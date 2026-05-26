import { createMachine, definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type {
  AnyEvent,
  EffectDeps,
  FSMEvent,
  ManagerAction,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginRouteMeta,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

export type LoadDocument = FSMEvent<"LOAD_DOCUMENT", { readonly documentId: string; readonly tenantId: string }>;
export type ResetDocument = FSMEvent<"RESET_DOCUMENT">;
export type StartWorkflow = FSMEvent<"START_WORKFLOW">;
export type HostEvents = LoadDocument | ResetDocument | StartWorkflow;

export type CachePluginEvent = FSMEvent<"CACHE_REFRESH", { readonly cacheKey: string }>;
export type DocumentCacheInternalEvent = FSMEvent<"DOCUMENT_CACHE_INTERNAL", { readonly cacheKey: string }>;

export type DocumentCacheContext = {
  readonly value: string;
};

export type DocumentCachePublicState = {
  readonly ready: boolean;
  readonly value: string;
};

export type DocumentCacheExtension = {
  readonly input: {
    readonly ttlMs: number;
    readonly initialContext: DocumentCacheContext;
  };
  readonly internalEvents: DocumentCacheInternalEvent;
  readonly effectDeps: {
    readonly cacheReader: { read(cacheKey: string): string };
  };
  readonly reactionDeps: {
    readonly cacheLog: { record(entry: string): void };
  };
  readonly publicState: DocumentCachePublicState;
};

type DocumentCacheRuntimeState = {
  readonly templates: readonly { readonly key: string; readonly data?: unknown }[];
  commits: number;
  lastAction: string | undefined;
};

type WorkflowContext = {
  readonly runs: number;
};

type DocumentationTrace = {
  readonly push: (entry: string) => void;
};

export type DocumentCachePluginOptions = {
  readonly namespace?: string;
  readonly trace?: DocumentationTrace;
};

const readInitialValue = (data: unknown): string => {
  if (!data || typeof data !== "object") return "empty";
  const value = (data as { readonly initialValue?: unknown }).initialValue;
  return typeof value === "string" ? value : "empty";
};

const readDocumentState = (value: unknown): DocumentCachePublicState => {
  if (!value || typeof value !== "object") return { ready: false, value: "empty" };
  const state = value as Partial<DocumentCachePublicState>;
  return {
    ready: state.ready === true,
    value: typeof state.value === "string" ? state.value : "empty",
  };
};

const readRuntimeState = (state: unknown): DocumentCacheRuntimeState => {
  return state as DocumentCacheRuntimeState;
};

const isDocumentAction = (
  action:
    | HostEvents
    | CachePluginEvent
    | DocumentCacheInternalEvent
    | { readonly type: string; readonly payload?: unknown },
): action is LoadDocument | ResetDocument | CachePluginEvent | DocumentCacheInternalEvent => {
  return (
    action.type === "LOAD_DOCUMENT" ||
    action.type === "RESET_DOCUMENT" ||
    action.type === "CACHE_REFRESH" ||
    action.type === "DOCUMENT_CACHE_INTERNAL"
  );
};

export const documentCacheStorage = defineStorageRuntime<DocumentCacheExtension>().create({
  kind: "document-cache",
  routeMetaKeys: ["cacheKey"],
  validateTemplate(ctx) {
    if (ctx.machine.ttlMs <= 0) {
      throw new Error("ttlMs must be positive.");
    }
  },
  compileTemplate(ctx) {
    return { data: { initialValue: ctx.machine.initialContext.value } };
  },
  createRuntimeState(ctx) {
    return {
      templates: ctx.templates,
      commits: 0,
      lastAction: undefined,
    };
  },
  createPublicInitialState(ctx) {
    return { ready: false, value: readInitialValue(ctx.template.data) };
  },
  prepareAction(ctx) {
    return ctx.action;
  },
  beginReduce() {},
  acceptsEvent(ctx) {
    if (!isDocumentAction(ctx.action)) return false;
    if (ctx.dispatch.route.scope !== "plugin") return true;
    if (ctx.dispatch.route.key !== "cacheKey") return true;

    return ctx.dispatch.route.targetSet.includes(ctx.template.key);
  },
  reduce(ctx) {
    const action = ctx.action;
    if (!isDocumentAction(action)) return false;

    const previous = readDocumentState(ctx.dispatch.nextState[ctx.template.key]);
    let next = previous;

    if (action.type === "LOAD_DOCUMENT") {
      next = {
        ready: true,
        value: `${action.payload.tenantId}:${action.payload.documentId}`,
      };
    }
    if (action.type === "CACHE_REFRESH" || action.type === "DOCUMENT_CACHE_INTERNAL") {
      next = { ready: true, value: action.payload.cacheKey };
    }
    if (action.type === "RESET_DOCUMENT") {
      next = { ready: false, value: "empty" };
    }

    ctx.dispatch.nextState = {
      ...ctx.dispatch.nextState,
      [ctx.template.key]: next,
    };
  },
  commit(ctx) {
    const state = readRuntimeState(ctx.state);
    state.commits += 1;
  },
  effects: {
    condition(ctx) {
      return Promise.resolve(ctx.predicate({ type: "CACHE_REFRESH", payload: { cacheKey: "condition" } }));
    },
    resolveInvocations() {
      return [];
    },
    invoke() {},
  },
  snapshot: {
    dehydrate(ctx) {
      const state = readRuntimeState(ctx.state);
      return { storage: { commits: state.commits, lastAction: state.lastAction } };
    },
    hydrate(ctx) {
      return { nextState: ctx.baseState, changed: false };
    },
  },
  identity: {
    resolve(ctx) {
      const action = ctx.action;
      if (!isDocumentAction(action) || action.type !== "LOAD_DOCUMENT") return undefined;

      return {
        documentId: action.payload.documentId,
        tenantId: action.payload.tenantId,
      };
    },
  },
  reactions: {
    run(ctx) {
      readRuntimeState(ctx.state).lastAction = ctx.action.type;
    },
  },
});

export const documentationNoopPlugin = definePlugin().create({
  name: "docs/noop",
});

export const createDocumentCachePlugin = ({ namespace = "docs", trace }: DocumentCachePluginOptions = {}) =>
  definePlugin<CachePluginEvent, HostEvents>().create({
    name: `document-cache:${namespace}`,
    routeMeta: {
      cacheKey(value: string) {
        return value;
      },
      tenantId(value: string) {
        return value;
      },
    },
    manager: {
      cache(ctx) {
        return {
          refresh(cacheKey: string) {
            trace?.push(`manager:${cacheKey}`);
            return ctx.transition({ type: "CACHE_REFRESH", payload: { cacheKey } });
          },
        };
      },
    },
    intercept(ctx) {
      trace?.push(`intercept:${ctx.action.type}`);
    },
    hooks: {
      beforeEffects(ctx) {
        trace?.push(`beforeEffects:${ctx.action.type}`);
      },
    },
    scopedDeps: {
      cacheScope(scope) {
        return {
          describe() {
            return `${scope.phase}:${scope.source.template}:${scope.event.type}`;
          },
        };
      },
    },
    scopedTransition: {
      refresh(scope) {
        return (cacheKey: string) => {
          trace?.push(`scopedTransition:${cacheKey}`);
          return scope.transition({ type: "CACHE_REFRESH", payload: { cacheKey } });
        };
      },
    },
    storage: [documentCacheStorage],
  });

export const documentCachePlugin = createDocumentCachePlugin();

export type AppPlugins = ReturnType<typeof createDocumentCachePlugin>;
export type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>;
export type AppDeps = EffectDeps<
  {
    readonly workflowLog: { push(entry: string): void };
  },
  AppPlugins
>;

export type DocumentationWorkflowState = {
  readonly state: "idle" | "active" | "done";
  readonly context: WorkflowContext;
};

export type DocumentationState = {
  readonly document: DocumentCachePublicState;
  readonly workflow: DocumentationWorkflowState;
};

export type DocumentationManager = {
  transition(
    action: ManagerAction<AppEvents, Partial<PluginRouteMeta<AppPlugins>>>,
  ): ManagerAction<AppEvents, Partial<PluginRouteMeta<AppPlugins>>>;
  getState(): DocumentationState;
  getSnapshot(): unknown;
  dehydrate(): { readonly storage?: Record<string, unknown> };
  setDependencies(deps: { readonly workflowLog: { push(entry: string): void } }): void;
  readonly cache: { readonly refresh: (cacheKey: string) => ManagerAction<AnyEvent> };
};

export const createAppMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  PluginMachineExtensions<AppPlugins>
> = createMachine;

const createDocumentMachine = () =>
  createAppMachine({
    storage: "document-cache",
    ttlMs: 30_000,
    config: {
      idle: {
        LOAD_DOCUMENT: "ready",
        CACHE_REFRESH: "ready",
        DOCUMENT_CACHE_INTERNAL: "ready",
      },
      ready: {
        LOAD_DOCUMENT: "ready",
        RESET_DOCUMENT: "idle",
        CACHE_REFRESH: "ready",
        DOCUMENT_CACHE_INTERNAL: "ready",
      },
    },
    initialState: "idle",
    initialContext: { value: "empty" },
  });

const createWorkflowMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createMachine;

const createWorkflow = () =>
  createWorkflowMachine({
    config: {
      idle: { START_WORKFLOW: "active" },
      active: { CACHE_REFRESH: "done" },
      done: {},
    },
    initialState: "idle",
    initialContext: { runs: 0 } satisfies WorkflowContext,
    reducer(state, action, meta) {
      return {
        state: meta.nextState,
        context: {
          runs: state.context.runs + (action.type === "START_WORKFLOW" ? 1 : 0),
        },
      };
    },
    effects: {
      active({ cacheScope, transition, workflowLog }) {
        workflowLog.push(cacheScope.describe());
        transition.refresh("workflow");
      },
    },
  });

const createNoop: TypedCreateMachineFn<FSMEvent<"PING">> = createMachine;

export const createNoopMachine = () =>
  createNoop({
    config: {
      idle: { PING: "active" },
      active: {},
    },
    initialState: "idle",
    initialContext: { count: 0 },
    reducer(state, action, meta) {
      return {
        state: meta.nextState,
        context: { count: state.context.count + (action.type === "PING" ? 1 : 0) },
      };
    },
  });

const createDocumentationMachines = () => ({
  document: createDocumentMachine(),
  workflow: createWorkflow(),
});

export const createDocumentationManager = (trace: string[] = []): DocumentationManager => {
  const plugin = createDocumentCachePlugin({ trace: { push: (entry) => trace.push(entry) } });
  return MachineManager(createDocumentationMachines(), { plugins: [plugin] as const });
};

export const createNoopDocumentationManager = () => {
  return MachineManager({ noop: createNoopMachine() }, { plugins: [documentationNoopPlugin] as const });
};

export const flushDocumentationEffects = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
