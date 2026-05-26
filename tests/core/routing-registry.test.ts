import { describe, expect, it, vi } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, Middleware } from "@lite-fsm/core";
import { createRoutingRuntime } from "@lite-fsm/core/internal/runtime/kernel/routing";

import { createLikeSync } from "./MachineManager.actors.fixtures";

type RouteEvent = FSMEvent<"LIKE", { id: string }> | FSMEvent<"HIT"> | FSMEvent<"BUMP">;
type RouteMachine = {
  storage: "route-test";
  routeId?: string;
  groupTag?: string;
  config: { IDLE: { HIT: "IDLE"; BUMP: "IDLE" } };
  initialState: "IDLE";
  initialContext: { hits: number };
};

type RouteRuntimeState = {
  readonly routes: Array<{ key: string | undefined; targetSet: string[] }>;
  reduces: number;
  commits: number;
};

const createRouteMachine = (options: { routeId?: string; groupTag?: string } = {}): RouteMachine =>
  ({
    storage: "route-test",
    routeId: options.routeId,
    groupTag: options.groupTag,
    config: { IDLE: { HIT: "IDLE", BUMP: "IDLE" } },
    initialState: "IDLE",
    initialContext: { hits: 0 },
  }) as never;

const createRouteStorage = () => {
  const runtimeState: RouteRuntimeState = { routes: [], reduces: 0, commits: 0 };

  const storage = defineStorageRuntime().create({
    kind: "route-test",
    validateTemplate() {},
    compileTemplate({ machine }) {
      const routeMachine = machine as Partial<RouteMachine>;
      return { data: { routeId: routeMachine.routeId, groupTag: routeMachine.groupTag } };
    },
    createRuntimeState() {
      return runtimeState;
    },
    createPublicInitialState({ template }) {
      const data = template.data as { routeId?: string; groupTag?: string };
      return { state: "IDLE", context: { hits: 0, routeId: data.routeId, groupTag: data.groupTag } };
    },
    acceptsEvent({ action }) {
      return action.type === "HIT" || action.type === "BUMP";
    },
    reduce({ template, dispatch, state }) {
      const routeState = state as RouteRuntimeState;
      const route = dispatch.route;
      const data = template.data as { routeId?: string; groupTag?: string };
      routeState.routes.push({ key: route.key, targetSet: [...route.targetSet] });

      const matchesPluginRoute =
        route.scope === "plugin" && data.routeId !== undefined && route.targetSet.includes(data.routeId);
      const matchesGroupTag =
        route.scope === "tag" && data.groupTag !== undefined && route.targetSet.includes(data.groupTag);
      if (!matchesPluginRoute && !matchesGroupTag) return { type: "skip" };

      routeState.reduces += 1;
      const prev = dispatch.nextState[template.key] as { state: "IDLE"; context: { hits: number } };
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: { ...prev, context: { ...prev.context, hits: prev.context.hits + 1 } },
      };
    },
    commit({ state }) {
      (state as RouteRuntimeState).commits += 1;
    },
  });

  return { storage, runtimeState };
};

const routeStoragePlugin = (storage: ReturnType<typeof createRouteStorage>["storage"]) =>
  definePlugin().create({
    name: "route-runtime",
    storage: [storage],
  });

const entityRoutingPlugin = (
  resolver: (value: unknown) => string | readonly string[] = (value) => String(value),
) =>
  definePlugin().create({
    name: "entity-routing",
    routeMeta: {
      entityId: resolver,
    },
  });

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"], messagePart?: string): LiteFsmError => {
  let caught: unknown;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(LiteFsmError);
  expect((caught as LiteFsmError).code).toBe(code);
  if (messagePart) expect((caught as LiteFsmError).message).toContain(messagePart);
  return caught as LiteFsmError;
};

describe("routing meta registry", () => {
  it("route resolver обрабатывает plugin meta key", () => {
    const { storage, runtimeState } = createRouteStorage();
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin((value) => [`entity/${String(value)}`, `entity/${String(value)}`])],
      },
    );

    manager.transition({ type: "HIT", meta: { entityId: "a" } } as never);

    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 1 } } });
    expect(runtimeState.routes).toEqual([{ key: "entityId", targetSet: ["entity/a"] }]);
    expect(runtimeState.commits).toBe(1);
  });

  it("duplicate route meta key бросает init error", () => {
    const first = entityRoutingPlugin();
    const second = definePlugin().create({
      name: "entity-routing-duplicate",
      routeMeta: {
        entityId(value) {
          return String(value);
        },
      },
    });
    const coreDuplicate = definePlugin().create({
      name: "actor-routing-duplicate",
      routeMeta: {
        actorId(value) {
          return String(value);
        },
      },
    });

    expect(() =>
      MachineManager({ entity: createRouteMachine({ routeId: "entity/a" }) as never }, { plugins: [first, second] }),
    ).toThrow(
      "[lite-fsm] duplicate routeMeta key 'entityId': plugin 'entity-routing' conflicts with plugin 'entity-routing-duplicate'.",
    );
    expect(() =>
      MachineManager({ entity: createRouteMachine({ routeId: "entity/a" }) as never }, { plugins: [coreDuplicate] }),
    ).toThrow(
      "[lite-fsm] duplicate routeMeta key 'actorId': plugin 'actor-routing-duplicate' conflicts with core reserved routeMeta key 'actorId'.",
    );
  });

  it("unregistered action.meta key срезается без ошибки", () => {
    const committed: unknown[] = [];
    const manager = MachineManager({
      counter: {
        config: { IDLE: { HIT: "IDLE" } },
        initialState: "IDLE",
        initialContext: { hits: 0 },
        reducer: (slice, _action, meta) => ({
          state: meta.nextState,
          context: { hits: slice.context.hits + 1 },
        }),
      } satisfies MachineConfig<{ IDLE: { HIT: "IDLE" } }, { hits: number }, FSMEvent<"HIT">>,
    });
    manager.onTransition((_prev, _current, action) => committed.push(action));

    expect(() => manager.transition({ type: "HIT", meta: { unknown: "ignored" } } as never)).not.toThrow();

    expect(manager.getState().counter.context.hits).toBe(1);
    expect(committed).toEqual([{ type: "HIT" }]);
  });

  it("core route keys actorId и groupId вместе бросают ambiguity error", () => {
    const { storage, runtimeState } = createRouteStorage();
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage)],
      },
    );

    expectLiteFsmError(
      () => manager.transition({ type: "HIT", meta: { actorId: "actor/1", groupId: "group/1" } } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "actorId, groupId",
    );

    expect(runtimeState.routes).toEqual([]);
    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 0 } } });
  });

  it("actorId и registered plugin route key вместе бросают ambiguity error без resolver", () => {
    const { storage, runtimeState } = createRouteStorage();
    const resolver = vi.fn((value: unknown) => String(value));
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin(resolver)],
      },
    );

    expectLiteFsmError(
      () => manager.transition({ type: "HIT", meta: { actorId: "actor/1", entityId: "entity/a" } } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "actorId, entityId",
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(runtimeState.routes).toEqual([]);
    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 0 } } });
  });

  it("sender keys и unknown meta fields не участвуют в ambiguity detection", () => {
    const { storage, runtimeState } = createRouteStorage();
    const resolver = vi.fn((value: unknown) => String(value));
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin(resolver)],
      },
    );

    expect(() =>
      manager.transition({
        type: "HIT",
        meta: {
          entityId: "entity/a",
          senderActorId: "actor/sender",
          senderGroupId: "group/sender",
          senderGroupTag: "sender",
          unknown: "ignored",
        },
      } as never),
    ).not.toThrow();

    expect(resolver).toHaveBeenCalled();
    expect(resolver.mock.calls.every(([value]) => value === "entity/a")).toBe(true);
    expect(runtimeState.routes).toEqual([{ key: "entityId", targetSet: ["entity/a"] }]);
    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 1 } } });
  });

  it("route key со значением undefined не считается active", () => {
    const { storage, runtimeState } = createRouteStorage();
    const resolver = vi.fn((value: unknown) => String(value));
    const manager = MachineManager(
      {
        tagged: createRouteMachine({ groupTag: "workers" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin(resolver)],
      },
    );

    expect(() =>
      manager.transition({ type: "HIT", meta: { entityId: undefined, groupTag: "workers" } } as never),
    ).not.toThrow();

    expect(resolver).not.toHaveBeenCalled();
    expect(runtimeState.routes).toEqual([{ key: "groupTag", targetSet: ["workers"] }]);
    expect(manager.getState()).toMatchObject({ tagged: { context: { hits: 1 } } });
  });

  it("meta.entityId не теряется при middleware rewrite и post-normalization", () => {
    const { storage } = createRouteStorage();
    const committed: unknown[] = [];
    const rewrite: Middleware<any, RouteEvent> = () => (next) => (action) =>
      next({
        ...action,
        meta: { ...action.meta, entityId: "a", senderGroupId: "sender", unknown: "drop" },
      } as never);
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "a" }) as never,
      },
      {
        middleware: [rewrite],
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin()],
      },
    );
    manager.onTransition((_prev, _current, action) => committed.push(action));

    manager.transition({ type: "HIT", meta: { entityId: "a" } } as never);

    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 1 } } });
    expect(committed).toEqual([{ type: "HIT", meta: { entityId: "a" } }]);
  });

  it("несколько route keys между actorId, plugin key и groupId бросают ambiguity error", () => {
    const { storage, runtimeState } = createRouteStorage();
    const resolver = vi.fn((value: unknown) => String(value));
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin(resolver)],
      },
    );

    expectLiteFsmError(
      () =>
        manager.transition({
          type: "HIT",
          meta: { actorId: "actor/1", entityId: "entity/a", groupId: "group/1" },
        } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "actorId, entityId, groupId",
    );
    expectLiteFsmError(
      () => manager.transition({ type: "HIT", meta: { entityId: "entity/a", groupId: "group/1" } } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "entityId, groupId",
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(runtimeState.routes).toEqual([]);
    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 0 } } });
  });

  it("несколько registered plugin route keys бросают ambiguity error без вызова resolvers", () => {
    const { storage, runtimeState } = createRouteStorage();
    const entityResolver = vi.fn((value: unknown) => String(value));
    const tenantResolver = vi.fn((value: unknown) => String(value));
    const routingPlugin = definePlugin().create({
      name: "multi-routing",
      routeMeta: {
        tenantId: tenantResolver,
        entityId: entityResolver,
      },
    });
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "tenant/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), routingPlugin],
      },
    );

    expectLiteFsmError(
      () => manager.transition({ type: "HIT", meta: { entityId: "entity/a", tenantId: "tenant/a" } } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "tenantId, entityId",
    );

    expect(runtimeState.routes).toEqual([]);
    expect(tenantResolver).not.toHaveBeenCalled();
    expect(entityResolver).not.toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({ entity: { context: { hits: 0 } } });
  });

  it("groupTag остается доступным нескольким storage runtimes", () => {
    const { storage } = createRouteStorage();
    const manager = MachineManager(
      {
        likeSync: createLikeSync(),
        tagged: createRouteMachine({ groupTag: "likeSync" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage)],
      },
    );

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "BUMP", meta: { groupTag: "likeSync" } });

    expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
    expect(manager.getState()).toMatchObject({ tagged: { context: { hits: 1 } } });
  });

  it("route resolver не мутирует storage runtime state", () => {
    const { storage, runtimeState } = createRouteStorage();
    const resolver = vi.fn((value: unknown) => {
      expect(runtimeState.reduces).toBe(0);
      expect(runtimeState.commits).toBe(0);
      return String(value);
    });
    const manager = MachineManager(
      {
        entity: createRouteMachine({ routeId: "entity/a" }) as never,
      },
      {
        plugins: [routeStoragePlugin(storage), entityRoutingPlugin(resolver)],
      },
    );

    manager.transition({ type: "HIT", meta: { entityId: "entity/a" } } as never);

    expect(resolver).toHaveBeenCalled();
    expect(runtimeState.reduces).toBe(1);
    expect(runtimeState.commits).toBe(1);
  });

  it("plugin route key не доставляется в instance actor runtime как unscoped", () => {
    const manager = MachineManager({ likeSync: createLikeSync() }, { plugins: [entityRoutingPlugin()] });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "BUMP", meta: { entityId: "entity/a" } } as never);

    expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(1);
  });

  it("invalid route resolver result бросает clear error", () => {
    const objectResult = definePlugin().create({
      name: "bad-object-route",
      routeMeta: {
        entityId() {
          return { id: "a" } as never;
        },
      },
    });
    const arrayResult = definePlugin().create({
      name: "bad-array-route",
      routeMeta: {
        entityId() {
          return ["a", 1] as never;
        },
      },
    });

    {
      const { storage } = createRouteStorage();
      const manager = MachineManager(
        { entity: createRouteMachine({ routeId: "a" }) as never },
        { plugins: [routeStoragePlugin(storage), objectResult] },
      );

      expect(() => manager.transition({ type: "HIT", meta: { entityId: "a" } } as never)).toThrow(
        "[lite-fsm] route resolver for meta key 'entityId' must return a string or an array of strings.",
      );
    }
    {
      const { storage } = createRouteStorage();
      const manager = MachineManager(
        { entity: createRouteMachine({ routeId: "a" }) as never },
        { plugins: [routeStoragePlugin(storage), arrayResult] },
      );

      expect(() => manager.transition({ type: "HIT", meta: { entityId: "a" } } as never)).toThrow(
        "[lite-fsm] route resolver for meta key 'entityId' must return a string or an array of strings.",
      );
    }
  });
});

describe("routing runtime helpers", () => {
  it("сохраняет registered keys и вычисляет route без storage runtime", () => {
    const routing = createRoutingRuntime();

    expect(routing.registeredMetaKeys).toEqual([]);
    expect(routing.hasRoute(undefined)).toBe(false);

    routing.registry.registerRouteMeta("entityId", (value) => [String(value), String(value)]);

    expect(routing.registeredMetaKeys).toEqual(["entityId"]);
    expect(routing.hasRoute({ entityId: "a" } as never)).toBe(true);
    expect(
      routing.stripRouting({
        actorId: "actor/a",
        senderActorId: "actor/source",
        entityId: "entity/a",
      } as never),
    ).toEqual({ senderActorId: "actor/source", entityId: "entity/a" });
    expect(routing.stripRouting({ entityId: "entity/a" } as never)).toEqual({ entityId: "entity/a" });
    expect(routing.stripSenderFields({ actorId: "actor/a" } as never)).toEqual({ actorId: "actor/a" });
    expect(routing.hasRoute({ groupTag: "group" })).toBe(true);
    expect(routing.resolveRoute({ type: "HIT", meta: { groupId: ["group/a", "group/a"] } })).toEqual({
      scope: "group",
      key: "groupId",
      targetSet: ["group/a"],
    });
    expectLiteFsmError(
      () => routing.resolveRoute({ type: "HIT", meta: { groupId: "group/a", groupTag: "group" } }),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
      "groupId, groupTag",
    );
    expect(routing.resolveRoute({ type: "HIT", meta: { entityId: "entity/a" } } as never)).toEqual({
      scope: "plugin",
      key: "entityId",
      targetSet: ["entity/a"],
    });
  });

  it("возвращает unscoped, если active route key исчезает во время resolution", () => {
    const routing = createRoutingRuntime();
    const meta = {};
    let actorId: string | undefined = "actor/a";

    Object.defineProperty(meta, "actorId", {
      get() {
        const current = actorId;
        actorId = undefined;
        return current;
      },
    });

    expect(routing.resolveRoute({ type: "HIT", meta: meta as never })).toEqual({
      scope: "unscoped",
      key: undefined,
      targetSet: [],
    });
  });
});
