// Memory leak проверки для persistManager. Требует флага --expose-gc:
//   pnpm run test:gc
// Без gc() весь describe помечается skip.

import { expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";
import { persistManager, type PersistStorage } from "@lite-fsm/persist";

import { allocHeavy, countLive, describeIfGc, forceGc, type WeakRefLike } from "../_shared/memoryLeak";

type CounterEvent = { type: "INC" };
type CounterMachine = MachineConfig<{ IDLE: { INC: null } }, { count: number }, CounterEvent>;
type CounterStore = { counter: CounterMachine };

const createCounter = (): CounterMachine =>
  ({
    config: { IDLE: { INC: null } },
    initialState: "IDLE",
    initialContext: { count: 0 },
    reducer: (state) => ({ state: state.state, context: { count: state.context.count + 1 } }),
  }) satisfies CounterMachine;

// Минимальный noop storage: persistManager в этих тестах ничего не пишет физически.
const createNoopStorage = (): PersistStorage<CounterStore> => ({
  get: () => undefined,
  set: () => {},
  remove: () => {},
  subscribe: () => () => {},
});

describeIfGc("memory leak — persistManager teardown (требует --expose-gc)", () => {
  // === subscribeStatus: unsubscribe освобождает closure из callback'а ========

  it("subscribeStatus: unsubscribe + drop controller освобождает heavy в callback", async () => {
    const holders: WeakRefLike<object>[] = [];

    await (async () => {
      const manager = MachineManager<CounterStore, CounterEvent>({ counter: createCounter() });
      const controller = persistManager<CounterStore>(manager, { storage: createNoopStorage() });

      const heavy = allocHeavy(holders);
      const unsubscribe = controller.subscribeStatus(() => {
        void heavy;
      });

      unsubscribe();
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === onError closure: после stop() + drop освобождается ====================

  it("start/stop: onError closure освобождается после stop + drop manager + drop controller", async () => {
    const holders: WeakRefLike<object>[] = [];

    await (async () => {
      const manager = MachineManager<CounterStore, CounterEvent>({ counter: createCounter() });

      const heavy = allocHeavy(holders);
      const controller = persistManager<CounterStore>(manager, {
        storage: createNoopStorage(),
        onError: (err) => {
          void heavy;
          void err;
        },
      });

      const stop = controller.start();
      manager.transition({ type: "INC" });
      stop();
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });

  // === storage.subscribe: после stop() user-side callback больше не держится ==

  it("stop(): persistManager отписывает свой callback от storage.subscribe", async () => {
    let activeSubscribers = 0;
    const storage: PersistStorage<CounterStore> = {
      get: () => undefined,
      set: () => {},
      remove: () => {},
      subscribe: () => {
        activeSubscribers += 1;
        return () => {
          activeSubscribers -= 1;
        };
      },
    };

    const manager = MachineManager<CounterStore, CounterEvent>({ counter: createCounter() });
    const controller = persistManager<CounterStore>(manager, { storage });

    const stop = controller.start();
    expect(activeSubscribers).toBe(1);
    stop();
    expect(activeSubscribers).toBe(0);
  });

  // === shouldSave heavy closure: drop manager + controller освобождает =======

  it("manager.onTransition subscriber persistManager отписан после stop, shouldSave освобождается", async () => {
    const holders: WeakRefLike<object>[] = [];

    await (async () => {
      const manager = MachineManager<CounterStore, CounterEvent>({ counter: createCounter() });

      const heavy = allocHeavy(holders);
      const controller = persistManager<CounterStore>(manager, {
        storage: createNoopStorage(),
        shouldSave: () => {
          void heavy;
          return false;
        },
      });

      const stop = controller.start();
      manager.transition({ type: "INC" });
      manager.transition({ type: "INC" });
      stop();
    })();

    await forceGc();
    expect(countLive(holders)).toBe(0);
  });
});
