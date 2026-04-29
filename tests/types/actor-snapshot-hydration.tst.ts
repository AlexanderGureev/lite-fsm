import { describe, expect, test } from "tstyche";
import { createMachine } from "lite-fsm";
import type {
  ActorDataSlice,
  ActorSnapshotEntry,
  DefaultActorSnapshot,
  DehydrateOptions,
  FSMEvent,
  HydrateMeta,
  MachineConfig,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  PublicActorSlice,
  SnapshotActorTemplateKey,
  SnapshotMachineKey,
  SnapshotForMachine,
  StateType,
  TypedCreateMachineFn,
} from "lite-fsm";

import type { Assert, Equal } from "./_helpers";

type Spawn = FSMEvent<"SPAWN", { id: string }>;
type Bump = FSMEvent<"BUMP">;
type Event = Spawn | Bump;
type ActorCfg = { __INIT: { SPAWN: "pending" }; pending: { BUMP: null } };
type RuntimeActorCfg = { __INIT: { SPAWN: "pending" }; pending: { BUMP: null } };
type DomainCfg = { idle: { BUMP: null } };
type ActorCtx = { id: string; count: number };
type DomainCtx = { count: number };
type CustomActorSnapshot = { value: string; count: number };
type DomainSnapshot = { count: number };

const domain = {
  config: { idle: { BUMP: null } },
  initialState: "idle",
  initialContext: { count: 0 },
  hydrate: (prev, snapshot: DomainSnapshot, _meta) => ({ state: prev.state, context: { count: snapshot.count } }),
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<DomainCfg, DomainCtx, Event, {}, DomainSnapshot>;

const runtimeActor = {
  config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
  initialState: "__INIT",
  initialContext: { id: "", count: 0 },
} satisfies MachineConfig<RuntimeActorCfg, ActorCtx, Event>;

const snapshotActor = {
  config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
  initialState: "__INIT",
  initialContext: { id: "", count: 0 },
  persistence: "snapshot",
  hydrate: (prev, snapshot: CustomActorSnapshot, meta) => {
    expect(prev).type.toBe<ActorDataSlice<ActorCfg, ActorCtx> | undefined>();
    expect(snapshot).type.toBe<CustomActorSnapshot>();
    expect(meta).type.toBe<HydrateMeta>();
    return {
      state: "pending",
      context: { id: snapshot.value, count: snapshot.count },
    };
  },
  dehydrate: (slice) => {
    expect(slice).type.toBe<ActorDataSlice<ActorCfg, ActorCtx>>();
    return {
      value: slice.context.id,
      count: slice.context.count,
    };
  },
} satisfies MachineConfig<ActorCfg, ActorCtx, Event, {}, CustomActorSnapshot>;

type Store = {
  domain: typeof domain;
  runtimeActor: typeof runtimeActor;
  snapshotActor: typeof snapshotActor;
};

describe("actor snapshot hydration type-контракты", () => {
  test("MachineManagerSnapshot включает только domain keys и snapshot actor keys", () => {
    type _SnapshotActorKey = Assert<Equal<SnapshotActorTemplateKey<Store>, "snapshotActor">>;
    type _SnapshotMachineKey = Assert<Equal<SnapshotMachineKey<Store>, "domain" | "snapshotActor">>;
    expect<MachineManagerSnapshot<Store>["machines"]>().type.toBe<
      Partial<{
        domain: DomainSnapshot;
        snapshotActor: Record<string, ActorSnapshotEntry<CustomActorSnapshot>>;
      }>
    >();
  });

  test("MachineManagerRuntimeSnapshot включает все actor records", () => {
    expect<MachineManagerRuntimeSnapshot<Store>["machines"]>().type.toBe<{
      domain: StateType<DomainCfg, DomainCtx>;
      runtimeActor: Record<string, PublicActorSlice<RuntimeActorCfg, ActorCtx>>;
      snapshotActor: Record<string, PublicActorSlice<ActorCfg, ActorCtx>>;
    }>();
  });

  test("DehydrateOptions отклоняет runtime actor keys", () => {
    expect<DehydrateOptions<Store>["machines"]>().type.toBe<ReadonlyArray<"domain" | "snapshotActor"> | undefined>();
    const ok: DehydrateOptions<Store> = { machines: ["domain", "snapshotActor"] };
    const bad: DehydrateOptions<Store> = {
      // @ts-expect-error!
      machines: ["runtimeActor"],
    };
    void ok;
    void bad;
  });

  test("domain hydrate/dehydrate signatures не меняются", () => {
    expect<typeof domain.hydrate>().type.toBe<
      (prev: StateType<DomainCfg, DomainCtx>, snapshot: DomainSnapshot, meta: { strategy: "replace" | "merge" }) => StateType<DomainCfg, DomainCtx>
    >();
    expect<typeof domain.dehydrate>().type.toBe<(state: StateType<DomainCfg, DomainCtx>) => DomainSnapshot>();
  });

  test("snapshot actor hydrate/dehydrate используют per-actor signatures", () => {
    expect<typeof snapshotActor.hydrate>().type.toBe<
      (
        prev: ActorDataSlice<ActorCfg, ActorCtx> | undefined,
        snapshot: CustomActorSnapshot,
        meta: HydrateMeta,
      ) => ActorDataSlice<ActorCfg, ActorCtx>
    >();
    expect<typeof snapshotActor.dehydrate>().type.toBe<
      (slice: ActorDataSlice<ActorCfg, ActorCtx>) => CustomActorSnapshot
    >();
  });

  test("TypedCreateMachineFn сохраняет snapshot actor persistence и custom snapshot hooks", () => {
    const typed: TypedCreateMachineFn<Event> = createMachine;
    const typedSnapshotActor = typed({
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
      hydrate: (_prev, snapshot: CustomActorSnapshot) => {
        return {
          state: "pending",
          context: { id: snapshot.value, count: snapshot.count },
        };
      },
      dehydrate: (slice) => ({
        value: slice.context.id,
        count: slice.context.count,
      }),
    });
    type TypedStore = { snapshotActor: typeof typedSnapshotActor };

    expect(typedSnapshotActor.persistence).type.toBe<"snapshot">();
    expect<MachineManagerSnapshot<TypedStore>["machines"]>().type.toBe<
      Partial<{ snapshotActor: Record<string, ActorSnapshotEntry<CustomActorSnapshot>> }>
    >();
    expect<DehydrateOptions<TypedStore>["machines"]>().type.toBe<ReadonlyArray<"snapshotActor"> | undefined>();
  });

  test("TypedCreateMachineFn выводит snapshot actor для всех вариантов hydrate/dehydrate", () => {
    const typed: TypedCreateMachineFn<Event> = createMachine;
    const persistenceOnly = typed({
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
    });
    const withHydrate = typed({
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
      hydrate: (_prev, snapshot: CustomActorSnapshot) => ({
        state: "pending",
        context: { id: snapshot.value, count: snapshot.count },
      }),
    });
    const withDehydrate = typed({
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
      dehydrate: (slice) => ({
        value: slice.context.id,
        count: slice.context.count,
      }),
    });
    const withBoth = typed({
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
      hydrate: (_prev, snapshot: CustomActorSnapshot) => ({
        state: "pending",
        context: { id: snapshot.value, count: snapshot.count },
      }),
      dehydrate: (slice) => ({
        value: slice.context.id,
        count: slice.context.count,
      }),
    });
    type TypedStore = {
      persistenceOnly: typeof persistenceOnly;
      withHydrate: typeof withHydrate;
      withDehydrate: typeof withDehydrate;
      withBoth: typeof withBoth;
    };

    expect(persistenceOnly.config).type.toBe<ActorCfg>();
    expect(withHydrate.config).type.toBe<ActorCfg>();
    expect(withDehydrate.config).type.toBe<ActorCfg>();
    expect(withBoth.config).type.toBe<ActorCfg>();
    expect<SnapshotForMachine<typeof persistenceOnly>>().type.toBe<
      Record<string, ActorSnapshotEntry<DefaultActorSnapshot<ActorCfg, ActorCtx>>>
    >();
    expect<SnapshotForMachine<typeof withHydrate>>().type.toBe<Record<string, ActorSnapshotEntry<CustomActorSnapshot>>>();
    expect<SnapshotForMachine<typeof withDehydrate>>().type.toBe<
      Record<string, ActorSnapshotEntry<CustomActorSnapshot>>
    >();
    expect<SnapshotForMachine<typeof withBoth>>().type.toBe<Record<string, ActorSnapshotEntry<CustomActorSnapshot>>>();
    expect<MachineManagerSnapshot<TypedStore>["machines"]>().type.toBe<
      Partial<{
        persistenceOnly: Record<string, ActorSnapshotEntry<DefaultActorSnapshot<ActorCfg, ActorCtx>>>;
        withHydrate: Record<string, ActorSnapshotEntry<CustomActorSnapshot>>;
        withDehydrate: Record<string, ActorSnapshotEntry<CustomActorSnapshot>>;
        withBoth: Record<string, ActorSnapshotEntry<CustomActorSnapshot>>;
      }>
    >();
  });

  test("actor hydrate/dehydrate без persistence snapshot отклоняются", () => {
    // @ts-expect-error!
    const badRuntimeHook: MachineConfig<ActorCfg, ActorCtx, Event> = {
      config: { __INIT: { SPAWN: "pending" }, pending: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      hydrate: (_prev: ActorDataSlice<ActorCfg, ActorCtx> | undefined, snapshot: DefaultActorSnapshot<ActorCfg, ActorCtx>) =>
        snapshot,
    };
    void badRuntimeHook;
  });

  test("persistence на domain machine отклоняется", () => {
    const badDomain: MachineConfig<DomainCfg, DomainCtx, Event> = {
      config: { idle: { BUMP: null } },
      initialState: "idle",
      initialContext: { count: 0 },
      // @ts-expect-error!
      persistence: "snapshot",
    };
    void badDomain;
  });
});
