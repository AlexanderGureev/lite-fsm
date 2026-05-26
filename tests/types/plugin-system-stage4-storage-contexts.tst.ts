import { describe, expect, test } from "tstyche";
import { defineStorageRuntime } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction } from "@lite-fsm/core";
import type {
  StorageAcceptsEventContext,
  StorageConditionContext,
  StorageTemplate,
} from "@lite-fsm/core/internal/pluginStorageTypes";

import type { Assert, Equal, IsUnknown } from "./_helpers";

type TemplateData = { readonly cacheKey: string; readonly weight: number };
type RuntimeState = { writes: number; readonly index: Map<string, string> };
type PublicState = { readonly ready: boolean; readonly count: number };
type SnapshotData = { readonly commits: number };
type Invocation = { readonly id: string; readonly retry: boolean };
type Identity = { readonly kind: "typed"; readonly id: string };
type StorageInput = {
  readonly initialContext: { readonly id: string };
  readonly ttl: number;
};
type TypedStorageExtension = {
  readonly input: StorageInput;
  readonly publicState: PublicState;
  readonly runtimeState: RuntimeState;
  readonly templateData: TemplateData;
  readonly snapshotData: SnapshotData;
  readonly invocation: Invocation;
  readonly identity: Identity;
};
type FallbackStorageExtension = {
  readonly input: {
    readonly initialContext: { readonly id: string };
  };
};

const typedStorage = defineStorageRuntime<TypedStorageExtension>().create({
  kind: "typed-storage-contexts",
  validateTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"typed-storage-contexts">();
    expect(ctx.machine.initialContext.id).type.toBe<string>();
    expect(ctx.machine.ttl).type.toBe<number>();
  },
  compileTemplate(ctx) {
    expect(ctx.machine.initialContext.id).type.toBe<string>();
    const data: TemplateData = { cacheKey: ctx.key, weight: ctx.machine.ttl };
    return { data };
  },
  createRuntimeState(ctx) {
    expect(ctx.templates).type.toBe<readonly StorageTemplate<TemplateData>[]>();
    expect(ctx.templates[0]?.data).type.toBe<TemplateData | undefined>();
    return { writes: 0, index: new Map<string, string>() };
  },
  createPublicInitialState(ctx) {
    expect(ctx.state).type.toBe<RuntimeState>();
    expect(ctx.template.data).type.toBe<TemplateData | undefined>();
    return { ready: true, count: ctx.state.writes };
  },
  prepareAction(ctx) {
    expect(ctx.state).type.toBe<RuntimeState>();
    expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
    expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
  },
  beforeReduce(ctx) {
    expect(ctx.state).type.toBe<RuntimeState>();
    expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
    expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
  },
  acceptsEvent(ctx) {
    expect(ctx.template.data).type.toBe<TemplateData | undefined>();
    expect(ctx.state).type.toBe<RuntimeState>();
    expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
    expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
    return false;
  },
  reduce(ctx) {
    expect(ctx.template.data).type.toBe<TemplateData | undefined>();
    expect(ctx.state).type.toBe<RuntimeState>();
    return { type: "skip" };
  },
  commit(ctx) {
    expect(ctx.state).type.toBe<RuntimeState>();
  },
  effects: {
    condition(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      expect(ctx.predicate).type.toBe<(action: ManagerAction<AnyEvent>) => boolean>();
      return Promise.resolve(ctx.predicate({ type: "CHECK" }));
    },
    resolveInvocations(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      const invocations = [{ id: "sync", retry: false }] as const;
      expect(invocations).type.toBeAssignableTo<readonly Invocation[]>();
      return invocations;
    },
    invoke(ctx) {
      expect(ctx.invocation).type.toBe<Invocation>();
      expect(ctx.state).type.toBe<RuntimeState>();
    },
  },
  snapshot: {
    dehydrate(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      return { snapshot: { commits: ctx.state.writes } };
    },
    hydrate(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      expect(ctx.machines).type.toBe<Readonly<Record<string, unknown>>>();
      expect(ctx.snapshot).type.toBe<SnapshotData | undefined>();
      return { nextState: ctx.baseState, changed: false };
    },
  },
  identity: {
    resolve(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      const identity: Identity | undefined =
        ctx.action.type === "IDENTIFY" ? { kind: "typed", id: ctx.action.type } : undefined;
      return identity;
    },
  },
  reactions: {
    run(ctx) {
      expect(ctx.state).type.toBe<RuntimeState>();
      expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
      expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
    },
  },
});

const typedBucketStorage = defineStorageRuntime<TypedStorageExtension>().create({
  kind: "typed-bucket-contexts",
  reduceScope: "bucket",
  validateTemplate() {},
  compileTemplate(ctx) {
    return { data: { cacheKey: ctx.key, weight: 1 } };
  },
  createRuntimeState(ctx) {
    expect(ctx.templates).type.toBe<readonly StorageTemplate<TemplateData>[]>();
    return { writes: 0, index: new Map<string, string>() };
  },
  createPublicInitialState() {
    return { ready: true, count: 0 };
  },
  reduceBucket(ctx) {
    expect(ctx.templates).type.toBe<readonly StorageTemplate<TemplateData>[]>();
    expect(ctx.templates[0]?.data).type.toBe<TemplateData | undefined>();
    expect(ctx.state).type.toBe<RuntimeState>();
    expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
    expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
    return { type: "skip" };
  },
  commit(ctx) {
    expect(ctx.state).type.toBe<RuntimeState>();
  },
});

describe("plugin system — этап 4 storage context types", () => {
  test("inline callbacks получают Extension runtime-only типы", () => {
    expect(typedStorage.kind).type.toBe<"typed-storage-contexts">();
    expect(typedBucketStorage.kind).type.toBe<"typed-bucket-contexts">();
  });

  test("compileTemplate проверяет data как templateData", () => {
    defineStorageRuntime<TypedStorageExtension>().create({
      kind: "invalid-template-data",
      validateTemplate() {},
      // @ts-expect-error!
      compileTemplate() {
        return { data: { cacheKey: "missing-weight" } };
      },
      createRuntimeState() {
        return { writes: 0, index: new Map<string, string>() };
      },
      createPublicInitialState() {
        return { ready: true, count: 0 };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });

  test("createRuntimeState и createPublicInitialState проверяют return type", () => {
    defineStorageRuntime<TypedStorageExtension>().create({
      kind: "invalid-runtime-state",
      validateTemplate() {},
      compileTemplate() {
        return { data: { cacheKey: "cache", weight: 1 } };
      },
      // @ts-expect-error!
      createRuntimeState() {
        return { index: new Map<string, string>() };
      },
      createPublicInitialState() {
        return { ready: true, count: 0 };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    defineStorageRuntime<TypedStorageExtension>().create({
      kind: "invalid-public-state",
      validateTemplate() {},
      compileTemplate() {
        return { data: { cacheKey: "cache", weight: 1 } };
      },
      createRuntimeState() {
        return { writes: 0, index: new Map<string, string>() };
      },
      // @ts-expect-error!
      createPublicInitialState() {
        return { ready: true };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });

  test("identity.resolve проверяет identity return type", () => {
    defineStorageRuntime<TypedStorageExtension>().create({
      kind: "invalid-identity",
      validateTemplate() {},
      compileTemplate() {
        return { data: { cacheKey: "cache", weight: 1 } };
      },
      createRuntimeState() {
        return { writes: 0, index: new Map<string, string>() };
      },
      createPublicInitialState() {
        return { ready: true, count: 0 };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
      identity: {
        // @ts-expect-error!
        resolve() {
          return { kind: "other", id: "bad" };
        },
      },
    });
  });

  test("callbacks без runtime-only fields сохраняют unknown fallback", () => {
    defineStorageRuntime<FallbackStorageExtension>().create({
      kind: "fallback-contexts",
      validateTemplate(ctx) {
        expect(ctx.machine.initialContext.id).type.toBe<string>();
      },
      compileTemplate() {
        return { data: { fallback: true } };
      },
      createRuntimeState(ctx) {
        expect(ctx.templates).type.toBe<readonly StorageTemplate<unknown>[]>();
        return { state: "unknown" };
      },
      createPublicInitialState(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        expect(ctx.template.data).type.toBe<unknown>();
        return { ready: true };
      },
      acceptsEvent(ctx) {
        expect(ctx.state).type.toBe<unknown>();
        expect(ctx.template.data).type.toBe<unknown>();
        return true;
      },
      reduce(ctx) {
        expect(ctx.state).type.toBe<unknown>();
      },
      commit(ctx) {
        expect(ctx.state).type.toBe<unknown>();
      },
      effects: {
        condition(ctx) {
          expect(ctx.state).type.toBe<unknown>();
          return Promise.resolve(false);
        },
        resolveInvocations() {
          return [{ fallback: true }] as const;
        },
        invoke(ctx) {
          expect(ctx.invocation).type.toBe<unknown>();
        },
      },
      identity: {
        resolve() {
          return { fallback: true };
        },
      },
    });
  });

  test("context type aliases доступны через internal source до root export этапа 6", () => {
    type AcceptsContext = StorageAcceptsEventContext<TypedStorageExtension>;
    type ConditionContext = StorageConditionContext<TypedStorageExtension>;
    type FallbackAcceptsContext = StorageAcceptsEventContext<FallbackStorageExtension>;

    type _AcceptsState = Assert<Equal<AcceptsContext["state"], RuntimeState>>;
    type _AcceptsTemplate = Assert<Equal<AcceptsContext["template"]["data"], TemplateData | undefined>>;
    type _ConditionState = Assert<Equal<ConditionContext["state"], RuntimeState>>;
    type _ConditionPredicate = Assert<
      Equal<ConditionContext["predicate"], (action: ManagerAction<AnyEvent>) => boolean>
    >;
    type _FallbackState = Assert<IsUnknown<FallbackAcceptsContext["state"]>>;
  });
});
