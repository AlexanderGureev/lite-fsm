import { describe, it, expect, vi } from "vitest";

import { MachineManager } from "../../src/core/MachineManager";
import { immerMiddleware } from "../../src/middleware/immer";
import { VOID_REDUCER_ERROR, WILDCARD } from "../../src/core/utils";
import type { AnyEvent, MachineReducer, Middleware } from "../../src/core/types";

describe("MachineManager", () => {
  describe("базовое поведение", () => {
    it("getState возвращает начальные state/context по каждой машине", () => {
      const manager = MachineManager({
        a: { config: { IDLE: {} }, initialState: "IDLE", initialContext: { n: 0 } },
        b: { config: { OFF: {} }, initialState: "OFF", initialContext: { flag: false } },
      });

      expect(manager.getState()).toEqual({
        a: { state: "IDLE", context: { n: 0 } },
        b: { state: "OFF", context: { flag: false } },
      });
    });

    it("пустая карта машин корректна и возвращает пустой state", () => {
      const manager = MachineManager<{}, AnyEvent>({});

      expect(manager.getState()).toEqual({});
      expect(manager.transition({ type: "ANY" })).toEqual({ type: "ANY" });
      expect(manager.getState()).toEqual({});
    });

    it("transition обновляет все машины, которые реагируют на событие", () => {
      const manager = MachineManager({
        a: { config: { IDLE: { GO: "ON" }, ON: {} }, initialState: "IDLE", initialContext: {} },
        b: { config: { OFF: { GO: "RUN" }, RUN: {} }, initialState: "OFF", initialContext: {} },
        c: { config: { READY: {} }, initialState: "READY", initialContext: {} },
      });

      const before = manager.getState();
      const untouched = before.c;

      manager.transition({ type: "GO" });

      expect(manager.getState()).toEqual({
        a: { state: "ON", context: {} },
        b: { state: "RUN", context: {} },
        c: { state: "READY", context: {} },
      });
      expect(manager.getState().c).toBe(untouched);
    });

    it("getState возвращает прямую ссылку на state: стабильна между вызовами, меняется после transition", () => {
      const manager = MachineManager({
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} },
      });

      const before = manager.getState();
      expect(manager.getState()).toBe(before);

      manager.transition({ type: "GO" });

      expect(manager.getState()).not.toBe(before);
    });

    it("в dev-режиме state заморожен — мутация извне кидает TypeError", () => {
      const manager = MachineManager({
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: { n: 0 } },
      });

      const snapshot = manager.getState() as Record<string, unknown>;
      expect(() => (snapshot.hacked = true)).toThrow(TypeError);
      expect(() => ((snapshot.m as { state: string }).state = "HACKED")).toThrow(TypeError);
      expect(() => ((snapshot.m as { context: { n: number } }).context.n = 999)).toThrow(TypeError);

      manager.transition({ type: "GO" });
      const next = manager.getState() as Record<string, unknown>;
      expect(() => ((next.m as { state: string }).state = "HACKED")).toThrow(TypeError);
    });

    it("кидает VOID_REDUCER_ERROR, если rootReducer через middleware возвращает undefined", () => {
      const breaking: Middleware<any, any> = (api) => {
        api.replaceReducer(() => () => undefined as any);
        return (next) => next;
      };

      const manager = MachineManager(
        { m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} } },
        { middleware: [breaking] },
      );

      expect(() => manager.transition({ type: "GO" })).toThrow(VOID_REDUCER_ERROR);
    });

    it("без middleware transition возвращает исходный action", () => {
      const manager = MachineManager({
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} },
      });

      const result = manager.transition({ type: "GO" });

      expect(result).toEqual({ type: "GO" });
      expect(manager.getState().m.state).toBe("ACTIVE");
    });

    it("reducer без return без immerMiddleware бросает понятную ошибку", () => {
      const manager = MachineManager({
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: () => {},
        },
      });

      expect(() => manager.transition({ type: "GO" })).toThrow(/immerMiddleware/);
    });

    it("immerMiddleware разрешает reducer без return", () => {
      const manager = MachineManager(
        {
          m: {
            config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
            initialState: "IDLE",
            initialContext: { count: 0 },
            reducer: ((state, _action, meta) => {
              state.state = meta.nextState;
              state.context.count += 1;
            }) satisfies MachineReducer<{ IDLE: { GO: "ACTIVE" }; ACTIVE: {} }, AnyEvent, { count: number }>,
          },
        },
        { middleware: [immerMiddleware] },
      );

      manager.transition({ type: "GO" });

      expect(manager.getState().m).toEqual({ state: "ACTIVE", context: { count: 1 } });
    });
  });

  describe("поток событий и каскад эффектов", () => {
    it("порядок: rootReducer (по всем машинам) → subscribers → effects по каждой машине", async () => {
      const order: string[] = [];

      const manager = MachineManager({
        a: {
          config: { IDLE: { GO: "ON" }, ON: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ON: () => {
              order.push("effect:a.ON");
            },
          },
        },
        b: {
          config: { OFF: { GO: "RUN" }, RUN: {} },
          initialState: "OFF",
          initialContext: {},
          effects: {
            RUN: () => {
              order.push("effect:b.RUN");
            },
          },
        },
      });

      manager.onTransition((_p, c, action) => {
        order.push(`sub:${action.type}:${c.a.state}/${c.b.state}`);
      });

      manager.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(order).toEqual(["sub:GO:ON/RUN", "effect:a.ON", "effect:b.RUN"]);
      });
    });

    it("эффекты машин вызываются в порядке вставки ключей, без сортировки по имени", async () => {
      const order: string[] = [];

      const manager = MachineManager({
        z: {
          config: { IDLE: { GO: "DONE" }, DONE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            DONE: () => order.push("z"),
          },
        },
        a: {
          config: { IDLE: { GO: "DONE" }, DONE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            DONE: () => order.push("a"),
          },
        },
      });

      manager.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(order).toEqual(["z", "a"]);
      });
    });

    it("каскад: вложенный transition из эффекта углубляет стек, эффекты разворачиваются LIFO", () => {
      const trace: string[] = [];
      type CascadeAction = { type: "E1" | "E2" | "E3" | "E4" };
      type EffectDeps = { transition: (a: CascadeAction) => void };

      const snap = () => {
        const s = manager.getState();
        return `a=${s.a.state} b=${s.b.state} c=${s.c.state}`;
      };

      const a = {
        config: { IDLE: { E1: "LEVEL1" }, LEVEL1: { E4: "DONE" }, DONE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          LEVEL1: ({ transition }: EffectDeps) => {
            trace.push(`in:A  ${snap()}`);
            transition({ type: "E2" });
            trace.push(`out:A ${snap()}`);
          },
        },
      };

      const b = {
        config: { IDLE: { E2: "LEVEL2" }, LEVEL2: { E4: "DONE" }, DONE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          LEVEL2: ({ transition }: EffectDeps) => {
            trace.push(`in:B  ${snap()}`);
            transition({ type: "E3" });
            trace.push(`out:B ${snap()}`);
          },
        },
      };

      const c = {
        config: { IDLE: { E3: "LEVEL3" }, LEVEL3: { E4: "DONE" }, DONE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          LEVEL3: ({ transition }: EffectDeps) => {
            trace.push(`in:C  ${snap()}`);
            transition({ type: "E4" });
            trace.push(`out:C ${snap()}`);
          },
        },
      };

      const manager = MachineManager({ a, b, c });

      manager.transition({ type: "E1" });

      expect(trace).toEqual([
        "in:A  a=LEVEL1 b=IDLE c=IDLE",
        "in:B  a=LEVEL1 b=LEVEL2 c=IDLE",
        "in:C  a=LEVEL1 b=LEVEL2 c=LEVEL3",
        "out:C a=DONE b=DONE c=DONE",
        "out:B a=DONE b=DONE c=DONE",
        "out:A a=DONE b=DONE c=DONE",
      ]);
    });
  });

  describe("onTransition", () => {
    it("подписчик получает (prev, current, action) с независимыми ссылками", () => {
      const manager = MachineManager({
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} },
      });

      const sub = vi.fn();
      manager.onTransition(sub);

      manager.transition({ type: "GO" });

      const [prev, cur, action] = sub.mock.calls[0];
      expect(prev.m.state).toBe("IDLE");
      expect(cur.m.state).toBe("ACTIVE");
      expect(action).toEqual({ type: "GO" });
      expect(prev).not.toBe(cur);
    });

    it("отписка прекращает последующие вызовы, оставляя остальных подписчиков", () => {
      const manager = MachineManager({
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } }, initialState: "IDLE", initialContext: {} },
      });

      const a = vi.fn();
      const b = vi.fn();
      const offA = manager.onTransition(a);
      manager.onTransition(b);

      manager.transition({ type: "GO" });
      offA();
      manager.transition({ type: "STOP" });

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(2);
    });
  });

  describe("setDependencies", () => {
    it("объектом: эффект получает переданные deps", () => {
      const log = vi.fn();

      const manager = MachineManager({
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: ({ services }: { services: { log: typeof log } }) => services.log("hi"),
          },
        },
      });

      manager.setDependencies({ services: { log } });
      manager.transition({ type: "GO" });

      expect(log).toHaveBeenCalledWith("hi");
    });

    it("функцией: результат становится новыми deps; предыдущие deps видны через аргумент", () => {
      const seen: unknown[] = [];

      const manager = MachineManager({
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: ({ services }: { services: { tag: string; extra?: boolean } }) => {
              seen.push(services);
            },
          },
        },
      });

      manager.setDependencies({ services: { tag: "v1" } });
      manager.setDependencies((prev: { services: { tag: string } }) => ({
        services: { ...prev.services, extra: true },
      }));

      manager.transition({ type: "GO" });

      expect(seen[0]).toEqual({ tag: "v1", extra: true });
    });
  });

  describe("middleware через opts.middleware", () => {
    it("порядок вызова нескольких middleware совпадает с порядком передачи", () => {
      const trace: string[] = [];

      const first = () => (next: (a: { type: string }) => { type: string }) => (action: { type: string }) => {
        trace.push(`1:${action.type}`);
        return next(action);
      };
      const second = () => (next: (a: { type: string }) => { type: string }) => (action: { type: string }) => {
        trace.push(`2:${action.type}`);
        return next(action);
      };

      const manager = MachineManager(
        { m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} } },
        { middleware: [first, second] },
      );

      manager.transition({ type: "GO" });

      expect(trace).toEqual(["1:GO", "2:GO"]);
    });

    it("middleware может трансформировать action для reducer, subscribers и wildcard effect", async () => {
      type Action = { type: "INC"; payload?: { amount: number; tagged: boolean } };
      const trace: string[] = [];
      const store = {
        counter: {
          config: { IDLE: { INC: null } },
          initialState: "IDLE",
          initialContext: { n: 0 },
          reducer: ((state, action) => {
            trace.push(`reducer:${action.payload?.amount}:${String(action.payload?.tagged)}`);
            if (action.type === "INC") {
              const amount = action.payload?.amount ?? 1;
              return { state: state.state, context: { n: state.context.n + amount } };
            }
            return state;
          }) satisfies MachineReducer<{ IDLE: { INC: null } }, Action, { n: number }>,
          effects: {
            [WILDCARD]: ({ action }: { action: Action }) => {
              trace.push(`effect:${action.payload?.amount}:${String(action.payload?.tagged)}`);
            },
          },
        },
      };

      const manager = MachineManager<typeof store, Action>(
        store,
        {
          middleware: [
            () => (next) => (action: Action) => {
              if (action.type === "INC" && action.payload === undefined) {
                return next({ ...action, payload: { amount: 5, tagged: true } });
              }
              return next(action);
            },
          ],
        },
      );

      manager.onTransition((_prev, _current, action: Action) => {
        trace.push(`sub:${action.payload?.amount}:${String(action.payload?.tagged)}`);
      });

      const result = manager.transition({ type: "INC" });

      expect(result).toEqual({ type: "INC", payload: { amount: 5, tagged: true } });
      expect(manager.getState().counter.context.n).toBe(5);

      await vi.waitFor(() => {
        expect(trace).toEqual(["reducer:5:true", "sub:5:true", "effect:5:true"]);
      });
    });

    it("middleware может блокировать action (не вызывая next)", () => {
      const trace: string[] = [];
      const machines = {
        m: { config: { IDLE: { A: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} },
      };

      const manager = MachineManager<typeof machines, AnyEvent>(
        machines,
        {
          middleware: [
            () => (next) => (action) => {
              trace.push(`in:${action.type}`);
              if (action.type === "BLOCKED") return action;
              return next(action);
            },
          ],
        },
      );

      manager.transition({ type: "BLOCKED" });
      manager.transition({ type: "A" });

      expect(trace).toEqual(["in:BLOCKED", "in:A"]);
      expect(manager.getState().m.state).toBe("ACTIVE");
    });

    it("api.transition: redispatch из middleware проходит цепочку", () => {
      const trace: string[] = [];

      const manager = MachineManager(
        {
          m: { config: { IDLE: { A: "MID" }, MID: { B: "DONE" }, DONE: {} }, initialState: "IDLE", initialContext: {} },
        },
        {
          middleware: [
            (api) => (next) => (action) => {
              trace.push(`mw:${action.type}`);
              const result = next(action);
              if (action.type === "A") api.transition({ type: "B" });
              return result;
            },
          ],
        },
      );

      manager.transition({ type: "A" });

      expect(trace).toEqual(["mw:A", "mw:B"]);
      expect(manager.getState().m.state).toBe("DONE");
    });

    it("api.getState возвращает актуальный state до и после next", () => {
      const snapshots: string[] = [];

      const manager = MachineManager(
        {
          m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} },
        },
        {
          middleware: [
            (api) => (next) => (action) => {
              snapshots.push(api.getState().m.state);
              const r = next(action);
              snapshots.push(api.getState().m.state);
              return r;
            },
          ],
        },
      );

      manager.transition({ type: "GO" });

      expect(snapshots).toEqual(["IDLE", "ACTIVE"]);
    });

    it("api.onTransition подписывается из middleware", () => {
      const seen: string[] = [];

      const manager = MachineManager(
        {
          m: { config: { IDLE: { A: "B" }, B: { C: "IDLE" } }, initialState: "IDLE", initialContext: {} },
        },
        {
          middleware: [
            (api) => {
              api.onTransition((_p, c, a) => {
                seen.push(`${a.type}@${c.m.state}`);
              });
              return (next) => (action) => next(action);
            },
          ],
        },
      );

      manager.transition({ type: "A" });
      manager.transition({ type: "C" });

      expect(seen).toEqual(["A@B", "C@IDLE"]);
    });

    it("api.condition резолвится из middleware", async () => {
      let resolved = false;

      const manager = MachineManager(
        {
          m: { config: { IDLE: { A: "B" }, B: { C: "IDLE" } }, initialState: "IDLE", initialContext: {} },
        },
        {
          middleware: [
            (api) => {
              api.condition((a) => a.type === "C").then(() => {
                resolved = true;
              });
              return (next) => (action) => next(action);
            },
          ],
        },
      );

      manager.transition({ type: "A" });
      manager.transition({ type: "C" });

      await vi.waitFor(() => {
        expect(resolved).toBe(true);
      });
    });
  });

  describe("replaceReducer (публичный API)", () => {
    it("переопределяет root reducer; оригинальный вызывается через переданную функцию", () => {
      const machines = {
        m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: { flag: false } },
      };
      const manager = MachineManager<typeof machines, AnyEvent>(machines);

      manager.replaceReducer((original) => (state, action) => {
        if (action.type === "CUSTOM") {
          return { ...state, m: { ...state.m, context: { flag: true } } };
        }
        return original(state, action);
      });

      manager.transition({ type: "CUSTOM" });
      expect(manager.getState().m.context.flag).toBe(true);

      manager.transition({ type: "GO" });
      expect(manager.getState().m.state).toBe("ACTIVE");
    });
  });

  describe("эффекты", () => {
    it("onError ловит ошибку из эффекта, машина продолжает работать", async () => {
      const onError = vi.fn();

      const manager = MachineManager(
        {
          m: {
            config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
            initialState: "IDLE",
            initialContext: {},
            effects: {
              ACTIVE: () => {
                throw new Error("boom");
              },
            },
          },
        },
        { onError },
      );

      manager.transition({ type: "GO" });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledOnce();
      });
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(manager.getState().m.state).toBe("ACTIVE");
    });

    it("condition внутри эффекта: reject попадает в onError", async () => {
      const onError = vi.fn();
      const machines = {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: async ({ condition }: { condition: (predicate: (action: AnyEvent) => boolean) => Promise<boolean> }) => {
              await condition(() => {
                throw new Error("predicate");
              });
            },
          },
        },
      };

      const manager = MachineManager<typeof machines, AnyEvent>(
        machines,
        { onError },
      );

      manager.transition({ type: "GO" });
      manager.transition({ type: "TRIGGER" });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledOnce();
      });
    });

    it("condition внутри эффекта: успешно резолвится на подходящем action", async () => {
      const done = vi.fn();

      const manager = MachineManager({
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { COMPLETE: "IDLE" } },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: async ({ condition }: { condition: (predicate: (action: AnyEvent) => boolean) => Promise<boolean> }) => {
              await condition((a: { type: string }) => a.type === "COMPLETE");
              done();
            },
          },
        },
      });

      manager.transition({ type: "GO" });
      manager.transition({ type: "COMPLETE" });

      await vi.waitFor(() => {
        expect(done).toHaveBeenCalledOnce();
      });
      expect(manager.getState().m.state).toBe("IDLE");
    });
  });
});
