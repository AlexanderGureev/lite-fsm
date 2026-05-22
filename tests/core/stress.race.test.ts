import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";

describe("MachineManager — stress / race conditions", () => {
  it("microtask race: CANCEL между resolve condition и transition подавляет late ATTEMPT_OK", async () => {
    type Event =
      | { type: "RUN"; payload: { id: string } }
      | { type: "ATTEMPT_OK" }
      | { type: "CANCEL" }
      | { type: "RESULT"; payload: { status: "ok" | "cancelled" } };

    type WorkerConfig = { __INIT: { RUN: "BUSY" }; BUSY: { ATTEMPT_OK: "__RESOLVED" }; "*": { CANCEL: "__CANCELLED" } };

    let gateResolve!: (value: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      gateResolve = resolve;
    });

    const worker = {
      config: { __INIT: { RUN: "BUSY" }, BUSY: { ATTEMPT_OK: "__RESOLVED" }, "*": { CANCEL: "__CANCELLED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => {
        if (action.type === "RUN") return { state: meta.nextState, context: { id: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        BUSY: async ({ self, transition }) => {
          const ok = await gate;
          if (ok) transition.actor(self.actorId, { type: "ATTEMPT_OK" });
        },
      },
    } satisfies MachineConfig<WorkerConfig, { id: string }, Event>;

    const log = {
      config: { IDLE: { RESULT: null } },
      initialState: "IDLE",
      initialContext: { entries: [] as Array<"ok" | "cancelled"> },
      reducer: (state, action) => {
        if (action.type === "RESULT") {
          return { state: state.state, context: { entries: [...state.context.entries, action.payload.status] } };
        }
      },
    } satisfies MachineConfig<{ IDLE: { RESULT: null } }, { entries: Array<"ok" | "cancelled"> }, Event>;

    const manager = MachineManager({ log, worker });

    manager.transition({ type: "RUN", payload: { id: "job-1" } });
    manager.transition({ type: "CANCEL", meta: { actorId: "worker/0" } });

    manager.transition({ type: "RESULT", payload: { status: "cancelled" } });
    gateResolve(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getState().worker).toEqual({});
    expect(manager.getState().log.context.entries).toEqual(["cancelled"]);
  });

  it("N concurrent spawns: 100 actors завершаются в произвольном порядке, итоговый record пуст", async () => {
    type Event =
      | { type: "SPAWN"; payload: { id: number } }
      | { type: "DONE" };

    type WorkerConfig = { __INIT: { SPAWN: "BUSY" }; BUSY: { DONE: "__RESOLVED" } };

    const resolvers: Array<() => void> = [];

    const worker = {
      config: { __INIT: { SPAWN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { id: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "SPAWN") return { state: meta.nextState, context: { id: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        BUSY: async ({ self, transition }) => {
          await new Promise<void>((resolve) => resolvers.push(resolve));
          transition.actor(self.actorId, { type: "DONE" });
        },
      },
    } satisfies MachineConfig<WorkerConfig, { id: number }, Event>;

    const manager = MachineManager({ worker });

    for (let i = 0; i < 100; i++) {
      manager.transition({ type: "SPAWN", payload: { id: i } });
    }

    expect(Object.keys(manager.getState().worker)).toHaveLength(100);

    const shuffled = [...resolvers].sort(() => Math.random() - 0.5);
    for (const resolve of shuffled) resolve();

    await vi.waitFor(() => expect(manager.getState().worker).toEqual({}));
  });

  it("reentrant transition в subscriber: каскадная обработка без stack overflow", () => {
    type Event = { type: "STEP"; payload: { remaining: number } } | { type: "DONE" };

    const counter = {
      config: { RUNNING: { STEP: null, DONE: "DONE" }, DONE: {} },
      initialState: "RUNNING",
      initialContext: { count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "STEP") {
          return { state: meta.nextState, context: { count: state.context.count + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<{ RUNNING: { STEP: null; DONE: "DONE" }; DONE: {} }, { count: number }, Event>;

    const manager = MachineManager({ counter });

    manager.onTransition((_prev, _current, action) => {
      if (action.type === "STEP" && action.payload.remaining > 0) {
        manager.transition({ type: "STEP", payload: { remaining: action.payload.remaining - 1 } });
      }
      if (action.type === "STEP" && action.payload.remaining === 0) {
        manager.transition({ type: "DONE" });
      }
    });

    manager.transition({ type: "STEP", payload: { remaining: 50 } });

    expect(manager.getState().counter.context.count).toBe(51);
    expect(manager.getState().counter.state).toBe("DONE");
  });

  it("late resolve disposed actor: transition подавляется normalize'ом (sender disposed)", async () => {
    type Event =
      | { type: "RUN"; payload: { id: string } }
      | { type: "DONE" }
      | { type: "CANCEL" }
      | { type: "LOG"; payload: { id: string } };

    type WorkerConfig = { __INIT: { RUN: "BUSY" }; BUSY: { DONE: "__RESOLVED" }; "*": { CANCEL: "__CANCELLED" } };

    let resolveDeferred!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveDeferred = resolve;
    });

    const worker = {
      config: { __INIT: { RUN: "BUSY" }, BUSY: { DONE: "__RESOLVED" }, "*": { CANCEL: "__CANCELLED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => {
        if (action.type === "RUN") return { state: meta.nextState, context: { id: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        BUSY: async ({ self, transition }) => {
          await deferred;
          transition.unscoped({ type: "LOG", payload: { id: self.actorId } });
          transition.actor(self.actorId, { type: "DONE" });
        },
      },
    } satisfies MachineConfig<WorkerConfig, { id: string }, Event>;

    const log = {
      config: { IDLE: { LOG: null } },
      initialState: "IDLE",
      initialContext: { ids: [] as string[] },
      reducer: (state, action) => {
        if (action.type === "LOG") {
          return { state: state.state, context: { ids: [...state.context.ids, action.payload.id] } };
        }
      },
    } satisfies MachineConfig<{ IDLE: { LOG: null } }, { ids: string[] }, Event>;

    const manager = MachineManager({ log, worker });

    manager.transition({ type: "RUN", payload: { id: "worker/0" } });
    manager.transition({ type: "CANCEL", meta: { actorId: "worker/0" } });

    resolveDeferred();
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getState().worker).toEqual({});
    expect(manager.getState().log.context.ids).toEqual([]);
  });
});
