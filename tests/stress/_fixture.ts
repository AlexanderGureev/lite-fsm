// Реалистичный roguelite-like setup для stress тестов: domain + actor template
// + middleware + onTransition subscriber + persistManager с noop storage.
// Каждый «tick»: domain TICK → spawn actor → kill actor → terminal collapse.

import { MachineManager } from "@lite-fsm/core";
import type { GenericMiddleware, MachineConfig } from "@lite-fsm/core";
import { persistManager, type PersistStorage } from "@lite-fsm/persist";

export type StressEvent =
  | { type: "TICK" }
  | { type: "SPAWN_ENEMY"; payload: { id: number } }
  | { type: "ENEMY_KILL" }
  | { type: "ENEMY_DESPAWN" };

// === Machines ===============================================================

const gameSession = {
  config: { RUNNING: { TICK: null } },
  initialState: "RUNNING",
  initialContext: { ticks: 0 },
  reducer: (state) => ({ state: state.state, context: { ticks: state.context.ticks + 1 } }),
} satisfies MachineConfig<{ RUNNING: { TICK: null } }, { ticks: number }, StressEvent>;

const score = {
  config: { IDLE: { ENEMY_KILL: null } },
  initialState: "IDLE",
  initialContext: { kills: 0 },
  reducer: (state) => ({ state: state.state, context: { kills: state.context.kills + 1 } }),
} satisfies MachineConfig<{ IDLE: { ENEMY_KILL: null } }, { kills: number }, StressEvent>;

// Actor с висящим condition в эффекте — это реалистичный случай (waiting на user input,
// network response и т.д.). dispose-wins reject должен освобождать closure на terminal collapse.
const enemy = {
  config: { __INIT: { SPAWN_ENEMY: "ALIVE" }, ALIVE: { ENEMY_DESPAWN: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: 0 },
  reducer: (state, action, meta) => {
    if (action.type === "SPAWN_ENEMY") return { state: meta.nextState, context: { id: action.payload.id } };
    return { state: meta.nextState, context: state.context };
  },
  effects: {
    ALIVE: ({ condition }) => {
      condition(() => false).catch(() => {});
    },
  },
} satisfies MachineConfig<
  { __INIT: { SPAWN_ENEMY: "ALIVE" }; ALIVE: { ENEMY_DESPAWN: "__RESOLVED" } },
  { id: number },
  StressEvent
>;

export type StressStore = {
  gameSession: typeof gameSession;
  score: typeof score;
  enemy: typeof enemy;
};

// === Storage / counters =====================================================

const createNoopStorage = (): PersistStorage<StressStore> => ({
  get: () => undefined,
  set: () => {},
  remove: () => {},
  subscribe: () => () => {},
});

// === World factory ==========================================================

export type StressWorld = {
  manager: ReturnType<typeof MachineManager<StressStore, StressEvent>>;
  controller: ReturnType<typeof persistManager<StressStore>>;
  stopPersist: () => void;
  middlewareCalls: { count: number };
  subscriberCalls: { count: number };
  /** Один tick: TICK + spawn/kill/despawn одного actor'а. 4 user transitions. */
  runTick: (cycle: number) => void;
  dispose: () => void;
};

export type CreateWorldOptions = {
  /** Default 0 для structural-тестов (детерминистично). Heavy-сценарий передаёт реалистичные ~100ms. */
  persistThrottleMs?: number;
};

export const createWorld = (opts: CreateWorldOptions = {}): StressWorld => {
  const middlewareCalls = { count: 0 };
  const subscriberCalls = { count: 0 };

  const counting: GenericMiddleware = () => (next) => (action) => {
    middlewareCalls.count += 1;
    return next(action);
  };

  const manager = MachineManager<StressStore, StressEvent>(
    { gameSession, score, enemy },
    { middleware: [counting] },
  );

  const unsubscribe = manager.onTransition(() => {
    subscriberCalls.count += 1;
  });

  const controller = persistManager<StressStore>(manager, {
    storage: createNoopStorage(),
    throttleMs: opts.persistThrottleMs ?? 0,
  });
  const stopPersist = controller.start();

  const runTick = (cycle: number) => {
    manager.transition({ type: "TICK" });
    manager.transition({ type: "SPAWN_ENEMY", payload: { id: cycle } });
    manager.transition({ type: "ENEMY_KILL" });
    manager.transition({ type: "ENEMY_DESPAWN", meta: { actorId: `enemy/${cycle}` } });
  };

  const dispose = () => {
    stopPersist();
    unsubscribe();
  };

  return { manager, controller, stopPersist, middlewareCalls, subscriberCalls, runTick, dispose };
};
