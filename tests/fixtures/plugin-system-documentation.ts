import { createMachine, definePlugin } from "@lite-fsm/core";
import type {
  EffectDeps,
  FSMEvent,
  MachineConfig,
  MachineStore,
  ManagerAction,
  ScopedDepsFactory,
  ScopedTransitionFactory,
  TypedCreateMachineFn,
} from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core";
import type {
  CompiledStorageTemplate,
  StorageHydrateContext,
  StorageRuntime,
} from "@lite-fsm/core/internal/runtime/kernel/storage";

export const DOCUMENTATION_STORAGE_KIND = "documentation-test";
export const DOCUMENTATION_META_KEY = "docTarget";

export type DocumentationTickEvent = FSMEvent<"DOC_TICK">;
export type DocumentationStartEvent = FSMEvent<"DOC_START">;
export type DocumentationDoneEvent = FSMEvent<"DOC_DONE", { id: string }>;
export type DocumentationPluginEvent = FSMEvent<"DOC_PLUGIN_EVENT", { id: string }>;
export type DocumentationAppEvent = DocumentationTickEvent | DocumentationStartEvent | DocumentationDoneEvent;

export type DocumentationStorageContext = {
  readonly target: string;
  readonly count: number;
};

export type DocumentationStoragePublicState = {
  readonly state: "READY";
  readonly context: DocumentationStorageContext;
};

export type DocumentationStorageExtension = {
  readonly storage: typeof DOCUMENTATION_STORAGE_KIND;
  readonly input: {
    readonly doc: {
      readonly target: string;
    };
  };
  readonly resultMetadata: {
    readonly example: "plugin-system";
  };
  readonly publicState: DocumentationStoragePublicState;
};

export type DocumentationPluginCapabilities = {
  readonly transitionEvents: DocumentationPluginEvent;
  readonly actionMeta: {
    readonly [DOCUMENTATION_META_KEY]: string;
  };
  readonly machine: DocumentationStorageExtension;
  readonly deps: {
    readonly docTrace: () => string;
  };
  readonly transition: {
    readonly docFinish: (id: string) => ManagerAction<DocumentationAppEvent>;
  };
  readonly manager: {
    readonly documentation: {
      readonly storageKind: typeof DOCUMENTATION_STORAGE_KIND;
      readonly machineKeys: () => readonly string[];
    };
  };
};

type DocumentationTemplateData = {
  readonly target: string;
};

type DocumentationStorageConfig = {
  readonly READY: {
    readonly DOC_TICK: "READY";
  };
};

export type DocumentationStorageMachine = {
  readonly storage: typeof DOCUMENTATION_STORAGE_KIND;
  readonly doc: {
    readonly target: string;
  };
  readonly config: DocumentationStorageConfig;
  readonly initialState: "READY";
  readonly initialContext: DocumentationStorageContext;
  readonly __liteFsmRuntime?: {
    readonly storage: typeof DOCUMENTATION_STORAGE_KIND;
    readonly publicEvents: DocumentationAppEvent;
    readonly resultMetadata: DocumentationStorageExtension["resultMetadata"];
    readonly publicState: DocumentationStoragePublicState;
  };
};

export type DocumentationEffectConfig = {
  readonly IDLE: {
    readonly DOC_START: "LOADING";
  };
  readonly LOADING: {
    readonly DOC_DONE: "IDLE";
  };
};

export type DocumentationEffectContext = {
  readonly trace: string;
};

type DocumentationStorageSnapshot = {
  readonly values: Record<string, number>;
};

type DocumentationStorageRuntimeState = {
  readonly templates: readonly CompiledStorageTemplate[];
  readonly values: Record<string, number>;
};

const readTemplateData = (template: CompiledStorageTemplate): DocumentationTemplateData => {
  const data = template.data as Partial<DocumentationTemplateData> | undefined;
  if (typeof data?.target === "string" && data.target.length > 0) return { target: data.target };

  throw new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm] storage runtime '${DOCUMENTATION_STORAGE_KIND}' received template without doc.target.`,
  );
};

const readMachineTarget = (key: string, machine: MachineStore[string]): string => {
  const target = (machine as { readonly doc?: { readonly target?: unknown } }).doc?.target;
  if (typeof target === "string" && target.length > 0) return target;

  throw new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm] machine '${key}' for storage kind '${DOCUMENTATION_STORAGE_KIND}' requires doc.target.`,
  );
};

const readStorageSnapshot = (ctx: StorageHydrateContext): DocumentationStorageSnapshot => {
  const envelope = ctx.snapshot as { readonly storage?: Record<string, unknown> };
  const payload = envelope.storage?.[DOCUMENTATION_STORAGE_KIND];
  const values = (payload as { readonly values?: unknown } | undefined)?.values;

  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_STORAGE_SNAPSHOT",
      `[lite-fsm] hydrate: invalid storage snapshot for runtime '${DOCUMENTATION_STORAGE_KIND}'.`,
    );
  }

  const normalized: Record<string, number> = {};
  for (const [target, value] of Object.entries(values)) {
    if (typeof value !== "number") {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_STORAGE_SNAPSHOT",
        `[lite-fsm] hydrate: invalid storage snapshot for runtime '${DOCUMENTATION_STORAGE_KIND}'.`,
      );
    }
    normalized[target] = value;
  }

  return { values: normalized };
};

export const documentationStorageRuntime: StorageRuntime = {
  kind: DOCUMENTATION_STORAGE_KIND,
  routeMetaKeys: [DOCUMENTATION_META_KEY],
  validateTemplate({ key, machine }) {
    readMachineTarget(key, machine);
  },
  compileTemplate({ key, machine }) {
    return {
      key,
      kind: DOCUMENTATION_STORAGE_KIND,
      data: { target: readMachineTarget(key, machine) } satisfies DocumentationTemplateData,
    };
  },
  createRuntimeState({ templates }) {
    const values: Record<string, number> = {};
    for (const template of templates) values[readTemplateData(template).target] = 0;

    return { templates, values } satisfies DocumentationStorageRuntimeState;
  },
  createPublicInitialState({ template, state }) {
    const data = readTemplateData(template);
    const runtimeState = state as DocumentationStorageRuntimeState;

    return {
      state: "READY",
      context: {
        target: data.target,
        count: runtimeState.values[data.target] ?? 0,
      },
    } satisfies DocumentationStoragePublicState;
  },
  acceptsEvent({ template, action, dispatch }) {
    if (action.type !== "DOC_TICK") return false;
    if (dispatch.route.scope === "unscoped") return true;
    if (dispatch.route.scope !== "plugin" || dispatch.route.key !== DOCUMENTATION_META_KEY) return false;

    return dispatch.route.targetSet.includes(readTemplateData(template).target);
  },
  reduce({ template, dispatch }) {
    const prev = dispatch.nextState[template.key] as DocumentationStoragePublicState | undefined;
    if (!prev) return false;

    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: {
        state: "READY",
        context: {
          target: prev.context.target,
          count: prev.context.count + 1,
        },
      } satisfies DocumentationStoragePublicState,
    };
  },
  commit({ state, dispatch }) {
    const runtimeState = state as DocumentationStorageRuntimeState;

    for (const template of runtimeState.templates) {
      const data = readTemplateData(template);
      const slice = dispatch.nextState[template.key] as DocumentationStoragePublicState | undefined;
      if (slice) runtimeState.values[data.target] = slice.context.count;
    }
  },
  snapshot: {
    dehydrate({ state }) {
      const runtimeState = state as DocumentationStorageRuntimeState;
      return {
        storage: {
          values: { ...runtimeState.values },
        } satisfies DocumentationStorageSnapshot,
      };
    },
    hydrate(ctx) {
      const runtimeState = ctx.state as DocumentationStorageRuntimeState;
      const payload = readStorageSnapshot(ctx);
      const nextState = { ...ctx.baseState };
      let changed = false;

      for (const template of runtimeState.templates) {
        const data = readTemplateData(template);
        const count = payload.values[data.target] ?? 0;
        const prev = ctx.baseState[template.key] as DocumentationStoragePublicState | undefined;

        nextState[template.key] = {
          state: "READY",
          context: {
            target: data.target,
            count,
          },
        } satisfies DocumentationStoragePublicState;

        changed ||= prev?.context.count !== count || prev?.context.target !== data.target;
        if (ctx.mode !== "preview") runtimeState.values[data.target] = count;
      }

      return { nextState, changed };
    },
  },
};

const documentationScopedDeps: ScopedDepsFactory<DocumentationPluginCapabilities["deps"]> = Object.assign(
  (scope: Parameters<ScopedDepsFactory<DocumentationPluginCapabilities["deps"]>>[0]) => ({
    docTrace: () => `${scope.source.storage}:${scope.source.template}:${scope.event.type}`,
  }),
  { keys: ["docTrace"] as const },
);

const documentationScopedTransition: ScopedTransitionFactory<DocumentationPluginCapabilities["transition"]> =
  Object.assign(
    (scope: Parameters<ScopedTransitionFactory<DocumentationPluginCapabilities["transition"]>>[0]) => ({
      docFinish: (id: string) =>
        scope.transition({ type: "DOC_DONE", payload: { id } }) as ManagerAction<DocumentationAppEvent>,
    }),
    { keys: ["docFinish"] as const },
  );

export const documentationNoopPlugin = definePlugin({
  name: "documentation-noop",
  install() {},
});

export const documentationPlugin = definePlugin<DocumentationPluginCapabilities, "documentation-plugin">({
  name: "documentation-plugin",
  install(ctx) {
    ctx.routing.registerMetaKey(DOCUMENTATION_META_KEY, (value) => String(value));
    ctx.storage.register(DOCUMENTATION_STORAGE_KIND, documentationStorageRuntime);
    ctx.deps.extendDeps(documentationScopedDeps);
    ctx.deps.extendTransition(documentationScopedTransition);
    ctx.manager.extend("documentation", (runtime) => ({
      storageKind: DOCUMENTATION_STORAGE_KIND,
      machineKeys: () => Object.keys(runtime.config),
    }));
  },
});

export type DocumentationPlugins = readonly [typeof documentationPlugin];
export type DocumentationEffectDeps = EffectDeps<{}, DocumentationPlugins>;
export type DocumentationEffectMachine = MachineConfig<
  DocumentationEffectConfig,
  DocumentationEffectContext,
  DocumentationAppEvent,
  DocumentationEffectDeps
>;

export const documentationCreateMachine: TypedCreateMachineFn<
  DocumentationAppEvent,
  DocumentationEffectDeps,
  DocumentationStorageExtension
> = createMachine;

export const createDocumentationStorageMachine = (target: string): DocumentationStorageMachine =>
  documentationCreateMachine({
    storage: DOCUMENTATION_STORAGE_KIND,
    doc: { target },
    config: {
      READY: { DOC_TICK: "READY" },
    },
    initialState: "READY",
    initialContext: {
      target,
      count: 0,
    },
  });

export const documentationStorageMachine = createDocumentationStorageMachine("docs/a");

export const documentationEffectMachine: DocumentationEffectMachine = documentationCreateMachine({
  storage: "instance",
  config: {
    IDLE: { DOC_START: "LOADING" },
    LOADING: { DOC_DONE: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: {
    trace: "",
  },
  reducer: (state, action, meta) => ({
    state: meta.nextState,
    context: {
      trace: action.type === "DOC_DONE" ? action.payload.id : state.context.trace,
    },
  }),
  effects: {
    LOADING: ({ docTrace, transition }) => {
      transition.docFinish(docTrace());
    },
  },
});
