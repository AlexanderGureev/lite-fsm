import type { AnyEvent, CoreActionMeta, MachinesState, MachineStore, ManagerAction } from "./types";
import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import { getStorageRuntimePayload, isLiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import { LiteFsmError } from "./utils";

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
  registerRouteMeta<Key extends string>(key: Key, resolver: RouteResolver<Key>): void;
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

export type ActionInterceptorResult = void | {
  readonly action?: ManagerAction<AnyEvent>;
  readonly skipDelivery?: boolean;
  readonly stopInterceptors?: boolean;
};

export type ActionInterceptor = (ctx: ActionInterceptorContext) => ActionInterceptorResult;

export type DispatchHook = (ctx: DispatchContext) => void;

const dispatchHookPhaseValues = [
  "beforeReduce",
  "afterReduce",
  "beforeCommit",
  "beforeSubscribers",
  "beforeEffects",
  "afterEffects",
] as const;

export type DispatchHookPhase = (typeof dispatchHookPhaseValues)[number];

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

const liteFsmPluginMarker: unique symbol = Symbol.for("lite-fsm.plugin.value") as never;
const liteFsmPluginPayload: unique symbol = Symbol.for("lite-fsm.plugin.payload") as never;
declare const liteFsmPluginEvents: unique symbol;
declare const liteFsmPluginDefinition: unique symbol;

export type NormalizedStorageEntry = {
  readonly owner: string;
  readonly kind: string;
  readonly value: unknown;
};

export type NormalizedRouteMetaEntry = {
  readonly owner: string;
  readonly key: string;
  readonly resolver: RouteResolver;
};

export type NormalizedScopedDepsEntry = {
  readonly owner: string;
  readonly key: string;
  readonly factory: (ctx: PluginScopedInvocationContext<AnyEvent, AnyEvent>) => unknown;
};

export type NormalizedScopedTransitionEntry = {
  readonly owner: string;
  readonly key: string;
  readonly factory: (ctx: PluginScopedInvocationContext<AnyEvent, AnyEvent>) => unknown;
};

export type NormalizedManagerEntry = {
  readonly owner: string;
  readonly key: string;
  readonly factory: ManagerExtensionFactory;
};

export type NormalizedDispatchHook = {
  readonly owner: string;
  readonly phase: DispatchHookPhase;
  readonly hook: DispatchHook;
};

export type NormalizedPlugin = {
  readonly name: string;
  readonly storage: readonly NormalizedStorageEntry[];
  readonly routeMeta: readonly NormalizedRouteMetaEntry[];
  readonly scopedDeps: readonly NormalizedScopedDepsEntry[];
  readonly scopedTransition: readonly NormalizedScopedTransitionEntry[];
  readonly manager: readonly NormalizedManagerEntry[];
  readonly intercept?: ActionInterceptor;
  readonly hooks: Partial<Record<DispatchHookPhase, NormalizedDispatchHook>>;
};

export type LiteFsmPlugin<
  Name extends string = string,
  PluginEvents extends AnyEvent = never,
  Definition extends object = object,
> = {
  readonly name: Name;
  readonly [liteFsmPluginMarker]: true;
  readonly [liteFsmPluginPayload]: NormalizedPlugin;
  readonly [liteFsmPluginEvents]: PluginEvents;
  readonly [liteFsmPluginDefinition]: Definition;
};

type ObserverEvents<PluginEvents extends AnyEvent, HostEvents extends AnyEvent> = [HostEvents] extends [never]
  ? PluginEvents
  : HostEvents | PluginEvents;

type PluginDispatchContext<Events extends AnyEvent> = Omit<DispatchContext, "action" | "originalAction"> & {
  readonly originalAction: ManagerAction<Events>;
  readonly action: ManagerAction<Events>;
};

type PluginActionInterceptorResult<Events extends AnyEvent> = void | {
  readonly action?: ManagerAction<Events>;
  readonly skipDelivery?: boolean;
  readonly stopInterceptors?: boolean;
};

type PluginActionInterceptor<Events extends AnyEvent> = (
  ctx: PluginDispatchContext<Events>,
) => PluginActionInterceptorResult<Events>;

type PluginDispatchHook<Events extends AnyEvent> = (ctx: PluginDispatchContext<Events>) => void;

type PluginRouteResolverContext<Key extends string, Events extends AnyEvent> = Omit<
  RouteResolverContext<Key>,
  "action"
> & {
  readonly action: ManagerAction<Events>;
};

type PluginRouteResolver<Key extends string, Events extends AnyEvent, Value = unknown> = {
  bivarianceHack(value: Value, ctx: PluginRouteResolverContext<Key, Events>): RouteResolverResult;
}["bivarianceHack"];

export type PluginScopedInvocationContext<Events extends AnyEvent, TransitionEvents extends AnyEvent> = Omit<
  ScopedInvocationContext,
  "event" | "transition"
> & {
  readonly event: ManagerAction<Events>;
  readonly transition: (action: ManagerAction<TransitionEvents>) => ManagerAction<TransitionEvents>;
};

type PluginScopedFactory<Events extends AnyEvent, TransitionEvents extends AnyEvent> = (
  ctx: PluginScopedInvocationContext<Events, TransitionEvents>,
) => unknown;

type PluginRouteMetaContext<RouteMetaValues extends object, Events extends AnyEvent> = {
  readonly [Key in keyof RouteMetaValues]: Key extends string
    ? PluginRouteResolver<Key, Events, RouteMetaValues[Key]>
    : never;
};

type PluginRouteMetaSection<
  RouteMetaValues extends object,
  RouteMetaResolvers extends object,
  Events extends AnyEvent,
> = {
  readonly routeMeta?: RouteMetaResolvers & PluginRouteMetaContext<RouteMetaValues, Events>;
};

type PluginDefinitionBase<
  PluginEvents extends AnyEvent,
  HostEvents extends AnyEvent,
  Name extends string = string,
  Events extends AnyEvent = ObserverEvents<PluginEvents, HostEvents>,
> = {
  readonly name: Name;
  readonly manager?: Record<string, ManagerExtensionFactory>;
  readonly storage?: readonly [LiteFsmStorageRuntimeDefinition, ...LiteFsmStorageRuntimeDefinition[]];
  readonly scopedDeps?: Record<string, PluginScopedFactory<Events, PluginEvents>>;
  readonly scopedTransition?: Record<string, PluginScopedFactory<Events, PluginEvents>>;
  readonly intercept?: PluginActionInterceptor<Events>;
  readonly hooks?: Partial<Record<DispatchHookPhase, PluginDispatchHook<Events>>>;
};

const pluginDefinitionKeys = [
  "name",
  "routeMeta",
  "manager",
  "storage",
  "scopedDeps",
  "scopedTransition",
  "intercept",
  "hooks",
] as const;

type PluginDefinitionKey = (typeof pluginDefinitionKeys)[number];

type RejectUnknownKeys<Definition extends object> = {
  readonly [Key in Exclude<keyof Definition, PluginDefinitionKey>]: never;
};

type PluginDefinitionOutput<Definition extends object, RouteMetaResolvers extends object> = Omit<
  Definition,
  "routeMeta"
> & {
  readonly routeMeta?: RouteMetaResolvers;
};

type PluginDefinitionInput<
  PluginEvents extends AnyEvent,
  HostEvents extends AnyEvent,
  RouteMetaValues extends object,
  RouteMetaResolvers extends object,
  Definition extends PluginDefinitionBase<PluginEvents, HostEvents>,
> = Definition &
  PluginRouteMetaSection<RouteMetaValues, RouteMetaResolvers, ObserverEvents<PluginEvents, HostEvents>> &
  RejectUnknownKeys<
    Definition & PluginRouteMetaSection<RouteMetaValues, RouteMetaResolvers, ObserverEvents<PluginEvents, HostEvents>>
  >;

type PluginCreate<PluginEvents extends AnyEvent, HostEvents extends AnyEvent> = <
  const RouteMetaValues extends object = {},
  const RouteMetaResolvers extends object = {},
  const Definition extends PluginDefinitionBase<PluginEvents, HostEvents> = PluginDefinitionBase<
    PluginEvents,
    HostEvents
  >,
>(
  definition: PluginDefinitionInput<PluginEvents, HostEvents, RouteMetaValues, RouteMetaResolvers, Definition>,
) => LiteFsmPlugin<Definition["name"], PluginEvents, PluginDefinitionOutput<Definition, RouteMetaResolvers>>;

export type PluginBuilder<PluginEvents extends AnyEvent, HostEvents extends AnyEvent> = {
  create: PluginCreate<PluginEvents, HostEvents>;
};

type PlainRecord = Record<string, unknown>;
type UnknownFunction = (...args: never[]) => unknown;

const topLevelSections = new Set<string>(pluginDefinitionKeys);

const dispatchHookPhases = new Set<string>(dispatchHookPhaseValues);

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isPlainObject = (value: unknown): value is PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const invalidPluginDefinition = (message: string): never => {
  throw new LiteFsmError("LITE_FSM_INVALID_PLUGIN_DEFINITION", `[lite-fsm] invalid plugin definition: ${message}`);
};

const assertDispatchHookPhase = (value: string): DispatchHookPhase => {
  if (dispatchHookPhases.has(value as DispatchHookPhase)) return value as DispatchHookPhase;

  return invalidPluginDefinition(`unknown dispatch hook phase '${value}'.`);
};

const assertPluginName = (value: unknown): string => {
  if (typeof value === "string" && value.length > 0) return value;

  return invalidPluginDefinition("name must be a non-empty string.");
};

const assertKnownTopLevelSections = (definition: PlainRecord) => {
  for (const key of Object.keys(definition)) {
    if (topLevelSections.has(key)) continue;

    invalidPluginDefinition(`unknown top-level section '${key}'.`);
  }
};

const assertObjectSection = (section: string, value: unknown): [string, unknown][] => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition(`section '${section}' must be a plain object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    invalidPluginDefinition(`section '${section}' must not be empty.`);
  }

  return entries;
};

const assertFunctionEntry = (section: string, key: string, value: unknown): UnknownFunction => {
  if (typeof value === "function") return value as UnknownFunction;

  return invalidPluginDefinition(`section '${section}' entry '${key}' must be a function.`);
};

const assertStorageRuntimeDefinitionValue = (value: unknown): LiteFsmStorageRuntimeDefinition => {
  if (isLiteFsmStorageRuntimeDefinition(value)) return value;

  return invalidPluginDefinition("storage definitions require defineStorageRuntime().create(...).");
};

const assertStorageSection = (value: unknown): readonly LiteFsmStorageRuntimeDefinition[] => {
  if (!Array.isArray(value)) {
    return invalidPluginDefinition("section 'storage' must be an array of storage definitions.");
  }

  if (value.length === 0) {
    return invalidPluginDefinition("section 'storage' must not be empty.");
  }

  return value.map(assertStorageRuntimeDefinitionValue);
};

const normalizeStorage = (owner: string, value: unknown): readonly NormalizedStorageEntry[] => {
  const registeredKinds = new Set<string>();

  return assertStorageSection(value).map((definition) => {
    if (registeredKinds.has(definition.kind)) {
      invalidPluginDefinition(`plugin '${owner}' defines duplicate storage kind '${definition.kind}'.`);
    }

    registeredKinds.add(definition.kind);
    return {
      owner,
      kind: definition.kind,
      value: getStorageRuntimePayload(definition),
    };
  });
};

const normalizeRouteMeta = (owner: string, value: unknown): readonly NormalizedRouteMetaEntry[] => {
  return assertObjectSection("routeMeta", value).map(([key, resolver]) => ({
    owner,
    key,
    resolver: assertFunctionEntry("routeMeta", key, resolver) as RouteResolver,
  }));
};

const normalizeManager = (owner: string, value: unknown): readonly NormalizedManagerEntry[] => {
  return assertObjectSection("manager", value).map(([key, factory]) => ({
    owner,
    key,
    factory: assertFunctionEntry("manager", key, factory) as ManagerExtensionFactory,
  }));
};

function normalizeScopedFactories(
  section: "scopedDeps",
  owner: string,
  value: unknown,
): readonly NormalizedScopedDepsEntry[];
function normalizeScopedFactories(
  section: "scopedTransition",
  owner: string,
  value: unknown,
): readonly NormalizedScopedTransitionEntry[];
function normalizeScopedFactories(
  section: "scopedDeps" | "scopedTransition",
  owner: string,
  value: unknown,
): readonly (NormalizedScopedDepsEntry | NormalizedScopedTransitionEntry)[] {
  return assertObjectSection(section, value).map(([key, factory]) => ({
    owner,
    key,
    factory: assertFunctionEntry(section, key, factory) as PluginScopedFactory<AnyEvent, AnyEvent>,
  }));
}

const normalizeHooks = (owner: string, value: unknown): Partial<Record<DispatchHookPhase, NormalizedDispatchHook>> => {
  const hooks: Partial<Record<DispatchHookPhase, NormalizedDispatchHook>> = {};

  for (const [phase, hook] of assertObjectSection("hooks", value)) {
    const hookPhase = assertDispatchHookPhase(phase);

    hooks[hookPhase] = {
      owner,
      phase: hookPhase,
      hook: assertFunctionEntry("hooks", phase, hook) as DispatchHook,
    };
  }

  return hooks;
};

const normalizePluginDefinition = (value: unknown): NormalizedPlugin => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition("definition must be a plain object.");
  }

  assertKnownTopLevelSections(value);

  const name = assertPluginName(value.name);

  const normalized: NormalizedPlugin = {
    name,
    storage: hasOwn(value, "storage") ? normalizeStorage(name, value.storage) : [],
    routeMeta: hasOwn(value, "routeMeta") ? normalizeRouteMeta(name, value.routeMeta) : [],
    scopedDeps: hasOwn(value, "scopedDeps") ? normalizeScopedFactories("scopedDeps", name, value.scopedDeps) : [],
    scopedTransition: hasOwn(value, "scopedTransition")
      ? normalizeScopedFactories("scopedTransition", name, value.scopedTransition)
      : [],
    manager: hasOwn(value, "manager") ? normalizeManager(name, value.manager) : [],
    hooks: hasOwn(value, "hooks") ? normalizeHooks(name, value.hooks) : {},
  };

  if (hasOwn(value, "intercept")) {
    if (typeof value.intercept !== "function") {
      invalidPluginDefinition("section 'intercept' must be a function.");
    }

    return { ...normalized, intercept: value.intercept as ActionInterceptor };
  }

  return normalized;
};

const createPluginValue = <const Definition extends { readonly name: string }, PluginEvents extends AnyEvent>(
  definition: Definition,
): LiteFsmPlugin<Definition["name"], PluginEvents, Definition> => {
  const normalized = normalizePluginDefinition(definition);
  const value = { name: normalized.name } as LiteFsmPlugin<Definition["name"], PluginEvents, Definition>;

  Object.defineProperties(value, {
    [liteFsmPluginMarker]: {
      value: true,
    },
    [liteFsmPluginPayload]: {
      value: normalized,
    },
  });

  return Object.freeze(value);
};

export function definePlugin<
  PluginEvents extends AnyEvent = never,
  HostEvents extends AnyEvent = [PluginEvents] extends [never] ? AnyEvent : never,
>(): PluginBuilder<PluginEvents, HostEvents> {
  if (arguments.length > 0) {
    invalidPluginDefinition("definePlugin must be called without arguments; use definePlugin().create(...).");
  }

  function create<
    const RouteMetaValues extends object = {},
    const RouteMetaResolvers extends object = {},
    const Definition extends PluginDefinitionBase<PluginEvents, HostEvents> = PluginDefinitionBase<
      PluginEvents,
      HostEvents
    >,
  >(
    definition: PluginDefinitionInput<PluginEvents, HostEvents, RouteMetaValues, RouteMetaResolvers, Definition>,
  ): LiteFsmPlugin<Definition["name"], PluginEvents, PluginDefinitionOutput<Definition, RouteMetaResolvers>> {
    return createPluginValue<PluginDefinitionOutput<Definition, RouteMetaResolvers>, PluginEvents>(
      definition as unknown as PluginDefinitionOutput<Definition, RouteMetaResolvers>,
    );
  }

  return { create };
}

export const isLiteFsmPluginValue = (value: unknown): value is LiteFsmPlugin => {
  return isPlainObject(value) && Reflect.get(value, liteFsmPluginMarker) === true;
};

export const getNormalizedPlugin = (plugin: LiteFsmPlugin): NormalizedPlugin => {
  return Reflect.get(plugin, liteFsmPluginPayload) as NormalizedPlugin;
};

declare const scopedEffectDeps: unique symbol;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

type PluginMember<Plugin> = Plugin extends readonly unknown[] ? Plugin[number] : Plugin;

type PluginDefinitionOf<Plugin> = Plugin extends LiteFsmPlugin<any, any, infer Definition> ? Definition : never;

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type UnknownIfUnannotated<Value> = IsAny<Value> extends true ? unknown : [Value] extends [never] ? unknown : Value;

type RouteMetaValue<Resolver> = Resolver extends (value: infer Value, ...args: any[]) => unknown
  ? UnknownIfUnannotated<Value>
  : unknown;

type FactoryReturn<Factory> = Factory extends (...args: any[]) => infer Result ? Result : never;

type RouteMetaForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly routeMeta?: infer RouteMeta extends object }
    ? { [Key in keyof RouteMeta]: RouteMetaValue<RouteMeta[Key]> }
    : {};

type ScopedDepsForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly scopedDeps?: infer ScopedDeps extends object }
    ? { [Key in keyof ScopedDeps]: FactoryReturn<ScopedDeps[Key]> }
    : {};

type ScopedTransitionForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly scopedTransition?: infer ScopedTransition extends object }
    ? { [Key in keyof ScopedTransition]: FactoryReturn<ScopedTransition[Key]> }
    : {};

type ManagerExtensionsForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly manager?: infer Manager extends object }
    ? { [Key in keyof Manager]: FactoryReturn<Manager[Key]> }
    : {};

type MachineExtensionsForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly storage?: infer Storage extends readonly unknown[] }
    ? Storage[number] extends LiteFsmStorageRuntimeDefinition<any, infer MachineExtension>
      ? MachineExtension
      : never
    : never;

type PluginCapabilityIntersection<Capability> = [Capability] extends [never]
  ? {}
  : Prettify<UnionToIntersection<Capability>>;

export type ManagerActionMeta<Plugins extends readonly LiteFsmPlugin<any, any, any>[]> = Prettify<
  CoreActionMeta & Partial<PluginRouteMeta<Plugins>>
>;

export type ScopedPluginDepsOf<Deps> = Deps extends { readonly [scopedEffectDeps]?: infer PluginScopedDeps }
  ? PluginScopedDeps
  : {};

export type EffectDeps<AppDeps extends object, Plugin> = Prettify<
  AppDeps &
    PluginScopedDeps<Plugin> & {
      readonly transition: PluginScopedTransition<Plugin>;
      readonly [scopedEffectDeps]?: PluginScopedDeps<Plugin>;
    }
>;

export type ManagerTransitionEvents<
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin<any, any, any>[],
> = AppEvents | PluginManagerEvents<Plugins>;

export type PluginManagerExtensions<Plugin> = PluginCapabilityIntersection<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ManagerExtensionsForPlugin<Member>
      : never
    : never
>;

export type PluginRouteMeta<Plugin> = PluginCapabilityIntersection<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? RouteMetaForPlugin<Member>
      : never
    : never
>;

export type PluginScopedDeps<Plugin> = PluginCapabilityIntersection<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ScopedDepsForPlugin<Member>
      : never
    : never
>;

export type PluginScopedTransition<Plugin> = PluginCapabilityIntersection<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ScopedTransitionForPlugin<Member>
      : never
    : never
>;

export type PluginManagerEvents<Plugin> =
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, infer PluginEvents, any>
      ? PluginEvents
      : never
    : never;

export type PluginMachineExtensions<Plugin> =
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? MachineExtensionsForPlugin<Member>
      : never
    : never;
