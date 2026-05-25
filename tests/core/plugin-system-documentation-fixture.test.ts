import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";

import {
  createDocumentationStorageMachine,
  documentationEffectMachine,
  documentationNoopPlugin,
  documentationPlugin,
  DOCUMENTATION_STORAGE_KIND,
} from "../fixtures/plugin-system-documentation";

const flushEffects = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("документационный plugin fixture", () => {
  it("no-op plugin не меняет форму manager и начальное состояние", () => {
    const plain = MachineManager({ effect: documentationEffectMachine });
    const withPlugin = MachineManager(
      { effect: documentationEffectMachine },
      { plugins: [documentationNoopPlugin] as const },
    );

    expect(Object.keys(withPlugin)).toEqual(Object.keys(plain));
    expect(withPlugin.getState()).toEqual(plain.getState());
  });

  it("показывает plugin transition event, manager extension и routing через typed action.meta", () => {
    const manager = MachineManager(
      {
        first: createDocumentationStorageMachine("docs/a"),
        second: createDocumentationStorageMachine("docs/b"),
      },
      { plugins: [documentationPlugin] as const },
    );

    expect(manager.documentation.storageKind).toBe(DOCUMENTATION_STORAGE_KIND);
    expect(manager.documentation.machineKeys()).toEqual(["first", "second"]);
    expect(manager.transition({ type: "DOC_PLUGIN_EVENT", payload: { id: "noop" } })).toEqual({
      type: "DOC_PLUGIN_EVENT",
      payload: { id: "noop" },
    });

    manager.transition({ type: "DOC_TICK", meta: { docTarget: "docs/b" } });

    expect(manager.getState().first).toEqual({
      state: "READY",
      context: { target: "docs/a", count: 0 },
    });
    expect(manager.getState().second).toEqual({
      state: "READY",
      context: { target: "docs/b", count: 1 },
    });
  });

  it("round-trip storage runtime snapshot проходит через snapshot.storage[kind]", () => {
    const source = MachineManager(
      {
        first: createDocumentationStorageMachine("docs/a"),
        second: createDocumentationStorageMachine("docs/b"),
      },
      { plugins: [documentationPlugin] as const },
    );
    source.transition({ type: "DOC_TICK" });
    source.transition({ type: "DOC_TICK", meta: { docTarget: "docs/b" } });

    const snapshot = source.dehydrate();

    expect(snapshot).toEqual({
      schemaVersion: undefined,
      machines: {},
      storage: {
        [DOCUMENTATION_STORAGE_KIND]: {
          values: {
            "docs/a": 1,
            "docs/b": 2,
          },
        },
      },
    });

    const restored = MachineManager(
      {
        first: createDocumentationStorageMachine("docs/a"),
        second: createDocumentationStorageMachine("docs/b"),
      },
      { plugins: [documentationPlugin] as const, snapshot },
    );

    expect(restored.getState()).toEqual({
      first: { state: "READY", context: { target: "docs/a", count: 1 } },
      second: { state: "READY", context: { target: "docs/b", count: 2 } },
    });
  });

  it("использует typed scoped dep и typed scoped transition method внутри effect", async () => {
    const manager = MachineManager(
      { effect: documentationEffectMachine },
      { plugins: [documentationPlugin] as const },
    );

    manager.transition({ type: "DOC_START" });
    await flushEffects();

    expect(manager.getState().effect).toEqual({
      state: "IDLE",
      context: { trace: "instance:effect:DOC_START" },
    });
  });
});
