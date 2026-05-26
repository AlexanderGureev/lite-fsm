import { describe, expect, test } from "tstyche";
import { defineStorageRuntime } from "@lite-fsm/core";
import type {
  AnyEvent,
  FSMEvent,
  ManagerAction,
  StorageBeforeReduceContext,
  StorageCommitContext,
  StorageConditionContext,
  StorageCreateRuntimeStateContext,
  StorageDehydrateContext,
  StorageEffectInvocationContext,
  StorageHydrateContext,
  StorageManagerContext,
  StoragePrepareActionContext,
  StorageReactionContext,
  StorageReduceBucketContext,
  StorageReduceContext,
  StorageResolveEffectInvocationsContext,
  StorageRuntimeExtension,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type ObservedStorageEvent = FSMEvent<"STORAGE_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT">;

type ObservedStorageExtension = {
  readonly observedEvents: ObservedStorageEvent;
  readonly runtimeState: { count: number };
  readonly templateData: { readonly key: string };
  readonly snapshotData: { readonly count: number };
  readonly invocation: { readonly id: string };
};

type FallbackStorageExtension = {
  readonly runtimeState: { count: number };
};

type ContextManagers<Extension extends StorageRuntimeExtension> = {
  readonly createRuntimeState: StorageCreateRuntimeStateContext<Extension>["manager"];
  readonly prepareAction: StoragePrepareActionContext<Extension>["manager"];
  readonly beforeReduce: StorageBeforeReduceContext<Extension>["manager"];
  readonly reduce: StorageReduceContext<Extension>["manager"];
  readonly reduceBucket: StorageReduceBucketContext<Extension>["manager"];
  readonly commit: StorageCommitContext<Extension>["manager"];
  readonly condition: StorageConditionContext<Extension>["manager"];
  readonly resolveInvocations: StorageResolveEffectInvocationsContext<Extension>["manager"];
  readonly invoke: StorageEffectInvocationContext<Extension>["manager"];
  readonly dehydrate: StorageDehydrateContext<Extension>["manager"];
  readonly hydrate: StorageHydrateContext<Extension>["manager"];
  readonly reaction: StorageReactionContext<Extension>["manager"];
};

type ForbiddenManagerKey = "routing" | "createScopedDeps" | "config" | "options" | "schemaVersion";

type ForbiddenManagerKeys<Extension extends StorageRuntimeExtension> = {
  readonly [Key in keyof ContextManagers<Extension>]: Extract<keyof ContextManagers<Extension>[Key], ForbiddenManagerKey>;
}[keyof ContextManagers<Extension>];

type _ObservedExtensionContract = Assert<ObservedStorageExtension extends StorageRuntimeExtension ? true : false>;
type _ObservedCreateRuntimeManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["createRuntimeState"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedPrepareManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["prepareAction"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedBeforeReduceManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["beforeReduce"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedReduceManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["reduce"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedReduceBucketManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["reduceBucket"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedCommitManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["commit"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedConditionManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["condition"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedResolveInvocationsManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["resolveInvocations"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedInvokeManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["invoke"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedDehydrateManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["dehydrate"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedHydrateManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["hydrate"], StorageManagerContext<ObservedStorageEvent>>
>;
type _ObservedReactionManager = Assert<
  Equal<ContextManagers<ObservedStorageExtension>["reaction"], StorageManagerContext<ObservedStorageEvent>>
>;
type _FallbackCreateRuntimeManager = Assert<
  Equal<ContextManagers<FallbackStorageExtension>["createRuntimeState"], StorageManagerContext<AnyEvent>>
>;
type _FallbackReduceManager = Assert<
  Equal<ContextManagers<FallbackStorageExtension>["reduce"], StorageManagerContext<AnyEvent>>
>;
type _NoForbiddenKeys = Assert<Equal<ForbiddenManagerKeys<ObservedStorageExtension>, never>>;

const expectObservedManager = (manager: StorageManagerContext<ObservedStorageEvent>) => {
  expect(manager).type.toBe<StorageManagerContext<ObservedStorageEvent>>();

  const action = manager.transition({ type: "STORAGE_EVENT", payload: { id: "typed" } });
  expect(action).type.toBe<ManagerAction<ObservedStorageEvent>>();

  // @ts-expect-error!
  manager.transition({ type: "HOST_EVENT" } satisfies HostEvent);
  // @ts-expect-error!
  manager.routing;
  // @ts-expect-error!
  manager.createScopedDeps;
  // @ts-expect-error!
  manager.config;
  // @ts-expect-error!
  manager.options;
  // @ts-expect-error!
  manager.schemaVersion;
};

describe("plugin system public API hardening — этап 2", () => {
  test("сужает storage manager context до public методов и observedEvents", () => {
    defineStorageRuntime<ObservedStorageExtension>().create({
      kind: "stage-two-public-manager",
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { key: ctx.key } };
      },
      createRuntimeState(ctx) {
        expectObservedManager(ctx.manager);
        return { count: ctx.templates.length };
      },
      createPublicInitialState() {
        return {};
      },
      prepareAction(ctx) {
        expectObservedManager(ctx.manager);
        return { type: "replace", action: ctx.manager.transition({ type: "STORAGE_EVENT", payload: { id: "prepare" } }) };
      },
      beforeReduce(ctx) {
        expectObservedManager(ctx.manager);
      },
      acceptsEvent(ctx) {
        return ctx.action.type === "STORAGE_EVENT";
      },
      reduce(ctx) {
        expectObservedManager(ctx.manager);
        ctx.state.count += 1;
        return { type: "skip" };
      },
      commit(ctx) {
        expectObservedManager(ctx.manager);
      },
      effects: {
        condition(ctx) {
          expectObservedManager(ctx.manager);
          return Promise.resolve(ctx.predicate({ type: "STORAGE_EVENT", payload: { id: "condition" } }));
        },
        resolveInvocations(ctx) {
          expectObservedManager(ctx.manager);
          return [{ id: String(ctx.state.count) }];
        },
        invoke(ctx) {
          expectObservedManager(ctx.manager);
          expect(ctx.invocation).type.toBe<{ readonly id: string }>();
        },
      },
      snapshot: {
        dehydrate(ctx) {
          expectObservedManager(ctx.manager);
          return { snapshot: { count: ctx.state.count } };
        },
        hydrate(ctx) {
          expectObservedManager(ctx.manager);
          return { nextState: ctx.baseState, changed: false };
        },
      },
      reactions: {
        run(ctx) {
          expectObservedManager(ctx.manager);
        },
      },
    });
  });

  test("типизирует bucket reduce manager теми же observedEvents", () => {
    defineStorageRuntime<ObservedStorageExtension>().create({
      kind: "stage-two-public-bucket-manager",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { key: ctx.key } };
      },
      createRuntimeState(ctx) {
        expectObservedManager(ctx.manager);
        return { count: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket(ctx) {
        expectObservedManager(ctx.manager);
        ctx.state.count += ctx.templates.length;
      },
      commit(ctx) {
        expectObservedManager(ctx.manager);
      },
    });
  });

  test("использует AnyEvent fallback, когда observedEvents не задан", () => {
    type FallbackManager = StorageReduceContext<FallbackStorageExtension>["manager"];
    expect<FallbackManager>().type.toBe<StorageManagerContext<AnyEvent>>();

    const storage = defineStorageRuntime<FallbackStorageExtension>().create({
      kind: "stage-two-any-event-manager",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState(ctx) {
        expect(ctx.manager).type.toBe<StorageManagerContext<AnyEvent>>();
        ctx.manager.transition({ type: "ANY_EVENT", payload: { ok: true } });
        return { count: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return true;
      },
      reduce(ctx) {
        expect(ctx.manager).type.toBe<StorageManagerContext<AnyEvent>>();
      },
      commit() {},
    });

    expect(storage.kind).type.toBe<"stage-two-any-event-manager">();
  });
});
