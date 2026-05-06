// Hydration / dehydration / snapshot envelope. Runtime actors skip-by-design;
// snapshot actors rebuild their public records and let sidecar canonicalize identity on commit.
// Validation is sidecar's responsibility — applySnapshot trusts hook output and only handles
// per-machine routing and ref-stability for unchanged slices.

import { hasOwn, isObjectRecord } from "./actor";
import type {
  ActorDataSlice,
  ActorMeta,
  AnyRecord,
  DehydrateOptions,
  HydrateStrategy,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  PublicActorSlice,
  UnknownMachineKeyContext,
} from "./types";
import type { SidecarState } from "./sidecar";
import { IS_DEV, LiteFsmError } from "./utils";

type SnapshotEnvelope = { schemaVersion?: number; machines: Record<string, unknown> };
type MachineKey<S extends MachineStore> = Extract<keyof S, string>;
type RuntimeConfig = { persistence?: unknown; hydrate?: unknown; dehydrate?: unknown };
type ActorSlice = PublicActorSlice<any, AnyRecord>;
type ActorData = ActorDataSlice<any, AnyRecord>;
type ActorRecord = Record<string, ActorSlice>;
type ActorHydrateFn = (prev: ActorData | undefined, snapshot: unknown, meta: { strategy: HydrateStrategy }) => ActorData;
type ActorDehydrateFn = (slice: ActorData) => unknown;
type RuntimeActorSnapshotEntry = { snapshot: unknown; meta?: unknown };
type DomainHydrateFn = (prev: unknown, snapshot: unknown, meta: { strategy: HydrateStrategy }) => unknown;
type DomainDehydrateFn = (state: unknown) => unknown;

// preview — `getHydratedState` для SSR overlay; не дёргает callbacks и DEV-warnings.
// commit — `hydrate` / `opts.snapshot`; уведомляет о schema mismatch и unknown keys.
export type ApplySnapshotMode = "preview" | "commit";

export type ApplySnapshotResult<S extends MachineStore> = {
  nextState: MachinesState<S>;
  changedActorTemplateKeys: string[];
};

export type ApplySnapshotDeps<S extends MachineStore> = {
  config: S;
  snapshotActorTemplateKeys: ReadonlyArray<MachineKey<S>>;
  runtimeActorTemplateKeys: ReadonlyArray<MachineKey<S>>;
  schemaVersion: number | undefined;
  groupTagForTemplate: (templateKey: string) => string;
  onSchemaVersionMismatch?: (incoming: number | undefined, current: number | undefined) => void;
  onUnknownMachineKey?: (key: string, context: UnknownMachineKeyContext) => void;
};

export const assertSnapshotEnvelope = (snapshot: unknown): SnapshotEnvelope => {
  if (!isObjectRecord(snapshot)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
      "[lite-fsm] hydrate: snapshot must be an object envelope.",
    );
  }
  if (!isObjectRecord(snapshot.machines)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
      "[lite-fsm] hydrate: snapshot.machines must be an object.",
    );
  }
  return {
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : undefined,
    machines: snapshot.machines,
  };
};

const toActorDataSlice = (slice: ActorSlice): ActorData => ({
  state: slice.state,
  context: slice.context,
});

const unpackActorSnapshotEntry = (value: unknown): RuntimeActorSnapshotEntry =>
  isObjectRecord(value) && hasOwn(value, "snapshot")
    ? { snapshot: value.snapshot, meta: value.meta }
    : { snapshot: value };

const attachActorMeta = (data: unknown, meta: Readonly<ActorMeta> | undefined): ActorSlice => {
  if (!isObjectRecord(data)) return data as ActorSlice;
  return { ...data, meta } as ActorSlice;
};

// Stability: keep prev ref when hook returns prev or when state/context match by ref.
// Sidecar will validate shape, public state and canonicalize meta during commit.
const buildNextActorSlice = (
  prev: ActorSlice | undefined,
  rawData: unknown,
  meta: Readonly<ActorMeta> | undefined,
): ActorSlice => {
  if (!prev) return attachActorMeta(rawData, meta);
  if (isObjectRecord(rawData) && rawData.state === prev.state && rawData.context === prev.context) return prev;
  return attachActorMeta(rawData, meta);
};

const hydrateActorTemplate = <S extends MachineStore>(
  prev: MachinesState<S>,
  templateKey: MachineKey<S>,
  snapshotRecord: unknown,
  strategy: HydrateStrategy,
  deps: ApplySnapshotDeps<S>,
): { record: ActorRecord; changed: boolean } => {
  if (!isObjectRecord(snapshotRecord)) {
    throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Invalid actor record '${templateKey}'.`);
  }

  const prevRecord = prev[templateKey] as ActorRecord;
  const cfg = deps.config[templateKey] as RuntimeConfig;
  const hydrateHook = cfg.hydrate as ActorHydrateFn | undefined;
  const nextRecord: ActorRecord = strategy === "replace" ? {} : { ...prevRecord };
  let changed = false;

  for (const [actorId, actorSnapshotEntry] of Object.entries(snapshotRecord)) {
    const prevSlice = prevRecord[actorId];
    const entry = unpackActorSnapshotEntry(actorSnapshotEntry);
    const rawData = hydrateHook
      ? hydrateHook(prevSlice ? toActorDataSlice(prevSlice) : undefined, entry.snapshot, { strategy })
      : entry.snapshot;
    const nextSlice = buildNextActorSlice(
      prevSlice,
      rawData,
      prevSlice?.meta ?? (entry.meta as Readonly<ActorMeta> | undefined),
    );

    if (prevRecord[actorId] !== nextSlice) changed = true;
    nextRecord[actorId] = nextSlice;
  }

  // Replace strategy: detect actors that existed in prev but were dropped from snapshot.
  if (strategy === "replace" && !changed) {
    for (const actorId of Object.keys(prevRecord)) {
      if (!(actorId in nextRecord)) {
        changed = true;
        break;
      }
    }
  }

  return { record: changed ? nextRecord : prevRecord, changed };
};

// Pure builder. Domain → hydrate hook. Snapshot actor → rebuild record (sidecar validates on commit).
// Runtime actor → DEV warn + skip. Unknown key → onUnknownMachineKey + skip.
export const applySnapshot = <S extends MachineStore>(
  prev: MachinesState<S>,
  incoming: MachineManagerSnapshot<S>,
  strategy: HydrateStrategy,
  context: UnknownMachineKeyContext,
  deps: ApplySnapshotDeps<S>,
  mode: ApplySnapshotMode = "commit",
): ApplySnapshotResult<S> => {
  const envelope = assertSnapshotEnvelope(incoming);

  if (mode === "commit" && envelope.schemaVersion !== deps.schemaVersion) {
    deps.onSchemaVersionMismatch?.(envelope.schemaVersion, deps.schemaVersion);
  }

  let next: MachinesState<S> | undefined;
  const changedActorTemplateKeys: string[] = [];

  for (const name of Object.keys(envelope.machines)) {
    if (!hasOwn(deps.config, name)) {
      if (mode === "commit") {
        /* v8 ignore next */
        if (IS_DEV) console.warn(`[lite-fsm] hydrate: unknown machine key '${name}', skipped.`);
        deps.onUnknownMachineKey?.(name, context);
      }
      continue;
    }

    const key = name as MachineKey<S>;

    if (deps.runtimeActorTemplateKeys.includes(key)) {
      /* v8 ignore next 5 -- production skip is silent; DEV warning path is covered. */
      if (IS_DEV) {
        console.warn(
          `[lite-fsm] hydrate: runtime actor template '${key}' was skipped — runtime actor templates do not participate in hydrate/dehydrate.`,
        );
      }
      continue;
    }

    if (deps.snapshotActorTemplateKeys.includes(key)) {
      const hydrated = hydrateActorTemplate(prev, key, envelope.machines[name], strategy, deps);
      if (!hydrated.changed) continue;
      next = next ?? { ...prev };
      next[key] = hydrated.record as MachinesState<S>[typeof key];
      changedActorTemplateKeys.push(key);
      continue;
    }

    const prevSlice = prev[key];
    const incomingSlice = envelope.machines[name];
    const hydrateHook = (deps.config[key] as RuntimeConfig).hydrate as DomainHydrateFn | undefined;
    const nextSlice = hydrateHook ? hydrateHook(prevSlice, incomingSlice, { strategy }) : incomingSlice;

    if (nextSlice === prevSlice) continue;
    next = next ?? { ...prev };
    next[key] = nextSlice as MachinesState<S>[typeof key];
  }

  return { nextState: next ?? prev, changedActorTemplateKeys };
};

// Builds transport envelope. Runtime actor template keys: implicit skip, explicit throw.
export const buildDehydratedEnvelope = <S extends MachineStore>(
  state: MachinesState<S>,
  config: S,
  sidecar: SidecarState,
  snapshotActorTemplateKeys: ReadonlyArray<MachineKey<S>>,
  runtimeActorTemplateKeys: ReadonlyArray<MachineKey<S>>,
  domainKeys: ReadonlyArray<MachineKey<S>>,
  schemaVersion: number | undefined,
  dehydrateOpts: DehydrateOptions<S> | undefined,
): MachineManagerSnapshot<S> => {
  const requestedKeys = dehydrateOpts?.machines as ReadonlyArray<MachineKey<S>> | undefined;
  if (requestedKeys) {
    for (const key of requestedKeys) {
      if (!hasOwn(config, key)) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
          `[lite-fsm] dehydrate: unknown machine key '${key}'.`,
        );
      }
      if (runtimeActorTemplateKeys.includes(key)) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
          `[lite-fsm] dehydrate: runtime actor template '${key}' cannot be dehydrated.`,
        );
      }
    }
  }

  const dehydrateActorTemplate = (templateKey: MachineKey<S>) => {
    const record = state[templateKey] as ActorRecord;
    /* v8 ignore next -- live actor records are validated before commit; defensive corruption guard. */
    if (!isObjectRecord(record)) {
      throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Invalid actor record '${templateKey}'.`);
    }

    const cfg = config[templateKey] as RuntimeConfig;
    const hook = cfg.dehydrate as ActorDehydrateFn | undefined;
    const out: Record<string, unknown> = {};

    for (const [actorId, slice] of Object.entries(record)) {
      const runtime = sidecar.actorById.get(actorId);
      /* v8 ignore next -- sidecar and public state commit atomically; defensive corruption guard. */
      if (!runtime) {
        throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Actor '${actorId}' has no runtime identity.`);
      }

      out[actorId] = {
        snapshot: hook ? hook(toActorDataSlice(slice)) : toActorDataSlice(slice),
        meta: runtime.meta,
      };
    }

    return out;
  };

  const keys: ReadonlyArray<MachineKey<S>> = requestedKeys ?? [...domainKeys, ...snapshotActorTemplateKeys];
  const machinesEnvelope: Record<string, unknown> = {};
  for (const key of keys) {
    if (snapshotActorTemplateKeys.includes(key)) {
      machinesEnvelope[key] = dehydrateActorTemplate(key);
      continue;
    }
    const cfg = config[key] as RuntimeConfig;
    const hook = cfg.dehydrate as DomainDehydrateFn | undefined;
    machinesEnvelope[key] = hook ? hook(state[key]) : state[key];
  }
  return { schemaVersion, machines: machinesEnvelope as MachineManagerSnapshot<S>["machines"] };
};
