import { describe, it, expect, vi } from "vitest";

import { createEffect, createMachine, createReducer, createConfig } from "@lite-fsm/core";
import type { ActorTransition } from "@lite-fsm/core";

const makeDeps = (actionType: string) => ({
  transition: vi.fn(),
  action: { type: actionType },
  condition: vi.fn(),
});

describe("createEffect", () => {
  describe("type: 'every' (по умолчанию)", () => {
    it("effect вызывается на каждый запуск обёрнутой функции", () => {
      const effect = vi.fn();
      const wrapped = createEffect({ effect });

      wrapped(makeDeps("A"));
      wrapped(makeDeps("B"));

      expect(effect).toHaveBeenCalledTimes(2);
    });

    it("transition из effect доходит до оригинального transition", () => {
      const wrapped = createEffect({
        effect: ({ transition }) => {
          transition({ type: "NEXT" });
        },
      });
      const deps = makeDeps("A");

      wrapped(deps);

      expect(deps.transition).toHaveBeenCalledWith({ type: "NEXT" });
    });
  });

  describe("cancelFn", () => {
    it("вызывается на каждый запуск effect", () => {
      const cancelFn = vi.fn(() => () => false);
      const wrapped = createEffect({ effect: () => {}, cancelFn });

      wrapped(makeDeps("A"));
      wrapped(makeDeps("B"));

      expect(cancelFn).toHaveBeenCalledTimes(2);
    });

    it("когда возвращает true — transition из effect игнорируется, но сам effect выполняется", () => {
      let shouldCancel = false;

      const effect = vi.fn(({ transition }) => {
        transition({ type: "NEXT" });
      });

      const wrapped = createEffect({
        effect,
        cancelFn: () => () => shouldCancel,
      });

      const firstDeps = makeDeps("A");
      wrapped(firstDeps);
      expect(firstDeps.transition).toHaveBeenCalledWith({ type: "NEXT" });

      shouldCancel = true;
      const secondDeps = makeDeps("B");
      wrapped(secondDeps);

      expect(effect).toHaveBeenCalledTimes(2);
      expect(secondDeps.transition).not.toHaveBeenCalled();
    });

    it("cancelFn подавляет actor transition sugar так же, как callable transition", () => {
      type Event = { type: "NEXT" };
      type ActorConfig = { __INIT: { NEXT: "READY" }; READY: { NEXT: null } };
      const actorTransition = Object.assign(vi.fn((action: Event) => action), {
        unscoped: vi.fn((action: Event) => action),
        actor: vi.fn((_id: string | string[], action: Event) => action),
        group: vi.fn((_id: string | string[], action: Event) => action),
        tag: vi.fn((_id: string | string[], action: Event) => action),
      }) satisfies ActorTransition<Event>;
      const deps = {
        transition: actorTransition,
        action: { type: "NEXT" } as Event,
        condition: vi.fn(),
        self: { actorId: "actor/0", groupId: "group/0", groupTag: "group" },
      };
      const callEveryTransition = ({ transition }: { transition: ActorTransition<Event> }) => {
        transition({ type: "NEXT" });
        transition.unscoped({ type: "NEXT" });
        transition.actor("actor/0", { type: "NEXT" });
        transition.group("group/0", { type: "NEXT" });
        transition.tag("group", { type: "NEXT" });
      };

      createEffect<Event, {}, ActorConfig, "*">({
        effect: callEveryTransition,
        cancelFn: () => () => false,
      })(deps);

      expect(actorTransition).toHaveBeenCalledTimes(1);
      expect(actorTransition.unscoped).toHaveBeenCalledTimes(1);
      expect(actorTransition.actor).toHaveBeenCalledTimes(1);
      expect(actorTransition.group).toHaveBeenCalledTimes(1);
      expect(actorTransition.tag).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();

      createEffect<Event, {}, ActorConfig, "*">({
        effect: callEveryTransition,
        cancelFn: () => () => true,
      })(deps);

      expect(actorTransition).not.toHaveBeenCalled();
      expect(actorTransition.unscoped).not.toHaveBeenCalled();
      expect(actorTransition.actor).not.toHaveBeenCalled();
      expect(actorTransition.group).not.toHaveBeenCalled();
      expect(actorTransition.tag).not.toHaveBeenCalled();
    });
  });

  describe("identity helpers из @lite-fsm/core", () => {
    it("createMachine возвращает переданный объект по ссылке (без копирования)", () => {
      const cfg = {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      } as const;

      expect(createMachine(cfg)).toBe(cfg);
    });

    it("createReducer возвращает переданный reducer по ссылке", () => {
      const reducer = (s: { state: "IDLE"; context: {} }) => s;

      expect(createReducer(reducer)).toBe(reducer);
    });

    it("createConfig возвращает переданный config по ссылке", () => {
      const cfg = { IDLE: { GO: "ACTIVE" }, ACTIVE: {} } as const;

      expect(createConfig(cfg)).toBe(cfg);
    });
  });

  describe("type: 'latest'", () => {
    it("transition из устаревшего (не последнего) запуска игнорируется", async () => {
      let releaseFirst!: () => void;
      let releaseSecond!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const secondGate = new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });

      const wrapped = createEffect({
        type: "latest",
        effect: async ({ action, transition }) => {
          if (action.type === "FIRST") {
            await firstGate;
            transition({ type: "FROM_FIRST" });
          } else {
            await secondGate;
            transition({ type: "FROM_SECOND" });
          }
        },
      });

      const originalTransition = vi.fn();

      wrapped({ transition: originalTransition, action: { type: "FIRST" }, condition: vi.fn() });
      wrapped({ transition: originalTransition, action: { type: "SECOND" }, condition: vi.fn() });

      releaseSecond();
      await secondGate;
      await Promise.resolve();

      expect(originalTransition).toHaveBeenCalledTimes(1);
      expect(originalTransition).toHaveBeenCalledWith({ type: "FROM_SECOND" });

      releaseFirst();
      await firstGate;
      await Promise.resolve();

      expect(originalTransition).toHaveBeenCalledTimes(1);
    });
  });
});
