import type { MachineManagerOptions } from "../../interfaces";
import type { ManagerRuntimeContext as PublicManagerRuntimeContext, ScopedInvocationContext } from "../../plugin";
import type {
  AnyEvent,
  DehydrateOptions,
  HydrateStrategy,
  MachinesState,
  MachineStore,
  ManagerAction,
} from "../../types";
import { LiteFsmError } from "../../utils";
import type { RouteConstraint, RoutingRuntime } from "./routing";

export type StorageRuntimeState = unknown;
export type RuntimeIdentity = Readonly<Record<string, unknown>>;
export type StorageEffectInvocation = unknown;
export const STORAGE_ACTION_DROP = Symbol.for("lite-fsm.storage-action-drop");

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
  readonly action: ManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly dispatch: StorageDispatchContext;
};

export type StorageReduceContext = {
  readonly template: CompiledStorageTemplate;
  readonly action: ManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageBeginReduceContext = {
  readonly action: ManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageCommitContext = {
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type ResolveEffectInvocationsContext = {
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageEffectInvocationContext = {
  readonly invocation: StorageEffectInvocation;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StorageConditionContext = {
  readonly predicate: (action: ManagerAction<AnyEvent>) => boolean;
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
  readonly snapshot: unknown;
  readonly baseState: Record<string, unknown>;
  readonly strategy: HydrateStrategy;
  readonly source: "hydrate" | "opts.snapshot";
  readonly mode: "preview" | "commit" | "init";
};

export type ResolveIdentityContext = {
  readonly state: StorageRuntimeState;
  readonly action: ManagerAction<AnyEvent>;
};

export type StorageReactionContext = {
  readonly action: ManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StoragePrepareActionContext = {
  readonly action: ManagerAction<AnyEvent>;
  readonly options: unknown;
  readonly state: StorageRuntimeState;
  readonly manager: ManagerRuntimeContext;
  readonly dispatch: StorageDispatchContext;
};

export type StoragePrepareActionResult = ManagerAction<AnyEvent> | typeof STORAGE_ACTION_DROP;

export type StorageHydrateResult = {
  readonly nextState: Record<string, unknown>;
  readonly changed: boolean;
};

export type StorageDehydrateResult = {
  readonly machines?: Record<string, unknown>;
  readonly storage?: unknown;
};

export type StorageDispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly originalAction: ManagerAction<AnyEvent>;
  preparedAction: ManagerAction<AnyEvent>;
  action: ManagerAction<AnyEvent>;
  skipDelivery: boolean;
  route: RouteConstraint;
  prevState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  nextCalled: boolean;
  dropped: boolean;
  touched: Set<string>;
  committedAction?: ManagerAction<AnyEvent>;
  committedPrevState?: Record<string, unknown>;
  reportError(error: unknown): void;
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

export type ManagerRuntimeContext = PublicManagerRuntimeContext & {
  readonly config: MachineStore;
  readonly options: MachineManagerOptions<any, any, any> | undefined;
  readonly schemaVersion: number | undefined;
  readonly routing: RoutingRuntime;
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
  createScopedDeps(baseDeps: Record<string, unknown>, ctx: ScopedInvocationContext): Record<string, unknown>;
};

export type StorageRuntimeBase = {
  readonly kind: string;
  readonly routeMetaKeys?: readonly string[];
  validateTemplate(ctx: ValidateTemplateContext): void;
  compileTemplate(ctx: CompileTemplateContext): CompiledStorageTemplate;
  createRuntimeState(ctx: CreateRuntimeStateContext): StorageRuntimeState;
  createPublicInitialState(ctx: CreatePublicInitialStateContext): unknown;
  prepareAction?(ctx: StoragePrepareActionContext): StoragePrepareActionResult;
  beginReduce?(ctx: StorageBeginReduceContext): void | false;
  acceptsEvent(ctx: AcceptsEventContext): boolean;
  reduce(ctx: StorageReduceContext): void | false;
  commit(ctx: StorageCommitContext): void;
};

export type StorageEffectsRuntime = {
  condition?(ctx: StorageConditionContext): Promise<boolean>;
  resolveInvocations(ctx: ResolveEffectInvocationsContext): StorageEffectInvocation[];
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

export type StorageRuntime = StorageRuntimeBase & {
  readonly effects?: StorageEffectsRuntime;
  readonly snapshot?: StorageSnapshotRuntime;
  readonly identity?: StorageIdentityRuntime;
  readonly reactions?: StorageReactionRuntime;
};

export type StorageRegistry = {
  register(kind: string, runtime: StorageRuntime): void;
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
