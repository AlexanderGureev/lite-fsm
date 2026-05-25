import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  EffectDeps,
  FSMEvent,
  MachineConfig,
  MachineDependencies,
  ManagerAction,
  PluginDeps,
  PluginTransitionExtensions,
  ScopedDepsContext,
  ScopedDepsFactory,
  ScopedInvocationContext,
  ScopedInvocationIndices,
  ScopedInvocationPhase,
  ScopedInvocationSource,
  ScopedTransitionContext,
  ScopedTransitionFactory,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Start = FSMEvent<"START">;
type Done = FSMEvent<"DONE">;
type AppEvent = Start | Done;
type Config = { idle: { START: "loading" }; loading: { DONE: "idle" } };
type Ctx = { id: string };
type AppDeps = { readonly api: { readonly load: () => Promise<string> } };

type ScopedCapabilities = {
  readonly deps: {
    readonly requestId: () => string;
  };
  readonly transition: {
    readonly finish: (id: string) => ManagerAction<AppEvent>;
  };
};

const scopedPlugin = definePlugin<ScopedCapabilities>({
  name: "scoped-plugin",
  install(ctx) {
    ctx.deps.extendDeps(
      Object.assign(
        (scope: ScopedDepsContext) => ({
          requestId: () => `${scope.source.template}:${scope.event.type}`,
        }),
        { keys: ["requestId"] as const },
      ),
    );
    ctx.deps.extendTransition(
      Object.assign(
        (scope: ScopedTransitionContext) => ({
          finish: (id: string) => scope.transition({ type: "DONE", payload: { id } } as never),
        }),
        { keys: ["finish"] as const },
      ),
    );
  },
});

const otherPlugin = definePlugin<{ readonly deps: { readonly otherDep: () => number } }>({
  name: "other-scoped-plugin",
  install(ctx) {
    ctx.deps.extendDeps(
      Object.assign(
        () => ({
          otherDep: () => 1,
        }),
        { keys: ["otherDep"] as const },
      ),
    );
  },
});

type ScopedPlugins = readonly [typeof scopedPlugin];
type ScopedDeps = EffectDeps<AppDeps, ScopedPlugins>;
const createScopedMachine: TypedCreateMachineFn<AppEvent, ScopedDeps> = createMachine;
const createPlainMachine: TypedCreateMachineFn<AppEvent, AppDeps> = createMachine;

const scopedMachine = createScopedMachine({
  config: { idle: { START: "loading" }, loading: { DONE: "idle" } },
  initialState: "idle",
  initialContext: { id: "" },
  effects: {
    loading: async ({ api, requestId, transition }) => {
      const id = await api.load();
      expect(requestId()).type.toBe<string>();
      expect(transition.finish(id)).type.toBe<ManagerAction<AppEvent>>();
      transition({ type: "DONE" });
    },
  },
});

const plainMachine = createPlainMachine({
  config: { idle: { START: "loading" }, loading: { DONE: "idle" } },
  initialState: "idle",
  initialContext: { id: "" },
  effects: {
    loading: ({ api, transition }) => {
      void api.load();
      transition({ type: "DONE" });
      // @ts-expect-error!
      transition.finish("missing-plugin");
    },
  },
});

const machines = {
  scoped: scopedMachine satisfies MachineConfig<Config, Ctx, AppEvent, ScopedDeps>,
};

describe("plugin system stage 7 — scoped deps types", () => {
  test("PluginCapabilities deps и transition попадают в effect deps через tuple текущего manager", () => {
    type _PluginDeps = Assert<Equal<PluginDeps<ScopedPlugins>, ScopedCapabilities["deps"]>>;
    type _PluginTransition = Assert<
      Equal<PluginTransitionExtensions<ScopedPlugins>, ScopedCapabilities["transition"]>
    >;

    const manager = MachineManager(machines, { plugins: [scopedPlugin] as const });
    manager.setDependencies({ api: { load: async () => "ok" } });

    // @ts-expect-error!
    manager.setDependencies({ api: { load: async () => "ok" }, requestId: () => "outside" });
    // @ts-expect-error!
    manager.transition.finish("outside-effect");
  });

  test("typed scoped deps недоступны без plugin capability", () => {
    createPlainMachine({
      config: { idle: { START: "loading" }, loading: { DONE: "idle" } },
      initialState: "idle",
      initialContext: { id: "" },
      effects: {
        loading: ({
          // @ts-expect-error!
          requestId,
        }) => {
          requestId();
        },
      },
    });
  });

  test("typed scoped deps недоступны вне effects/reactions", () => {
    expect<MachineDependencies<typeof machines, ScopedPlugins>>().type.toBeAssignableTo<AppDeps>();
    expect<AppDeps>().type.toBeAssignableTo<MachineDependencies<typeof machines, ScopedPlugins>>();
    expect<MachineDependencies<typeof machines>>().type.toBeAssignableTo<AppDeps>();
    expect<AppDeps>().type.toBeAssignableTo<MachineDependencies<typeof machines>>();

    const manager = MachineManager(machines, { plugins: [scopedPlugin] as const });
    manager.setDependencies({ api: { load: async () => "ok" } });

    // @ts-expect-error!
    manager.setDependencies({ requestId: () => "not-app-dep" });
  });

  test("scoped transition недоступен без plugin capability текущего tuple", () => {
    type OtherScopedDeps = EffectDeps<AppDeps, readonly [typeof otherPlugin]>;
    const createOtherMachine: TypedCreateMachineFn<AppEvent, OtherScopedDeps> = createMachine;

    createOtherMachine({
      config: { idle: { START: "loading" }, loading: { DONE: "idle" } },
      initialState: "idle",
      initialContext: { id: "" },
      effects: {
        loading: ({ otherDep, transition }) => {
          expect(otherDep()).type.toBe<number>();
          // @ts-expect-error!
          transition.finish("missing-plugin");
        },
      },
    });
  });

  test("публикует scoped registry и context types", () => {
    type _Phase = Assert<Equal<ScopedInvocationPhase, "effect" | "reaction">>;
    type _Source = Assert<Equal<ScopedInvocationSource, { readonly storage: string; readonly template: string }>>;
    type _Indices = Assert<Equal<ScopedInvocationIndices, Readonly<Record<string, unknown>>>>;
    type _Context = Assert<
      Equal<
        ScopedInvocationContext,
        {
          readonly source: ScopedInvocationSource;
          readonly event: ManagerAction<{ type: string; payload?: unknown }>;
          readonly indices: ScopedInvocationIndices;
          readonly phase: ScopedInvocationPhase;
          readonly transition: (
            action: ManagerAction<{ type: string; payload?: unknown }>,
          ) => ManagerAction<{ type: string; payload?: unknown }>;
        }
      >
    >;

    expect<ScopedDepsFactory<{ value: string }>["keys"]>().type.toBe<readonly string[]>();
    expect<ScopedTransitionFactory<{ finish: () => void }>["keys"]>().type.toBe<readonly string[]>();
  });

  test("plain machine сохраняет обычные deps", () => {
    type PlainStore = { plain: typeof plainMachine };
    const manager = MachineManager({ plain: plainMachine });

    expect<MachineDependencies<PlainStore>>().type.toBe<AppDeps>();
    manager.setDependencies({ api: { load: async () => "ok" } });
  });
});
