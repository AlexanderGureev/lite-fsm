import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { HYDRATE_ACTION_TYPE } from "@lite-fsm/core/internal/utils";
import type { MachineConfig, MachineReducer, Middleware } from "@lite-fsm/core";

type CounterConfig = { IDLE: { INC: null }; READY: {} };
type CounterAction = { type: "INC" } | { type: "IGNORED" };
type CounterContext = { count: number };
type CounterSnapshot = { count: number };

const counterReducer: MachineReducer<CounterConfig, CounterAction, CounterContext> = (state, action) => {
  if (action.type !== "INC") return state;
  return { state: state.state, context: { count: state.context.count + 1 } };
};

const counterMachine = {
  config: { IDLE: { INC: null }, READY: {} },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: counterReducer,
  hydrate: (prev, snapshot: CounterSnapshot, meta) => {
    if (prev.context.count === snapshot.count) return prev;
    return { state: meta.strategy === "replace" ? "READY" : prev.state, context: { count: snapshot.count } };
  },
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<CounterConfig, CounterContext, CounterAction, {}, CounterSnapshot>;

const flagMachine = {
  config: { OFF: {}, ON: {} },
  initialState: "OFF",
  initialContext: { enabled: false } as { enabled: boolean },
} satisfies MachineConfig<{ OFF: {}; ON: {} }, { enabled: boolean }, CounterAction>;

describe("hydrate у MachineManager", () => {
  it("opts.snapshot применяется до публикации manager и использует strategy replace", () => {
    const manager = MachineManager(
      { counter: counterMachine, flag: flagMachine },
      { schemaVersion: 1, snapshot: { schemaVersion: 1, machines: { counter: { count: 5 } } } },
    );

    expect(manager.getState()).toEqual({
      counter: { state: "READY", context: { count: 5 } },
      flag: { state: "OFF", context: { enabled: false } },
    });
    expect(manager.getSnapshot()).toEqual({
      schemaVersion: 1,
      machines: manager.getState(),
    });
  });

  it("strategy merge используется по умолчанию, вызывает hydrate-хуки и не меняет пропущенные машины", () => {
    const manager = MachineManager({ counter: counterMachine, flag: flagMachine });
    const beforeFlag = manager.getState().flag;

    manager.hydrate({ machines: { counter: { count: 2 } } });

    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 2 } });
    expect(manager.getState().flag).toBe(beforeFlag);
  });

  it("getHydratedState показывает результат hydrate без мутаций и уведомлений", () => {
    const manager = MachineManager({ counter: counterMachine, flag: flagMachine });
    const sub = vi.fn();
    manager.onTransition(sub);

    const before = manager.getState();
    const preview = manager.getHydratedState({ machines: { counter: { count: 2 } } });

    expect(preview).not.toBe(before);
    expect(preview.counter).toEqual({ state: "IDLE", context: { count: 2 } });
    expect(preview.flag).toBe(before.flag);
    expect(manager.getState()).toBe(before);
    expect(sub).not.toHaveBeenCalled();
  });

  it("getHydratedState может считать preview поверх явно переданного baseState", () => {
    const manager = MachineManager({ counter: counterMachine, flag: flagMachine });
    const firstPreview = manager.getHydratedState({ machines: { counter: { count: 2 } } });

    const secondPreview = manager.getHydratedState(
      {
        machines: {
          flag: { state: "ON", context: { enabled: true } },
        },
      },
      { baseState: firstPreview },
    );

    expect(secondPreview.counter).toBe(firstPreview.counter);
    expect(secondPreview.flag).toEqual({ state: "ON", context: { enabled: true } });
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("getHydratedState молча пропускает неизвестные ключи и несовпадение schemaVersion", () => {
    const onUnknownMachineKey = vi.fn();
    const onSchemaVersionMismatch = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = MachineManager(
      { counter: counterMachine },
      { schemaVersion: 2, onUnknownMachineKey, onSchemaVersionMismatch },
    );

    const preview = manager.getHydratedState({
      schemaVersion: 1,
      machines: { missing: {}, counter: { count: 4 } },
    } as never);

    expect(preview.counter.context.count).toBe(4);
    expect(manager.getState().counter.context.count).toBe(0);
    expect(onUnknownMachineKey).not.toHaveBeenCalled();
    expect(onSchemaVersionMismatch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("strategy replace перезаписывает runtime slices без хуков только для машин из snapshot", () => {
    const manager = MachineManager({ counter: counterMachine, flag: flagMachine });

    manager.hydrate(
      {
        machines: {
          flag: { state: "ON", context: { enabled: true } },
        },
      },
      { strategy: "replace" },
    );

    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 0 } });
    expect(manager.getState().flag).toEqual({ state: "ON", context: { enabled: true } });
  });

  it("hydrate с теми же ссылками остаётся global noop и не уведомляет подписчиков", () => {
    const manager = MachineManager({ counter: counterMachine });
    const sub = vi.fn();
    manager.hydrate({ machines: { counter: { count: 3 } } });
    const before = manager.getState();
    manager.onTransition(sub);

    manager.hydrate({ machines: { counter: { count: 3 } } });

    expect(manager.getState()).toBe(before);
    expect(sub).not.toHaveBeenCalled();
  });

  it("один раз уведомляет подписчиков hydrate system action и не запускает эффекты", () => {
    const effect = vi.fn();
    const manager = MachineManager({
      counter: {
        ...counterMachine,
        effects: {
          READY: effect,
        },
      },
    });
    const sub = vi.fn();
    manager.onTransition(sub);

    manager.hydrate({ machines: { counter: { count: 1 } } }, { strategy: "replace" });

    expect(sub).toHaveBeenCalledOnce();
    expect(sub.mock.calls[0][2]).toEqual({
      type: HYDRATE_ACTION_TYPE,
      payload: { strategy: "replace", snapshot: { machines: { counter: { count: 1 } } } },
    });
    expect(effect).not.toHaveBeenCalled();
  });

  it("hydrate не проходит через middleware, а transition отклоняет reserved system actions", () => {
    const seen: string[] = [];
    const middleware: Middleware<any, CounterAction> = () => (next) => (action) => {
      seen.push(action.type);
      return next(action);
    };
    const manager = MachineManager({ counter: counterMachine }, { middleware: [middleware] });

    manager.hydrate({ machines: { counter: { count: 7 } } });

    expect(seen).toEqual([]);
    expect(() => manager.transition({ type: HYDRATE_ACTION_TYPE } as unknown as CounterAction)).toThrow(
      /reserved system action/,
    );
  });

  it("валидирует envelope, но не custom snapshot каждой машины", () => {
    const manager = MachineManager({ counter: counterMachine });

    expect(() => manager.hydrate(null as never)).toThrow(/snapshot must be an object/);
    expect(() => manager.hydrate({ machines: null } as never)).toThrow(/snapshot\.machines must be an object/);
    expect(() => manager.hydrate({ machines: { counter: { count: 1, extra: true } as CounterSnapshot } })).not.toThrow();
  });

  it("пропускает неизвестные машины, вызывает callbacks и применяет известные slices", () => {
    const onUnknownMachineKey = vi.fn();
    const onSchemaVersionMismatch = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = MachineManager(
      { counter: counterMachine },
      { schemaVersion: 2, onUnknownMachineKey, onSchemaVersionMismatch },
    );

    manager.hydrate({ schemaVersion: 1, machines: { missing: {}, counter: { count: 4 } } } as never);

    expect(manager.getState().counter.context.count).toBe(4);
    expect(onUnknownMachineKey).toHaveBeenCalledWith("missing", "hydrate");
    expect(onSchemaVersionMismatch).toHaveBeenCalledWith(1, 2);
    expect(warn).toHaveBeenCalledWith("[lite-fsm] hydrate: unknown machine key 'missing', skipped.");
    warn.mockRestore();
  });

  it("condition игнорирует hydrate system actions и резолвится на следующем пользовательском action", async () => {
    let resolved = false;
    const predicate = vi.fn((action: CounterAction) => action.type === "INC");
    const manager = MachineManager(
      { counter: counterMachine },
      {
        middleware: [
          (api) => {
            api.condition(predicate).then(() => {
              resolved = true;
            });
            return (next) => (action) => next(action);
          },
        ],
      },
    );

    manager.hydrate({ machines: { counter: { count: 1 } } });
    expect(predicate).not.toHaveBeenCalled();

    manager.transition({ type: "INC" });

    await vi.waitFor(() => {
      expect(resolved).toBe(true);
    });
    expect(predicate).toHaveBeenCalledOnce();
  });
});
