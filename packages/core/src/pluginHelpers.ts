// Derived helper types for plugin consumers. App code использует их, чтобы из tuple plugins
// получить events, route meta, scoped deps, manager extensions и machine extensions.

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type { LiteFsmPlugin } from "./plugin";
import type { AnyEvent, CoreActionMeta } from "./types";

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

export type PluginManagerExtensions<Plugin> = IntersectCapabilities<
  PluginMember<Plugin> extends infer Member
    ? Member extends LiteFsmPlugin<any, any, any>
      ? ManagerExtensionsForPlugin<Member>
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
