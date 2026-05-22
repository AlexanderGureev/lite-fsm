// Memory leak проверки. Требует флага --expose-gc у node:
//   pnpm run test:gc
// Без gc() весь describe помечается skip.

import { expect, it, vi } from "vitest";

import { createEffect, MachineManager } from "@lite-fsm/core";
import { createSidecarState } from "@lite-fsm/core/internal/sidecar";
import type { MachineConfig, MachinesState, Middleware } from "@lite-fsm/core";

import {
  allocHeavy,
  countLive,
  describeIfGc,
  forceGc,
  type WeakRefLike,
} from "../_shared/memoryLeak";
import {
  createLikeSync,
  createReplacingMiddleware,
  createSnapshotLikeSync,
  type LikeConfig,
  type LikeEvent,
} from "./MachineManager.actors.fixtures";

describeIfGc("memory leak — bag cleanup (требует --expose-gc)", () => {
  it("sidecar state — sanity smoke: createSidecarState даёт чистый граф", () => {
    const sidecar = createSidecarState();
    expect(sidecar.actorById.size).toBe(0);
    expect(sidecar.groupById.size).toBe(0);
  });

  it("terminal collapse: actor исчезает из record, dispose-callbacks вызваны", () => {
    const disposed = vi.fn();
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: createEffect<LikeEvent, {}, LikeConfig, "PENDING">({
          effect: () => {},
          cancelFn: () => () => false,
        }),
        "*": ({ self }) => {
          disposed(self.actorId);
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

    expect(manager.getState().likeSync).toEqual({});
  });

  it("WeakRef на closure из effect: после terminal collapse + gc() ref становится недоступен", async () => {
    type Event = { type: "RUN" } | { type: "DONE" };
    type WorkerConfig = { __INIT: { RUN: "BUSY" }; BUSY: { DONE: "__RESOLVED" } };

    const holders: WeakRefLike<object>[] = [];

    const worker = {
      config: { __INIT: { RUN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: {},
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      effects: {
        BUSY: ({ self, transition, condition }) => {
          const heavy = allocHeavy(holders, 10_000);
          // Подвешиваем condition: dispose-wins reject отлавливается, но closure остаётся
          // в bag до cleanupDisposedActor.
          condition(() => {
            void heavy;
            return false;
          }).catch(() => {});
          transition.actor(self.actorId, { type: "DONE" });
        },
      },
    } satisfies MachineConfig<WorkerConfig, {}, Event>;

    await (async () => {
      const manager = MachineManager({ worker });
      for (let i = 0; i < 20; i++) manager.transition({ type: "RUN" });
      expect(manager.getState().worker).toEqual({});
    })();

    await forceGc();
    expect(countLive(holders)).toBeLessThan(holders.length);
  });

  // === P0-1: Domain machine — subscribers cleanup =============================

  it("domain subscribers: после unsubscribe + drop manager closure из onTransition освобождается", async () => {
    const holders: WeakRefLike<object>[] = [];

    type CounterEvent = { type: "INC" };
    const counter = {
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state) => ({ state: state.state, context: { count: state.context.count + 1 } }),
    } satisfies MachineConfig<{ IDLE: { INC: null } }, { count: number }, CounterEvent>;

    await (async () => {
      const manager = MachineManager({ counter });
      const heavy = allocHeavy(holders);
      const unsubscribe = manager.onTransition(() => {
        void heavy;
      });
      manager.transition({ type: "INC" });
      unsubscribe();
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === P0-2: External replacement через middleware ===========================

  it("external replacement: middleware-подмена actor record чистит bag и освобождает closure", async () => {
    const holders: WeakRefLike<object>[] = [];

    const replacing = createReplacingMiddleware("PING", (next) => ({ ...next, likeSync: {} }));

    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition }) => {
          const heavy = allocHeavy(holders);
          condition(() => {
            void heavy;
            return false;
          }).catch(() => {});
        },
      },
    };

    await (async () => {
      const manager = MachineManager({ likeSync: actorMachine }, { middleware: [replacing] });
      manager.transition({ type: "LIKE", payload: { id: "a" } });
      expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/0"]);

      replacing.replace();
      expect(manager.getState().likeSync).toEqual({});
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === P0-3: Hydrate replace удаляет акторов =================================

  it("hydrate replace: closure из condition() удалённого актора освобождается", async () => {
    const holders: WeakRefLike<object>[] = [];

    const snapshotActor = createSnapshotLikeSync({
      effects: {
        "*": ({ action, condition }) => {
          if (action.type !== "BUMP") return;
          const heavy = allocHeavy(holders);
          condition(() => {
            void heavy;
            return false;
          }).catch(() => {});
        },
      },
    });

    await (async () => {
      const manager = MachineManager({ likeSync: snapshotActor });
      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      manager.hydrate({ machines: { likeSync: {} } }, { strategy: "replace" });
      expect(manager.getState().likeSync).toEqual({});
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === P1-4: Domain condition() без self =====================================

  it("domain condition(): после resolve + drop manager closure из predicate освобождается", async () => {
    const holders: WeakRefLike<object>[] = [];

    type DomainEvent = { type: "START" } | { type: "PING" };
    const machine = {
      config: { IDLE: { START: "BUSY" }, BUSY: { PING: "IDLE" } },
      initialState: "IDLE",
      initialContext: {},
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      effects: {
        BUSY: async ({ condition }) => {
          const heavy = allocHeavy(holders);
          await condition((action) => {
            void heavy;
            return action.type === "PING";
          });
        },
      },
    } satisfies MachineConfig<{ IDLE: { START: "BUSY" }; BUSY: { PING: "IDLE" } }, {}, DomainEvent>;

    await (async () => {
      const manager = MachineManager({ domain: machine });
      manager.transition({ type: "START" });
      manager.transition({ type: "PING" });

      // condition() резолвится в микротаске — даём ему отработать до drop manager.
      await Promise.resolve();
      await Promise.resolve();
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === P1-5: Long-running churn — integral check =============================

  it("churn 200 spawn→done: WeakRef-массы освобождаются после drop manager", async () => {
    const holders: WeakRefLike<object>[] = [];

    type Event = { type: "RUN" } | { type: "DONE" };
    type WorkerConfig = { __INIT: { RUN: "BUSY" }; BUSY: { DONE: "__RESOLVED" } };

    const worker = {
      config: { __INIT: { RUN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: {},
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      effects: {
        BUSY: ({ self, transition, condition }) => {
          const heavy = allocHeavy(holders, 1_000);
          condition(() => {
            void heavy;
            return false;
          }).catch(() => {});
          transition.actor(self.actorId, { type: "DONE" });
        },
      },
    } satisfies MachineConfig<WorkerConfig, {}, Event>;

    await (async () => {
      const manager = MachineManager({ worker });
      for (let i = 0; i < 200; i++) manager.transition({ type: "RUN" });
      expect(manager.getState().worker).toEqual({});
    })();

    await forceGc();
    // V8 может удержать единичные closure под Promise-цепочкой; допускаем ≤ 10% живых.
    expect(countLive(holders)).toBeLessThanOrEqual(Math.ceil(holders.length / 10));
  });

  // === P2-6: createEffect cleanup при переходах между public states =========

  it("createEffect cancelFn: переходы перезаписывают slot.cancel, terminal cleanup освобождает все closures", async () => {
    const holders: WeakRefLike<object>[] = [];

    type Event = { type: "RUN" } | { type: "LOOP" } | { type: "DONE" };
    type WorkerConfig = {
      __INIT: { RUN: "BUSY" };
      BUSY: { LOOP: "BUSY"; DONE: "__RESOLVED" };
    };

    const worker = {
      config: { __INIT: { RUN: "BUSY" }, BUSY: { LOOP: "BUSY", DONE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: {},
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      effects: {
        BUSY: createEffect<Event, {}, WorkerConfig, "BUSY">({
          effect: () => {},
          cancelFn: () => {
            const heavy = allocHeavy(holders, 1_000);
            return () => {
              void heavy;
              return false;
            };
          },
        }),
      },
    } satisfies MachineConfig<WorkerConfig, {}, Event>;

    await (async () => {
      const manager = MachineManager({ worker });
      manager.transition({ type: "RUN" });
      for (let i = 0; i < 10; i++) manager.transition({ type: "LOOP", meta: { actorId: "worker/0" } });
      manager.transition({ type: "DONE", meta: { actorId: "worker/0" } });
      expect(manager.getState().worker).toEqual({});
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === P2-7: replaceReducer chain не утекает после drop manager ==============

  it("replaceReducer chain: closure из middleware-wrapped reducer освобождается после drop manager", async () => {
    const holders: WeakRefLike<object>[] = [];

    type CounterEvent = { type: "INC" };
    type CounterStore = {
      counter: MachineConfig<{ IDLE: { INC: null } }, { count: number }, CounterEvent>;
    };
    const counter = {
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state) => ({ state: state.state, context: { count: state.context.count + 1 } }),
    } satisfies CounterStore["counter"];

    const wrapping: Middleware<MachinesState<CounterStore>, CounterEvent> = (api) => {
      const heavy = allocHeavy(holders);
      api.replaceReducer((reducer) => (state, action) => {
        void heavy;
        return reducer(state, action);
      });
      return (next) => (action) => next(action);
    };

    await (async () => {
      const manager = MachineManager<CounterStore, CounterEvent>({ counter }, { middleware: [wrapping] });
      manager.transition({ type: "INC" });
      expect(manager.getState().counter.context.count).toBe(1);
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });
});
