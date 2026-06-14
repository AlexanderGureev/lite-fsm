// Derived helper types for plugin consumers. App code использует их, чтобы из tuple plugins
// получить events, route meta, scoped deps и manager extensions.

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type { LiteFsmPlugin } from "./plugin";
import type { AnyEvent, CoreActionMeta, MachinesState, MachineStore } from "./types";
import type {
  ManagerExtensionType,
  ManagerExtensionTypeLambda,
  managerExtensionTypeMarker,
  ManagerRuntimeContext,
} from "./pluginTypes";
import type { StorageMachineTypingExtension } from "./pluginStorageTypes";

// === Utility types ===========================================================

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type UnknownIfUnannotated<Value> = IsAny<Value> extends true ? unknown : [Value] extends [never] ? unknown : Value;

type FactoryReturn<Factory> = Factory extends (...args: any[]) => infer Result ? Result : never;

type RouteMetaValue<Resolver> = Resolver extends (value: infer Value, ...args: any[]) => unknown
  ? UnknownIfUnannotated<Value>
  : unknown;

type IsExactly<Value, Expected> = [Value] extends [Expected]
  ? [Expected] extends [Value]
    ? true
    : false
  : false;

type IsStoreReference<Value> =
  IsExactly<Value, MachineStore> extends true
    ? true
    : IsExactly<Value, MachinesState<MachineStore>> extends true
      ? true
      : false;

// Generic manager factories при ReturnType-подобном извлечении схлопываются до constraint.
// Локальная специализация восстанавливает ссылки на `MachineStore` и `MachinesState`.
type HasStoreReferences<Value> =
  IsAny<Value> extends true
    ? false
    : [Value] extends [never]
      ? false
      : IsStoreReference<Value> extends true
        ? true
        : Value extends (...args: any[]) => infer Result
          ? HasStoreReferences<Result>
          : Value extends object
            ? keyof Value extends never
              ? false
              : true extends { [Key in keyof Value]: HasStoreReferences<Value[Key]> }[keyof Value]
                ? true
                : false
            : false;

type SpecializeStoreReferences<Value, S extends MachineStore> =
  IsExactly<Value, MachineStore> extends true
    ? S
    : IsExactly<Value, MachinesState<MachineStore>> extends true
      ? MachinesState<S>
      : Value extends (...args: infer Args) => infer Result
        ? HasStoreReferences<Result> extends true
          ? (...args: Args) => SpecializeStoreReferences<Result, S>
          : Value
        : Value extends object
          ? HasStoreReferences<Value> extends true
            ? { [Key in keyof Value]: SpecializeStoreReferences<Value[Key], S> }
            : Value
          : Value;

// === Plugin tuple traversal ==================================================

type PluginMember<Plugin> = Plugin extends readonly unknown[] ? Plugin[number] : Plugin;

type PluginDefinitionOf<Plugin> = Plugin extends LiteFsmPlugin<any, any, infer Definition> ? Definition : never;

// Пересечение capabilities всех plugins в tuple. Пустой union даёт `{}`,
// чтобы helpers оставались useable без plugins.
type IntersectCapabilities<Capability> = [Capability] extends [never] ? {} : Prettify<UnionToIntersection<Capability>>;

// === Per-plugin section extractors ===========================================

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

type ApplyManagerExtensionType<
  Lambda extends ManagerExtensionTypeLambda,
  S extends MachineStore,
  Events extends AnyEvent,
> = (Lambda & {
  readonly context: ManagerRuntimeContext<Events, S>;
})["type"];

type ManagerFactoryReturn<Factory, S extends MachineStore, Events extends AnyEvent> =
  typeof managerExtensionTypeMarker extends keyof Factory
    ? Factory extends ManagerExtensionType<infer Lambda>
      ? ApplyManagerExtensionType<Lambda, S, Events>
      : never
    : SpecializeStoreReferences<
        Factory extends (ctx: ManagerRuntimeContext<infer FactoryEvents, any>) => unknown
          ? Factory extends (ctx: ManagerRuntimeContext<FactoryEvents, S>) => infer Result
            ? Result
            : FactoryReturn<Factory>
          : FactoryReturn<Factory>,
        S
      >;

type ManagerExtensionsForPlugin<Plugin, S extends MachineStore, Events extends AnyEvent> =
  PluginDefinitionOf<Plugin> extends { readonly manager?: infer Manager extends object }
    ? { [Key in keyof Manager]: ManagerFactoryReturn<Manager[Key], S, Events> }
    : {};

type StorageTypingExtensionsForPlugin<Plugin> =
  PluginDefinitionOf<Plugin> extends { readonly storage?: infer Storage extends readonly unknown[] }
    ? Storage[number] extends LiteFsmStorageRuntimeDefinition<any, infer MachineExtension>
      ? MachineExtension
      : never
    : never;

// === Public helper types =====================================================

declare const scopedEffectDeps: unique symbol;

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

// Walks plugin tuple, ходит через each narrowed member и собирает intersection capabilities.
// Distributive narrowing (Member extends ... ? ...) обязателен, чтобы per-member section
// извлекался для каждого члена tuple отдельно, а не для union'а сразу.

export type PluginRouteMeta<Plugin> = IntersectCapabilities<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? RouteMetaForPlugin<Member>
      : never
    : never
>;

export type PluginScopedDeps<Plugin> = IntersectCapabilities<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ScopedDepsForPlugin<Member>
      : never
    : never
>;

export type PluginScopedTransition<Plugin> = IntersectCapabilities<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ScopedTransitionForPlugin<Member>
      : never
    : never
>;

export type PluginManagerExtensions<
  Plugin,
  S extends MachineStore = MachineStore,
  Events extends AnyEvent = AnyEvent,
> = IntersectCapabilities<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ManagerExtensionsForPlugin<Member, S, Events>
      : never
    : never
>;

export type PluginManagerEvents<Plugin> =
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, infer PluginEvents, any>
      ? PluginEvents
      : never
    : never;

export type StorageTypingExtensionsForPluginSource<Plugin> =
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? StorageTypingExtensionsForPlugin<Member> extends StorageMachineTypingExtension
        ? StorageTypingExtensionsForPlugin<Member>
        : never
      : never
    : never;
