import { describe, expect, test } from "tstyche";
import { definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  AnyEvent,
  ManagerAction,
  ReadonlyManagerAction,
  StorageAcceptsEventContext,
  StorageBeforeReduceContext,
  StorageCommitContext,
  StorageConditionContext,
  StorageEffectInvocationContext,
  StorageIdentityContext,
  StoragePrepareActionContext,
  StorageReactionContext,
  StorageReduceBucketContext,
  StorageReduceContext,
  StorageResolveEffectInvocationsContext,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type HostEvent = {
  type: "HOST_EVENT";
  payload: {
    id: string;
    nested: { count: number };
    ids: string[];
  };
};
type PluginEvent = {
  type: "PLUGIN_EVENT";
  payload: {
    id: string;
    nested: { count: number };
    ids: string[];
  };
};
type ObservedEvent = HostEvent | PluginEvent;

type ImmutableStorageExtension = {
  readonly observedEvents: ObservedEvent;
  readonly runtimeState: { writes: number };
  readonly templateData: { readonly id: string };
  readonly invocation: { readonly id: string };
};

type StorageActionViews = {
  readonly prepareAction: StoragePrepareActionContext<ImmutableStorageExtension>["action"];
  readonly beforeReduce: StorageBeforeReduceContext<ImmutableStorageExtension>["action"];
  readonly acceptsEvent: StorageAcceptsEventContext<ImmutableStorageExtension>["action"];
  readonly reduce: StorageReduceContext<ImmutableStorageExtension>["action"];
  readonly reduceBucket: StorageReduceBucketContext<ImmutableStorageExtension>["action"];
  readonly commit: StorageCommitContext<ImmutableStorageExtension>["action"];
  readonly resolveInvocations: StorageResolveEffectInvocationsContext<ImmutableStorageExtension>["action"];
  readonly invoke: StorageEffectInvocationContext<ImmutableStorageExtension>["action"];
  readonly identity: StorageIdentityContext<ImmutableStorageExtension>["action"];
  readonly reaction: StorageReactionContext<ImmutableStorageExtension>["action"];
};

type _StorageActionViewsReadonly = Assert<
  Equal<
    StorageActionViews,
    {
      readonly prepareAction: ReadonlyManagerAction<ObservedEvent>;
      readonly beforeReduce: ReadonlyManagerAction<ObservedEvent>;
      readonly acceptsEvent: ReadonlyManagerAction<ObservedEvent>;
      readonly reduce: ReadonlyManagerAction<ObservedEvent>;
      readonly reduceBucket: ReadonlyManagerAction<ObservedEvent>;
      readonly commit: ReadonlyManagerAction<ObservedEvent>;
      readonly resolveInvocations: ReadonlyManagerAction<ObservedEvent>;
      readonly invoke: ReadonlyManagerAction<ObservedEvent>;
      readonly identity: ReadonlyManagerAction<ObservedEvent>;
      readonly reaction: ReadonlyManagerAction<ObservedEvent>;
    }
  >
>;

type _StoragePredicateReadonly = Assert<
  Equal<
    Parameters<StorageConditionContext<ImmutableStorageExtension>["predicate"]>[0],
    ReadonlyManagerAction<ObservedEvent>
  >
>;

describe("plugin system public API hardening — этап 3", () => {
  test("plugin callbacks получают immutable action view", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-three-plugin-immutability",
      routeMeta: {
        entityId(value: string, ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
          // @ts-expect-error!
          ctx.action.type = "PLUGIN_EVENT";
          // @ts-expect-error!
          ctx.action.meta = {};
          if (ctx.action.meta) {
            // @ts-expect-error!
            ctx.action.meta.actorId = "next";
          }
          return value;
        },
      },
      intercept(ctx) {
        expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
        expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();

        // @ts-expect-error!
        ctx.action = { type: "PLUGIN_EVENT", payload: { id: "plugin", nested: { count: 1 }, ids: [] } };
        // @ts-expect-error!
        ctx.action.type = "PLUGIN_EVENT";
        // @ts-expect-error!
        ctx.action.meta = {};
        if (ctx.action.meta) {
          // @ts-expect-error!
          ctx.action.meta.actorId = "next";
        }
        if (ctx.action.type === "PLUGIN_EVENT") {
          // @ts-expect-error!
          ctx.action.payload.nested.count = 2;
          // @ts-expect-error!
          ctx.action.payload.ids.push("next");
        }

        return {
          action: {
            type: "PLUGIN_EVENT",
            payload: { id: "replacement", nested: { count: 1 }, ids: [] },
          } satisfies ManagerAction<PluginEvent>,
        };
      },
      hooks: {
        beforeReduce(ctx) {
          // @ts-expect-error!
          ctx.action.type = "HOST_EVENT";
          // @ts-expect-error!
          ctx.action.meta = {};
          if (ctx.action.meta) {
            // @ts-expect-error!
            ctx.action.meta.actorId = "next";
          }
        },
      },
      scopedDeps: {
        audit(scope) {
          expect(scope.event).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
          // @ts-expect-error!
          scope.event.type = "PLUGIN_EVENT";
          return { readonlyEvent: scope.event };
        },
      },
      scopedTransition: {
        emit(scope) {
          // @ts-expect-error!
          scope.event.meta = {};
          return () =>
            scope.transition({
              type: "PLUGIN_EVENT",
              payload: { id: "plugin", nested: { count: 1 }, ids: [] },
            });
        },
      },
    });
  });

  test("storage callbacks получают immutable action view, но replacement остается mutable ManagerAction", () => {
    defineStorageRuntime<ImmutableStorageExtension>().create({
      kind: "stage-three-storage-immutability",
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { id: ctx.key } };
      },
      createRuntimeState() {
        return { writes: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      prepareAction(ctx) {
        // @ts-expect-error!
        ctx.action.type = "PLUGIN_EVENT";
        const replacement = {
          type: "PLUGIN_EVENT",
          payload: { id: "replacement", nested: { count: 1 }, ids: [] },
        } satisfies ManagerAction<PluginEvent>;
        return { type: "replace", action: replacement };
      },
      beforeReduce(ctx) {
        // @ts-expect-error!
        ctx.action.meta = {};
        if (ctx.action.meta) {
          // @ts-expect-error!
          ctx.action.meta.actorId = "next";
        }
        const replacement = {
          type: "HOST_EVENT",
          payload: { id: "host", nested: { count: 1 }, ids: [] },
        } satisfies ManagerAction<HostEvent>;
        return { type: "replace", action: replacement };
      },
      acceptsEvent(ctx) {
        return ctx.action.type === "PLUGIN_EVENT";
      },
      reduce(ctx) {
        // @ts-expect-error!
        ctx.action.payload.ids = [];
      },
      commit(ctx) {
        ctx.state.writes += 1;
      },
      effects: {
        condition(ctx) {
          const action: Parameters<typeof ctx.predicate>[0] = {
            type: "HOST_EVENT",
            payload: { id: "host", nested: { count: 1 }, ids: [] },
          };
          // @ts-expect-error!
          action.payload.nested.count = 2;
          return Promise.resolve(ctx.predicate(action));
        },
        resolveInvocations(ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
          return [{ id: ctx.action.type }];
        },
        invoke(ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
          expect(ctx.invocation.id).type.toBe<string>();
        },
      },
      identity: {
        resolve(ctx) {
          expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
          return undefined;
        },
      },
      reactions: {
        run(ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
        },
      },
    });

    defineStorageRuntime<ImmutableStorageExtension>().create({
      kind: "stage-three-bucket-storage-immutability",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { id: ctx.key } };
      },
      createRuntimeState() {
        return { writes: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket(ctx) {
        expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
        return { type: "skip" };
      },
      commit(ctx) {
        ctx.state.writes += 1;
      },
    });
  });

  test("ReadonlyManagerAction запрещает nested payload mutation", () => {
    const action = {} as ReadonlyManagerAction<HostEvent>;

    // @ts-expect-error!
    action.payload.id = "next";
    // @ts-expect-error!
    action.payload.nested.count = 2;
    // @ts-expect-error!
    action.payload.ids.push("next");

    expect(action).type.toBe<ReadonlyManagerAction<HostEvent>>();
  });

  test("fallback storage action context использует readonly AnyEvent", () => {
    type FallbackExtension = {};

    expect<StoragePrepareActionContext<FallbackExtension>["action"]>().type.toBe<ReadonlyManagerAction<AnyEvent>>();
  });
});
