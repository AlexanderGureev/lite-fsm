import { describe, expect, test } from "tstyche";
import { createMachine, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type {
  EffectDeps,
  ManagerAction,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginManagerExtensions,
  PluginRouteMeta,
  PluginScopedDeps,
  PluginScopedTransition,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";
import {
  createDocumentCachePlugin,
  createDocumentationManager,
  documentCachePlugin,
  documentCacheStorage,
  type AppDeps,
  type AppEvents,
  type AppPlugins,
  type CachePluginEvent,
  type DocumentCacheExtension,
  type DocumentCachePublicState,
  type HostEvents,
} from "../fixtures/plugin-system-documentation";

describe("plugin system documentation fixture", () => {
  test("helper types принимают plugin union и runtime tuple", () => {
    type PluginTuple = readonly [AppPlugins];
    type ExpectedStorage = DocumentCacheExtension & { readonly storage: "document-cache" };

    type _UnionEvents = Assert<Equal<PluginManagerEvents<AppPlugins>, CachePluginEvent>>;
    type _TupleEvents = Assert<Equal<PluginManagerEvents<PluginTuple>, CachePluginEvent>>;
    type _RouteMeta = Assert<Equal<PluginRouteMeta<AppPlugins>, { readonly cacheKey: string; readonly tenantId: string }>>;
    type _Manager = Assert<
      Equal<
        PluginManagerExtensions<AppPlugins>,
        { readonly cache: { refresh(cacheKey: string): ManagerAction<CachePluginEvent> } }
      >
    >;
    type _ScopedDeps = Assert<Equal<PluginScopedDeps<AppPlugins>, { readonly cacheScope: { describe(): string } }>>;
    type _ScopedTransition = Assert<
      Equal<PluginScopedTransition<AppPlugins>, { readonly refresh: (cacheKey: string) => ManagerAction<CachePluginEvent> }>
    >;
    type _MachineExtensions = Assert<
      ExpectedStorage extends PluginMachineExtensions<AppPlugins>
        ? PluginMachineExtensions<AppPlugins> extends ExpectedStorage
          ? true
          : false
        : false
    >;
  });

  test("machine events явно включают PluginManagerEvents", () => {
    const createHostMachine: TypedCreateMachineFn<HostEvents> = createMachine;

    createHostMachine({
      config: {
        idle: {
          LOAD_DOCUMENT: "idle",
          RESET_DOCUMENT: "idle",
          START_WORKFLOW: "idle",
          // @ts-expect-error!
          CACHE_REFRESH: "idle",
        },
      },
      initialState: "idle",
      initialContext: {},
    });

    const manager = createDocumentationManager();

    manager.transition({ type: "CACHE_REFRESH", payload: { cacheKey: "manual" } });
    manager.transition({
      type: "LOAD_DOCUMENT",
      payload: { documentId: "42", tenantId: "acme" },
      meta: { cacheKey: "document" },
    });
    expect(manager.getState().document).type.toBe<DocumentCachePublicState>();
  });

  test("storage runtime fixture сохраняет public compileTemplate contract", () => {
    expect(documentCacheStorage.kind).type.toBe<"document-cache">();

    defineStorageRuntime().create({
      kind: "docs-template-contract",
      validateTemplate() {},
      // @ts-expect-error!
      compileTemplate(ctx) {
        return {
          data: ctx.key,
          key: ctx.key,
        };
      },
      createRuntimeState() {
        return {};
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

  test("EffectDeps добавляет scoped deps и scoped transition к app deps", () => {
    type Deps = EffectDeps<{ readonly workflowLog: { push(entry: string): void } }, AppPlugins>;

    expect<AppDeps>().type.toBe<Deps>();
    expect<AppDeps["workflowLog"]["push"]>().type.toBe<(entry: string) => void>();
    expect<AppDeps["cacheScope"]["describe"]>().type.toBe<() => string>();
    expect<AppDeps["transition"]["refresh"]>().type.toBe<
      (cacheKey: string) => ManagerAction<CachePluginEvent>
    >();
  });

  test("manager получает plugin events, route meta и manager extension из tuple", () => {
    const manager = createDocumentationManager();

    manager.transition({ type: "CACHE_REFRESH", payload: { cacheKey: "typed" } });
    manager.transition({
      type: "LOAD_DOCUMENT",
      payload: { documentId: "42", tenantId: "acme" },
      meta: { cacheKey: "document" },
    });
    expect(manager.cache.refresh("typed")).type.toBe<ManagerAction<CachePluginEvent>>();

    // @ts-expect-error!
    manager.transition({ type: "UNKNOWN" });
  });

  test("storage definitions подключаются только через plugin storage section", () => {
    const plugin = createDocumentCachePlugin({ namespace: "storage" });

    expect(plugin.name).type.toBeAssignableTo<string>();
    expect(documentCachePlugin.name).type.toBeAssignableTo<string>();

    MachineManager(
      {},
      {
        plugins: [
          // @ts-expect-error!
          documentCacheStorage,
        ],
      },
    );
  });
});
