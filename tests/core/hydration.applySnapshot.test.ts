import { describe, expect, it, vi } from "vitest";

import { applySnapshot, assertSnapshotEnvelope, type ApplySnapshotDeps } from "@lite-fsm/core/internal/hydration";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";
import type { MachineStore } from "@lite-fsm/core";

type DomainCfg = { config: object; hydrate?: unknown; dehydrate?: unknown };
type StoreShape = Record<string, DomainCfg>;

const makeDeps = (
  config: StoreShape,
  overrides: Partial<ApplySnapshotDeps<MachineStore>> = {},
): ApplySnapshotDeps<MachineStore> => ({
  config: config as unknown as MachineStore,
  snapshotActorTemplateKeys: [],
  runtimeActorTemplateKeys: [],
  schemaVersion: undefined,
  groupTagForTemplate: (key) => key,
  ...overrides,
});

describe("applySnapshot — unit", () => {
  describe("assertSnapshotEnvelope", () => {
    it("envelope должен быть object", () => {
      expect(() => assertSnapshotEnvelope(null)).toThrow(LiteFsmError);
      expect(() => assertSnapshotEnvelope("str")).toThrow(/snapshot must be an object/);
    });

    it("envelope.machines должен быть object", () => {
      expect(() => assertSnapshotEnvelope({ machines: 42 })).toThrow(/snapshot\.machines must be an object/);
      expect(() => assertSnapshotEnvelope({ machines: null })).toThrow(/snapshot\.machines must be an object/);
    });

    it("schemaVersion парсится только для number, иначе undefined", () => {
      expect(assertSnapshotEnvelope({ schemaVersion: 3, machines: {} }).schemaVersion).toBe(3);
      expect(assertSnapshotEnvelope({ schemaVersion: "v3", machines: {} }).schemaVersion).toBeUndefined();
    });
  });

  describe("mode preview vs commit", () => {
    it("preview не вызывает onUnknownMachineKey / onSchemaVersionMismatch", () => {
      const onUnknown = vi.fn();
      const onMismatch = vi.fn();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const deps = makeDeps(
        { known: { config: {} } },
        { schemaVersion: 2, onUnknownMachineKey: onUnknown, onSchemaVersionMismatch: onMismatch },
      );

      applySnapshot(
        { known: { state: "IDLE", context: {} } } as never,
        { schemaVersion: 1, machines: { known: { state: "ON", context: {} }, missing: {} } } as never,
        "merge",
        "hydrate",
        deps,
        "preview",
      );

      expect(onUnknown).not.toHaveBeenCalled();
      expect(onMismatch).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("commit вызывает onUnknownMachineKey + onSchemaVersionMismatch с правильными аргументами", () => {
      const onUnknown = vi.fn();
      const onMismatch = vi.fn();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const deps = makeDeps(
        { known: { config: {} } },
        { schemaVersion: 2, onUnknownMachineKey: onUnknown, onSchemaVersionMismatch: onMismatch },
      );

      applySnapshot(
        { known: { state: "IDLE", context: {} } } as never,
        { schemaVersion: 1, machines: { missing: {} } } as never,
        "merge",
        "hydrate",
        deps,
        "commit",
      );

      expect(onMismatch).toHaveBeenCalledWith(1, 2);
      expect(onUnknown).toHaveBeenCalledWith("missing", "hydrate");
      warn.mockRestore();
    });
  });

  describe("runtime actor template", () => {
    it("runtime template ключ в snapshot: skip без mutate, DEV warn", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const deps = makeDeps(
        { runtime: { config: { __INIT: {} } } },
        { runtimeActorTemplateKeys: ["runtime"] },
      );

      const prev = { runtime: { "runtime/0": { state: "PENDING", context: {} } } };
      const result = applySnapshot(
        prev as never,
        { machines: { runtime: { "runtime/0": { state: "ACTIVE", context: {} } } } } as never,
        "merge",
        "hydrate",
        deps,
        "commit",
      );

      expect(result.nextState).toBe(prev as never);
      expect(result.changedActorTemplateKeys).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("runtime actor template"));
      warn.mockRestore();
    });
  });

  describe("snapshot actor template", () => {
    it("strategy 'replace' дропает старые actorId, не присутствующие в snapshot", () => {
      const deps = makeDeps(
        { actor: { config: { __INIT: {} } } },
        { snapshotActorTemplateKeys: ["actor"] },
      );
      const prev = {
        actor: {
          "actor/0": { state: "PENDING", context: { value: 0 }, meta: { actorId: "actor/0", groupId: "actor/0", groupTag: "actor" } },
          "actor/1": { state: "PENDING", context: { value: 1 }, meta: { actorId: "actor/1", groupId: "actor/1", groupTag: "actor" } },
        },
      };

      const result = applySnapshot(
        prev as never,
        {
          machines: {
            actor: {
              "actor/0": {
                snapshot: { state: "PENDING", context: { value: 0 } },
                meta: { actorId: "actor/0", groupId: "actor/0", groupTag: "actor" },
              },
            },
          },
        } as never,
        "replace",
        "hydrate",
        deps,
        "commit",
      );

      expect(result.changedActorTemplateKeys).toEqual(["actor"]);
      expect(Object.keys((result.nextState as any).actor)).toEqual(["actor/0"]);
    });

    it("strategy 'merge' сохраняет старые actorId и добавляет новые", () => {
      const deps = makeDeps(
        { actor: { config: { __INIT: {} } } },
        { snapshotActorTemplateKeys: ["actor"] },
      );
      const prev = {
        actor: {
          "actor/0": { state: "PENDING", context: { value: 0 }, meta: { actorId: "actor/0", groupId: "actor/0", groupTag: "actor" } },
        },
      };

      const result = applySnapshot(
        prev as never,
        {
          machines: {
            actor: {
              "actor/1": {
                snapshot: { state: "ACTIVE", context: { value: 1 } },
                meta: { actorId: "actor/1", groupId: "actor/1", groupTag: "actor" },
              },
            },
          },
        } as never,
        "merge",
        "hydrate",
        deps,
        "commit",
      );

      expect(Object.keys((result.nextState as any).actor).sort()).toEqual(["actor/0", "actor/1"]);
    });
  });

  describe("ref-stability", () => {
    it("domain hydrate hook вернул prev → next === prev, ключ НЕ в changedActorTemplateKeys", () => {
      const deps = makeDeps({
        domain: {
          config: {},
          hydrate: (prev: unknown) => prev,
        },
      });
      const prev = { domain: { state: "IDLE", context: { n: 5 } } };

      const result = applySnapshot(
        prev as never,
        { machines: { domain: { state: "ON", context: { n: 9 } } } } as never,
        "merge",
        "hydrate",
        deps,
        "commit",
      );

      expect(result.nextState).toBe(prev as never);
      expect(result.changedActorTemplateKeys).toEqual([]);
    });

    it("domain без hydrate hook: snapshot записывается как есть", () => {
      const deps = makeDeps({ domain: { config: {} } });
      const prev = { domain: { state: "IDLE", context: { n: 0 } } };

      const result = applySnapshot(
        prev as never,
        { machines: { domain: { state: "ON", context: { n: 9 } } } } as never,
        "merge",
        "hydrate",
        deps,
        "commit",
      );

      expect((result.nextState as any).domain).toEqual({ state: "ON", context: { n: 9 } });
    });
  });
});
