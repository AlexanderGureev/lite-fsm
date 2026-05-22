// Standalone scenario-тесты для архитектурных паттернов из SKILL.md.
// Все примеры самодостаточны: configs/reducers/effects живут внутри тестов и не зависят от apps/*.

import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";

describe("MachineManager actors — характерные сценарии", () => {
  it("likes scenario: unscoped LIKE создаёт actor, domain видит LIKE, actor resolve/reject обновляет domain", () => {
    type Event =
      | { type: "LIKE"; payload: { id: string; fail?: boolean } }
      | { type: "LIKE_OK"; payload: { id: string } }
      | { type: "LIKE_ERR"; payload: { id: string } }
      | { type: "OK" }
      | { type: "FAIL" };
    type LikeActorConfig = { __INIT: { LIKE: "PENDING" }; PENDING: { OK: "__RESOLVED"; FAIL: "__REJECTED" } };

    const likes = {
      config: { IDLE: { LIKE: null, LIKE_OK: null, LIKE_ERR: null } },
      initialState: "IDLE",
      initialContext: { liked: [] as string[], resolved: [] as string[], rejected: [] as string[] },
      reducer: (state, action) => {
        if (action.type === "LIKE") {
          return {
            state: state.state,
            context: { ...state.context, liked: [...state.context.liked, action.payload.id] },
          };
        }
        if (action.type === "LIKE_OK") {
          return {
            state: state.state,
            context: { ...state.context, resolved: [...state.context.resolved, action.payload.id] },
          };
        }
        if (action.type === "LIKE_ERR") {
          return {
            state: state.state,
            context: { ...state.context, rejected: [...state.context.rejected, action.payload.id] },
          };
        }
      },
    } satisfies MachineConfig<
      { IDLE: { LIKE: null; LIKE_OK: null; LIKE_ERR: null } },
      { liked: string[]; resolved: string[]; rejected: string[] },
      Event
    >;

    const likeSync = {
      config: { __INIT: { LIKE: "PENDING" }, PENDING: { OK: "__RESOLVED", FAIL: "__REJECTED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => ({
        state: meta.nextState,
        context: { id: action.type === "LIKE" ? action.payload.id : state.context.id },
      }),
      effects: {
        PENDING: ({ action, self, transition }) => {
          if (action.type !== "LIKE") return;
          // ВАЖНО: unscoped отправляем ДО terminal-collapse этого actor'а,
          // иначе normalize дропает action как от disposed sender'а.
          transition.unscoped({
            type: action.payload.fail ? "LIKE_ERR" : "LIKE_OK",
            payload: { id: action.payload.id },
          });
          transition.actor(self.actorId, { type: action.payload.fail ? "FAIL" : "OK" });
        },
      },
    } satisfies MachineConfig<LikeActorConfig, { id: string }, Event>;
    const manager = MachineManager({ likes, likeSync });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b", fail: true } });

    expect(manager.getState().likes.context).toEqual({
      liked: ["a", "b"],
      resolved: ["a"],
      rejected: ["b"],
    });
    expect(manager.getState().likeSync).toEqual({});
  });

  it("game tag-scoped scenario доставляет target tags и spawn'ит только в существующих groups", () => {
    type Event = { type: "PULSE" };
    type Config = { __INIT: { PULSE: "ACTIVE" }; ACTIVE: { PULSE: null } };
    type Context = { kind: string; pulses: number };
    const createTemplate = (kind: string, groupTag: string) =>
      ({
        config: { __INIT: { PULSE: "ACTIVE" }, ACTIVE: { PULSE: null } },
        groupTag,
        initialState: "__INIT",
        initialContext: { kind, pulses: 0 },
        reducer: (state, action, meta) => ({
          state: meta.nextState,
          context: { kind, pulses: state.state === "__INIT" && action.type === "PULSE" ? 1 : state.context.pulses + 1 },
        }),
      }) satisfies MachineConfig<Config, Context, Event>;
    const manager = MachineManager({
      enemy: createTemplate("enemy", "enemy"),
      turret: createTemplate("turret", "turret"),
      npc: createTemplate("npc", "npc"),
    });

    manager.transition({ type: "PULSE" });
    manager.transition({ type: "PULSE", meta: { groupTag: ["enemy", "turret", "missing"] } });

    expect(Object.keys(manager.getState().enemy)).toEqual(["enemy/0", "enemy/3"]);
    expect(Object.keys(manager.getState().turret)).toEqual(["turret/1", "turret/4"]);
    expect(Object.keys(manager.getState().npc)).toEqual(["npc/2"]);
    expect(manager.getState().enemy["enemy/0"].context.pulses).toBe(2);
    expect(manager.getState().enemy["enemy/3"].context.pulses).toBe(1);
    expect(manager.getState().turret["turret/1"].context.pulses).toBe(2);
    expect(manager.getState().turret["turret/4"].context.pulses).toBe(1);
    expect(manager.getState().npc["npc/2"].context.pulses).toBe(1);
  });

  it("coordinator: top-level процесс ждёт STEP_DONE из sub-process actor и переходит в FINISHED", async () => {
    type Event =
      | { type: "START"; payload: { id: string } }
      | { type: "STEP_DONE"; payload: { id: string } }
      | { type: "DONE" };

    const session = {
      config: {
        IDLE: { START: "RUNNING" },
        RUNNING: { DONE: "FINISHED" },
        FINISHED: { START: "RUNNING" },
      },
      initialState: "IDLE",
      initialContext: { lastId: "" },
      reducer: (state, action, meta) => {
        if (action.type === "START") return { state: meta.nextState, context: { lastId: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        RUNNING: async ({ action, condition, transition }) => {
          if (action.type !== "START") return;
          await condition((next) => next.type === "STEP_DONE" && next.payload.id === action.payload.id);
          transition({ type: "DONE" });
        },
      },
    } satisfies MachineConfig<
      { IDLE: { START: "RUNNING" }; RUNNING: { DONE: "FINISHED" }; FINISHED: { START: "RUNNING" } },
      { lastId: string },
      Event
    >;

    const step = {
      config: { __INIT: { START: "WORK" }, WORK: { STEP_DONE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => ({
        state: meta.nextState,
        context: { id: action.type === "START" ? action.payload.id : state.context.id },
      }),
      effects: {
        WORK: ({ self, transition }) => {
          // Сначала рассказываем миру через unscoped, ПОТОМ переводим себя в terminal.
          transition.unscoped({ type: "STEP_DONE", payload: { id: self.actorId } });
          transition.actor(self.actorId, { type: "STEP_DONE", payload: { id: self.actorId } });
        },
      },
    } satisfies MachineConfig<
      { __INIT: { START: "WORK" }; WORK: { STEP_DONE: "__RESOLVED" } },
      { id: string },
      Event
    >;

    const manager = MachineManager({ session, step });

    manager.transition({ type: "START", payload: { id: "step/0" } });
    await vi.waitFor(() => expect(manager.getState().session.state).toBe("FINISHED"));
    expect(manager.getState().step).toEqual({});
  });

  it("observer: domain машина читает state другой через wildcard subscriber, без cross-reducer вызовов", () => {
    type Event = { type: "INC" } | { type: "RESET" } | { type: "SYNC"; payload: { count: number; reached: boolean } };

    const counter = {
      config: { IDLE: { INC: null, RESET: null } },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state, action) => {
        if (action.type === "INC") return { state: state.state, context: { count: state.context.count + 1 } };
        if (action.type === "RESET") return { state: state.state, context: { count: 0 } };
      },
    } satisfies MachineConfig<{ IDLE: { INC: null; RESET: null } }, { count: number }, Event>;

    const watcher = {
      config: { WATCHING: { SYNC: null } },
      initialState: "WATCHING",
      initialContext: { lastCount: 0, reached: false },
      reducer: (state, action) => {
        if (action.type === "SYNC") {
          return {
            state: state.state,
            context: { lastCount: action.payload.count, reached: state.context.reached || action.payload.reached },
          };
        }
      },
    } satisfies MachineConfig<{ WATCHING: { SYNC: null } }, { lastCount: number; reached: boolean }, Event>;

    const manager = MachineManager({ counter, watcher });

    // Observer pattern: subscriber переводит изменение counter в SYNC event для watcher.
    let prevCount = manager.getState().counter.context.count;
    manager.onTransition((_prev, current) => {
      const nextCount = current.counter.context.count;
      if (nextCount === prevCount) return;
      prevCount = nextCount;
      manager.transition({ type: "SYNC", payload: { count: nextCount, reached: nextCount >= 3 } });
    });

    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });

    expect(manager.getState().counter.context.count).toBe(4);
    expect(manager.getState().watcher.context).toEqual({ lastCount: 4, reached: true });
  });

  it("error-catcher: middleware ловит throw из effects и пишет в отдельную error-машину через onError", async () => {
    type Event =
      | { type: "RUN"; payload: { id: string; fail: boolean } }
      | { type: "DONE" }
      | { type: "REPORT_ERROR"; payload: { message: string; jobId: string } };

    const errors = {
      config: { IDLE: { REPORT_ERROR: null } },
      initialState: "IDLE",
      initialContext: { collected: [] as Array<{ message: string; jobId: string }> },
      reducer: (state, action) => {
        if (action.type === "REPORT_ERROR") {
          return {
            state: state.state,
            context: { collected: [...state.context.collected, action.payload] },
          };
        }
      },
    } satisfies MachineConfig<
      { IDLE: { REPORT_ERROR: null } },
      { collected: Array<{ message: string; jobId: string }> },
      Event
    >;

    const job = {
      config: { IDLE: { RUN: "BUSY" }, BUSY: { DONE: "IDLE" } },
      initialState: "IDLE",
      initialContext: { lastJobId: "" },
      reducer: (state, action, meta) => {
        if (action.type === "RUN") return { state: meta.nextState, context: { lastJobId: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        BUSY: ({ action, transition }) => {
          if (action.type !== "RUN") return;
          if (action.payload.fail) throw new Error(`job ${action.payload.id} failed`);
          transition({ type: "DONE" });
        },
      },
    } satisfies MachineConfig<{ IDLE: { RUN: "BUSY" }; BUSY: { DONE: "IDLE" } }, { lastJobId: string }, Event>;

    let manager!: ReturnType<typeof MachineManager<{ errors: typeof errors; job: typeof job }, Event>>;
    manager = MachineManager(
      { errors, job },
      {
        onError: (err) => {
          if (err instanceof Error) {
            manager.transition({
              type: "REPORT_ERROR",
              payload: { message: err.message, jobId: manager.getState().job.context.lastJobId },
            });
          }
        },
      },
    );

    manager.transition({ type: "RUN", payload: { id: "ok-1", fail: false } });
    manager.transition({ type: "RUN", payload: { id: "fail-1", fail: true } });

    await vi.waitFor(() => expect(manager.getState().errors.context.collected).toHaveLength(1));
    expect(manager.getState().errors.context.collected[0]).toEqual({ message: "job fail-1 failed", jobId: "fail-1" });
    expect(manager.getState().job.state).toBe("BUSY");
  });

  it("technical bridge actor: внешний adapter моделируется как actor template с lifecycle", () => {
    type Event =
      | { type: "OPEN" }
      | { type: "RECV"; payload: { data: string } }
      | { type: "PUSH"; payload: { data: string } }
      | { type: "CLOSE" }
      | { type: "INCOMING"; payload: { data: string } };

    type Adapter = { send: (msg: string) => void; received: string[] };

    const inbox = {
      config: { IDLE: { INCOMING: null } },
      initialState: "IDLE",
      initialContext: { messages: [] as string[] },
      reducer: (state, action) => {
        if (action.type === "INCOMING") {
          return { state: state.state, context: { messages: [...state.context.messages, action.payload.data] } };
        }
      },
    } satisfies MachineConfig<{ IDLE: { INCOMING: null } }, { messages: string[] }, Event>;

    type ConnectionConfig = {
      __INIT: { OPEN: "OPENED" };
      OPENED: { RECV: null; PUSH: null; CLOSE: "__RESOLVED" };
    };

    const connection = {
      config: { __INIT: { OPEN: "OPENED" }, OPENED: { RECV: null, PUSH: null, CLOSE: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { sent: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "PUSH") {
          return { state: meta.nextState, context: { sent: state.context.sent + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        // Wildcard, чтобы PUSH/RECV self-transitions внутри OPENED тоже триггерили эффект.
        "*": ({ action, transition, adapter }) => {
          if (action.type === "RECV") {
            transition.unscoped({ type: "INCOMING", payload: { data: action.payload.data } });
          }
          if (action.type === "PUSH") {
            adapter.send(action.payload.data);
          }
        },
      },
    } satisfies MachineConfig<ConnectionConfig, { sent: number }, Event, { adapter: Adapter }>;

    const adapter: Adapter = {
      received: [],
      send(msg) {
        this.received.push(msg);
      },
    };

    const manager = MachineManager({ inbox, connection });
    manager.setDependencies({ adapter });

    manager.transition({ type: "OPEN" });
    manager.transition({ type: "PUSH", payload: { data: "hello" }, meta: { actorId: "connection/0" } });
    manager.transition({ type: "RECV", payload: { data: "pong" }, meta: { actorId: "connection/0" } });
    manager.transition({ type: "CLOSE", meta: { actorId: "connection/0" } });

    expect(adapter.received).toEqual(["hello"]);
    expect(manager.getState().inbox.context.messages).toEqual(["pong"]);
    expect(manager.getState().connection).toEqual({});
  });

  it("view-modal actor: open/close через actor template, decision захватывается domain reducer'ом напрямую", () => {
    type Event =
      | { type: "CONFIRM"; payload: { question: string } }
      | { type: "ANSWER"; payload: { accepted: boolean } };

    const history = {
      config: { IDLE: { ANSWER: null } },
      initialState: "IDLE",
      initialContext: { decisions: [] as Array<{ accepted: boolean }> },
      reducer: (state, action) => {
        if (action.type === "ANSWER") {
          return {
            state: state.state,
            context: { decisions: [...state.context.decisions, { accepted: action.payload.accepted }] },
          };
        }
      },
    } satisfies MachineConfig<{ IDLE: { ANSWER: null } }, { decisions: Array<{ accepted: boolean }> }, Event>;

    const modal = {
      config: { __INIT: { CONFIRM: "OPEN" }, OPEN: { ANSWER: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { question: "" },
      reducer: (state, action, meta) => {
        if (action.type === "CONFIRM") return { state: meta.nextState, context: { question: action.payload.question } };
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<
      { __INIT: { CONFIRM: "OPEN" }; OPEN: { ANSWER: "__RESOLVED" } },
      { question: string },
      Event
    >;

    const manager = MachineManager({ history, modal });

    manager.transition({ type: "CONFIRM", payload: { question: "exit?" } });
    expect(manager.getState().modal["modal/0"].context.question).toBe("exit?");

    manager.transition({ type: "ANSWER", payload: { accepted: true }, meta: { actorId: "modal/0" } });
    expect(manager.getState().modal).toEqual({});
    expect(manager.getState().history.context.decisions).toEqual([{ accepted: true }]);

    // Параллельная модалка — самостоятельный actor с своим actorId.
    manager.transition({ type: "CONFIRM", payload: { question: "save?" } });
    manager.transition({ type: "ANSWER", payload: { accepted: false }, meta: { actorId: "modal/1" } });
    expect(manager.getState().history.context.decisions).toEqual([{ accepted: true }, { accepted: false }]);
  });

  it("retry: actor через ATTEMPT_FAIL → RETRY поднимает счётчик до OK; CANCEL подавляет позднюю транзицию", async () => {
    type Event =
      | { type: "RUN"; payload: { id: string } }
      | { type: "ATTEMPT_OK" }
      | { type: "ATTEMPT_FAIL" }
      | { type: "RETRY" }
      | { type: "CANCEL" }
      | { type: "RESULT"; payload: { id: string; status: "ok" | "cancelled"; attempts: number } };

    const log = {
      config: { IDLE: { RESULT: null } },
      initialState: "IDLE",
      initialContext: { entries: [] as Array<{ id: string; status: string; attempts: number }> },
      reducer: (state, action) => {
        if (action.type === "RESULT") {
          return { state: state.state, context: { entries: [...state.context.entries, action.payload] } };
        }
      },
    } satisfies MachineConfig<
      { IDLE: { RESULT: null } },
      { entries: Array<{ id: string; status: string; attempts: number }> },
      Event
    >;

    type WorkerConfig = {
      __INIT: { RUN: "BUSY" };
      BUSY: { ATTEMPT_OK: "__RESOLVED"; ATTEMPT_FAIL: null; RETRY: null };
      "*": { CANCEL: "__CANCELLED" };
    };

    const worker = {
      config: {
        __INIT: { RUN: "BUSY" },
        BUSY: { ATTEMPT_OK: "__RESOLVED", ATTEMPT_FAIL: null, RETRY: null },
        "*": { CANCEL: "__CANCELLED" },
      },
      initialState: "__INIT",
      initialContext: { id: "", attempts: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "RUN") return { state: meta.nextState, context: { id: action.payload.id, attempts: 1 } };
        if (action.type === "RETRY") {
          return { state: meta.nextState, context: { ...state.context, attempts: state.context.attempts + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        // Wildcard, чтобы и __INIT→BUSY (RUN), и BUSY→BUSY self (RETRY) дёргали attempt.
        // Late transitions от CANCEL'нутого actor'а дропаются normalize'ом (sender disposed).
        "*": async ({ action, self, transition, attempt }) => {
          if (action.type !== "RUN" && action.type !== "RETRY") return;
          const id = action.type === "RUN" ? action.payload.id : self.actorId;
          const ok = await attempt(id);
          transition.actor(self.actorId, ok ? { type: "ATTEMPT_OK" } : { type: "ATTEMPT_FAIL" });
        },
      },
    } satisfies MachineConfig<
      WorkerConfig,
      { id: string; attempts: number },
      Event,
      { attempt: (id: string) => Promise<boolean> }
    >;

    // Кейс 1: первый attempt fail → RETRY → второй ok → ATTEMPT_OK → log "ok".
    {
      let callCount = 0;
      const attempt = vi.fn(async () => {
        callCount += 1;
        return callCount >= 2;
      });
      const manager = MachineManager({ log, worker });
      manager.setDependencies({ attempt });

      manager.onTransition((_prev, current, action) => {
        if (action.type === "ATTEMPT_FAIL") {
          const actorId = action.meta?.actorId;
          if (typeof actorId === "string" && current.worker[actorId]) {
            manager.transition({ type: "RETRY", meta: { actorId } });
          }
        }
        if (action.type === "ATTEMPT_OK") {
          const actorId = action.meta?.actorId;
          if (typeof actorId !== "string") return;
          // Actor уже collapsed на этот момент — берём context из _prev.
          const slice = (_prev.worker as Record<string, { context: { id: string; attempts: number } }>)[actorId];
          if (!slice) return;
          manager.transition({
            type: "RESULT",
            payload: { id: slice.context.id, status: "ok", attempts: slice.context.attempts },
          });
        }
      });

      manager.transition({ type: "RUN", payload: { id: "job-a" } });

      await vi.waitFor(() => expect(manager.getState().log.context.entries).toHaveLength(1));
      expect(manager.getState().log.context.entries[0]).toEqual({ id: "job-a", status: "ok", attempts: 2 });
      expect(manager.getState().worker).toEqual({});
      expect(attempt).toHaveBeenCalledTimes(2);
    }

    // Кейс 2: CANCEL до завершения attempt → log "cancelled", поздний ATTEMPT_OK подавлен latest и normalize.
    {
      let resolveFn!: (v: boolean) => void;
      const pending = new Promise<boolean>((resolve) => {
        resolveFn = resolve;
      });
      const attempt = vi.fn(() => pending);
      const manager = MachineManager({ log, worker });
      manager.setDependencies({ attempt });

      manager.onTransition((prev, current, action) => {
        if (action.type !== "CANCEL") return;
        const actorId = action.meta?.actorId;
        if (typeof actorId !== "string") return;
        const slice = (prev.worker as Record<string, { context: { id: string; attempts: number } }>)[actorId];
        if (!slice || (current.worker as Record<string, unknown>)[actorId]) return;
        manager.transition({
          type: "RESULT",
          payload: { id: slice.context.id, status: "cancelled", attempts: slice.context.attempts },
        });
      });

      manager.transition({ type: "RUN", payload: { id: "job-c" } });
      manager.transition({ type: "CANCEL", meta: { actorId: "worker/0" } });

      expect(manager.getState().worker).toEqual({});
      expect(manager.getState().log.context.entries[0]).toEqual({ id: "job-c", status: "cancelled", attempts: 1 });

      const logSizeBefore = manager.getState().log.context.entries.length;
      resolveFn(true);
      await Promise.resolve();
      await Promise.resolve();
      // Поздняя resolve от cancelled actor дропается: log не растёт.
      expect(manager.getState().log.context.entries.length).toBe(logSizeBefore);
    }
  });

  it("multi-actor pool: спавн нескольких актеров параллельно, scoped routing адресует отдельных", () => {
    type Event =
      | { type: "ENLIST"; payload: { teamId: string; role: string } }
      | { type: "STRIKE" }
      | { type: "RESOLVE" };

    type FighterConfig = {
      __INIT: { ENLIST: "READY" };
      READY: { STRIKE: null; RESOLVE: "__RESOLVED" };
    };

    const fighter = {
      config: { __INIT: { ENLIST: "READY" }, READY: { STRIKE: null, RESOLVE: "__RESOLVED" } },
      groupTag: "team",
      initialState: "__INIT",
      initialContext: { role: "", strikes: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "ENLIST") {
          return { state: meta.nextState, context: { role: action.payload.role, strikes: 0 } };
        }
        if (action.type === "STRIKE") {
          return { state: meta.nextState, context: { ...state.context, strikes: state.context.strikes + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<FighterConfig, { role: string; strikes: number }, Event>;

    const manager = MachineManager(
      { fighter },
      {
        generateGroupId: ({ action }) => {
          if (action.type === "ENLIST") return `team/${action.payload.teamId}`;
          throw new Error("ENLIST expected");
        },
      },
    );

    manager.transition({ type: "ENLIST", payload: { teamId: "alpha", role: "scout" } });
    manager.transition({ type: "ENLIST", payload: { teamId: "alpha", role: "medic" }, meta: { groupId: "team/alpha" } });
    manager.transition({ type: "ENLIST", payload: { teamId: "bravo", role: "scout" } });
    manager.transition({ type: "ENLIST", payload: { teamId: "bravo", role: "medic" }, meta: { groupId: "team/bravo" } });

    manager.transition({ type: "STRIKE", meta: { groupId: "team/alpha" } });
    manager.transition({ type: "STRIKE", meta: { groupId: "team/alpha" } });
    manager.transition({ type: "STRIKE", meta: { groupId: "team/bravo" } });

    const fighters = Object.values(manager.getState().fighter);
    const alphaFighters = fighters.filter((s) => s.meta.groupId === "team/alpha");
    const bravoFighters = fighters.filter((s) => s.meta.groupId === "team/bravo");

    expect(alphaFighters).toHaveLength(2);
    expect(bravoFighters).toHaveLength(2);
    for (const f of alphaFighters) expect(f.context.strikes).toBe(2);
    for (const f of bravoFighters) expect(f.context.strikes).toBe(1);

    manager.transition({ type: "RESOLVE", meta: { groupId: "team/alpha" } });
    expect(Object.values(manager.getState().fighter).every((s) => s.meta.groupId === "team/bravo")).toBe(true);
  });

  it("multi-template composition: одно событие спавнит несколько связанных actor templates в одной группе", () => {
    type Event = { type: "SPAWN_ENEMY"; payload: { kind: string } } | { type: "TICK" } | { type: "HIT" };

    type EnemyBodyConfig = { __INIT: { SPAWN_ENEMY: "ALIVE" }; ALIVE: { TICK: null; HIT: "__RESOLVED" } };
    type EnemyHealthConfig = { __INIT: { SPAWN_ENEMY: "FULL" }; FULL: { HIT: "__RESOLVED" } };

    const enemyBody = {
      config: { __INIT: { SPAWN_ENEMY: "ALIVE" }, ALIVE: { TICK: null, HIT: "__RESOLVED" } },
      groupTag: "enemy",
      initialState: "__INIT",
      initialContext: { kind: "", ticks: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "SPAWN_ENEMY") {
          return { state: meta.nextState, context: { kind: action.payload.kind, ticks: 0 } };
        }
        if (action.type === "TICK") {
          return { state: meta.nextState, context: { ...state.context, ticks: state.context.ticks + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<EnemyBodyConfig, { kind: string; ticks: number }, Event>;

    const enemyHealth = {
      config: { __INIT: { SPAWN_ENEMY: "FULL" }, FULL: { HIT: "__RESOLVED" } },
      groupTag: "enemy",
      initialState: "__INIT",
      initialContext: { hp: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "SPAWN_ENEMY") return { state: meta.nextState, context: { hp: 100 } };
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<EnemyHealthConfig, { hp: number }, Event>;

    const manager = MachineManager({ enemyBody, enemyHealth });

    manager.transition({ type: "SPAWN_ENEMY", payload: { kind: "grunt" } });
    manager.transition({ type: "SPAWN_ENEMY", payload: { kind: "boss" } });

    expect(Object.keys(manager.getState().enemyBody)).toHaveLength(2);
    expect(Object.keys(manager.getState().enemyHealth)).toHaveLength(2);

    manager.transition({ type: "TICK", meta: { groupId: "enemy/0" } });
    manager.transition({ type: "TICK", meta: { groupId: "enemy/0" } });
    manager.transition({ type: "TICK", meta: { groupId: "enemy/0" } });

    const aliveBody = Object.values(manager.getState().enemyBody).find((s) => s.meta.groupId === "enemy/0");
    expect(aliveBody?.context.ticks).toBe(3);

    manager.transition({ type: "HIT", meta: { groupId: "enemy/1" } });

    expect(Object.values(manager.getState().enemyBody).every((s) => s.meta.groupId === "enemy/0")).toBe(true);
    expect(Object.values(manager.getState().enemyHealth).every((s) => s.meta.groupId === "enemy/0")).toBe(true);
  });

  it("guard-через-reducer: невалидный transition остаётся в текущем state без запуска target effects", async () => {
    type Event = { type: "SUBMIT"; payload: { code: string } } | { type: "RESET" };

    const calls: string[] = [];
    const form = {
      config: { IDLE: { SUBMIT: "VALIDATED", RESET: null }, VALIDATED: { RESET: "IDLE" } },
      initialState: "IDLE",
      initialContext: { code: "", error: "" as string },
      reducer: (state, action, meta) => {
        if (action.type === "SUBMIT") {
          if (action.payload.code.length < 4) {
            // Guard в reducer: оставляем state IDLE, фиксируем error.
            return { state: state.state, context: { code: action.payload.code, error: "too short" } };
          }
          return { state: meta.nextState, context: { code: action.payload.code, error: "" } };
        }
        if (action.type === "RESET") {
          return { state: meta.nextState, context: { code: "", error: "" } };
        }
      },
      effects: {
        VALIDATED: ({ action }) => {
          if (action.type === "SUBMIT") calls.push(`validated:${action.payload.code}`);
        },
      },
    } satisfies MachineConfig<
      { IDLE: { SUBMIT: "VALIDATED"; RESET: null }; VALIDATED: { RESET: "IDLE" } },
      { code: string; error: string },
      Event
    >;

    const manager = MachineManager({ form });

    manager.transition({ type: "SUBMIT", payload: { code: "abc" } });
    expect(manager.getState().form.state).toBe("IDLE");
    expect(manager.getState().form.context.error).toBe("too short");

    manager.transition({ type: "SUBMIT", payload: { code: "abcdef" } });
    expect(manager.getState().form.state).toBe("VALIDATED");
    expect(manager.getState().form.context.error).toBe("");

    await vi.waitFor(() => expect(calls).toEqual(["validated:abcdef"]));
  });

  it("self-issued cleanup: actor effect завершает себя через terminal при детектировании условия", () => {
    type Event = { type: "WATCH"; payload: { tag: string } } | { type: "FOUND"; payload: { tag: string } };

    type WatcherConfig = {
      __INIT: { WATCH: "LOOKING" };
      LOOKING: { FOUND: "__RESOLVED" };
    };

    const watcher = {
      config: { __INIT: { WATCH: "LOOKING" }, LOOKING: { FOUND: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { tag: "" },
      reducer: (state, action, meta) => {
        if (action.type === "WATCH") return { state: meta.nextState, context: { tag: action.payload.tag } };
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        LOOKING: ({ self, transition }) => {
          transition.actor(self.actorId, { type: "FOUND", payload: { tag: "auto" } });
        },
      },
    } satisfies MachineConfig<WatcherConfig, { tag: string }, Event>;

    const manager = MachineManager({ watcher });

    manager.transition({ type: "WATCH", payload: { tag: "first" } });
    manager.transition({ type: "WATCH", payload: { tag: "second" } });

    // Каждый actor сам себя резолвит сразу после spawn → record остаётся пустым.
    expect(manager.getState().watcher).toEqual({});
  });

  it("middleware guard блокирует spawn: PROCESS уходит дальше только при allowed=true", () => {
    type Event = { type: "REQUEST"; payload: { allowed: boolean } } | { type: "PROCESS" };

    const spawned = {
      config: { __INIT: { PROCESS: "WORK" }, WORK: {} },
      initialState: "__INIT",
      initialContext: { mark: false },
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: { ...state.context, mark: true } }),
    } satisfies MachineConfig<{ __INIT: { PROCESS: "WORK" }; WORK: {} }, { mark: boolean }, Event>;

    const manager = MachineManager(
      { spawned },
      {
        middleware: [
          () => (next) => (action) => {
            if (action.type === "REQUEST") {
              if (!action.payload.allowed) return action;
              return next({ type: "PROCESS" });
            }
            return next(action);
          },
        ],
      },
    );

    manager.transition({ type: "REQUEST", payload: { allowed: false } });
    expect(manager.getState().spawned).toEqual({});

    manager.transition({ type: "REQUEST", payload: { allowed: true } });
    expect(Object.keys(manager.getState().spawned)).toEqual(["spawned/0"]);
  });

  it("derived view: subscriber строит read-model из multi-machine state и dedupe по значению", () => {
    type Event = { type: "ADD"; payload: { id: string; price: number } } | { type: "PAY" };

    const cart = {
      config: { OPEN: { ADD: null, PAY: "PAID" }, PAID: {} },
      initialState: "OPEN",
      initialContext: { items: [] as Array<{ id: string; price: number }> },
      reducer: (state, action) => {
        if (action.type === "ADD") {
          return { state: state.state, context: { items: [...state.context.items, action.payload] } };
        }
        if (action.type === "PAY") {
          return { state: "PAID", context: state.context };
        }
      },
    } satisfies MachineConfig<
      { OPEN: { ADD: null; PAY: "PAID" }; PAID: {} },
      { items: Array<{ id: string; price: number }> },
      Event
    >;

    const manager = MachineManager({ cart });

    type ViewModel = { total: number; status: "OPEN" | "PAID"; itemCount: number };
    let view: ViewModel = { total: 0, status: "OPEN", itemCount: 0 };
    const views: ViewModel[] = [view];

    manager.onTransition((_prev, current) => {
      const total = current.cart.context.items.reduce((sum, item) => sum + item.price, 0);
      const next: ViewModel = {
        total,
        status: current.cart.state,
        itemCount: current.cart.context.items.length,
      };
      if (next.total === view.total && next.status === view.status && next.itemCount === view.itemCount) return;
      view = next;
      views.push(view);
    });

    manager.transition({ type: "ADD", payload: { id: "a", price: 5 } });
    manager.transition({ type: "ADD", payload: { id: "b", price: 10 } });
    manager.transition({ type: "PAY" });

    expect(views).toEqual([
      { total: 0, status: "OPEN", itemCount: 0 },
      { total: 5, status: "OPEN", itemCount: 1 },
      { total: 15, status: "OPEN", itemCount: 2 },
      { total: 15, status: "PAID", itemCount: 2 },
    ]);
  });
});

describe("MachineManager actors — расширенные edge cases", () => {
  it("view-modal: вторая модалка поверх первой живут параллельно с независимыми actorId", () => {
    type Event =
      | { type: "CONFIRM"; payload: { question: string } }
      | { type: "ANSWER"; payload: { actorId: string; accepted: boolean } };

    const modal = {
      config: { __INIT: { CONFIRM: "OPEN" }, OPEN: { ANSWER: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { question: "" },
      reducer: (state, action, meta) => {
        if (action.type === "CONFIRM") return { state: meta.nextState, context: { question: action.payload.question } };
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<
      { __INIT: { CONFIRM: "OPEN" }; OPEN: { ANSWER: "__RESOLVED" } },
      { question: string },
      Event
    >;

    const manager = MachineManager({ modal });

    manager.transition({ type: "CONFIRM", payload: { question: "first?" } });
    manager.transition({ type: "CONFIRM", payload: { question: "second?" } });

    expect(Object.keys(manager.getState().modal)).toEqual(["modal/0", "modal/1"]);
    expect(manager.getState().modal["modal/0"].context.question).toBe("first?");
    expect(manager.getState().modal["modal/1"].context.question).toBe("second?");

    manager.transition({
      type: "ANSWER",
      payload: { actorId: "modal/1", accepted: true },
      meta: { actorId: "modal/1" },
    });

    expect(manager.getState().modal["modal/0"]).toBeDefined();
    expect(manager.getState().modal["modal/1"]).toBeUndefined();
    expect(manager.getState().modal["modal/0"].context.question).toBe("first?");
  });

  it("observer chain: counter → watcher → reporter ловит финальное состояние", () => {
    type Event =
      | { type: "INC" }
      | { type: "RESET" }
      | { type: "WATCH_SYNC"; payload: { count: number } }
      | { type: "REPORT"; payload: { final: number } };

    const counter = {
      config: { IDLE: { INC: null, RESET: null } },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state, action) => {
        if (action.type === "INC") return { state: state.state, context: { count: state.context.count + 1 } };
        if (action.type === "RESET") return { state: state.state, context: { count: 0 } };
      },
    } satisfies MachineConfig<{ IDLE: { INC: null; RESET: null } }, { count: number }, Event>;

    const watcher = {
      config: { IDLE: { WATCH_SYNC: null } },
      initialState: "IDLE",
      initialContext: { lastCount: 0 },
      reducer: (state, action) => {
        if (action.type === "WATCH_SYNC") {
          return { state: state.state, context: { lastCount: action.payload.count } };
        }
      },
    } satisfies MachineConfig<{ IDLE: { WATCH_SYNC: null } }, { lastCount: number }, Event>;

    const reporter = {
      config: { IDLE: { REPORT: null } },
      initialState: "IDLE",
      initialContext: { reports: [] as number[] },
      reducer: (state, action) => {
        if (action.type === "REPORT") {
          return { state: state.state, context: { reports: [...state.context.reports, action.payload.final] } };
        }
      },
    } satisfies MachineConfig<{ IDLE: { REPORT: null } }, { reports: number[] }, Event>;

    const manager = MachineManager({ counter, watcher, reporter });

    let prevCounter = manager.getState().counter.context.count;
    manager.onTransition((_prev, current, action) => {
      if (action.type === "WATCH_SYNC") return;
      if (action.type === "REPORT") return;
      const nextCount = current.counter.context.count;
      if (nextCount === prevCounter) return;
      prevCounter = nextCount;
      manager.transition({ type: "WATCH_SYNC", payload: { count: nextCount } });
    });

    let prevWatcher = manager.getState().watcher.context.lastCount;
    manager.onTransition((_prev, current, action) => {
      if (action.type !== "WATCH_SYNC") return;
      const next = current.watcher.context.lastCount;
      if (next === prevWatcher || next !== 0) {
        prevWatcher = next;
        return;
      }
      prevWatcher = next;
      manager.transition({ type: "REPORT", payload: { final: next } });
    });

    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });
    manager.transition({ type: "RESET" });

    expect(manager.getState().counter.context.count).toBe(0);
    expect(manager.getState().watcher.context.lastCount).toBe(0);
    expect(manager.getState().reporter.context.reports).toEqual([0]);
  });

  it("derived view: dedupe по значению не пушит при action без изменения state", () => {
    type Event = { type: "INC" } | { type: "NOOP" };

    const counter = {
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state, action) => {
        if (action.type === "INC") return { state: state.state, context: { count: state.context.count + 1 } };
      },
    } satisfies MachineConfig<{ IDLE: { INC: null } }, { count: number }, Event>;

    const manager = MachineManager({ counter });

    type View = { count: number };
    let view: View = { count: manager.getState().counter.context.count };
    const views: View[] = [view];

    manager.onTransition((_prev, current) => {
      const next: View = { count: current.counter.context.count };
      if (next.count === view.count) return;
      view = next;
      views.push(view);
    });

    manager.transition({ type: "INC" });
    manager.transition({ type: "NOOP" });
    manager.transition({ type: "NOOP" });
    manager.transition({ type: "INC" });

    expect(views).toEqual([{ count: 0 }, { count: 1 }, { count: 2 }]);
  });

  it("middleware guard блокирует action: reducer НЕ вызывается при allowed=false", () => {
    type Event = { type: "REQUEST"; payload: { allowed: boolean } } | { type: "PROCESS" };

    const reducer = vi.fn((_state, _action: Event, meta) => ({ state: meta.nextState, context: { mark: true } }));
    const spawned = {
      config: { __INIT: { PROCESS: "WORK" }, WORK: {} },
      initialState: "__INIT",
      initialContext: { mark: false },
      reducer,
    } satisfies MachineConfig<{ __INIT: { PROCESS: "WORK" }; WORK: {} }, { mark: boolean }, Event>;

    const manager = MachineManager(
      { spawned },
      {
        middleware: [
          () => (next) => (action) => {
            if (action.type === "REQUEST") {
              if (!action.payload.allowed) return action;
              return next({ type: "PROCESS" });
            }
            return next(action);
          },
        ],
      },
    );

    manager.transition({ type: "REQUEST", payload: { allowed: false } });
    expect(reducer).not.toHaveBeenCalled();

    manager.transition({ type: "REQUEST", payload: { allowed: true } });
    expect(reducer).toHaveBeenCalled();
    expect(manager.getState().spawned["spawned/0"].context.mark).toBe(true);
  });

  it("self-issued cleanup с throw: onError ловит ошибку, manager продолжает работу", async () => {
    type Event = { type: "WATCH" } | { type: "FOUND" };

    type WatcherConfig = { __INIT: { WATCH: "LOOKING" }; LOOKING: { FOUND: "__RESOLVED" } };

    const watcher = {
      config: { __INIT: { WATCH: "LOOKING" }, LOOKING: { FOUND: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { times: 0 },
      reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      effects: {
        LOOKING: ({ self, transition, action }) => {
          if (action.type === "WATCH" && self.actorId === "watcher/0") {
            throw new Error("first watcher fails");
          }
          transition.actor(self.actorId, { type: "FOUND" });
        },
      },
    } satisfies MachineConfig<WatcherConfig, { times: number }, Event>;

    const errors: unknown[] = [];
    const manager = MachineManager({ watcher }, { onError: (err) => errors.push(err) });

    manager.transition({ type: "WATCH" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect((errors[0] as Error).message).toBe("first watcher fails");

    manager.transition({ type: "WATCH" });
    await vi.waitFor(() => expect(manager.getState().watcher["watcher/1"]).toBeUndefined());
  });
});
