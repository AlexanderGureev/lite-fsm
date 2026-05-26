import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  FSMEvent,
  ManagerAction,
  PluginMachineExtensions,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, IsNever } from "./_helpers";

type AppEvent = FSMEvent<"LOAD"> | FSMEvent<"RESET">;
type CacheInternalEvent = FSMEvent<"CACHE_INVALIDATED", { readonly key: string }>;
type AppDeps = { readonly api: { readonly load: () => Promise<string> } };
type CacheExtension = {
  readonly input: {
    readonly initialContext: { readonly token: string };
    readonly ttl: number;
  };
  readonly internalEvents: CacheInternalEvent;
  readonly effectDeps: {
    readonly cacheApi: { readonly read: () => string };
  };
  readonly reactionDeps: {
    readonly cacheLog: (message: string) => void;
  };
  readonly resultMetadata: {
    readonly cacheKind: "cache";
  };
  readonly publicState: {
    readonly ready: boolean;
  };
};
type CacheMachineExtension = CacheExtension & { readonly storage: "cache" };

const cacheStorage = defineStorageRuntime<CacheExtension>().create({
  kind: "cache",
  routeMetaKeys: ["cacheKey"],
  validateTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"cache">();
    expect(ctx.machine.initialContext.token).type.toBe<string>();
    expect(ctx.machine.ttl).type.toBe<number>();
  },
  compileTemplate(ctx) {
    expect(ctx.machine.initialContext.token).type.toBe<string>();
    return { data: { key: ctx.key } };
  },
  createRuntimeState(ctx) {
    expect(ctx.templates[0]?.data).type.toBe<unknown>();
    return { ready: true };
  },
  createPublicInitialState(ctx) {
    expect(ctx.state).type.toBe<unknown>();
    expect(ctx.template.data).type.toBe<unknown>();
    return { ready: true };
  },
  acceptsEvent(ctx) {
    expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
    expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
    return false;
  },
  reduce(ctx) {
    expect(ctx.state).type.toBe<unknown>();
  },
  commit(ctx) {
    expect(ctx.state).type.toBe<unknown>();
  },
});

const sessionStorage = defineStorageRuntime().create({
  kind: "session",
  validateTemplate() {},
  compileTemplate() {},
  createRuntimeState() {
    return undefined;
  },
  createPublicInitialState() {
    return { state: "IDLE", context: {} };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const cachePlugin = definePlugin().create({
  name: "stage-seven-cache",
  storage: [cacheStorage],
});
const multiStoragePlugin = definePlugin().create({
  name: "stage-seven-multiple-storage",
  storage: [cacheStorage, sessionStorage],
});
const noStoragePlugin = definePlugin().create({
  name: "stage-seven-no-storage",
});

describe("plugin system — этап 7 storage types", () => {
  test("defineStorageRuntime сохраняет literal kind и выводит normalized machine extension", () => {
    expect(cacheStorage.kind).type.toBe<"cache">();
    expect(sessionStorage.kind).type.toBe<"session">();

    type _CacheExtension = Assert<
      PluginMachineExtensions<typeof cachePlugin> extends CacheMachineExtension
        ? CacheMachineExtension extends PluginMachineExtensions<typeof cachePlugin>
          ? true
          : false
        : false
    >;
    type _DefaultExtension = Assert<
      PluginMachineExtensions<typeof multiStoragePlugin> extends
        | CacheMachineExtension
        | { readonly storage: "session" }
        ? (CacheMachineExtension | { readonly storage: "session" }) extends PluginMachineExtensions<
            typeof multiStoragePlugin
          >
          ? true
          : false
        : false
    >;
    type _NoStorage = Assert<IsNever<PluginMachineExtensions<typeof noStoragePlugin>>>;
  });

  test("PluginMachineExtensions одинаково принимает tuple и union", () => {
    type TupleExtensions = PluginMachineExtensions<readonly [typeof cachePlugin, typeof multiStoragePlugin]>;
    type UnionExtensions = PluginMachineExtensions<typeof cachePlugin | typeof multiStoragePlugin>;

    expect<TupleExtensions>().type.toBeAssignableTo<UnionExtensions>();
    expect<UnionExtensions>().type.toBeAssignableTo<TupleExtensions>();
  });

  test("plugin с несколькими storage definitions дает union extensions", () => {
    type Extensions = PluginMachineExtensions<typeof multiStoragePlugin>;

    expect<Extensions>().type.toBe<CacheMachineExtension | { readonly storage: "session" }>();
  });

  test("TypedCreateMachineFn принимает declared storage kind и отклоняет unknown", () => {
    type Extensions = PluginMachineExtensions<typeof multiStoragePlugin>;
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, Extensions> = createMachine;

    const cacheMachine = createAppMachine({
      storage: "cache",
      ttl: 60,
      config: {
        IDLE: { LOAD: "LOADING", CACHE_INVALIDATED: "IDLE" },
        LOADING: { RESET: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { token: "" },
      effects: {
        LOADING: ({ api, cacheApi, cacheLog, transition }) => {
          expect(api.load()).type.toBe<Promise<string>>();
          expect(cacheApi.read()).type.toBe<string>();
          expect(cacheLog("loaded")).type.toBe<void>();
          expect(transition({ type: "CACHE_INVALIDATED", payload: { key: "user" } })).type.toBe<
            ManagerAction<AppEvent | CacheInternalEvent>
          >();
        },
      },
    });
    const sessionMachine = createAppMachine({
      storage: "session",
      config: { IDLE: { LOAD: "IDLE" } },
      initialState: "IDLE",
      initialContext: {},
    });

    expect(cacheMachine.storage).type.toBe<"cache">();
    expect(sessionMachine.storage).type.toBe<"session">();

    createAppMachine({
      // @ts-expect-error!
      storage: "unknown",
      config: { IDLE: { LOAD: "IDLE" } },
      initialState: "IDLE",
      initialContext: {},
    });
  });

  test("public compileTemplate не принимает ручные key или kind", () => {
    defineStorageRuntime().create({
      kind: "manual-key",
      validateTemplate() {},
      // @ts-expect-error!
      compileTemplate(ctx) {
        return { key: ctx.key };
      },
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "manual-kind",
      validateTemplate() {},
      // @ts-expect-error!
      compileTemplate() {
        return { kind: "manual-kind" };
      },
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });

  test("optional runtime blocks принимают текущий storage runtime contract", () => {
    defineStorageRuntime().create({
      kind: "with-optional-blocks",
      validateTemplate() {},
      compileTemplate() {
        return { data: undefined };
      },
      createRuntimeState() {
        return {};
      },
      createPublicInitialState(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        return {};
      },
      prepareAction(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        // @ts-expect-error!
        ctx.dispatch.originalAction;
        // @ts-expect-error!
        ctx.dispatch.preparedAction;
        // @ts-expect-error!
        ctx.dispatch.action;
        // @ts-expect-error!
        ctx.dispatch.committedAction;
        // @ts-expect-error!
        ctx.dispatch.dropped;
        return { type: "replace", action: ctx.action };
      },
      beforeReduce(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        return { type: "drop" };
      },
      acceptsEvent(ctx) {
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        return true;
      },
      reduce(ctx) {
        expect(ctx.template.data).type.toBe<unknown>();
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        // @ts-expect-error!
        ctx.dispatch.route = ctx.dispatch.route;
        // @ts-expect-error!
        ctx.dispatch.prevState = ctx.dispatch.prevState;
        // @ts-expect-error!
        ctx.dispatch.skipDelivery = false;
        ctx.dispatch.nextState = ctx.dispatch.nextState;
        ctx.dispatch.runtime.set("stage-seven", true);
        return { type: "skip" };
      },
      commit(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
      },
      effects: {
        condition(ctx) {
          expect(ctx.state).type.toBe<unknown>();
          return Promise.resolve(ctx.predicate({ type: "LOAD" }));
        },
        resolveInvocations(ctx) {
          expect(ctx.state).type.toBe<unknown>();
          expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
          expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
          return [{ id: "invoke" }];
        },
        invoke(ctx) {
          expect(ctx.invocation).type.toBe<unknown>();
          expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
          expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        },
      },
      snapshot: {
        dehydrate(ctx) {
          expect(ctx.rootState).type.toBe<Record<string, unknown>>();
          return { storage: { ready: true } };
        },
        hydrate(ctx) {
          expect(ctx.snapshot).type.toBe<unknown>();
          return { nextState: ctx.baseState, changed: false };
        },
      },
      identity: {
        resolve(ctx) {
          expect(ctx.state).type.toBe<unknown>();
          expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
          return { type: ctx.action.type };
        },
      },
      reactions: {
        run(ctx) {
          expect(ctx.state).type.toBe<unknown>();
          expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
          expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        },
      },
    });
  });

  test("storage runtime reduceScope различает template и bucket shapes", () => {
    defineStorageRuntime().create({
      kind: "default-template-scope",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent(ctx) {
        expect(ctx.template.key).type.toBe<string>();
        return true;
      },
      reduce(ctx) {
        expect(ctx.template.kind).type.toBe<string>();
      },
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "explicit-template-scope",
      reduceScope: "template",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      reduce(ctx) {
        expect(ctx.template.data).type.toBe<unknown>();
      },
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "bucket-scope",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket(ctx) {
        expect(ctx.templates).type.toBe<readonly { readonly key: string; readonly kind: string; readonly data?: unknown }[]>();
        expect(ctx.action).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<{ type: string; payload?: unknown }>>();
        expect(ctx.state).type.toBe<unknown>();
        return { type: "skip" };
      },
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime().create({
      kind: "bucket-without-explicit-scope",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {},
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime().create({
      kind: "bucket-with-accepts-event",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {},
      acceptsEvent() {
        return true;
      },
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime().create({
      kind: "bucket-with-reduce",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {},
      reduce() {},
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime().create({
      kind: "template-with-reduce-bucket",
      reduceScope: "template",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      reduce() {},
      reduceBucket() {},
      commit() {},
    });
  });

  test("defineStorageRuntime не принимает старый beginReduce", () => {
    defineStorageRuntime().create({
      kind: "old-begin-reduce",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      // @ts-expect-error!
      beginReduce() {},
      acceptsEvent() {
        return true;
      },
      reduce() {},
      commit() {},
    });
  });

  test("defineStorageRuntime не принимает старые result contracts", () => {
    defineStorageRuntime().create({
      kind: "old-prepare-action-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      // @ts-expect-error!
      prepareAction(ctx) {
        return ctx.action;
      },
      acceptsEvent() {
        return true;
      },
      reduce() {},
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "old-before-reduce-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      // @ts-expect-error!
      beforeReduce() {
        return false;
      },
      acceptsEvent() {
        return true;
      },
      reduce() {},
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "old-reduce-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      // @ts-expect-error!
      reduce() {
        return false;
      },
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "old-reduce-drop-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      // @ts-expect-error!
      reduce() {
        return { type: "drop" };
      },
      commit() {},
    });

    defineStorageRuntime().create({
      kind: "old-reduce-replace-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      // @ts-expect-error!
      reduce() {
        return { type: "replace", action: { type: "RESET" } };
      },
      commit() {},
    });
  });

  test("Extension generic не принимает storage и unknown keys", () => {
    // @ts-expect-error!
    defineStorageRuntime<{ readonly input: {}; readonly storage: "bad" }>().create({
      kind: "bad-storage-extension",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime<{ readonly input: {}; readonly unknown: string }>().create({
      kind: "bad-unknown-extension",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });

  test("plugin storage section принимает readonly array definitions, но не object map или inline runtime", () => {
    definePlugin().create({
      name: "stage-seven-readonly-array",
      storage: [cacheStorage] as const,
    });

    definePlugin().create({
      name: "stage-seven-object-form",
      // @ts-expect-error!
      storage: { cache: cacheStorage },
    });

    definePlugin().create({
      name: "stage-seven-inline-form",
      storage: [
        {
          kind: "inline",
          // @ts-expect-error!
          validateTemplate() {},
          compileTemplate() {},
          createRuntimeState() {
            return undefined;
          },
          createPublicInitialState() {
            return {};
          },
          acceptsEvent() {
            return false;
          },
          reduce() {},
          commit() {},
        },
      ],
    });
  });
});
