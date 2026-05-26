import { assertSnapshotEnvelope, type SnapshotEnvelope } from "../../hydration";
import type {
  DehydrateOptions,
  HydrateStrategy,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
} from "../../types";
import { LiteFsmError } from "../../utils";
import type { CompiledStorageTemplate, ManagerRuntimeContext, StorageRuntime } from "./storage";

export type RuntimeBucket = {
  readonly runtime: StorageRuntime;
  readonly templates: CompiledStorageTemplate[];
  state: unknown;
};

export type SnapshotRuntimeDeps<S extends MachineStore> = {
  readonly config: MachineStore;
  readonly buckets: readonly RuntimeBucket[];
  readonly bucketsByKind: ReadonlyMap<string, RuntimeBucket>;
  readonly templateKindByKey: ReadonlyMap<string, string>;
  readonly defaultStorageKind: string;
  readonly managerContext: ManagerRuntimeContext;
  readonly getState: () => MachinesState<S>;
  readonly getSchemaVersion: () => number | undefined;
};

type RootState = Record<string, unknown>;
type DehydrateRuntimeOptions = DehydrateOptions<MachineStore> | undefined;
type HydratePlan = {
  bucket: RuntimeBucket;
  machines: Record<string, unknown>;
  storageSnapshot?: unknown;
  hasStorageSnapshot: boolean;
};

type SnapshotContext = "dehydrate" | "hydrate";

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const unsupportedSnapshot = (): never => {
  throw new Error("[lite-fsm] snapshot is not supported by the configured storage runtimes.");
};

const assertKnownStorageKind = (
  kind: string,
  bucketsByKind: ReadonlyMap<string, RuntimeBucket>,
  context: SnapshotContext,
): RuntimeBucket => {
  const bucket = bucketsByKind.get(kind);
  if (bucket) return bucket;

  throw new LiteFsmError("LITE_FSM_UNKNOWN_STORAGE_KIND", `[lite-fsm] ${context}: unknown storage kind '${kind}'.`);
};

const assertSnapshotCapable = (
  kind: string,
  bucket: RuntimeBucket,
  context: SnapshotContext,
): NonNullable<StorageRuntime["snapshot"]> => {
  if (bucket.runtime.snapshot) return bucket.runtime.snapshot;

  throw new LiteFsmError(
    "LITE_FSM_UNSUPPORTED_STORAGE_SNAPSHOT",
    `[lite-fsm] ${context}: storage runtime '${kind}' does not support snapshots.`,
  );
};

export const createSnapshotRuntime = <S extends MachineStore>(deps: SnapshotRuntimeDeps<S>) => {
  const { buckets, bucketsByKind, templateKindByKey, defaultStorageKind, managerContext, getState, getSchemaVersion } =
    deps;

  const narrowDehydrateOptions = (
    options: DehydrateRuntimeOptions,
    machineKeys: readonly string[] | undefined,
  ): DehydrateRuntimeOptions => {
    if (!options) return undefined;
    if (options.machines === undefined) return options;
    return { ...options, machines: (machineKeys ?? []) as never };
  };

  const resolveDehydrateStorageKinds = (options: DehydrateRuntimeOptions): Set<string> => {
    const requested = options?.storage;
    if (requested === undefined) {
      return new Set(buckets.filter((bucket) => bucket.runtime.snapshot).map((bucket) => bucket.runtime.kind));
    }

    const kinds = new Set<string>();
    for (const kind of requested) {
      const bucket = assertKnownStorageKind(kind, bucketsByKind, "dehydrate");
      assertSnapshotCapable(kind, bucket, "dehydrate");
      kinds.add(kind);
    }
    return kinds;
  };

  const resolveMachineDehydrateKinds = (
    options: DehydrateRuntimeOptions,
    keysByKind: Map<string, string[]>,
  ): Set<string> => {
    const requestedKeys = options?.machines as readonly string[] | undefined;
    if (!requestedKeys) {
      return new Set(
        buckets
          .filter((bucket) => bucket.runtime.snapshot && bucket.templates.length > 0)
          .map((bucket) => bucket.runtime.kind),
      );
    }

    const kinds = new Set<string>();
    for (const key of requestedKeys) {
      if (!hasOwn(deps.config, key)) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
          `[lite-fsm] dehydrate: unknown machine key '${key}'.`,
        );
      }

      const kind = templateKindByKey.get(key)!;
      const bucket = bucketsByKind.get(kind)!;
      assertSnapshotCapable(kind, bucket, "dehydrate");
      kinds.add(kind);
      const keys = keysByKind.get(kind) ?? [];
      keys.push(key);
      keysByKind.set(kind, keys);
    }
    return kinds;
  };

  const dehydrate = (options: DehydrateRuntimeOptions): MachineManagerSnapshot<S> => {
    const keysByKind = new Map<string, string[]>();
    const machineKinds = resolveMachineDehydrateKinds(options, keysByKind);
    const storageKinds = resolveDehydrateStorageKinds(options);
    const callKinds = new Set([...machineKinds, ...storageKinds]);

    if (callKinds.size === 0 && !buckets.some((bucket) => bucket.runtime.snapshot)) {
      return unsupportedSnapshot();
    }

    const machinesEnvelope: Record<string, unknown> = {};
    const storageEnvelope: Record<string, unknown> = {};

    for (const bucket of buckets) {
      const kind = bucket.runtime.kind;
      if (!callKinds.has(kind)) continue;
      const snapshotRuntime = assertSnapshotCapable(kind, bucket, "dehydrate");
      const result = snapshotRuntime.dehydrate({
        state: bucket.state,
        manager: managerContext,
        rootState: getState() as RootState,
        options: narrowDehydrateOptions(options, keysByKind.get(kind)),
      });

      if (result.machines !== undefined) {
        Object.assign(machinesEnvelope, result.machines);
      }
      if (storageKinds.has(kind) && hasOwn(result, "storage") && result.storage !== undefined) {
        storageEnvelope[kind] = result.storage;
      }
    }

    const snapshot: MachineManagerSnapshot<S> = {
      schemaVersion: getSchemaVersion(),
      machines: machinesEnvelope as MachineManagerSnapshot<S>["machines"],
    };
    if (Object.keys(storageEnvelope).length > 0) snapshot.storage = storageEnvelope;
    return snapshot;
  };

  const ensureHydratePlan = (plans: Map<string, HydratePlan>, kind: string): HydratePlan => {
    const existing = plans.get(kind);
    if (existing) return existing;

    const bucket = assertKnownStorageKind(kind, bucketsByKind, "hydrate");
    assertSnapshotCapable(kind, bucket, "hydrate");
    const created: HydratePlan = { bucket, machines: {}, hasStorageSnapshot: false };
    plans.set(kind, created);
    return created;
  };

  const selectUnknownMachineBucket = (): RuntimeBucket => {
    const defaultBucket = bucketsByKind.get(defaultStorageKind);
    if (defaultBucket?.runtime.snapshot) return defaultBucket;
    const firstSnapshotBucket = buckets.find((bucket) => bucket.runtime.snapshot);
    if (firstSnapshotBucket) return firstSnapshotBucket;
    return unsupportedSnapshot();
  };

  const buildHydratePlans = (envelope: SnapshotEnvelope): HydratePlan[] => {
    const plans = new Map<string, HydratePlan>();
    let unknownMachinePlan: HydratePlan | undefined;

    for (const [key, value] of Object.entries(envelope.machines)) {
      const kind = templateKindByKey.get(key);
      if (!kind) {
        const bucket = unknownMachinePlan?.bucket ?? selectUnknownMachineBucket();
        unknownMachinePlan = ensureHydratePlan(plans, bucket.runtime.kind);
        unknownMachinePlan.machines[key] = value;
        continue;
      }

      ensureHydratePlan(plans, kind).machines[key] = value;
    }

    for (const [kind, value] of Object.entries(envelope.storage ?? {})) {
      const plan = ensureHydratePlan(plans, kind);
      plan.storageSnapshot = value;
      plan.hasStorageSnapshot = true;
    }

    return buckets
      .map((bucket) => plans.get(bucket.runtime.kind))
      .filter((plan): plan is HydratePlan => Boolean(plan));
  };

  const hydrate = (
    snapshot: MachineManagerSnapshot<S>,
    strategy: HydrateStrategy,
    mode: "preview" | "commit" | "init",
    baseState: MachinesState<S>,
    source: "hydrate" | "opts.snapshot",
  ): { nextState: MachinesState<S>; changed: boolean } => {
    const envelope = assertSnapshotEnvelope(snapshot);
    const plans = buildHydratePlans(envelope);

    if (plans.length === 0 && !buckets.some((bucket) => bucket.runtime.snapshot)) {
      return unsupportedSnapshot();
    }

    let nextState = baseState as RootState;
    let changed = false;
    for (const plan of plans) {
      const storageSnapshot = plan.hasStorageSnapshot
        ? { [plan.bucket.runtime.kind]: plan.storageSnapshot }
        : undefined;
      const runtimeSnapshot: MachineManagerSnapshot<S> = {
        schemaVersion: envelope.schemaVersion,
        machines: plan.machines as MachineManagerSnapshot<S>["machines"],
        ...(storageSnapshot ? { storage: storageSnapshot } : {}),
      };
      const result = plan.bucket.runtime.snapshot!.hydrate({
        state: plan.bucket.state,
        manager: managerContext,
        snapshot: runtimeSnapshot,
        baseState: nextState,
        strategy,
        source,
        mode,
      });
      if (!result.changed) continue;
      nextState = result.nextState;
      changed = true;
    }

    return { nextState: nextState as MachinesState<S>, changed };
  };

  return { dehydrate, hydrate };
};
