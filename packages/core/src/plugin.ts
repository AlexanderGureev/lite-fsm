import type {
  AnyEvent,
  CoreActionMeta,
  MachineRuntimeExtension,
  MachinesState,
  MachineStore,
  ManagerAction,
} from "./types";
import type { StorageRegistry } from "./runtime/kernel/storage";

export type RouteResolverResult = string | readonly string[];

export type RouteResolverContext<Key extends string = string> = {
  readonly key: Key;
  readonly action: ManagerAction<AnyEvent>;
  readonly meta: Readonly<Record<string, unknown>>;
};

export type RouteResolver<Key extends string = string> = (
  value: unknown,
  ctx: RouteResolverContext<Key>,
) => RouteResolverResult;

export type RoutingRegistry = {
  registerMetaKey<Key extends string>(key: Key, resolver: RouteResolver<Key>): void;
};

export type DispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly originalAction: ManagerAction<AnyEvent>;
  readonly action: ManagerAction<AnyEvent>;
  readonly skipDelivery: boolean;
  reportError(error: unknown): void;
};

export type ActionInterceptorContext = DispatchContext;

export type ActionInterceptorResult =
  | void
  | {
      readonly action?: ManagerAction<AnyEvent>;
      readonly skipDelivery?: boolean;
      readonly stopInterceptors?: boolean;
    };

export type ActionInterceptor = (ctx: ActionInterceptorContext) => ActionInterceptorResult;

export type ActionRegistry = {
  intercept(handler: ActionInterceptor): void;
};

export type DispatchHook = (ctx: DispatchContext) => void;

export type DispatchRegistry = {
  beforeReduce(hook: DispatchHook): void;
  afterReduce(hook: DispatchHook): void;
  beforeCommit(hook: DispatchHook): void;
  beforeSubscribers(hook: DispatchHook): void;
  beforeEffects(hook: DispatchHook): void;
  afterEffects(hook: DispatchHook): void;
};

export type ScopedInvocationPhase = "effect" | "reaction";

export type ScopedInvocationSource = {
  readonly storage: string;
  readonly template: string;
};

export type ScopedInvocationIndices = Readonly<Record<string, unknown>>;

export type ScopedInvocationContext = {
  readonly source: ScopedInvocationSource;
  readonly event: ManagerAction<AnyEvent>;
  readonly indices: ScopedInvocationIndices;
  readonly phase: ScopedInvocationPhase;
  readonly transition: (action: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>;
};

export type ScopedDepsContext = ScopedInvocationContext;
export type ScopedTransitionContext = ScopedInvocationContext;

export type ScopedDepsFactory<Deps extends object = object> = {
  readonly keys: readonly string[];
  (ctx: ScopedDepsContext): Deps;
};

export type ScopedTransitionFactory<Transition extends object = object> = {
  readonly keys: readonly string[];
  (ctx: ScopedTransitionContext): Transition;
};

export type DepsExtensionRegistry = {
  extendDeps(factory: ScopedDepsFactory): void;
  extendTransition(factory: ScopedTransitionFactory): void;
};

export type ManagerRuntimeContext = {
  readonly config: MachineStore;
  readonly options: unknown;
  readonly schemaVersion: number | undefined;
  getState(): MachinesState<MachineStore>;
  transition(action: ManagerAction<AnyEvent>, options?: unknown): ManagerAction<AnyEvent>;
  onTransition(
    cb: (
      prevState: MachinesState<MachineStore>,
      currentState: MachinesState<MachineStore>,
      action: ManagerAction<AnyEvent> | { type: string; payload?: unknown },
    ) => void,
  ): () => void;
  getDependencies(): Record<string, unknown>;
};

export type ManagerExtensionFactory<Value = unknown> = (ctx: ManagerRuntimeContext) => Value;

export type ManagerExtensionRegistry = {
  extend<Key extends string, Value>(key: Key, factory: ManagerExtensionFactory<Value>): void;
};

export type PluginInstallContext = {
  readonly actions: ActionRegistry;
  readonly storage: StorageRegistry;
  readonly dispatch: DispatchRegistry;
  readonly routing: RoutingRegistry;
  readonly manager: ManagerExtensionRegistry;
  readonly deps: DepsExtensionRegistry;
};

export type ManagerExtensionCapability = {
  <S extends MachineStore, AppEvents extends AnyEvent>(
    this: {
      readonly __liteFsmManagerExtensionStore?: S;
      readonly __liteFsmManagerExtensionEvents?: AppEvents;
    },
  ): object;
  readonly __liteFsmManagerExtensionStore?: unknown;
  readonly __liteFsmManagerExtensionEvents?: unknown;
  __liteFsmManagerExtension?(): object;
};

export type PluginCapabilities = {
  readonly manager?: object | ManagerExtensionCapability;
  readonly transitionEvents?: AnyEvent;
  readonly machine?: MachineRuntimeExtension;
  readonly actionMeta?: object;
  readonly deps?: object;
  readonly transition?: object;
};

export type LiteFsmPlugin<Capabilities extends PluginCapabilities = {}> = {
  readonly name: string;
  install(ctx: PluginInstallContext): void;
  readonly __capabilities?: Capabilities;
};

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void
  ? I
  : never;

declare const scopedEffectDeps: unique symbol;

type CapabilitiesOf<Plugin> = Plugin extends LiteFsmPlugin<infer Capabilities> ? Capabilities : {};

type HasSpecificCapabilities<Capabilities> = PluginCapabilities extends Capabilities ? false : true;

type TransitionEventsOf<Plugin> =
  HasSpecificCapabilities<CapabilitiesOf<Plugin>> extends true
    ? "transitionEvents" extends keyof CapabilitiesOf<Plugin>
      ? NonNullable<CapabilitiesOf<Plugin>["transitionEvents"]> extends infer Events
        ? Events extends AnyEvent
          ? Events
          : never
        : never
      : never
    : never;

type ActionMetaOf<Plugin> =
  HasSpecificCapabilities<CapabilitiesOf<Plugin>> extends true
    ? "actionMeta" extends keyof CapabilitiesOf<Plugin>
      ? NonNullable<CapabilitiesOf<Plugin>["actionMeta"]> extends infer Meta
        ? Meta extends object
          ? Meta
          : never
        : never
      : never
    : never;

type DepsOf<Plugin> =
  HasSpecificCapabilities<CapabilitiesOf<Plugin>> extends true
    ? "deps" extends keyof CapabilitiesOf<Plugin>
      ? NonNullable<CapabilitiesOf<Plugin>["deps"]> extends infer Deps
        ? Deps extends object
          ? Deps
          : never
        : never
      : never
    : never;

type TransitionOf<Plugin> =
  HasSpecificCapabilities<CapabilitiesOf<Plugin>> extends true
    ? "transition" extends keyof CapabilitiesOf<Plugin>
      ? NonNullable<CapabilitiesOf<Plugin>["transition"]> extends infer Transition
        ? Transition extends object
          ? Transition
          : never
        : never
      : never
    : never;

type ManagerOf<Plugin> =
  HasSpecificCapabilities<CapabilitiesOf<Plugin>> extends true
    ? "manager" extends keyof CapabilitiesOf<Plugin>
      ? NonNullable<CapabilitiesOf<Plugin>["manager"]> extends infer Manager
        ? Manager extends object
          ? Manager
          : never
        : never
      : never
    : never;

type PluginActionMetaUnion<Plugins extends readonly LiteFsmPlugin[]> = ActionMetaOf<Plugins[number]>;
type PluginDepsUnion<Plugins extends readonly LiteFsmPlugin[]> = DepsOf<Plugins[number]>;
type PluginManagerUnion<Plugins extends readonly LiteFsmPlugin[]> = ManagerOf<Plugins[number]>;
type PluginTransitionUnion<Plugins extends readonly LiteFsmPlugin[]> = TransitionOf<Plugins[number]>;

export type PluginTransitionEvents<Plugins extends readonly LiteFsmPlugin[]> = TransitionEventsOf<Plugins[number]>;

export type PluginActionMeta<Plugins extends readonly LiteFsmPlugin[]> = [
  PluginActionMetaUnion<Plugins>,
] extends [never]
  ? {}
  : Partial<UnionToIntersection<PluginActionMetaUnion<Plugins>>>;

export type ManagerActionMeta<Plugins extends readonly LiteFsmPlugin[]> = CoreActionMeta & PluginActionMeta<Plugins>;

export type PluginDeps<Plugins extends readonly LiteFsmPlugin[]> = [PluginDepsUnion<Plugins>] extends [never]
  ? {}
  : UnionToIntersection<PluginDepsUnion<Plugins>>;

export type PluginTransitionExtensions<Plugins extends readonly LiteFsmPlugin[]> = [
  PluginTransitionUnion<Plugins>,
] extends [never]
  ? {}
  : UnionToIntersection<PluginTransitionUnion<Plugins>>;

export type ManagerExtensionStore<Capability extends ManagerExtensionCapability> =
  Capability["__liteFsmManagerExtensionStore"] extends MachineStore
    ? Capability["__liteFsmManagerExtensionStore"]
    : MachineStore;

export type ManagerExtensionAppEvents<Capability extends ManagerExtensionCapability> =
  Capability["__liteFsmManagerExtensionEvents"] extends AnyEvent
    ? Capability["__liteFsmManagerExtensionEvents"]
    : AnyEvent;

type ApplyManagerExtensionCapability<
  Capability extends ManagerExtensionCapability,
  S extends MachineStore,
  AppEvents extends AnyEvent,
> = Capability extends { __liteFsmManagerExtension(): object }
  ? ReturnType<
      (Capability & {
        readonly __liteFsmManagerExtensionStore: S;
        readonly __liteFsmManagerExtensionEvents: AppEvents;
      })["__liteFsmManagerExtension"]
    >
  : ReturnType<Capability>;

type ResolveManagerExtension<
  Capability,
  S extends MachineStore,
  AppEvents extends AnyEvent,
> = Capability extends ManagerExtensionCapability
  ? ApplyManagerExtensionCapability<Capability, S, AppEvents>
  : Capability extends object
    ? Capability
    : never;

export type PluginManagerExtensions<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = [PluginManagerUnion<Plugins>] extends [never]
  ? {}
  : UnionToIntersection<ResolveManagerExtension<PluginManagerUnion<Plugins>, S, AppEvents>>;

export type ScopedPluginDepsOf<Deps> = Deps extends { readonly [scopedEffectDeps]?: infer PluginScopedDeps }
  ? PluginScopedDeps
  : {};

export type EffectDeps<AppDeps extends object, Plugins extends readonly LiteFsmPlugin[]> = AppDeps &
  PluginDeps<Plugins> & {
    readonly transition: PluginTransitionExtensions<Plugins>;
  } & { readonly [scopedEffectDeps]?: PluginDeps<Plugins> };

export type ManagerTransitionEvents<
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = AppEvents | PluginTransitionEvents<Plugins>;

export function definePlugin<Capabilities extends PluginCapabilities, const Name extends string = string>(
  plugin: LiteFsmPlugin<Capabilities> & { readonly name: Name },
): LiteFsmPlugin<Capabilities> & { readonly name: Name };
export function definePlugin<const Plugin extends LiteFsmPlugin>(plugin: Plugin): Plugin;
export function definePlugin(plugin: LiteFsmPlugin): LiteFsmPlugin {
  return plugin;
}
