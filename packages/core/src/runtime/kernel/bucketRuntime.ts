// Bucket-loop dispatch operations: prepare/reduce/commit/reactions/effects/condition по всем
// зарегистрированным storage runtime. Извлечено из createMachineManagerFactory, чтобы оставить
// в фабрике только pipeline-orchestration и lifecycle, а bucket-iteration жил в одном месте.

import type { AnyEvent, MachinesState, MachineStore, ManagerAction } from "../../types";
import { LiteFsmError } from "../../utils";
import type { RuntimeBucket } from "./snapshot";
import {
  type ManagerRuntimeContext,
  type StorageDispatchContext,
  type StorageDispatchLifecycleContext,
  type StorageReduceResult,
} from "./storage";

type Action = ManagerAction<AnyEvent>;
type ActionStageOutcome = { readonly type: "continue"; readonly action: Action } | { readonly type: "drop" };

const assertReduceResult = (runtimeKind: string, result: unknown): StorageReduceResult => {
  if (result === undefined) return result;
  if (typeof result === "object" && result !== null && (result as { readonly type?: unknown }).type === "skip") {
    return result as StorageReduceResult;
  }

  throw new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm] storage runtime '${runtimeKind}' returned invalid reduce result.`,
  );
};

export type BucketRuntime<S extends MachineStore> = {
  prepareAction(action: Action, options: unknown, dispatch: StorageDispatchLifecycleContext): ActionStageOutcome;
  beforeReduce(action: Action, dispatch: StorageDispatchLifecycleContext): ActionStageOutcome;
  reduce(action: Action, dispatch: StorageDispatchLifecycleContext): MachinesState<S>;
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
): BucketRuntime<S> => ({
  prepareAction(action, options, dispatch) {
    let currentAction = action;
    for (const bucket of buckets) {
      if (!bucket.runtime.prepareAction) continue;
      const result = bucket.runtime.prepareAction({
        action: currentAction,
        originalAction: dispatch.originalAction,
        options,
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      });
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
      if (!bucket.runtime.beforeReduce) continue;
      const result = bucket.runtime.beforeReduce({
        action: currentAction,
        originalAction: dispatch.originalAction,
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      });
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
        const result = assertReduceResult(
          bucket.runtime.kind,
          bucket.runtime.reduceBucket({
            templates: bucket.templates,
            action,
            originalAction: dispatch.originalAction,
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        );
        if (result?.type !== "skip") dispatch.touched.add(bucket.runtime.kind);
        continue;
      }

      for (const template of bucket.templates) {
        if (
          !bucket.runtime.acceptsEvent({
            template,
            action,
            originalAction: dispatch.originalAction,
            state: bucket.state,
            dispatch: dispatch.dispatch,
          })
        ) {
          continue;
        }
        const result = assertReduceResult(
          bucket.runtime.kind,
          bucket.runtime.reduce({
            template,
            action,
            originalAction: dispatch.originalAction,
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        );
        if (result?.type !== "skip") dispatch.touched.add(bucket.runtime.kind);
      }
    }
    return dispatch.nextState as MachinesState<S>;
  },

  commit(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind)) continue;
      bucket.runtime.commit({
        action: dispatch.action,
        originalAction: dispatch.originalAction,
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      });
    }
  },

  runReactions(action, dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.reactions) continue;
      bucket.runtime.reactions.run({
        action,
        originalAction: dispatch.originalAction,
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      });
    }
  },

  runEffects(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.effects) continue;
      for (const invocation of bucket.runtime.effects.resolveInvocations({
        action: dispatch.action,
        originalAction: dispatch.originalAction,
        state: bucket.state,
        manager: managerContext,
        dispatch: dispatch.dispatch,
      })) {
        bucket.runtime.effects.invoke({
          invocation,
          action: dispatch.action,
          originalAction: dispatch.originalAction,
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
      predicate,
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
