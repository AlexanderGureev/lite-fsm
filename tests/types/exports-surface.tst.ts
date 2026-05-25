import { describe, expect, test } from "tstyche";
import { createActorMeta, definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  ActionForState,
  ActorActionForState,
  ActorDataSlice,
  ActorDefaultDeps,
  ActorDehydrateHook,
  ActorHydrateHook,
  ActorMeta,
  ActorPersistence,
  ActorPublicState,
  ActorSnapshotEntry,
  ActorSystemState,
  ActorTemplateSnapshot,
  ActorTerminalState,
  ActorTransition,
  ActorTransitionTarget,
  AnyEvent,
  AnyRecord,
  CFG,
  CoreActionMeta,
  DefaultDeps,
  DefaultActorSnapshot,
  DehydrateOptions,
  DomainTransitionTarget,
  EffectDeps,
  EffectStateName,
  EffectType,
  FSMEvent,
  FSMEventMeta,
  GenerateSpawnIdFn,
  GenericMiddleware,
  HydrateAction,
  HydrateMeta,
  HydrateOptions,
  HydratePreviewOptions,
  HydrateStrategy,
  IMachine,
  IMachineManager,
  IncomingEventTypes,
  IsActorTemplate,
  MachineConfig,
  MachineDependencies,
  MachineEffect,
  MachineEvents,
  MachineManagerDehydratedSnapshot,
  MachineManagerDehydrateFn,
  MachineManagerDehydrateResult,
  MachineManagerOptions,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachineReducer,
  MachineReducerInputState,
  MachineReducerState,
  MachineResultMetadata,
  MachineRuntimeSnapshot,
  MachineRuntimeSnapshotForMachine,
  MachineRuntimeExtension,
  MachineRuntimeMetadata,
  MachineSliceState,
  MachineSnapshot,
  MachineState,
  MachineStore,
  MachinesState,
  ManagerAction,
  ManagerCommitAction,
  ManagerFromPlugins,
  Middleware,
  MiddlewareApi,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginManagerExtensions,
  PluginRouteMeta,
  PluginScopedDeps,
  PluginScopedTransition,
  PublicActorSlice,
  Reducer,
  SType,
  Self,
  SnapshotActorTemplateKey,
  SnapshotForMachine,
  SnapshotMachineKey,
  SpawnIdContext,
  State,
  StateName,
  StateType,
  Subscriber,
  TransitionNextState,
  TransitionSubscriber,
  TransitionTargetForConfig,
  TypedCreateConfigFn,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
  TypedCreateReducerFn,
  UnknownMachineKeyContext,
  VoidReducerMiddleware,
  WILDCARD,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Ping = FSMEvent<"PING", { id: string }>;
type Done = FSMEvent<"DONE">;
type Event = Ping | Done;
type DomainCfg = { idle: { PING: "busy" }; busy: { DONE: "idle" }; "*": { DONE: "idle" } };
type ActorCfg = { __INIT: { PING: "pending" }; pending: { DONE: "__RESOLVED" } };
type Ctx = { id: string };
type Deps = { clock: () => number };
type DomainMachine = MachineConfig<DomainCfg, Ctx, Event, Deps>;
type ActorMachine = MachineConfig<ActorCfg, Ctx, Event, Deps>;
const domainMachine = {
  config: { idle: { PING: "busy" }, busy: { DONE: "idle" }, "*": { DONE: "idle" } },
  initialState: "idle",
  initialContext: { id: "" },
  reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
  effects: {
    busy: ({ clock }) => {
      expect(clock()).type.toBe<number>();
    },
  },
} satisfies DomainMachine;
const actorMachine = {
  config: { __INIT: { PING: "pending" }, pending: { DONE: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
  effects: {
    pending: ({ clock, self }) => {
      expect(clock()).type.toBe<number>();
      expect(self).type.toBe<Self>();
    },
  },
} satisfies ActorMachine;
type Store = { domain: typeof domainMachine; actor: typeof actorMachine };

describe("canary поверхности экспорта core-типов", () => {
  test("экспортирует все публичные core type-алиасы из types.ts", () => {
    type _SType = Assert<Equal<SType, string | number | symbol>>;
    type _Wildcard = Assert<Equal<WILDCARD, "*">>;
    type _State = Assert<Equal<State<"idle" | "*" | 1>, "idle">>;
    type _AnyRecord = Assert<Equal<AnyRecord, Record<string, unknown>>>;
    type _AnyEvent = Assert<Equal<AnyEvent, { type: string; payload?: unknown }>>;
    type _StateName = Assert<Equal<StateName<DomainCfg>, "idle" | "busy">>;
    type _MetaKeys = Assert<
      Equal<
        keyof FSMEventMeta,
        "actorId" | "groupId" | "groupTag" | "senderActorId" | "senderGroupId" | "senderGroupTag"
      >
    >;
    type _CoreActionMeta = Assert<Equal<CoreActionMeta, FSMEventMeta>>;
    type _ManagerAction = Assert<Equal<ManagerAction<Ping>, Ping & { meta?: FSMEventMeta }>>;
    type _CustomManagerAction = Assert<
      Equal<ManagerAction<Ping, { readonly route?: string }>, Ping & { meta?: { readonly route?: string } }>
    >;
    type _ActorMeta = Assert<Equal<ActorMeta, Self>>;
    type _Terminal = Assert<Equal<ActorTerminalState, "__RESOLVED" | "__REJECTED" | "__CANCELLED">>;
    type _System = Assert<Equal<ActorSystemState, "__INIT" | ActorTerminalState>>;
    type _PublicActorState = Assert<Equal<ActorPublicState<ActorCfg>, "pending">>;
    type _DomainTarget = Assert<Equal<DomainTransitionTarget<keyof DomainCfg>, "idle" | "busy" | null>>;
    type _ActorTarget = Assert<Equal<ActorTransitionTarget<keyof ActorCfg>, "pending" | ActorTerminalState | null>>;
    type _TargetForDomain = Assert<
      Equal<TransitionTargetForConfig<DomainCfg, keyof DomainCfg>, "idle" | "busy" | null>
    >;
    type _NextForActor = Assert<Equal<TransitionNextState<ActorCfg>, "pending" | ActorTerminalState>>;
    type _Cfg = Assert<Equal<keyof CFG<DomainCfg, Event>, keyof DomainCfg>>;
    type _StateType = Assert<Equal<StateType<DomainCfg, Ctx>, { state: "idle" | "busy"; context: Ctx }>>;
    type _MachineState = Assert<Equal<MachineState<DomainCfg, Ctx>, StateType<DomainCfg, Ctx>>>;
    type _MachineRuntimeExtensionKeys = Assert<
      Equal<
        keyof MachineRuntimeExtension,
        | "storage"
        | "input"
        | "internalEvents"
        | "reducerContext"
        | "effectDeps"
        | "reactionDeps"
        | "resultMetadata"
        | "publicState"
      >
    >;
    type _ReducerInput = Assert<
      Equal<MachineReducerInputState<ActorCfg, Ctx>, { state: "__INIT" | "pending" | ActorTerminalState; context: Ctx }>
    >;
    type _ReducerState = Assert<
      Equal<MachineReducerState<ActorCfg, Ctx>, { state: "pending" | ActorTerminalState; context: Ctx }>
    >;
    type _HydrateStrategy = Assert<Equal<HydrateStrategy, "replace" | "merge">>;
    type _HydrateOptions = Assert<Equal<HydrateOptions, { strategy?: HydrateStrategy }>>;
    type _HydratePreview = Assert<Equal<HydratePreviewOptions<Store>["baseState"], MachinesState<Store> | undefined>>;
    type _HydrateMeta = Assert<Equal<HydrateMeta, { strategy: HydrateStrategy }>>;
    type _UnknownKey = Assert<Equal<UnknownMachineKeyContext, "hydrate" | "opts.snapshot">>;
    type _HydrateAction = Assert<
      Equal<
        HydrateAction<Store>,
        { type: "@@lite-fsm/HYDRATE"; payload: { strategy: HydrateStrategy; snapshot: MachineManagerSnapshot<Store> } }
      >
    >;
    type _CommitAction = Assert<
      Equal<ManagerCommitAction<Store, ManagerAction<Event>>, ManagerAction<Event> | HydrateAction<Store>>
    >;
    type _MiddlewareApi = Assert<
      Equal<MiddlewareApi<Ctx, Event>["transition"], (action: ManagerAction<Event>) => ManagerAction<Event>>
    >;
    type _Middleware = Assert<
      Equal<
        Middleware<Ctx, Event>,
        (
          api: MiddlewareApi<Ctx, Event>,
        ) => (
          next: (action: ManagerAction<Event>) => ManagerAction<Event>,
        ) => (action: ManagerAction<Event>) => ManagerAction<Event>
      >
    >;
    type _GenericMiddleware = Assert<
      Equal<
        GenericMiddleware,
        <S, P extends AnyEvent>(api: MiddlewareApi<S, P>) => (next: (action: P) => P) => (action: P) => P
      >
    >;
    type _VoidReducerMiddleware = Assert<Equal<VoidReducerMiddleware["__liteFsmAllowVoidReducer"], true>>;
    type _MachineReducer = Assert<
      Equal<
        MachineReducer<DomainCfg, Event, Ctx>,
        (
          state: MachineReducerInputState<DomainCfg, Ctx>,
          payload: ManagerAction<Event>,
          meta: { nextState: TransitionNextState<DomainCfg>; config: DomainCfg },
        ) => MachineReducerState<DomainCfg, Ctx> | void
      >
    >;
    type _Incoming = Assert<Equal<IncomingEventTypes<DomainCfg, "busy">, "PING">>;
    type _ActionForState = Assert<Equal<ActionForState<DomainCfg, "busy", Event>, Ping>>;
    type _ActorTransition = Assert<
      Equal<
        ActorTransition<Event>["actor"],
        (id: string | string[], action: Event & { meta?: never }) => ManagerAction<Event>
      >
    >;
    type _DefaultDeps = Assert<Equal<DefaultDeps<"busy", DomainCfg, Event>["action"], Ping>>;
    type _ActorAction = Assert<Equal<ActorActionForState<ActorCfg, "pending", Event>, ManagerAction<Ping>>>;
    type _ActorDeps = Assert<Equal<ActorDefaultDeps<"pending", ActorCfg, Event>["self"], Self>>;
    type _MachineEffect = Assert<
      Equal<ReturnType<MachineEffect<"busy", DomainCfg, Event, Deps>>, Promise<void> | void>
    >;
    type _EffectStateName = Assert<Equal<EffectStateName<ActorCfg>, "pending" | "*">>;
    type _MachineConfig = Assert<Equal<DomainMachine["initialContext"], Ctx>>;
    type _ActorPersistence = Assert<Equal<ActorPersistence, "runtime" | "snapshot">>;
    type _DefaultActorSnapshot = Assert<Equal<DefaultActorSnapshot<ActorCfg, Ctx>, { state: "pending"; context: Ctx }>>;
    type _ActorDataSlice = Assert<Equal<ActorDataSlice<ActorCfg, Ctx>, { state: "pending"; context: Ctx }>>;
    type _ActorSnapshotEntry = Assert<
      Equal<ActorSnapshotEntry<{ id: string }>, { snapshot: { id: string }; meta: Readonly<ActorMeta> }>
    >;
    type _ActorHydrateHook = Assert<
      Equal<
        ActorHydrateHook<ActorCfg, Ctx, { id: string }>,
        (
          prev: ActorDataSlice<ActorCfg, Ctx> | undefined,
          snapshot: { id: string },
          meta: HydrateMeta,
        ) => ActorDataSlice<ActorCfg, Ctx>
      >
    >;
    type _ActorDehydrateHook = Assert<
      Equal<ActorDehydrateHook<ActorCfg, Ctx, { id: string }>, (slice: ActorDataSlice<ActorCfg, Ctx>) => { id: string }>
    >;
    type _ActorTemplateSnapshot = Assert<
      Equal<
        ActorTemplateSnapshot<ActorCfg, Ctx>,
        Record<string, ActorSnapshotEntry<DefaultActorSnapshot<ActorCfg, Ctx>>>
      >
    >;
    type _MachineStore = Assert<
      Equal<
        MachineStore,
        Record<
          string,
          {
            storage?: unknown;
            config: object;
            initialState: string;
            initialContext: AnyRecord;
            groupTag?: string;
            persistence?: unknown;
            reducer?: unknown;
            hydrate?: unknown;
            dehydrate?: unknown;
            effects?: unknown;
          }
        >
      >
    >;
    type _IsActorTemplate = Assert<Equal<IsActorTemplate<ActorMachine>, true>>;
    type _PublicActorSlice = Assert<
      Equal<PublicActorSlice<ActorCfg, Ctx>, { state: "pending"; context: Ctx; meta: Readonly<ActorMeta> }>
    >;
    type _MachineSlice = Assert<
      Equal<MachineSliceState<ActorMachine>, Record<string, PublicActorSlice<ActorCfg, Ctx>>>
    >;
    type _MachineRuntimeMetadata = Assert<Equal<MachineRuntimeMetadata<DomainMachine>, {}>>;
    type _MachineResultMetadata = Assert<Equal<MachineResultMetadata<DomainMachine>, {}>>;
    type _MachinesState = Assert<
      Equal<
        MachinesState<Store>,
        { domain: { state: "idle" | "busy"; context: Ctx }; actor: Record<string, PublicActorSlice<ActorCfg, Ctx>> }
      >
    >;
    type _RuntimeSnapshot = Assert<Equal<MachineRuntimeSnapshot<DomainCfg, Ctx>, StateType<DomainCfg, Ctx>>>;
    type _RuntimeSnapshotForMachine = Assert<
      Equal<MachineRuntimeSnapshotForMachine<ActorMachine>, Record<string, PublicActorSlice<ActorCfg, Ctx>>>
    >;
    type _SnapshotForMachine = Assert<Equal<SnapshotForMachine<DomainMachine>, StateType<DomainCfg, Ctx>>>;
    type _MachineSnapshot = Assert<Equal<MachineSnapshot<DomainMachine>, SnapshotForMachine<DomainMachine>>>;
    type _ManagerSnapshot = Assert<
      Equal<MachineManagerSnapshot<Store>["machines"], Partial<{ domain: StateType<DomainCfg, Ctx> }>>
    >;
    type _ManagerSnapshotStorage = Assert<
      Equal<MachineManagerSnapshot<Store>["storage"], Record<string, unknown> | undefined>
    >;
    type _ManagerDehydratedSnapshot = Assert<
      Equal<MachineManagerDehydratedSnapshot<Store>["machines"], { domain: StateType<DomainCfg, Ctx> }>
    >;
    type _ManagerDehydratedSnapshotStorage = Assert<
      Equal<MachineManagerDehydratedSnapshot<Store>["storage"], Record<string, unknown> | undefined>
    >;
    type _ManagerDehydrateResult = Assert<
      Equal<
        MachineManagerDehydrateResult<Store, readonly ["domain"]>["machines"],
        { domain: StateType<DomainCfg, Ctx> }
      >
    >;
    type _ManagerRuntimeSnapshot = Assert<
      Equal<
        MachineManagerRuntimeSnapshot<Store>["machines"],
        { domain: StateType<DomainCfg, Ctx>; actor: Record<string, PublicActorSlice<ActorCfg, Ctx>> }
      >
    >;
    type _SnapshotActorKey = Assert<Equal<SnapshotActorTemplateKey<Store>, never>>;
    type _SnapshotMachineKey = Assert<Equal<SnapshotMachineKey<Store>, "domain">>;
    type _DehydrateOptions = Assert<Equal<DehydrateOptions<Store>["machines"], ReadonlyArray<"domain"> | undefined>>;
    type _DehydrateStorageOptions = Assert<Equal<DehydrateOptions<Store>["storage"], readonly string[] | undefined>>;
    const dehydrate = null as unknown as MachineManagerDehydrateFn<Store>;
    expect(dehydrate({ machines: ["domain"] }).machines.domain).type.toBe<StateType<DomainCfg, Ctx>>();
    type _TransitionSubscriber = Assert<
      Equal<
        TransitionSubscriber<Store, Event>,
        (
          prevState: MachinesState<Store>,
          currentState: MachinesState<Store>,
          action: ManagerCommitAction<Store, ManagerAction<Event>>,
        ) => void
      >
    >;
    const typedCreateMachine = null as unknown as TypedCreateMachineFn<Event, Deps>;
    const exportedMachine = typedCreateMachine({
      config: { idle: { PING: "busy" }, busy: { DONE: "idle" }, "*": { DONE: "idle" } },
      initialState: "idle",
      initialContext: { id: "" },
    });
    expect(exportedMachine).type.toBe<MachineConfig<DomainCfg, Ctx, Event, Deps>>();
    type _FSMEvent = Assert<Equal<FSMEvent<"DONE">, { type: "DONE" }>>;
    type _CreateReducerFn = Assert<
      Equal<ReturnType<TypedCreateReducerFn<Event>>, MachineReducer<object, Event, AnyRecord>>
    >;
    type _CreateConfigFn = Assert<Equal<ReturnType<TypedCreateConfigFn<Event>>, object>>;
    type _EffectType = Assert<Equal<EffectType, "every" | "latest">>;
    type _CreateEffectFn = Assert<
      TypedCreateEffectFn<Event, Deps> extends <
        C extends { [key in keyof C]: object },
        N extends StateName<C> | WILDCARD,
      >(opts: {
        effect: MachineEffect<N, C, Event, Deps>;
        type?: EffectType;
        cancelFn?: (deps: Parameters<MachineEffect<N, C, Event, Deps>>[0]) => () => boolean;
      }) => MachineEffect<N, C, Event, Deps>
        ? true
        : false
    >;
    type _SpawnIdContext = Assert<
      Equal<
        SpawnIdContext<Event>,
        {
          templateKey: string;
          groupTag: string;
          counter: number;
          originId: string | undefined;
          action: ManagerAction<Event>;
        }
      >
    >;
    type _GenerateSpawnIdFn = Assert<Equal<GenerateSpawnIdFn<Event>, (ctx: SpawnIdContext<Event>) => string>>;
    const testPlugin = definePlugin<Ping>().create({
      name: "export-surface-plugin",
      routeMeta: {
        routeId(value: string) {
          return value;
        },
      },
      scopedDeps: {
        trace() {
          return () => "trace";
        },
      },
      scopedTransition: {
        finish(scope) {
          return () => scope.transition({ type: "PING", payload: { id: "p" } });
        },
      },
      manager: {
        audit() {
          return { enabled: true } as const;
        },
      },
    });
    type TestPlugin = typeof testPlugin;
    type _PluginManagerEvents = Assert<Equal<PluginManagerEvents<TestPlugin>, Ping>>;
    type _PluginRouteMeta = Assert<Equal<PluginRouteMeta<TestPlugin>, { readonly routeId: string }>>;
    type _PluginManagerExtensions = Assert<
      Equal<PluginManagerExtensions<TestPlugin>, { readonly audit: { readonly enabled: true } }>
    >;
    type _PluginScopedDeps = Assert<Equal<PluginScopedDeps<TestPlugin>, { readonly trace: () => "trace" }>>;
    type _PluginScopedTransition = Assert<
      Equal<PluginScopedTransition<TestPlugin>, { readonly finish: () => ManagerAction<Ping> }>
    >;
    type _PluginMachineExtensions = Assert<Equal<PluginMachineExtensions<TestPlugin>, never>>;
    type _EffectDeps = Assert<
      EffectDeps<Deps, readonly [TestPlugin]> extends Deps & {
        readonly trace: () => string;
        readonly transition: { readonly finish: () => ManagerAction<Ping> };
      }
        ? true
        : false
    >;
    type _ManagerFromPlugins = Assert<
      ManagerFromPlugins<Store, Done, readonly [TestPlugin]> extends IMachineManager<
        Store,
        Done | Ping,
        CoreActionMeta & { readonly routeId?: string },
        readonly [TestPlugin]
      > & {
        readonly audit: { readonly enabled: true };
      }
        ? true
        : false
    >;
  });

  test("экспортирует createActorMeta как public runtime helper", () => {
    const meta = createActorMeta({ actorId: "a", groupId: "g", groupTag: "t" });

    expect(meta).type.toBe<Readonly<ActorMeta>>();
    // @ts-expect-error!
    meta.actorId = "next";
  });

  test("экспортирует definePlugin как public runtime helper", () => {
    const plugin = definePlugin().create({ name: "exported-plugin" });

    expect(plugin.name).type.toBe<"exported-plugin">();
  });

  test("экспортирует defineStorageRuntime как public runtime helper", () => {
    const storage = defineStorageRuntime().create({
      kind: "exported-storage",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    expect(storage.kind).type.toBe<"exported-storage">();
  });

  test("экспортирует все публичные core type-алиасы из interfaces.ts", () => {
    expect<MachineDependencies<Store>>().type.toBe<Deps>();
    expect<Event>().type.toBeAssignableTo<MachineEvents<Store>>();
    expect<MachineManagerOptions<Store, Event>["middleware"]>().type.toBe<
      Array<Middleware<MachinesState<Store>, Event>> | undefined
    >();
    expect<MachineManagerOptions<Store, Event>["originId"]>().type.toBe<string | undefined>();
    expect<MachineManagerOptions<Store, Event>["generateActorId"]>().type.toBe<GenerateSpawnIdFn<Event> | undefined>();
    expect<MachineManagerOptions<Store, Event>["generateGroupId"]>().type.toBe<GenerateSpawnIdFn<Event> | undefined>();
    expect<MachineManagerOptions<Store, Event>["plugins"]>().type.toBe<readonly [] | undefined>();
    expect<IMachine<DomainCfg, Ctx, Event, Deps>["transition"]>().type.toBe<
      (state: StateType<DomainCfg, Ctx>, action: Event) => StateType<DomainCfg, Ctx>
    >();
    expect<IMachineManager<Store, Event>["getState"]>().type.toBe<() => MachinesState<Store>>();
    expect<Reducer<Ctx, Event>>().type.toBe<(state: Ctx, action: Event) => Ctx>();
    expect<Subscriber<DomainCfg, Ctx, Event>>().type.toBe<
      (prevState: StateType<DomainCfg, Ctx>, currentState: StateType<DomainCfg, Ctx>, action: Event) => void
    >();
  });
});
