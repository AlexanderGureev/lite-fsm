import { describe, expect, test } from "tstyche";
import { createActorMeta, definePlugin } from "@lite-fsm/core";
import type {
  ActionInterceptor,
  ActionInterceptorContext,
  ActionInterceptorResult,
  ActionRegistry,
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
  DepsExtensionRegistry,
  DispatchContext,
  DispatchHook,
  DispatchRegistry,
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
  LiteFsmPlugin,
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
  ManagerActionMeta,
  ManagerAction,
  ManagerCommitAction,
  ManagerExtensionAppEvents,
  ManagerExtensionCapability,
  ManagerExtensionFactory,
  ManagerExtensionRegistry,
  ManagerExtensionStore,
  ManagerFromPlugins,
  ManagerRuntimeContext,
  ManagerTransitionEvents,
  Middleware,
  MiddlewareApi,
  PluginCapabilities,
  PluginActionMeta,
  PluginDeps,
  PluginInstallContext,
  PluginManagerExtensions,
  PluginTransitionExtensions,
  PluginTransitionEvents,
  PublicActorSlice,
  Reducer,
  RouteResolver,
  RouteResolverContext,
  RouteResolverResult,
  RoutingRegistry,
  ScopedDepsContext,
  ScopedDepsFactory,
  ScopedInvocationContext,
  ScopedInvocationIndices,
  ScopedInvocationPhase,
  ScopedInvocationSource,
  ScopedTransitionContext,
  ScopedTransitionFactory,
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
    type _PluginCapabilities = Assert<
      Equal<keyof PluginCapabilities, "manager" | "transitionEvents" | "machine" | "actionMeta" | "deps" | "transition">
    >;
    type TestPlugin = LiteFsmPlugin<{
      readonly manager: { readonly audit: { readonly enabled: true } };
      readonly transitionEvents: Ping;
      readonly actionMeta: { readonly routeId: string };
      readonly deps: { readonly trace: () => string };
      readonly transition: { readonly finish: () => ManagerAction<Event> };
    }>;
    type _PluginManagerExtensions = Assert<
      Equal<
        PluginManagerExtensions<Store, Event, readonly [TestPlugin]>,
        { readonly audit: { readonly enabled: true } }
      >
    >;
    type _PluginTransitionEvents = Assert<Equal<PluginTransitionEvents<readonly [TestPlugin]>, Ping>>;
    type _ManagerTransitionEvents = Assert<Equal<ManagerTransitionEvents<Done, readonly [TestPlugin]>, Done | Ping>>;
    type _PluginActionMeta = Assert<Equal<PluginActionMeta<readonly [TestPlugin]>, { readonly routeId?: string }>>;
    type _PluginDeps = Assert<Equal<PluginDeps<readonly [TestPlugin]>, { readonly trace: () => string }>>;
    type _PluginTransitionExtensions = Assert<
      Equal<PluginTransitionExtensions<readonly [TestPlugin]>, { readonly finish: () => ManagerAction<Event> }>
    >;
    type _EffectDeps = Assert<
      EffectDeps<Deps, readonly [TestPlugin]> extends Deps & {
        readonly trace: () => string;
        readonly transition: { readonly finish: () => ManagerAction<Event> };
      }
        ? true
        : false
    >;
    type _ManagerActionMeta = Assert<
      Equal<ManagerActionMeta<readonly [TestPlugin]>, CoreActionMeta & { readonly routeId?: string }>
    >;
    type _ManagerFromPlugins = Assert<
      Equal<
        ManagerFromPlugins<Store, Event, readonly [TestPlugin]>,
        IMachineManager<Store, Event | Ping, ManagerActionMeta<readonly [TestPlugin]>, readonly [TestPlugin]> & {
          readonly audit: { readonly enabled: true };
        }
      >
    >;
    type _LiteFsmPlugin = Assert<
      Equal<LiteFsmPlugin<{ manager: { ready: true } }>["install"], (ctx: PluginInstallContext) => void>
    >;
    type _PluginInstallContext = Assert<
      Equal<keyof PluginInstallContext, "actions" | "storage" | "dispatch" | "routing" | "manager" | "deps">
    >;
    type _ManagerExtensionCapability = Assert<ManagerExtensionCapability extends { (): object } ? true : false>;
    type _ManagerExtensionStore = Assert<Equal<ManagerExtensionStore<ManagerExtensionCapability>, MachineStore>>;
    type _ManagerExtensionAppEvents = Assert<Equal<ManagerExtensionAppEvents<ManagerExtensionCapability>, AnyEvent>>;
    type _ManagerRuntimeContextKeys = Assert<
      Equal<
        keyof ManagerRuntimeContext,
        "config" | "options" | "schemaVersion" | "getState" | "transition" | "onTransition" | "getDependencies"
      >
    >;
    type _ManagerExtensionFactory = Assert<
      Equal<ManagerExtensionFactory<{ ok: true }>, (ctx: ManagerRuntimeContext) => { ok: true }>
    >;
    type _ManagerExtensionRegistry = Assert<
      Equal<
        ManagerExtensionRegistry,
        { extend<Key extends string, Value>(key: Key, factory: ManagerExtensionFactory<Value>): void }
      >
    >;
    type _ScopedPhase = Assert<Equal<ScopedInvocationPhase, "effect" | "reaction">>;
    type _ScopedSource = Assert<Equal<ScopedInvocationSource, { readonly storage: string; readonly template: string }>>;
    type _ScopedIndices = Assert<Equal<ScopedInvocationIndices, Readonly<Record<string, unknown>>>>;
    type _ScopedContext = Assert<
      Equal<
        ScopedInvocationContext,
        {
          readonly source: ScopedInvocationSource;
          readonly event: ManagerAction<AnyEvent>;
          readonly indices: ScopedInvocationIndices;
          readonly phase: ScopedInvocationPhase;
          readonly transition: (action: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>;
        }
      >
    >;
    type _ScopedDepsContext = Assert<Equal<ScopedDepsContext, ScopedInvocationContext>>;
    type _ScopedTransitionContext = Assert<Equal<ScopedTransitionContext, ScopedInvocationContext>>;
    type _DepsFactory = Assert<
      Equal<ScopedDepsFactory<{ readonly trace: string }>["keys"], readonly string[]>
    >;
    type _TransitionFactory = Assert<
      Equal<ScopedTransitionFactory<{ readonly finish: () => void }>["keys"], readonly string[]>
    >;
    type _DepsExtensionRegistry = Assert<
      Equal<
        DepsExtensionRegistry,
        {
          extendDeps(factory: ScopedDepsFactory): void;
          extendTransition(factory: ScopedTransitionFactory): void;
        }
      >
    >;
    type _DispatchContext = Assert<
      Equal<
        DispatchContext,
        {
          readonly options: unknown;
          readonly runtime: Map<string, unknown>;
          readonly originalAction: ManagerAction<AnyEvent>;
          readonly action: ManagerAction<AnyEvent>;
          readonly skipDelivery: boolean;
          reportError(error: unknown): void;
        }
      >
    >;
    type _ActionInterceptorContext = Assert<Equal<ActionInterceptorContext, DispatchContext>>;
    type _ActionInterceptorResult = Assert<
      Equal<
        ActionInterceptorResult,
        | void
        | {
            readonly action?: ManagerAction<AnyEvent>;
            readonly skipDelivery?: boolean;
            readonly stopInterceptors?: boolean;
          }
      >
    >;
    type _ActionRegistry = Assert<Equal<ActionRegistry, { intercept(handler: ActionInterceptor): void }>>;
    type _DispatchHook = Assert<Equal<DispatchHook, (ctx: DispatchContext) => void>>;
    type _DispatchRegistry = Assert<
      Equal<
        DispatchRegistry,
        {
          beforeReduce(hook: DispatchHook): void;
          afterReduce(hook: DispatchHook): void;
          beforeCommit(hook: DispatchHook): void;
          beforeSubscribers(hook: DispatchHook): void;
          beforeEffects(hook: DispatchHook): void;
          afterEffects(hook: DispatchHook): void;
        }
      >
    >;
    type _RouteResolverResult = Assert<Equal<RouteResolverResult, string | readonly string[]>>;
    type _RouteResolverContext = Assert<
      Equal<
        RouteResolverContext<"entityId">,
        {
          readonly key: "entityId";
          readonly action: ManagerAction<AnyEvent>;
          readonly meta: Readonly<Record<string, unknown>>;
        }
      >
    >;
    type _RouteResolver = Assert<
      Equal<RouteResolver<"entityId">, (value: unknown, ctx: RouteResolverContext<"entityId">) => RouteResolverResult>
    >;
    type _RoutingRegistry = Assert<
      Equal<RoutingRegistry, { registerMetaKey<Key extends string>(key: Key, resolver: RouteResolver<Key>): void }>
    >;
  });

  test("экспортирует createActorMeta как public runtime helper", () => {
    const meta = createActorMeta({ actorId: "a", groupId: "g", groupTag: "t" });

    expect(meta).type.toBe<Readonly<ActorMeta>>();
    // @ts-expect-error!
    meta.actorId = "next";
  });

  test("экспортирует definePlugin как public runtime helper", () => {
    const plugin = definePlugin({ name: "exported-plugin", install() {} });

    expect(plugin.name).type.toBe<"exported-plugin">();
    expect(plugin.install).type.toBeAssignableTo<(ctx: PluginInstallContext) => void>();
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
    expect<MachineManagerOptions<Store, Event>["plugins"]>().type.toBe<readonly LiteFsmPlugin[] | undefined>();
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
