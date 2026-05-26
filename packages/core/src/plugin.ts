// Public entry point of plugin system. Содержит typed builder definePlugin, value type
// LiteFsmPlugin и factory createPluginValue. Validation/normalization вынесены в
// pluginNormalize.ts; runtime types и helpers — в pluginTypes.ts / pluginHelpers.ts.

import { invalidPluginDefinition, isPlainObject, normalizePluginDefinition } from "./pluginNormalize";
import type {
  DispatchContext,
  DispatchHookPhase,
  ManagerExtensionFactory,
  NormalizedPlugin,
  RouteResolverContext,
  RouteResolverResult,
  ScopedInvocationContext,
} from "./pluginTypes";
import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type { AnyEvent, ManagerAction } from "./types";

// Re-exports keep public API stable: tests и runtime importят эти типы из ./plugin.
export type {
  ActionInterceptor,
  ActionInterceptorResult,
  DispatchContext,
  DispatchHook,
  DispatchHookPhase,
  ManagerExtensionFactory,
  ManagerRuntimeContext,
  NormalizedDispatchHook,
  NormalizedManagerEntry,
  NormalizedPlugin,
  NormalizedRouteMetaEntry,
  NormalizedScopedDepsEntry,
  NormalizedScopedTransitionEntry,
  NormalizedStorageEntry,
  RouteResolver,
  RouteResolverContext,
  RouteResolverResult,
  RoutingRegistry,
  ScopedInvocationContext,
  ScopedInvocationIndices,
  ScopedInvocationPhase,
  ScopedInvocationSource,
} from "./pluginTypes";
export type {
  EffectDeps,
  ManagerActionMeta,
  ManagerTransitionEvents,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginManagerExtensions,
  PluginRouteMeta,
  PluginScopedDeps,
  PluginScopedTransition,
  ScopedPluginDepsOf,
} from "./pluginHelpers";

// === Plugin value marker =====================================================
// Symbol slots отделяют branded plugin value от arbitrary structural objects;
// payload хранится в hidden slot, чтобы users не видели normalized representation.

const liteFsmPluginMarker: unique symbol = Symbol.for("lite-fsm.plugin.value") as never;
const liteFsmPluginPayload: unique symbol = Symbol.for("lite-fsm.plugin.payload") as never;
declare const liteFsmPluginEvents: unique symbol;
declare const liteFsmPluginDefinition: unique symbol;

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

// === Plugin definition typing ================================================

// Observer callbacks получают общий поток host manager-а; scoped transition остается
// ограничен событиями, которые plugin сам добавляет в manager.transition.
type PluginObservedEvents<PluginEvents extends AnyEvent, HostEvents extends AnyEvent> = [AnyEvent] extends [HostEvents]
  ? AnyEvent
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

// bivarianceHack нужен, чтобы resolver value/ctx инферились bivariantly через intersection-typing.
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

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type UnknownIfUnannotated<Value> = IsAny<Value> extends true ? unknown : [Value] extends [never] ? unknown : Value;

type RouteMetaValue<Resolver> = Resolver extends (value: infer Value, ...args: any[]) => unknown
  ? UnknownIfUnannotated<Value>
  : unknown;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type StorageRouteMetaRequirements<Definition> = Definition extends {
  readonly storage?: infer Storage extends readonly unknown[];
}
  ? UnionToIntersection<
      Storage[number] extends LiteFsmStorageRuntimeDefinition<any, any, infer RouteMetaRequirements>
        ? RouteMetaRequirements
        : never
    >
  : {};

type RequiredRouteMetaSection<
  RouteMetaResolvers extends object,
  RouteMetaRequirements extends object,
> = keyof RouteMetaRequirements extends never
  ? {}
  : {
      readonly routeMeta: {
        readonly [Key in keyof RouteMetaRequirements & string]: Key extends keyof RouteMetaResolvers
          ? RouteMetaValue<RouteMetaResolvers[Key]> extends RouteMetaRequirements[Key]
            ? unknown
            : never
          : never;
      };
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
  Events extends AnyEvent = PluginObservedEvents<PluginEvents, HostEvents>,
> = {
  readonly name: Name;
  readonly manager?: Record<string, ManagerExtensionFactory>;
  readonly storage?: readonly [LiteFsmStorageRuntimeDefinition, ...LiteFsmStorageRuntimeDefinition[]];
  readonly scopedDeps?: Record<string, PluginScopedFactory<Events, PluginEvents>>;
  readonly scopedTransition?: Record<string, PluginScopedFactory<Events, PluginEvents>>;
  readonly intercept?: PluginActionInterceptor<Events>;
  readonly hooks?: Partial<Record<DispatchHookPhase, PluginDispatchHook<Events>>>;
};

type PluginDefinitionKey =
  | "name"
  | "routeMeta"
  | "manager"
  | "storage"
  | "scopedDeps"
  | "scopedTransition"
  | "intercept"
  | "hooks";

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
  PluginRouteMetaSection<RouteMetaValues, RouteMetaResolvers, PluginObservedEvents<PluginEvents, HostEvents>> &
  RequiredRouteMetaSection<RouteMetaResolvers, StorageRouteMetaRequirements<Definition>> &
  RejectUnknownKeys<
    Definition &
      PluginRouteMetaSection<RouteMetaValues, RouteMetaResolvers, PluginObservedEvents<PluginEvents, HostEvents>>
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

// === Factory / accessors =====================================================

const createPluginValue = <const Definition extends { readonly name: string }, PluginEvents extends AnyEvent>(
  definition: Definition,
): LiteFsmPlugin<Definition["name"], PluginEvents, Definition> => {
  const normalized = normalizePluginDefinition(definition);
  const value = { name: normalized.name } as LiteFsmPlugin<Definition["name"], PluginEvents, Definition>;

  Object.defineProperties(value, {
    [liteFsmPluginMarker]: { value: true },
    [liteFsmPluginPayload]: { value: normalized },
  });

  return Object.freeze(value);
};

export function definePlugin<
  PluginEvents extends AnyEvent = never,
  HostEvents extends AnyEvent = AnyEvent,
>(): PluginBuilder<PluginEvents, HostEvents> {
  if (arguments.length > 0) {
    invalidPluginDefinition("definePlugin must be called without arguments; use definePlugin().create(...).");
  }

  return {
    create<
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
    },
  };
}

export const isLiteFsmPluginValue = (value: unknown): value is LiteFsmPlugin =>
  isPlainObject(value) && Reflect.get(value, liteFsmPluginMarker) === true;

export const getNormalizedPlugin = (plugin: LiteFsmPlugin): NormalizedPlugin =>
  Reflect.get(plugin, liteFsmPluginPayload) as NormalizedPlugin;
