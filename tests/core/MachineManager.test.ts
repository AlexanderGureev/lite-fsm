import { describe, it, expect, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { VOID_REDUCER_ERROR, WILDCARD } from "@lite-fsm/core/internal/utils";
import type { AnyEvent, Middleware } from "@lite-fsm/core";

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

    it("transition обновляет все машины, которые реагируют на событие; не затронутые сохраняют ссылку", () => {
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

  describe("middleware (manager-specific)", () => {
    it("запрещает несколько next() в одном middleware dispatch", () => {
      const manager = MachineManager(
        {
          m: { config: { IDLE: { A: "B" }, B: {} }, initialState: "IDLE", initialContext: {} },
        },
        {
          middleware: [
            () => (next) => (action) => {
              next(action);
              return next(action);
            },
          ],
        },
      );

      expect(() => manager.transition({ type: "A" })).toThrow(/next\(\) more than once/);
    });

    it("кидает VOID_REDUCER_ERROR, когда middleware-replaced root reducer возвращает undefined", () => {
      const breaking: Middleware<any, AnyEvent> = (api) => {
        api.replaceReducer(() => () => undefined as never);
        return (next) => next;
      };

      const manager = MachineManager(
        { m: { config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} }, initialState: "IDLE", initialContext: {} } },
        { middleware: [breaking] },
      );

      expect(() => manager.transition({ type: "GO" })).toThrow(VOID_REDUCER_ERROR);
    });

    it("effects после вложенного api.transition используют prevState фактического outer commit", async () => {
      const seen: string[] = [];
      const manager = MachineManager(
        {
          m: {
            config: { IDLE: { B: "DONE" }, DONE: { A: null } },
            initialState: "IDLE",
            initialContext: {},
            effects: {
              DONE: () => seen.push("done"),
              [WILDCARD]: () => seen.push("wildcard"),
            },
          },
        },
        {
          middleware: [
            (api) => (next) => (action) => {
              if (action.type === "A") api.transition({ type: "B" });
              return next(action);
            },
          ],
        },
      );

      manager.transition({ type: "A" });

      await vi.waitFor(() => {
        expect(seen).toEqual(["done", "wildcard"]);
      });
      expect(manager.getState().m.state).toBe("DONE");
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

    it("domain condition резолвится на подходящем committed action", async () => {
      const done = vi.fn();

      const manager = MachineManager({
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { COMPLETE: "IDLE" } },
          initialState: "IDLE",
          initialContext: {},
          effects: {
            ACTIVE: async ({ condition }: { condition: (predicate: (a: AnyEvent) => boolean) => Promise<boolean> }) => {
              await condition((a) => a.type === "COMPLETE");
              done();
            },
          },
        },
      });

      manager.transition({ type: "GO" });
      manager.transition({ type: "COMPLETE" });

      await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    });
  });
});
