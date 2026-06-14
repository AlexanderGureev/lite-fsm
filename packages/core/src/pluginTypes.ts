// Public type contracts for plugin system. Используются и в plugin DSL, и в kernel runtime,
// и при типизации plugin definition пользователем.

import type { AnyEvent, MachinesState, MachineStore, ManagerAction, ReadonlyManagerAction } from "./types";

// === Routing =================================================================

export type RouteResolverResult = string | readonly string[];

export type RouteResolverContext<Key extends string = string> = {
  readonly key: Key;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly meta: Readonly<Record<string, unknown>>;
};

export type RouteResolver<Key extends string = string> = (
  value: unknown,
  ctx: RouteResolverContext<Key>,
) => RouteResolverResult;

export type RoutingRegistry = {
  registerRouteMeta<Key extends string>(key: Key, resolver: RouteResolver<Key>, owner?: string): void;
};

// === Dispatch ================================================================

export type DispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly skipDelivery: boolean;
  reportError(error: unknown): void;
};

export type ActionInterceptorResult = void | {
  readonly action?: ManagerAction<AnyEvent>;
  readonly skipDelivery?: boolean;
  readonly stopInterceptors?: boolean;
};

export type ActionInterceptor = (ctx: DispatchContext) => ActionInterceptorResult;

export type DispatchHook = (ctx: DispatchContext) => void;

export const DISPATCH_HOOK_PHASES = [
  "beforeReduce",
  "afterReduce",
  "beforeCommit",
  "beforeSubscribers",
  "beforeEffects",
  "afterEffects",
] as const;

export type DispatchHookPhase = (typeof DISPATCH_HOOK_PHASES)[number];

// === Scoped invocation =======================================================

export type ScopedInvocationPhase = "effect" | "reaction";

export type ScopedInvocationSource = {
  readonly storage: string;
  readonly template: string;
};

export type ScopedInvocationIndices = Readonly<Record<string, unknown>>;

export type ScopedInvocationContext = {
  readonly source: ScopedInvocationSource;
  readonly event: ReadonlyManagerAction<AnyEvent>;
  readonly indices: ScopedInvocationIndices;
  readonly phase: ScopedInvocationPhase;
  readonly transition: (action: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>;
};

// === Manager extension =======================================================

export declare const managerExtensionTypeMarker: unique symbol;

export type ManagerRuntimeContext<
  Events extends AnyEvent = AnyEvent,
  S extends MachineStore = MachineStore,
> = {
  readonly config: S;
  readonly options: unknown;
  readonly schemaVersion: number | undefined;
  getState(): MachinesState<S>;
  transition(action: ManagerAction<Events>, options?: unknown): ManagerAction<Events>;
  onTransition(
    cb: (
      prevState: MachinesState<S>,
      currentState: MachinesState<S>,
      action: ReadonlyManagerAction<Events> | { readonly type: string; readonly payload?: unknown },
    ) => void,
  ): () => void;
  getDependencies(): Record<string, unknown>;
};

export type ManagerExtensionFactory<
  Events extends AnyEvent = AnyEvent,
  Value = unknown,
  S extends MachineStore = MachineStore,
> = (ctx: ManagerRuntimeContext<Events, S>) => Value;

export type ManagerExtensionTypeLambda = {
  readonly type: unknown;
};

export type ManagerExtensionType<Lambda extends ManagerExtensionTypeLambda> = {
  readonly [managerExtensionTypeMarker]?: Lambda;
};

// === Normalized plugin payload ===============================================
// Internal representation, в которое plugin DSL приводит входное plugin definition.

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

export type NormalizedScopedFactory = (ctx: ScopedInvocationContext) => unknown;

export type NormalizedScopedDepsEntry = {
  readonly owner: string;
  readonly key: string;
  readonly factory: NormalizedScopedFactory;
};

export type NormalizedScopedTransitionEntry = {
  readonly owner: string;
  readonly key: string;
  readonly factory: NormalizedScopedFactory;
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
