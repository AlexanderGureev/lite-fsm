import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";
import type { MachineConfig } from "@lite-fsm/core";

import { createLikeSync, type LikeEvent } from "./MachineManager.actors.fixtures";

describe("MachineManager actors — lifecycle (late dispatch, terminal collapse, hydration skip)", () => {
  describe("terminal collapse и subscriber view", () => {
    it("terminal transition схлопывает actor без запуска actor effects", () => {
      const calls: LikeEvent["type"][] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            calls.push(action.type);
          },
          "*": ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(calls).toEqual(["LIKE"]);
    });

    it("subscriber видит actor record уже после terminal collapse", () => {
      const snapshots: Array<Record<string, unknown>> = [];
      const manager = MachineManager({ likeSync: createLikeSync() });
      manager.onTransition((_prev, current, action) => {
        if (action.type === "OK") snapshots.push(current.likeSync);
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(snapshots).toEqual([{}]);
      expect(snapshots[0]).toBe(manager.getState().likeSync);
    });

    it("не запускает actor effect, если subscriber reentrant удалил actor до phase 12", () => {
      const calls: LikeEvent["type"][] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });
      manager.onTransition((_prev, _current, action) => {
        if (action.type === "LIKE") {
          manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
        }
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(calls).toEqual([]);
    });
  });

  describe("late dispatch от disposed actor", () => {
    it("late transition от disposed actor — full no-op для domain и actor", () => {
      let savedTransition: ((action: LikeEvent) => LikeEvent) | undefined;
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: { PENDING: ({ transition }) => void (savedTransition = transition) },
      };
      const manager = MachineManager({
        domain: {
          config: { IDLE: { BUMP: null } },
          initialState: "IDLE",
          initialContext: { bumps: 0 },
          reducer: (state, action) => {
            if (action.type === "BUMP") return { state: state.state, context: { bumps: state.context.bumps + 1 } };
          },
        } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, LikeEvent>,
        likeSync: actorMachine,
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      savedTransition?.({ type: "BUMP" });

      expect(manager.getState().domain.context.bumps).toBe(0);
    });
  });

  describe("hydration: skip-by-design для runtime actor templates", () => {
    it("dehydrate() пропускает actor templates без persistence", () => {
      const manager = MachineManager({
        domain: { config: { IDLE: {} }, initialState: "IDLE", initialContext: { ok: true } },
        likeSync: createLikeSync(),
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.dehydrate()).toEqual({
        schemaVersion: undefined,
        machines: { domain: { state: "IDLE", context: { ok: true } } },
      });
    });

    it("dehydrate({ machines: [actorKey] }) бросает LITE_FSM_INVALID_HYDRATION_ENVELOPE", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });
      expect(() => manager.dehydrate({ machines: ["likeSync"] as never })).toThrow(LiteFsmError);
    });

    it("hydrate() пропускает actor template ключи с DEV warning", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.hydrate({ machines: { likeSync: { hacked: { state: "PENDING", context: {} } } } } as never);

      expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("a");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("opts.snapshot пропускает actor template keys и применяет domain keys", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const domain = {
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: { value: 0 },
      } satisfies MachineConfig<{ IDLE: {} }, { value: number }, LikeEvent>;

      const manager = MachineManager(
        { domain, likeSync: createLikeSync() },
        {
          snapshot: {
            machines: {
              domain: { state: "IDLE", context: { value: 42 } },
              likeSync: { ghost: { state: "PENDING", context: { id: "ghost", count: 1 } } },
            },
          } as never,
        },
      );

      expect(manager.getState().domain.context.value).toBe(42);
      expect(manager.getState().likeSync).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("getHydratedState сохраняет actor template record по ссылке", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const state = manager.getState();
      const preview = manager.getHydratedState({
        machines: {
          likeSync: { ghost: { state: "PENDING", context: { id: "ghost", count: 1 } } },
        },
      } as never);

      expect(preview).toBe(state);
      expect(preview.likeSync).toBe(state.likeSync);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("invalid envelope shape бросает LITE_FSM_INVALID_HYDRATION_ENVELOPE", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });
      expect(() => manager.hydrate(null as never)).toThrow(LiteFsmError);
      expect(() => manager.hydrate({ machines: null } as never)).toThrow(LiteFsmError);
    });
  });
});
