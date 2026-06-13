import type { MachineManagerOptions } from "../../interfaces";
import type { ManagerRuntimeContext as PublicManagerRuntimeContext, ScopedInvocationContext } from "../../plugin";
import type {
  StorageActionStageResult as PublicStorageActionStageResult,
  StorageDehydrateResult as PublicStorageDehydrateResult,
  StorageHydrateResult as PublicStorageHydrateResult,
  StoragePrepareActionResult as PublicStoragePrepareActionResult,
  StorageReduceResult as PublicStorageReduceResult,
  StorageRuntimeExtension as PublicStorageRuntimeExtension,
} from "../../pluginStorageTypes";
import type {
  AnyEvent,
  DehydrateOptions,
  HydrateStrategy,
  MachinesState,
  MachineStore,
  ManagerAction,
  ReadonlyManagerAction,
} from "../../types";
import { LiteFsmError } from "../../utils";
import type { RouteConstraint, RoutingRuntime } from "./routing";

export type StorageRuntimeState = unknown;
export type RuntimeIdentity = Readonly<Record<string, unknown>>;
export type StorageEffectInvocation = unknown;

export type StorageActionStageResult = PublicStorageActionStageResult;
export type StorageReduceResult = PublicStorageReduceResult;

export type ValidateTemplateContext = {
  readonly key: string;
  readonly machine: MachineStore[string];
  readonly storageKind: string;
};

export type CompileTemplateContext = ValidateTemplateContext;

export type CompiledStorageTemplate = {
  readonly key: string;
  readonly kind: string;
  readonly data?: unknown;
};

export type CreateRuntimeStateContext = {
  readonly templates: readonly CompiledStorageTemplate[];
  readonly manager: ManagerRuntimeContext;
};

export type CreatePublicInitialStateContext = {
  readonly template: CompiledStorageTemplate;
  readonly state: StorageRuntimeState;
};

export type AcceptsEventContext = {
  readonly template: CompiledStorageTemplate;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly dispatch: StorageDispatchContext;
};

export type StorageReduceContext = {
  readonly template: CompiledStorageTemplate;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageBeforeReduceContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageReduceBucketContext = {
  readonly templates: readonly CompiledStorageTemplate[];
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageCommitContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type ResolveEffectInvocationsContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageEffectInvocationContext = {
  readonly invocation: StorageEffectInvocation;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageConditionContext = {
  readonly predicate: (action: ReadonlyManagerAction<AnyEvent>) => boolean;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
};

export type StorageDehydrateContext = {
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly rootState: Record<string, unknown>;
  readonly options: DehydrateOptions<MachineStore> | undefined;
};

export type StorageHydrateContext = {
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly machines: Readonly<Record<string, unknown>>;
  readonly snapshot: unknown | undefined;
  readonly baseState: Record<string, unknown>;
  readonly strategy: HydrateStrategy;
  readonly source: "hydrate" | "opts.snapshot";
  readonly mode: "preview" | "commit" | "init";
};

export type ResolveIdentityContext = {
  readonly state: StorageRuntimeState;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
};

export type StorageReactionContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StoragePrepareActionContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly options: unknown;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StoragePrepareActionResult = PublicStoragePrepareActionResult;

export type StorageHydrateResult = PublicStorageHydrateResult;

export type StorageDehydrateResult = PublicStorageDehydrateResult<PublicStorageRuntimeExtension>;

export type StorageDispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly route: RouteConstraint;
  readonly prevState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  readonly skipDelivery: boolean;
  reportError(error: unknown): void;
};

export type StorageDispatchOutcome =
  | { readonly type: "active" }
  | { readonly type: "drop"; readonly action: ManagerAction<AnyEvent> };

export type StorageDispatchLifecycleContext = {
  readonly originalAction: ManagerAction<AnyEvent>;
  action: ManagerAction<AnyEvent>;
  skipDelivery: boolean;
  route: RouteConstraint;
  prevState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  nextCalled: boolean;
  outcome: StorageDispatchOutcome;
  touched: Set<string>;
  readonly dispatch: StorageDispatchContext;
};

// Типизированный slot для StorageDispatchContext.runtime: storage runtime владеет ключом
// и типом своего per-dispatch state, locale cast'а runtime.get → T сосредоточен в одном месте.
export type DispatchSlot<T> = {
  readonly key: string;
  get(dispatch: StorageDispatchContext): T | undefined;
  set(dispatch: StorageDispatchContext, value: T): void;
};

export const createDispatchSlot = <T>(key: string): DispatchSlot<T> => ({
  key,
  get(dispatch) {
    return dispatch.runtime.get(key) as T | undefined;
  },
  set(dispatch, value) {
    dispatch.runtime.set(key, value);
  },
});

export type ManagerRuntimeContext<
  Events extends AnyEvent = AnyEvent,
  S extends MachineStore = MachineStore,
> = PublicManagerRuntimeContext<Events, S> & {
  readonly config: S;
  readonly options: MachineManagerOptions<any, any, any> | undefined;
  readonly schemaVersion: number | undefined;
  readonly routing: RoutingRuntime;
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
  createScopedDeps(baseDeps: Record<string, unknown>, ctx: ScopedInvocationContext): Record<string, unknown>;
};

export type StorageRouteMetaDependencyKeys = readonly string[];

export type StorageRuntimeBase = {
  readonly kind: string;
  readonly routeMetaKeys?: StorageRouteMetaDependencyKeys;
  validateTemplate(ctx: ValidateTemplateContext): void;
  compileTemplate(ctx: CompileTemplateContext): CompiledStorageTemplate;
  createRuntimeState(ctx: CreateRuntimeStateContext): StorageRuntimeState;
  createPublicInitialState(ctx: CreatePublicInitialStateContext): unknown;
  prepareAction?(ctx: StoragePrepareActionContext): StoragePrepareActionResult;
  beforeReduce?(ctx: StorageBeforeReduceContext): StorageActionStageResult;
  commit(ctx: StorageCommitContext): void;
};

export type TemplateStorageRuntime = StorageRuntimeBase & {
  readonly reduceScope?: "template";
  acceptsEvent(ctx: AcceptsEventContext): boolean;
  reduce(ctx: StorageReduceContext): StorageReduceResult;
  readonly reduceBucket?: never;
};

export type BucketStorageRuntime = StorageRuntimeBase & {
  readonly reduceScope: "bucket";
  reduceBucket(ctx: StorageReduceBucketContext): StorageReduceResult;
  readonly acceptsEvent?: never;
  readonly reduce?: never;
};

export type StorageEffectsRuntime = {
  condition?(ctx: StorageConditionContext): Promise<boolean>;
  resolveInvocations(ctx: ResolveEffectInvocationsContext): readonly StorageEffectInvocation[];
  invoke(ctx: StorageEffectInvocationContext): void;
};

export type StorageSnapshotRuntime = {
  dehydrate(ctx: StorageDehydrateContext): StorageDehydrateResult;
  hydrate(ctx: StorageHydrateContext): StorageHydrateResult;
};

export type StorageIdentityRuntime = {
  resolve(ctx: ResolveIdentityContext): RuntimeIdentity | undefined;
};

export type StorageReactionRuntime = {
  run(ctx: StorageReactionContext): void;
};

export type StorageRuntime = (TemplateStorageRuntime | BucketStorageRuntime) & {
  readonly effects?: StorageEffectsRuntime;
  readonly snapshot?: StorageSnapshotRuntime;
  readonly identity?: StorageIdentityRuntime;
  readonly reactions?: StorageReactionRuntime;
};

export type StorageRegistry = {
  register(kind: string, runtime: StorageRuntime, owner: string): void;
  get(kind: string): StorageRuntime | undefined;
};

export type RuntimeStorageEntry = {
  readonly kind: string;
  readonly runtime: StorageRuntime;
};

export const compileStorageTemplates = (
  machines: MachineStore,
  machineKeys: readonly string[],
  storage: StorageRegistry,
  defaultStorageKind: string,
): CompiledStorageTemplate[] => {
  const templates: CompiledStorageTemplate[] = [];
  for (const key of machineKeys) {
    const machine = machines[key];
    const storageKind = machine.storage === undefined ? defaultStorageKind : String(machine.storage);
    const runtime = storage.get(storageKind);
    if (!runtime) {
      throw new LiteFsmError(
        "LITE_FSM_UNKNOWN_STORAGE_KIND",
        `[lite-fsm] machine '${key}' uses unknown storage kind '${storageKind}'.`,
      );
    }

    const context: ValidateTemplateContext = { key, machine, storageKind };
    runtime.validateTemplate(context);
    const compiled = runtime.compileTemplate(context);
    if (compiled.kind !== storageKind) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_STORAGE_RUNTIME",
        `[lite-fsm] storage runtime '${storageKind}' compiled machine '${key}' with kind '${compiled.kind}'.`,
      );
    }
    templates.push(compiled);
  }
  return templates;
};
