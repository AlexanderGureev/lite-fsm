import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";

type CounterEvent = FSMEvent<"INC">;
type CounterConfig = { readonly IDLE: { readonly INC: "IDLE" } };
type CounterContext = { readonly count: number };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;

const createCounter = (): CounterMachine => ({
  config: { IDLE: { INC: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice) => ({
    state: "IDLE",
    context: { count: slice.context.count + 1 },
  }),
});

const createStorageRuntimeDefinition = (kind: string) =>
  defineStorageRuntime<{ readonly publicState: { readonly ready: boolean } }>().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return {};
    },
    createPublicInitialState() {
      return { ready: true };
    },
    acceptsEvent() {
      return false;
    },
    reduce() {},
    commit() {},
  });

const expectLiteFsmError = (
  run: () => unknown,
  code: LiteFsmError["code"],
  fragments: readonly string[],
) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof LiteFsmError)) {
    throw new Error("Expected LiteFsmError.");
  }

  expect(caught.code).toBe(code);
  for (const fragment of fragments) {
    expect(caught.message).toContain(fragment);
  }
};

describe("plugin system — этап 2 — owner-aware duplicate diagnostics", () => {
  it("диагностирует duplicate routeMeta key с владельцами", () => {
    const first = definePlugin().create({
      name: "stage-two-route-a",
      routeMeta: { cacheKey: () => "cache/a" },
    });
    const second = definePlugin().create({
      name: "stage-two-route-b",
      routeMeta: { cacheKey: () => "cache/b" },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] as const }),
      "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
      [
        "duplicate routeMeta key 'cacheKey'",
        "plugin 'stage-two-route-a'",
        "plugin 'stage-two-route-b'",
      ],
    );
  });

  it("диагностирует duplicate manager key с владельцами", () => {
    const first = definePlugin().create({
      name: "stage-two-manager-a",
      manager: { audit: () => ({ ready: true }) },
    });
    const second = definePlugin().create({
      name: "stage-two-manager-b",
      manager: { audit: () => ({ ready: true }) },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] as const }),
      "LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY",
      [
        "duplicate manager key 'audit'",
        "plugin 'stage-two-manager-a'",
        "plugin 'stage-two-manager-b'",
      ],
    );
  });

  it("диагностирует duplicate scopedDeps key с владельцами", () => {
    const first = definePlugin().create({
      name: "stage-two-scoped-deps-a",
      scopedDeps: { trace: () => "a" },
    });
    const second = definePlugin().create({
      name: "stage-two-scoped-deps-b",
      scopedDeps: { trace: () => "b" },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] as const }),
      "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
      [
        "duplicate scopedDeps key 'trace'",
        "plugin 'stage-two-scoped-deps-a'",
        "plugin 'stage-two-scoped-deps-b'",
      ],
    );
  });

  it("диагностирует duplicate scopedTransition key с владельцами", () => {
    const first = definePlugin().create({
      name: "stage-two-scoped-transition-a",
      scopedTransition: { finish: () => () => undefined },
    });
    const second = definePlugin().create({
      name: "stage-two-scoped-transition-b",
      scopedTransition: { finish: () => () => undefined },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] as const }),
      "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
      [
        "duplicate scopedTransition key 'finish'",
        "plugin 'stage-two-scoped-transition-a'",
        "plugin 'stage-two-scoped-transition-b'",
      ],
    );
  });

  it("диагностирует duplicate storage kind с владельцами", () => {
    const first = definePlugin().create({
      name: "stage-two-storage-a",
      storage: [createStorageRuntimeDefinition("stage-two-cache")],
    });
    const second = definePlugin().create({
      name: "stage-two-storage-b",
      storage: [createStorageRuntimeDefinition("stage-two-cache")],
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] as const }),
      "LITE_FSM_DUPLICATE_STORAGE_KIND",
      [
        "duplicate storage kind 'stage-two-cache'",
        "plugin 'stage-two-storage-a'",
        "plugin 'stage-two-storage-b'",
      ],
    );
  });

  it("сохраняет reserved core key diagnostics", () => {
    const routeMeta = definePlugin().create({
      name: "stage-two-reserved-route",
      routeMeta: { actorId: () => "actor/a" },
    });
    const manager = definePlugin().create({
      name: "stage-two-reserved-manager",
      manager: { transition: () => ({ ready: true }) },
    });
    const scopedDeps = definePlugin().create({
      name: "stage-two-reserved-scoped-deps",
      scopedDeps: { action: () => undefined },
    });
    const scopedTransition = definePlugin().create({
      name: "stage-two-reserved-scoped-transition",
      scopedTransition: { actor: () => () => undefined },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [routeMeta] as const }),
      "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
      ["duplicate routeMeta key 'actorId'", "plugin 'stage-two-reserved-route'", "core reserved routeMeta key"],
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [manager] as const }),
      "LITE_FSM_MANAGER_EXTENSION_CORE_KEY",
      ["plugin 'stage-two-reserved-manager'", "core manager key"],
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [scopedDeps] as const }),
      "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
      ["plugin 'stage-two-reserved-scoped-deps'", "core scoped dep key 'action'"],
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [scopedTransition] as const }),
      "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
      ["plugin 'stage-two-reserved-scoped-transition'", "core scoped transition key 'actor'"],
    );
  });
});
