// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { devToolsMiddleware } from "../../src/middleware/devTools";
import { immerMiddleware } from "../../src/middleware/immer";
import { MachineManager } from "../../src/core/MachineManager";
import type { AnyEvent, MachineReducer } from "../../src/core/types";

type DevtoolsMessage = {
  type: string;
  state?: string;
  payload?: { type: string };
};

type FakeDevtools = {
  init: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  _emit: (msg: DevtoolsMessage) => void;
};

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: {
      connect: (config: unknown) => FakeDevtools;
    };
  }
}

const createFakeDevtools = (): FakeDevtools => {
  let listener: (msg: DevtoolsMessage) => void = () => {};
  return {
    init: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn((cb: (msg: DevtoolsMessage) => void) => {
      listener = cb;
    }),
    _emit: (msg) => listener(msg),
  };
};

describe("devToolsMiddleware — с window и extension", () => {
  let fake: FakeDevtools;
  let connect: ReturnType<typeof vi.fn<(config: unknown) => FakeDevtools>>;

  beforeEach(() => {
    fake = createFakeDevtools();
    connect = vi.fn<(config: unknown) => FakeDevtools>(() => fake);
    window.__REDUX_DEVTOOLS_EXTENSION__ = { connect };
  });

  afterEach(() => {
    delete window.__REDUX_DEVTOOLS_EXTENSION__;
  });

  it("подключается к extension с корректными опциями и вызывает init с текущим state", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: { n: 0 },
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    expect(connect).toHaveBeenCalledOnce();
    expect(connect.mock.calls[0][0]).toEqual({
      features: { pause: true, export: true, test: true, jump: true, skip: false, live: true },
      autoPause: false,
      latency: 500,
    });
    expect(fake.init).toHaveBeenCalledOnce();
    expect(fake.init.mock.calls[0][0]).toEqual(manager.getState());
  });

  it("send вызывается для обычного action с текущим state после next", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "GO" });

    expect(fake.send).toHaveBeenCalledOnce();
    const [sentAction, sentState] = fake.send.mock.calls[0];
    expect(sentAction).toEqual({ type: "GO" });
    expect(sentState.m.state).toBe("ACTIVE");
  });

  it("не отправляет действия из blacklistActions", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { SILENT: null, GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: ["SILENT"] })] },
    );

    manager.transition({ type: "SILENT" });
    expect(fake.send).not.toHaveBeenCalled();

    manager.transition({ type: "GO" });
    expect(fake.send).toHaveBeenCalledOnce();
  });

  it("не отправляет действия с префиксом @devtools обратно в extension", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({
      type: "DISPATCH",
      state: JSON.stringify({ m: { state: "ACTIVE", context: { restored: true } } }),
      payload: { type: "JUMP_TO_ACTION" },
    });

    expect(manager.getState().m.state).toBe("ACTIVE");
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("JUMP_TO_ACTION: replaceReducer мёржит payload в state", () => {
    type Ctx = { jumped?: boolean };
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {} as Ctx,
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({
      type: "DISPATCH",
      state: JSON.stringify({ m: { state: "ACTIVE", context: { jumped: true } } }),
      payload: { type: "JUMP_TO_ACTION" },
    });

    expect(manager.getState().m.state).toBe("ACTIVE");
    expect(manager.getState().m.context.jumped).toBe(true);
  });

  it("ROLLBACK: replaceReducer мёржит payload в state", () => {
    type Ctx = { rolled?: boolean };
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
          initialState: "IDLE",
          initialContext: {} as Ctx,
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "GO" });

    fake._emit({
      type: "DISPATCH",
      state: JSON.stringify({ m: { state: "IDLE", context: { rolled: true } } }),
      payload: { type: "ROLLBACK" },
    });

    expect(manager.getState().m.state).toBe("IDLE");
    expect(manager.getState().m.context.rolled).toBe(true);
  });

  it("default case в replaceReducer пропускает action в оригинальный reducer", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "GO" });
    expect(manager.getState().m.state).toBe("ACTIVE");
  });

  it("DISPATCH с невалидным JSON — логирует ошибку через console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({ type: "DISPATCH", state: "{invalid json", payload: { type: "JUMP_TO_ACTION" } });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toBe("[devToolsMiddleware]");
    errorSpy.mockRestore();
  });

  it("DISPATCH без state — игнорируется (никаких transition / errors)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({ type: "DISPATCH", payload: { type: "JUMP_TO_ACTION" } });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("не-DISPATCH сообщения игнорируются", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({ type: "START" });
    fake._emit({ type: "ACTION", state: JSON.stringify({}) });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("devToolsMiddleware — с window, но без extension", () => {
  beforeEach(() => {
    delete window.__REDUX_DEVTOOLS_EXTENSION__;
  });

  it("работает как pass-through + оборачивает reducer без обращения к devtools", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    const result = manager.transition({ type: "GO" });
    expect(result).toEqual({ type: "GO" });
    expect(manager.getState().m.state).toBe("ACTIVE");
  });

  it("JUMP/ROLLBACK всё ещё работают через replaceReducer (без devtools)", () => {
    type Ctx = { manually?: boolean };
    const machines = {
      m: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {} as Ctx,
      },
    };
    const manager = MachineManager<typeof machines, AnyEvent>(
      machines,
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({
      type: "@devtools/JUMP_TO_ACTION",
      payload: { m: { state: "ACTIVE", context: { manually: true } } },
    });

    expect(manager.getState().m.state).toBe("ACTIVE");
    expect(manager.getState().m.context.manually).toBe(true);
  });

  it("работает вместе с immerMiddleware в обоих порядках", () => {
    const cases = [
      [immerMiddleware, devToolsMiddleware({ blacklistActions: [] })],
      [devToolsMiddleware({ blacklistActions: [] }), immerMiddleware],
    ];

    for (const middleware of cases) {
      type Ctx = { count: number; restored?: boolean };
      const manager = MachineManager(
        {
          m: {
            config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
            initialState: "IDLE",
            initialContext: { count: 0 } as Ctx,
            reducer: ((state, _action, meta) => {
              state.state = meta.nextState;
              state.context.count += 1;
            }) satisfies MachineReducer<{ IDLE: { GO: "ACTIVE" }; ACTIVE: {} }, AnyEvent, Ctx>,
          },
        },
        { middleware },
      );

      expect(() => manager.transition({ type: "GO" })).not.toThrow();
      expect(manager.getState().m).toEqual({ state: "ACTIVE", context: { count: 1 } });

      manager.transition({
        type: "@devtools/JUMP_TO_ACTION",
        payload: { m: { state: "IDLE", context: { count: 10, restored: true } } },
      });

      expect(manager.getState().m).toEqual({ state: "IDLE", context: { count: 10, restored: true } });
    }
  });
});
