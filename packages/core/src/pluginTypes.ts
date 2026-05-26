// Public type contracts for plugin system. Используются и в plugin DSL, и в kernel runtime,
// и при типизации plugin definition пользователем.

import type { AnyEvent, MachinesState, MachineStore, ManagerAction } from "./types";

// === Routing =================================================================

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
  registerRouteMeta<Key extends string>(key: Key, resolver: RouteResolver<Key>, owner?: string): void;
};

// === Dispatch ================================================================

export type DispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly originalAction: ManagerAction<AnyEvent>;
  readonly action: ManagerAction<AnyEvent>;
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
  readonly event: ManagerAction<AnyEvent>;
  readonly indices: ScopedInvocationIndices;
  readonly phase: ScopedInvocationPhase;
  readonly transition: (action: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>;
};

// === Manager extension =======================================================

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
