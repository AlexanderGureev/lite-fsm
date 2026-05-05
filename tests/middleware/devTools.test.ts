// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { devToolsMiddleware } from "../../src/middleware/devTools";
import { immerMiddleware } from "../../src/middleware/immer";
import { MachineManager } from "../../src/core/MachineManager";
import { HYDRATE_ACTION_TYPE } from "../../src/core/utils";
import type { AnyEvent, FSMEvent, MachineConfig, MachineReducer } from "../../src/core/types";

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

  it("send вызывается для обычного action с текущим state после reducer pass", () => {
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

  it("send вызывается для hydrate system action с hydrated state", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: {}, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: { n: 0 },
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );
    const snapshot = {
      machines: {
        m: { state: "ACTIVE", context: { n: 2 } },
      },
    } as const;

    manager.hydrate(snapshot);

    expect(fake.send).toHaveBeenCalledOnce();
    expect(fake.send).toHaveBeenCalledWith(
      {
        type: HYDRATE_ACTION_TYPE,
        payload: { strategy: "merge", snapshot },
      },
      {
        m: { state: "ACTIVE", context: { n: 2 } },
      },
    );
  });

  it("не отправляет hydrate system action из blacklistActions", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: {}, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: { n: 0 },
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [HYDRATE_ACTION_TYPE] })] },
    );

    manager.hydrate({
      machines: {
        m: { state: "ACTIVE", context: { n: 2 } },
      },
    });

    expect(fake.send).not.toHaveBeenCalled();
  });

  it("send снимает точный state до effects, а JUMP через transition доигрывает transient state", () => {
    type Event = FSMEvent<"START"> | FSMEvent<"DONE">;
    type Context = { done: number };
    const manager = MachineManager(
      {
        flow: {
          config: { READY: { START: "BUSY" }, BUSY: { DONE: "READY" } },
          initialState: "READY",
          initialContext: { done: 0 } as Context,
          reducer: (state, action, meta) => ({
            state: meta.nextState,
            context: { done: state.context.done + (action.type === "DONE" ? 1 : 0) },
          }),
          effects: {
            BUSY: ({ transition }) => {
              transition({ type: "DONE" });
            },
          },
        } satisfies MachineConfig<{ READY: { START: "BUSY" }; BUSY: { DONE: "READY" } }, Context, Event>,
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "START" });

    expect(fake.send).toHaveBeenCalledTimes(2);
    expect(fake.send.mock.calls.map(([action]) => action.type)).toEqual(["START", "DONE"]);
    expect(fake.send.mock.calls[0][1].flow).toEqual({ state: "BUSY", context: { done: 0 } });
    expect(fake.send.mock.calls[1][1].flow).toEqual({ state: "READY", context: { done: 1 } });

    fake._emit({
      type: "DISPATCH",
      state: JSON.stringify({ flow: { state: "BUSY", context: { done: 10 } } }),
      payload: { type: "JUMP_TO_ACTION" },
    });

    expect(manager.getState().flow).toEqual({ state: "READY", context: { done: 11 } });
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

  it("JUMP_TO_ACTION: replaceReducer заменяет state из DevTools snapshot", () => {
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

  it("ROLLBACK: replaceReducer заменяет state из DevTools snapshot", () => {
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

  it("обычный action проходит через original reducer", () => {
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

  it("DISPATCH без payload.type — игнорируется", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    fake._emit({ type: "DISPATCH", state: JSON.stringify({ m: { state: "IDLE", context: {} } }) });

    expect(manager.getState().m.state).toBe("IDLE");
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

  it("передаёт actor meta в DevTools и восстанавливает actor sidecar при JUMP", () => {
    type Event = FSMEvent<"START", { id: string }> | FSMEvent<"BUMP">;
    const actor: MachineConfig<
      { __INIT: { START: "PENDING" }; PENDING: { BUMP: null } },
      { id: string; count: number },
      Event
    > = {
      config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "START") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
        }
        return;
      },
    };
    const manager = MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });

    manager.transition({ type: "START", payload: { id: "a" } });

    const [, sentState] = fake.send.mock.calls[0];
    expect(sentState.sync["sync/0"].meta).toEqual({
      actorId: "sync/0",
      groupId: "sync/0",
      groupTag: "sync",
    });

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: {} }),
    });
    expect(manager.getState().sync).toEqual({});

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify(sentState),
    });

    manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });
    expect(manager.getState().sync["sync/0"].context.count).toBe(2);
  });

  it("восстанавливает actor sidecar совместно с immerMiddleware в обоих порядках middleware", () => {
    type Event = FSMEvent<"START", { id: string }> | FSMEvent<"BUMP">;
    type ActorConfig = { __INIT: { START: "PENDING" }; PENDING: { BUMP: null } };
    type ActorContext = { id: string; count: number };
    const createActor = () =>
      ({
        config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
        initialState: "__INIT",
        initialContext: { id: "", count: 0 },
        reducer: ((state, action, meta) => {
          state.state = meta.nextState;
          if (action.type === "START") {
            state.context.id = action.payload.id;
            state.context.count = 1;
            return;
          }
          if (action.type === "BUMP") state.context.count += 1;
        }) satisfies MachineReducer<ActorConfig, Event, ActorContext>,
      }) satisfies MachineConfig<ActorConfig, ActorContext, Event>;
    const cases = [
      [immerMiddleware, devToolsMiddleware({ blacklistActions: [] })],
      [devToolsMiddleware({ blacklistActions: [] }), immerMiddleware],
    ];

    for (const middleware of cases) {
      fake.send.mockClear();
      const manager = MachineManager({ sync: createActor() }, { middleware });

      manager.transition({ type: "START", payload: { id: "a" } });
      const [, sentState] = fake.send.mock.calls[fake.send.mock.calls.length - 1];
      expect(sentState.sync["sync/0"].meta).toEqual({
        actorId: "sync/0",
        groupId: "sync/0",
        groupTag: "sync",
      });

      fake._emit({
        type: "DISPATCH",
        payload: { type: "JUMP_TO_ACTION" },
        state: JSON.stringify({ sync: {} }),
      });
      expect(manager.getState().sync).toEqual({});

      fake._emit({
        type: "DISPATCH",
        payload: { type: "JUMP_TO_ACTION" },
        state: JSON.stringify(sentState),
      });
      manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });

      expect(manager.getState().sync["sync/0"].context).toEqual({ id: "a", count: 2 });
    }
  });

  it("ROLLBACK восстанавливает actor sidecar и увеличивает счётчики до следующего spawn", () => {
    type Event = FSMEvent<"START", { id: string }> | FSMEvent<"BUMP">;
    const actor: MachineConfig<
      { __INIT: { START: "PENDING" }; PENDING: { BUMP: null } },
      { id: string; count: number },
      Event
    > = {
      config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "START") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: "PENDING", context: { ...state.context, count: state.context.count + 1 } };
        }
        return { state: "PENDING", context: state.context };
      },
    };
    const manager = MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });

    fake._emit({
      type: "DISPATCH",
      payload: { type: "ROLLBACK" },
      state: JSON.stringify({
        sync: {
          "sync/5": {
            state: "PENDING",
            context: { id: "restored", count: 1 },
            meta: { actorId: "sync/5", groupId: "sync/5", groupTag: "sync" },
          },
        },
      }),
    });

    manager.transition({ type: "BUMP", meta: { groupId: "sync/5" } });
    expect(manager.getState().sync["sync/5"].context.count).toBe(2);

    manager.transition({ type: "START", payload: { id: "new" } });
    expect(Object.keys(manager.getState().sync).sort()).toEqual(["sync/5", "sync/6"]);
    expect(manager.getState().sync["sync/6"].context.id).toBe("new");
  });

  it("восстанавливает actor'ов с opaque ids и игнорирует невалидную метадату восстановления", () => {
    type Event = FSMEvent<"BUMP">;
    const actor: MachineConfig<{ __INIT: { BUMP: "PENDING" }; PENDING: { BUMP: null } }, { count: number }, Event> = {
      config: { __INIT: { BUMP: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { count: 0 },
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: { count: state.context.count + 1 } }),
    };
    const manager = MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({
        sync: {
          "sync/foo": {
            state: "PENDING",
            context: { count: 1 },
            meta: { actorId: "sync/foo", groupId: "sync/0", groupTag: "sync" },
          },
          "sync/bar": {
            state: "PENDING",
            context: { count: 1 },
            meta: { actorId: "sync/bar", groupId: "sync/0", groupTag: "sync" },
          },
          custom: {
            state: "PENDING",
            context: { count: 1 },
            meta: { actorId: "custom", groupId: "sync/foo", groupTag: "sync" },
          },
        },
      }),
    });
    manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });
    expect(manager.getState().sync["sync/foo"].context.count).toBe(2);
    expect(manager.getState().sync["sync/bar"].context.count).toBe(2);

    manager.transition({ type: "BUMP", meta: { groupId: "sync/foo" } });
    expect(manager.getState().sync.custom.context.count).toBe(2);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({
        sync: {
          bad: {
            state: "PENDING",
            context: { count: 1 },
            meta: { actorId: "other", groupId: "sync/1", groupTag: "sync" },
          },
        },
      }),
    });
    expect(errorSpy).toHaveBeenCalledWith("[devToolsMiddleware]", expect.any(Error));
    expect(manager.getState().sync.custom.context.count).toBe(2);
    manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });
    expect(manager.getState().sync["sync/foo"].context.count).toBe(3);
    expect(manager.getState().sync["sync/bar"].context.count).toBe(3);
    errorSpy.mockRestore();
  });

  it("JUMP назад удаляет actor, чистит pending condition и следующий JUMP вперёд восстанавливает routing", async () => {
    type Event = FSMEvent<"START", { id: string }> | FSMEvent<"BUMP">;
    const pending: Array<Promise<boolean>> = [];
    const actor: MachineConfig<
      { __INIT: { START: "PENDING" }; PENDING: { BUMP: null } },
      { id: string; count: number },
      Event
    > = {
      config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "START") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
      },
      effects: {
        PENDING: ({ condition }) => {
          pending.push(condition((next) => next.type === "BUMP"));
        },
      },
    };
    const manager = MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });

    manager.transition({ type: "START", payload: { id: "a" } });
    const [, sentState] = fake.send.mock.calls[0];

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: {} }),
    });
    await expect(pending[0]).rejects.toThrow();
    expect(manager.getState().sync).toEqual({});

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify(sentState),
    });
    manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });

    expect(manager.getState().sync["sync/0"].context.count).toBe(2);
  });

  it("JUMP restore создаёт fresh actor bag и не наследует pending condition старого actor", async () => {
    type Event = FSMEvent<"START", { id: string }> | FSMEvent<"ARM"> | FSMEvent<"BUMP">;
    type Config = { __INIT: { START: "PENDING" }; PENDING: { ARM: "WAIT"; BUMP: null }; WAIT: { BUMP: null } };
    const oldPending: Array<Promise<boolean>> = [];
    const freshPending: Array<Promise<boolean>> = [];
    const actor: MachineConfig<Config, { id: string; count: number }, Event> = {
      config: { __INIT: { START: "PENDING" }, PENDING: { ARM: "WAIT", BUMP: null }, WAIT: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "START") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        PENDING: ({ condition }) => {
          oldPending.push(condition((next) => next.type === "BUMP"));
        },
        WAIT: ({ condition }) => {
          freshPending.push(condition((next) => next.type === "BUMP"));
        },
      },
    };
    const manager = MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });

    manager.transition({ type: "START", payload: { id: "a" } });
    const [, sentState] = fake.send.mock.calls[0];
    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: {} }),
    });
    await expect(oldPending[0]).rejects.toThrow();

    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify(sentState),
    });
    manager.transition({ type: "ARM", meta: { actorId: "sync/0" } });
    manager.transition({ type: "BUMP", meta: { actorId: "sync/0" } });

    await expect(freshPending[0]).resolves.toBe(true);
    expect(manager.getState().sync["sync/0"].context.count).toBe(2);
  });

  it("in-flight async actor transition после JUMP назад становится no-op для late-dispatch", async () => {
    type Event = FSMEvent<"START"> | FSMEvent<"BUMP">;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actor: MachineConfig<{ __INIT: { START: "PENDING" }; PENDING: { BUMP: null } }, { count: number }, Event> = {
      config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { count: 0 },
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: { count: state.context.count + 1 } }),
      effects: {
        PENDING: async ({ transition }) => {
          await gate;
          transition({ type: "BUMP" });
        },
      },
    };
    const domain: MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, Event> = {
      config: { IDLE: { BUMP: null } },
      initialState: "IDLE",
      initialContext: { bumps: 0 },
      reducer: (state, action) => {
        if (action.type === "BUMP") return { state: state.state, context: { bumps: state.context.bumps + 1 } };
      },
    };
    const manager = MachineManager(
      { domain, sync: actor },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "START" });
    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: {} }),
    });
    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getState().sync).toEqual({});
    expect(manager.getState().domain.context.bumps).toBe(0);
  });

  it("корректно обрабатывает невалидные actor snapshots в payload DevTools", () => {
    type Event = FSMEvent<"BUMP">;
    const actor: MachineConfig<{ __INIT: { BUMP: "PENDING" }; PENDING: { BUMP: null } }, { count: number }, Event> = {
      config: { __INIT: { BUMP: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { count: 0 },
    };
    MachineManager({ sync: actor }, { middleware: [devToolsMiddleware({ blacklistActions: [] })] });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fake._emit({ type: "DISPATCH", payload: { type: "JUMP_TO_ACTION" }, state: JSON.stringify(1) });
    fake._emit({ type: "DISPATCH", payload: { type: "JUMP_TO_ACTION" }, state: JSON.stringify({ sync: 1 }) });
    fake._emit({ type: "DISPATCH", payload: { type: "JUMP_TO_ACTION" }, state: JSON.stringify({ sync: { bad: 1 } }) });
    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: { bad: { state: "PENDING", context: {} } } }),
    });
    fake._emit({
      type: "DISPATCH",
      payload: { type: "JUMP_TO_ACTION" },
      state: JSON.stringify({ sync: { bad: { state: "PENDING", context: {}, meta: {} } } }),
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("отклоняет невалидные actor restore snapshots без частичного commit", () => {
    type Event = FSMEvent<"BUMP">;
    const actor: MachineConfig<{ __INIT: { BUMP: "PENDING" }; PENDING: { BUMP: null } }, { count: number }, Event> = {
      config: { __INIT: { BUMP: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { count: 0 },
    };
    const manager = MachineManager(
      {
        sync: actor,
        other: { ...actor, groupTag: "other" },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const emitRestore = (sync: unknown, other: unknown = {}) => {
      fake._emit({
        type: "DISPATCH",
        payload: { type: "JUMP_TO_ACTION" },
        state: JSON.stringify({ sync, other }),
      });
      expect(manager.getState()).toEqual({ sync: {}, other: {} });
    };

    emitRestore({
      "sync/0": {
        state: "__RESOLVED",
        context: { count: 1 },
        meta: { actorId: "sync/0", groupId: "sync/0", groupTag: "sync" },
      },
    });
    emitRestore({
      badKey: {
        state: "PENDING",
        context: { count: 1 },
        meta: { actorId: "sync/0", groupId: "sync/0", groupTag: "sync" },
      },
    });
    emitRestore(
      {
        shared: {
          state: "PENDING",
          context: { count: 1 },
          meta: { actorId: "shared", groupId: "sync/0", groupTag: "sync" },
        },
      },
      {
        shared: {
          state: "PENDING",
          context: { count: 1 },
          meta: { actorId: "shared", groupId: "other/0", groupTag: "other" },
        },
      },
    );
    emitRestore(
      {
        "sync/0": {
          state: "PENDING",
          context: { count: 1 },
          meta: { actorId: "sync/0", groupId: "sync/0", groupTag: "sync" },
        },
      },
      {
        "other/0": {
          state: "PENDING",
          context: { count: 1 },
          meta: { actorId: "other/0", groupId: "sync/0", groupTag: "sync" },
        },
      },
    );

    expect(errorSpy).toHaveBeenCalledTimes(4);
    errorSpy.mockRestore();
  });
});

describe("devToolsMiddleware — fallback на plain middleware api", () => {
  let fake: FakeDevtools;

  beforeEach(() => {
    fake = createFakeDevtools();
    window.__REDUX_DEVTOOLS_EXTENSION__ = { connect: () => fake };
  });

  afterEach(() => {
    delete window.__REDUX_DEVTOOLS_EXTENSION__;
  });

  it("работает с plain middleware api", () => {
    const api = {
      getState: () => ({ n: 1 }),
      transition: vi.fn((action: AnyEvent) => action),
      replaceReducer: vi.fn(),
      onTransition: () => () => {},
      condition: async () => true,
    };

    const wrapped = devToolsMiddleware({ blacklistActions: [] })(api)(vi.fn((action: AnyEvent) => action));
    expect(fake.init).toHaveBeenCalledWith({ n: 1 });

    wrapped({ type: "GO" });
    expect(fake.send).toHaveBeenCalledWith({ type: "GO" }, { n: 1 });

    fake._emit({ type: "DISPATCH", payload: { type: "JUMP_TO_ACTION" }, state: JSON.stringify({ n: 2 }) });
    expect(api.replaceReducer).toHaveBeenCalledOnce();
    expect(api.transition).toHaveBeenCalledWith({ type: "@devtools/JUMP_TO_ACTION", payload: { n: 2 } });
  });
});

describe("devToolsMiddleware — с window, но без extension", () => {
  beforeEach(() => {
    delete window.__REDUX_DEVTOOLS_EXTENSION__;
  });

  it("работает как pass-through без обращения к devtools", () => {
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

  it("JUMP/ROLLBACK без extension не заменяют state сами по себе", () => {
    type Ctx = { manually?: boolean };
    const machines = {
      m: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {} as Ctx,
      },
    };
    const manager = MachineManager<typeof machines, AnyEvent>(machines, {
      middleware: [devToolsMiddleware({ blacklistActions: [] })],
    });

    manager.transition({
      type: "@devtools/JUMP_TO_ACTION",
      payload: { m: { state: "ACTIVE", context: { manually: true } } },
    });

    expect(manager.getState().m.state).toBe("IDLE");
    expect(manager.getState().m.context.manually).toBeUndefined();
  });

  it("JUMP/ROLLBACK с не-object payload не меняет state", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: {} },
          initialState: "IDLE",
          initialContext: { stable: true },
        },
      },
      { middleware: [devToolsMiddleware({ blacklistActions: [] })] },
    );

    manager.transition({ type: "@devtools/JUMP_TO_ACTION", payload: null });
    manager.transition({ type: "@devtools/ROLLBACK", payload: 1 });

    expect(manager.getState().m).toEqual({ state: "IDLE", context: { stable: true } });
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

      manager.transition({ type: "@devtools/JUMP_TO_ACTION" });

      expect(manager.getState().m).toEqual({ state: "ACTIVE", context: { count: 1 } });
    }
  });
});
