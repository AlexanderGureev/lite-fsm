import { describe, it, expect, vi } from "vitest";

import { createMachine, defineMachine } from "../../src/core/Machine";
import { immerMiddleware } from "../../src/middleware/immer";
import { FSMEvent, Middleware } from "../../src/core/types";
import { VOID_REDUCER_ERROR, VOID_REDUCER_MIDDLEWARE_MARKER, WILDCARD } from "../../src/core/utils";

describe("createMachine — stateful-обёртка", () => {
  describe("базовое поведение", () => {
    it("getState возвращает initial state и initial context", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      });

      expect(machine.getState()).toEqual({ state: "IDLE", context: { count: 0 } });
    });

    it("transition меняет внутренний state", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      machine.transition({ type: "GO" });

      expect(machine.getState().state).toBe("ACTIVE");
    });

    it("getState возвращает прямую ссылку на state: стабильна между вызовами, меняется после transition", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      const before = machine.getState();
      expect(machine.getState()).toBe(before);

      machine.transition({ type: "GO" });

      expect(machine.getState()).not.toBe(before);
    });

    it("в dev-режиме state заморожен — мутация извне кидает TypeError", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { n: 0 },
      });

      const snapshot = machine.getState() as { state: string; context: { n: number } };
      expect(() => (snapshot.state = "HACKED")).toThrow(TypeError);
      expect(() => (snapshot.context.n = 999)).toThrow(TypeError);

      machine.transition({ type: "GO" });
      const next = machine.getState() as { state: string; context: { n: number } };
      expect(() => (next.state = "HACKED")).toThrow(TypeError);
    });

    it("кидает VOID_REDUCER_ERROR, если rootReducer через middleware возвращает undefined", () => {
      const breaking: Middleware<any, any> = (api) => {
        api.replaceReducer(() => () => undefined as any);
        return (next) => next;
      };

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      machine.addMiddleware(breaking);

      expect(() => machine.transition({ type: "GO" })).toThrow(VOID_REDUCER_ERROR);
    });

    it("transition возвращает исходный action, когда нет middleware", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      const result = machine.transition({ type: "GO" });

      expect(result).toEqual({ type: "GO" });
    });

    it("reducer без return без immerMiddleware бросает понятную ошибку", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        reducer: () => {},
      });

      expect(() => machine.transition({ type: "GO" })).toThrow(/immerMiddleware/);
    });
  });

  describe("поток событий", () => {
    it("порядок: rootReducer → subscribers → effects (effects видят УЖЕ обновлённый state)", async () => {
      const order: string[] = [];

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: () => {
            order.push("effect:ACTIVE");
          },
        },
      });

      machine.onTransition((prev, cur, action) => {
        order.push(`sub:${prev.state}->${cur.state}:${action.type}`);
      });

      machine.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(order).toEqual(["sub:IDLE->ACTIVE:GO", "effect:ACTIVE"]);
      });
    });

    it("вложенные transition из эффектов одной машины разворачиваются LIFO", async () => {
      const trace: string[] = [];
      let getState = () => "INIT";

      const machine = createMachine({
        config: {
          IDLE: { E1: "LEVEL1" },
          LEVEL1: { E2: "LEVEL2" },
          LEVEL2: { E3: "DONE" },
          DONE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          LEVEL1: ({ transition }) => {
            trace.push(`in:LEVEL1:${getState()}`);
            transition({ type: "E2" });
            trace.push(`out:LEVEL1:${getState()}`);
          },
          LEVEL2: ({ transition }) => {
            trace.push(`in:LEVEL2:${getState()}`);
            transition({ type: "E3" });
            trace.push(`out:LEVEL2:${getState()}`);
          },
        },
      });

      getState = () => machine.getState().state;

      machine.transition({ type: "E1" });

      await vi.waitFor(() => {
        expect(trace).toEqual([
          "in:LEVEL1:LEVEL1",
          "in:LEVEL2:LEVEL2",
          "out:LEVEL2:DONE",
          "out:LEVEL1:DONE",
        ]);
      });
      expect(machine.getState().state).toBe("DONE");
    });
  });

  describe("onTransition", () => {
    it("подписчик получает (prev, current, action)", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { n: 1 },
      });

      const sub = vi.fn();
      machine.onTransition(sub);

      machine.transition({ type: "GO" });

      expect(sub).toHaveBeenCalledOnce();
      const [prev, cur, action] = sub.mock.calls[0];
      expect(prev).toEqual({ state: "IDLE", context: { n: 1 } });
      expect(cur).toEqual({ state: "ACTIVE", context: { n: 1 } });
      expect(action).toEqual({ type: "GO" });
    });

    it("несколько подписчиков получают один и тот же снимок", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      const subA = vi.fn();
      const subB = vi.fn();
      machine.onTransition(subA);
      machine.onTransition(subB);

      machine.transition({ type: "GO" });

      expect(subA.mock.calls[0]).toEqual(subB.mock.calls[0]);
    });

    it("отписка прекращает последующие вызовы", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
      });

      const sub = vi.fn();
      const off = machine.onTransition(sub);

      machine.transition({ type: "GO" });
      off();
      machine.transition({ type: "STOP" });

      expect(sub).toHaveBeenCalledTimes(1);
    });

    it("отписка во время эмита не влияет на текущий вызов, но отключает следующий", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
      });

      const calls: string[] = [];

      const off = machine.onTransition((_p, _c, a) => {
        calls.push(`A:${a.type}`);
        off();
      });

      machine.onTransition((_p, _c, a) => {
        calls.push(`B:${a.type}`);
      });

      machine.transition({ type: "GO" });
      machine.transition({ type: "STOP" });

      expect(calls).toEqual(["A:GO", "B:GO", "B:STOP"]);
    });

    it("подписчик, добавленный во время эмита, начинает получать только следующие transition", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
      });

      const calls: string[] = [];
      let subscribed = false;

      machine.onTransition((_p, _c, action) => {
        calls.push(`A:${action.type}`);

        if (!subscribed) {
          subscribed = true;
          machine.onTransition((_nextPrev, _nextCurrent, nextAction) => {
            calls.push(`B:${nextAction.type}`);
          });
        }
      });

      machine.transition({ type: "GO" });
      machine.transition({ type: "STOP" });

      expect(calls).toEqual(["A:GO", "A:STOP", "B:STOP"]);
    });
  });

  describe("эффекты", () => {
    it("эффект вызывается при смене состояния", async () => {
      const effect = vi.fn();

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { ACTIVE: effect },
      });

      machine.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(effect).toHaveBeenCalledOnce();
      });
    });

    it("self-transition вызывает wildcard effect через stateful-путь", async () => {
      const wildcard = vi.fn();

      const machine = createMachine({
        config: { IDLE: { PING: null } },
        initialState: "IDLE",
        initialContext: { n: 1 },
        effects: { [WILDCARD]: wildcard },
      });

      machine.transition({ type: "PING" });

      expect(machine.getState()).toEqual({ state: "IDLE", context: { n: 1 } });

      await vi.waitFor(() => {
        expect(wildcard).toHaveBeenCalledOnce();
      });
      expect(wildcard.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          action: { type: "PING" },
        }),
      );
    });

    it("onError ловит ошибку из эффекта, не ломая машину", async () => {
      const onError = vi.fn();

      const machine = createMachine(
        {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: () => {
              throw new Error("boom");
            },
          },
        },
        { onError },
      );

      machine.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledOnce();
      });
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(machine.getState().state).toBe("ACTIVE");
    });

    it("dependencies прокидываются в эффект", async () => {
      const log = vi.fn();

      const machine = createMachine(
        {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: ({ services }) => services.log("hi"),
          },
        },
        { dependencies: { services: { log } } },
      );

      machine.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledWith("hi");
      });
    });
  });

  describe("condition (в эффекте)", () => {
    it("резолвится на подходящем action", async () => {
      const done = vi.fn();

      const machine = createMachine({
        config: {
          IDLE: { GO: "ACTIVE" },
          ACTIVE: { COMPLETE: "DONE" },
          DONE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: async ({ condition }) => {
            const ok = await condition((a) => a.type === "COMPLETE");
            done(ok);
          },
        },
      });

      machine.transition({ type: "GO" });
      machine.transition({ type: "COMPLETE" });

      await vi.waitFor(() => {
        expect(done).toHaveBeenCalledWith(true);
      });
    });

    it("ошибка в predicate → reject → onError", async () => {
      const onError = vi.fn();

      const machine = createMachine(
        {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: async ({ condition }) => {
              await condition(() => {
                throw new Error("predicate error");
              });
            },
          },
        },
        { onError },
      );

      machine.transition({ type: "GO" });
      machine.transition({ type: "TRIGGER" });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledOnce();
      });
      expect(onError.mock.calls[0][0].message).toBe("predicate error");
    });

    it("несколько ожидающих condition резолвятся одним подходящим action", async () => {
      const done = vi.fn();

      const machine = createMachine({
        config: {
          IDLE: { GO: "ACTIVE" },
          ACTIVE: { COMPLETE: "DONE" },
          DONE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: async ({ condition }) => {
            const results = await Promise.all([
              condition((a) => a.type === "COMPLETE"),
              condition((a) => a.type === "COMPLETE"),
            ]);
            done(results);
          },
        },
      });

      machine.transition({ type: "GO" });
      machine.transition({ type: "COMPLETE" });

      await vi.waitFor(() => {
        expect(done).toHaveBeenCalledWith([true, true]);
      });
    });
  });

  describe("addMiddleware", () => {
    it("immerMiddleware разрешает reducer без return", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
        reducer: (state, _action, meta) => {
          state.state = meta.nextState;
          state.context.count += 1;
        },
      });

      machine.addMiddleware(immerMiddleware);
      machine.transition({ type: "GO" });

      expect(machine.getState()).toEqual({ state: "ACTIVE", context: { count: 1 } });
    });

    it("кастомный middleware с маркером разрешает void reducer без подключения immer", () => {
      const allowVoidReducer = (((_api) => (next) => (action) => next(action)) as Middleware<any, any> & {
        [VOID_REDUCER_MIDDLEWARE_MARKER]: true;
      });
      allowVoidReducer[VOID_REDUCER_MIDDLEWARE_MARKER] = true;

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        reducer: () => {},
      });

      machine.addMiddleware(allowVoidReducer);

      expect(() => machine.transition({ type: "GO" })).not.toThrow();
      expect(machine.getState()).toEqual({ state: "IDLE", context: {} });
    });

    it("api.transition: redispatch из middleware проходит через всю цепочку", () => {
      const trace: string[] = [];

      const machine = createMachine({
        config: { IDLE: { A: "MID" }, MID: { B: "DONE" }, DONE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      machine.addMiddleware((api) => (next) => (action) => {
        trace.push(`mw:${action.type}`);
        const result = next(action);
        if (action.type === "A") api.transition({ type: "B" });
        return result;
      });

      machine.transition({ type: "A" });

      expect(trace).toEqual(["mw:A", "mw:B"]);
      expect(machine.getState().state).toBe("DONE");
    });

    it("api.replaceReducer подменяет поведение reducer'а", () => {
      const machine = createMachine({
        config: { IDLE: { INC: null } },
        initialState: "IDLE",
        initialContext: { n: 0 },
      });

      machine.addMiddleware(({ replaceReducer }) => {
        replaceReducer((original) => (state, action) => {
          if (action.type === "INC") {
            return { state: state.state, context: { n: state.context.n + 10 } };
          }
          return original(state, action);
        });

        return (next) => (action) => next(action);
      });

      machine.transition({ type: "INC" });

      expect(machine.getState().context.n).toBe(10);
    });

    it("api.getState возвращает актуальный state до и после next", () => {
      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      const before: string[] = [];
      const after: string[] = [];

      machine.addMiddleware((api) => (next) => (action) => {
        before.push(api.getState().state);
        const r = next(action);
        after.push(api.getState().state);
        return r;
      });

      machine.transition({ type: "GO" });

      expect(before).toEqual(["IDLE"]);
      expect(after).toEqual(["ACTIVE"]);
    });

    it("api.onTransition позволяет подписаться на последующие переходы", () => {
      const seen: string[] = [];

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
      });

      machine.addMiddleware((api) => {
        api.onTransition((_p, c, a) => {
          seen.push(`${a.type}@${c.state}`);
        });
        return (next) => (action) => next(action);
      });

      machine.transition({ type: "GO" });
      machine.transition({ type: "STOP" });

      expect(seen).toEqual(["GO@ACTIVE", "STOP@IDLE"]);
    });

    it("api.condition резолвится из middleware", async () => {
      const machine = createMachine({
        config: { IDLE: { A: "ACTIVE" }, ACTIVE: { B: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
      });

      let resolved: boolean | null = null;

      machine.addMiddleware((api) => {
        api.condition((a) => a.type === "B").then((v) => {
          resolved = v;
        });
        return (next) => (action) => next(action);
      });

      machine.transition({ type: "A" });
      machine.transition({ type: "B" });

      await vi.waitFor(() => {
        expect(resolved).toBe(true);
      });
    });

    it("middleware может блокировать action: state, subscribers и effects не меняются", () => {
      const sub = vi.fn();
      const effect = vi.fn();

      const machine = createMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { ACTIVE: effect },
      });

      machine.onTransition(sub);
      machine.addMiddleware(() => (next) => (action) => {
        if (action.type === "GO") return action;
        return next(action);
      });

      const result = machine.transition({ type: "GO" });

      expect(result).toEqual({ type: "GO" });
      expect(machine.getState().state).toBe("IDLE");
      expect(sub).not.toHaveBeenCalled();
      expect(effect).not.toHaveBeenCalled();
    });

    it("порядок вызова нескольких middleware совпадает с порядком регистрации", () => {
      const trace: string[] = [];

      const machine = createMachine({
        config: { IDLE: { A: null } },
        initialState: "IDLE",
        initialContext: {},
      });

      machine.addMiddleware(() => (next) => (action) => {
        trace.push("first");
        return next(action);
      });
      machine.addMiddleware(() => (next) => (action) => {
        trace.push("second");
        return next(action);
      });

      machine.transition({ type: "A" });

      expect(trace).toEqual(["first", "second"]);
    });

    it("изменённый middleware action доходит до reducer, subscribers и wildcard effect", async () => {
      type Action = { type: "INC"; payload?: { amount: number; tagged: boolean } };
      const trace: string[] = [];

      const machine = createMachine({
        config: { IDLE: { INC: null } },
        initialState: "IDLE",
        initialContext: { n: 0 },
        reducer: (state, action: Action) => {
          trace.push(`reducer:${action.payload?.amount}:${String(action.payload?.tagged)}`);
          return {
            state: state.state,
            context: { n: state.context.n + (action.payload?.amount ?? 0) },
          };
        },
        effects: {
          [WILDCARD]: ({ action }) => {
            trace.push(`effect:${action.payload?.amount}:${String(action.payload?.tagged)}`);
          },
        },
      });

      machine.onTransition((_prev, _current, action: Action) => {
        trace.push(`sub:${action.payload?.amount}:${String(action.payload?.tagged)}`);
      });

      machine.addMiddleware(() => (next) => (action: Action) =>
        next({ ...action, payload: { amount: 3, tagged: true } }),
      );

      const result = machine.transition({ type: "INC" });

      expect(result).toEqual({ type: "INC", payload: { amount: 3, tagged: true } });
      expect(machine.getState()).toEqual({ state: "IDLE", context: { n: 3 } });

      await vi.waitFor(() => {
        expect(trace).toEqual(["reducer:3:true", "sub:3:true", "effect:3:true"]);
      });
    });
  });
});

describe("defineMachine для core", () => {
  it("прокидывает dependencies и onError в createMachine", async () => {
    const onError = vi.fn();
    const log = vi.fn();

    type Events = FSMEvent<"GO">;
    type Deps = { services: { log: (m: string) => void } };

    const m = defineMachine<Events, Deps>({
      onError,
      dependencies: { services: { log } },
    }).create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: ({ services }) => {
          services.log("hi");
          throw new Error("boom");
        },
      },
    });

    m.transition({ type: "GO" });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(log).toHaveBeenCalledWith("hi");
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("одна фабрика создаёт независимые машины", () => {
    type Events = FSMEvent<"GO">;
    const factory = defineMachine<Events>();

    const first = factory.create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
      initialState: "IDLE",
      initialContext: {},
    });

    const second = factory.create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
      initialState: "IDLE",
      initialContext: {},
    });

    first.transition({ type: "GO" });

    expect(first.getState().state).toBe("ACTIVE");
    expect(second.getState().state).toBe("IDLE");
  });
});
