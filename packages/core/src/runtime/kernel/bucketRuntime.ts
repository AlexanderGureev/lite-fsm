// Bucket-loop dispatch operations: prepare/reduce/commit/reactions/effects/condition по всем
// зарегистрированным storage runtime. Извлечено из createMachineManagerFactory, чтобы оставить
// в фабрике только pipeline-orchestration и lifecycle, а bucket-iteration жил в одном месте.

import type { AnyEvent, MachinesState, MachineStore, ManagerAction } from "../../types";
import { createReadonlyActionView } from "./actionView";
import {
  assertStorageAcceptsEventResult,
  assertStorageActionStageResult,
  assertStorageReduceResult,
} from "./callbackValidation";
import type { RuntimeBucket } from "./snapshot";
import {
  type ManagerRuntimeContext,
  type StorageDispatchContext,
  type StorageDispatchLifecycleContext,
} from "./storage";
import type { GuardedCallbackRunner } from "./transitionGuard";

type Action = ManagerAction<AnyEvent>;
type ActionStageOutcome = { readonly type: "continue"; readonly action: Action } | { readonly type: "drop" };

const createStorageActionViews = (action: Action, dispatch: StorageDispatchLifecycleContext) => ({
  action: createReadonlyActionView(action),
  originalAction: createReadonlyActionView(dispatch.originalAction),
});

export type BucketRuntime<S extends MachineStore> = {
  prepareAction(action: Action, options: unknown, dispatch: StorageDispatchLifecycleContext): ActionStageOutcome;
  beforeReduce(action: Action, dispatch: StorageDispatchLifecycleContext): ActionStageOutcome;
  reduce(action: Action, dispatch: StorageDispatchLifecycleContext): MachinesState<S>;
  markExternallyChangedBuckets(
    prevState: Record<string, unknown>,
    nextState: Record<string, unknown>,
    dispatch: StorageDispatchLifecycleContext,
  ): void;
  commit(dispatch: StorageDispatchLifecycleContext): void;
  runReactions(action: Action, dispatch: StorageDispatchLifecycleContext): void;
  runEffects(dispatch: StorageDispatchLifecycleContext): void;
  condition(predicate: (action: Action) => boolean): Promise<boolean>;
};

export const createBucketRuntime = <S extends MachineStore>(
  buckets: readonly RuntimeBucket[],
  managerContext: ManagerRuntimeContext,
  resolveRoute: (action: Action) => StorageDispatchContext["route"],
  defaultStorageKind: string,
  runGuardedCallback: GuardedCallbackRunner,
): BucketRuntime<S> => ({
  prepareAction(action, options, dispatch) {
    let currentAction = action;
    for (const bucket of buckets) {
      const prepareAction = bucket.runtime.prepareAction;
      if (!prepareAction) continue;
      const source = `storage runtime '${bucket.runtime.kind}' prepareAction`;
      const result = assertStorageActionStageResult(
        source,
        runGuardedCallback("storage.prepareAction", () =>
          prepareAction({
            ...createStorageActionViews(currentAction, dispatch),
            options,
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        ),
      );
      if (result?.type === "drop") return { type: "drop" };
      if (result?.type !== "replace") continue;
      currentAction = result.action;
      dispatch.route = resolveRoute(currentAction);
    }
    return { type: "continue", action: currentAction };
  },

  beforeReduce(action, dispatch) {
    let currentAction = action;
    for (const bucket of buckets) {
      const beforeReduce = bucket.runtime.beforeReduce;
      if (!beforeReduce) continue;
      const source = `storage runtime '${bucket.runtime.kind}' beforeReduce`;
      const result = assertStorageActionStageResult(
        source,
        runGuardedCallback("storage.beforeReduce", () =>
          beforeReduce({
            ...createStorageActionViews(currentAction, dispatch),
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        ),
      );
      if (result?.type === "drop") return { type: "drop" };
      if (result?.type !== "replace") continue;
      currentAction = result.action;
      dispatch.route = resolveRoute(currentAction);
    }
    return { type: "continue", action: currentAction };
  },

  reduce(action, dispatch) {
    for (const bucket of buckets) {
      if (bucket.runtime.reduceScope === "bucket") {
        const reduceBucket = bucket.runtime.reduceBucket;
        const result = assertStorageReduceResult(
          `storage runtime '${bucket.runtime.kind}' reduceBucket`,
          runGuardedCallback("storage.reduceBucket", () =>
            reduceBucket({
              templates: bucket.templates,
              ...createStorageActionViews(action, dispatch),
              state: bucket.state,
              manager: managerContext,
              dispatch: dispatch.dispatch,
            }),
          ),
        );
        if (result?.type !== "skip") dispatch.touched.add(bucket.runtime.kind);
        continue;
      }

      const acceptsEvent = bucket.runtime.acceptsEvent;
      const reduce = bucket.runtime.reduce;
      for (const template of bucket.templates) {
        if (
          !assertStorageAcceptsEventResult(
            `storage runtime '${bucket.runtime.kind}' acceptsEvent`,
            runGuardedCallback("storage.acceptsEvent", () =>
              acceptsEvent({
                template,
                ...createStorageActionViews(action, dispatch),
                state: bucket.state,
                dispatch: dispatch.dispatch,
              }),
            ),
          )
        ) {
          continue;
        }
        const result = assertStorageReduceResult(
          `storage runtime '${bucket.runtime.kind}' reduce`,
          runGuardedCallback("storage.reduce", () =>
            reduce({
              template,
              ...createStorageActionViews(action, dispatch),
              state: bucket.state,
              manager: managerContext,
              dispatch: dispatch.dispatch,
            }),
          ),
        );
        if (result?.type !== "skip") dispatch.touched.add(bucket.runtime.kind);
      }
    }
    return dispatch.nextState as MachinesState<S>;
  },

  markExternallyChangedBuckets(prevState, nextState, dispatch) {
    for (const bucket of buckets) {
      if (dispatch.touched.has(bucket.runtime.kind)) continue;

      for (const template of bucket.templates) {
        if (prevState[template.key] === nextState[template.key]) continue;
        dispatch.touched.add(bucket.runtime.kind);
        break;
      }
    }
  },

  commit(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind)) continue;
      runGuardedCallback("storage.commit", () => {
        bucket.runtime.commit({
          ...createStorageActionViews(dispatch.action, dispatch),
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        });
      });
    }
  },

  runReactions(action, dispatch) {
    for (const bucket of buckets) {
      const reactions = bucket.runtime.reactions;
      if (!dispatch.touched.has(bucket.runtime.kind) || !reactions) continue;
      runGuardedCallback("storage.reactions", () => {
        reactions.run({
          ...createStorageActionViews(action, dispatch),
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        });
      });
    }
  },

  runEffects(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.effects) continue;
      for (const invocation of bucket.runtime.effects.resolveInvocations({
        ...createStorageActionViews(dispatch.action, dispatch),
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      })) {
        bucket.runtime.effects.invoke({
          invocation,
          ...createStorageActionViews(dispatch.action, dispatch),
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        });
      }
    }
  },

  // condition() обслуживается только default storage bucket: predicate intuitively
  // проверяет state центральных машин (instance), а plugin storage может объявлять
  // effects.condition для собственных внутренних целей — MiddlewareApi.condition его не вызывает.
  condition(predicate) {
    const bucket = buckets.find((entry) => entry.runtime.kind === defaultStorageKind);
    if (!bucket?.runtime.effects?.condition) return Promise.resolve(false);
    return bucket.runtime.effects.condition({
      predicate: (action) => predicate(createReadonlyActionView(action as Action) as Action),
      state: bucket.state,
      manager: managerContext,
    });
  },
});

export const initBucketState = <S extends MachineStore>(
  buckets: readonly RuntimeBucket[],
  bucketsByKind: ReadonlyMap<string, RuntimeBucket>,
  templates: readonly { readonly key: string; readonly kind: string }[],
  managerContext: ManagerRuntimeContext,
): MachinesState<S> => {
  for (const bucket of buckets) {
    bucket.state = bucket.runtime.createRuntimeState({ templates: bucket.templates, manager: managerContext });
  }

  return Object.fromEntries(
    templates.map((template) => {
      const bucket = bucketsByKind.get(template.kind);
      return [
        template.key,
        bucket?.runtime.createPublicInitialState({
          template,
          state: bucket.state,
        }),
      ];
    }),
  ) as MachinesState<S>;
};

export const groupTemplatesByRuntime = (
  templates: readonly { readonly key: string; readonly kind: string }[],
  registeredRuntimes: readonly { readonly kind: string; readonly runtime: RuntimeBucket["runtime"] }[],
): RuntimeBucket[] => {
  const buckets = new Map<string, RuntimeBucket>();

  for (const { kind, runtime } of registeredRuntimes) {
    buckets.set(kind, { runtime, templates: [], state: undefined });
  }

  for (const template of templates) {
    buckets.get(template.kind)?.templates.push(template as RuntimeBucket["templates"][number]);
  }

  return [...buckets.values()];
};
