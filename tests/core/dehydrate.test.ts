import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig, MachineReducer } from "@lite-fsm/core";

type Config = { IDLE: { INC: null } };
type Action = { type: "INC" };
type Context = { count: number; secret: string };
type Snapshot = { count: number };

const reducer: MachineReducer<Config, Action, Context> = (state) => ({
  state: state.state,
  context: { ...state.context, count: state.context.count + 1 },
});

const counter = {
  config: { IDLE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0, secret: "hidden" },
  reducer,
  hydrate: (prev, snapshot: Snapshot) => {
    if (prev.context.count === snapshot.count) return prev;
    return { state: prev.state, context: { ...prev.context, count: snapshot.count } };
  },
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<Config, Context, Action, {}, Snapshot>;

const plain = {
  config: { READY: {} },
  initialState: "READY",
  initialContext: { label: "ok" },
} as const;

describe("dehydrate у MachineManager", () => {
  it("getSnapshot возвращает runtime state и не вызывает dehydrate-хуки", () => {
    const dehydrate = vi.fn(counter.dehydrate);
    const manager = MachineManager({ counter: { ...counter, dehydrate } }, { schemaVersion: 9 });

    const snapshot = manager.getSnapshot();

    expect(snapshot).toEqual({
      schemaVersion: 9,
      machines: {
        counter: { state: "IDLE", context: { count: 0, secret: "hidden" } },
      },
    });
    expect(snapshot.machines.counter).toBe(manager.getState().counter);
    expect(dehydrate).not.toHaveBeenCalled();
  });

  it("dehydrate возвращает все машины в envelope и применяет dehydrate-хуки машин", () => {
    const manager = MachineManager({ counter, plain }, { schemaVersion: 3 });
    manager.transition({ type: "INC" });

    expect(manager.dehydrate()).toEqual({
      schemaVersion: 3,
      machines: {
        counter: { count: 1 },
        plain: { state: "READY", context: { label: "ok" } },
      },
    });
  });

  it("dehydrate может выгрузить только выбранные машины", () => {
    const manager = MachineManager({ counter, plain });

    expect(manager.dehydrate({ machines: ["counter"] })).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { count: 0 },
      },
    });
  });

  it("dehydrate бросает ошибку для неизвестных ключей машин", () => {
    const manager = MachineManager({ counter });

    expect(() => manager.dehydrate({ machines: ["missing" as never] })).toThrow(
      "[lite-fsm] dehydrate: unknown machine key 'missing'.",
    );
  });

  it("восстанавливает custom snapshot через hydrate-хук, не мутируя исходный manager", () => {
    const source = MachineManager({ counter });
    source.transition({ type: "INC" });
    const before = source.getState();

    const snapshot = source.dehydrate();
    const restored = MachineManager({ counter }, { snapshot });

    expect(restored.getState().counter.context.count).toBe(1);
    expect(source.getState()).toBe(before);
  });
});
