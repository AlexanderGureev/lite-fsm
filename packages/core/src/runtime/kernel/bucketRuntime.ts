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
  type BucketStorageRuntime,
  type ManagerRuntimeContext,
  type StorageActionStageResult,
  type StorageBeforeReduceContext,
  type StorageDispatchContext,
  type StorageDispatchLifecycleContext,
  type StoragePrepareActionContext,
  type TemplateStorageRuntime,
} from "./storage";
import type { GuardedCallbackRunner } from "./transitionGuard";
import { createBucketTraceRunner, readTransitionTraceSession } from "./transitionTrace";

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
): BucketRuntime<S> => {
  // prepareAction и beforeReduce делят одну форму: пройти buckets, под guard/trace выполнить
  // optional stage-метод, применить его drop/replace к action и пересчитать route. Различаются
  // лишь именем метода (оно же trace phase, guard phase и source) и формой контекста.
  const runActionStage = <Ctx>(
    stage: "prepareAction" | "beforeReduce",
    action: Action,
    dispatch: StorageDispatchLifecycleContext,
    selectStage: (runtime: RuntimeBucket["runtime"]) => ((ctx: Ctx) => StorageActionStageResult) | undefined,
    buildContext: (bucket: RuntimeBucket, currentAction: Action) => Ctx,
  ): ActionStageOutcome => {
    const runBucketPhase = createBucketTraceRunner(readTransitionTraceSession(dispatch.dispatch));
    let currentAction = action;
    for (const bucket of buckets) {
      const run = selectStage(bucket.runtime);
      if (!run) continue;
      const runtimeKind = bucket.runtime.kind;
      const result = runBucketPhase(stage, runtimeKind, () =>
        assertStorageActionStageResult(
          `storage runtime '${runtimeKind}' ${stage}`,
          runGuardedCallback(`storage.${stage}`, () => run(buildContext(bucket, currentAction))),
        ),
      );
      if (result?.type === "drop") return { type: "drop" };
      if (result?.type !== "replace") continue;
      currentAction = result.action;
      dispatch.route = resolveRoute(currentAction);
    }
    return { type: "continue", action: currentAction };
  };

  const reduceBucketScope = (
    runtime: BucketStorageRuntime,
    bucket: RuntimeBucket,
    action: Action,
    dispatch: StorageDispatchLifecycleContext,
  ) => {
    const result = assertStorageReduceResult(
      `storage runtime '${runtime.kind}' reduceBucket`,
      runGuardedCallback("storage.reduceBucket", () =>
        runtime.reduceBucket({
          templates: bucket.templates,
          ...createStorageActionViews(action, dispatch),
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        }),
      ),
    );
    if (result?.type !== "skip") dispatch.touched.add(runtime.kind);
  };

  const reduceTemplateScope = (
    runtime: TemplateStorageRuntime,
    bucket: RuntimeBucket,
    action: Action,
    dispatch: StorageDispatchLifecycleContext,
  ) => {
    for (const template of bucket.templates) {
      const accepted = assertStorageAcceptsEventResult(
        `storage runtime '${runtime.kind}' acceptsEvent`,
        runGuardedCallback("storage.acceptsEvent", () =>
          runtime.acceptsEvent({
            template,
            ...createStorageActionViews(action, dispatch),
            state: bucket.state,
            dispatch: dispatch.dispatch,
          }),
        ),
      );
      if (!accepted) continue;
      const result = assertStorageReduceResult(
        `storage runtime '${runtime.kind}' reduce`,
        runGuardedCallback("storage.reduce", () =>
          runtime.reduce({
            template,
            ...createStorageActionViews(action, dispatch),
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        ),
      );
      if (result?.type !== "skip") dispatch.touched.add(runtime.kind);
    }
  };

  return {
    prepareAction(action, options, dispatch) {
      return runActionStage<StoragePrepareActionContext>(
        "prepareAction",
        action,
        dispatch,
        (runtime) => runtime.prepareAction,
        (bucket, currentAction) => ({
          ...createStorageActionViews(currentAction, dispatch),
          options,
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        }),
      );
    },

    beforeReduce(action, dispatch) {
      return runActionStage<StorageBeforeReduceContext>(
        "beforeReduce",
        action,
        dispatch,
        (runtime) => runtime.beforeReduce,
        (bucket, currentAction) => ({
          ...createStorageActionViews(currentAction, dispatch),
          state: bucket.state,
          manager: managerContext,
          dispatch: dispatch.dispatch,
        }),
      );
    },

    reduce(action, dispatch) {
      const runBucketPhase = createBucketTraceRunner(readTransitionTraceSession(dispatch.dispatch));
      for (const bucket of buckets) {
        const runtime = bucket.runtime;
        runBucketPhase("reduce", runtime.kind, () =>
          runtime.reduceScope === "bucket"
            ? reduceBucketScope(runtime, bucket, action, dispatch)
            : reduceTemplateScope(runtime, bucket, action, dispatch),
        );
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
      const runBucketPhase = createBucketTraceRunner(readTransitionTraceSession(dispatch.dispatch));
      for (const bucket of buckets) {
        if (!dispatch.touched.has(bucket.runtime.kind)) continue;
        runBucketPhase("commit", bucket.runtime.kind, () => {
          runGuardedCallback("storage.commit", () => {
            bucket.runtime.commit({
              ...createStorageActionViews(dispatch.action, dispatch),
              state: bucket.state,
              manager: managerContext,
              dispatch: dispatch.dispatch,
            });
          });
        });
      }
    },

    runReactions(action, dispatch) {
      const runBucketPhase = createBucketTraceRunner(readTransitionTraceSession(dispatch.dispatch));
      for (const bucket of buckets) {
        const reactions = bucket.runtime.reactions;
        if (!dispatch.touched.has(bucket.runtime.kind) || !reactions) continue;
        runBucketPhase("reactions", bucket.runtime.kind, () => {
          runGuardedCallback("storage.reactions", () => {
            reactions.run({
              ...createStorageActionViews(action, dispatch),
              state: bucket.state,
              manager: managerContext,
              dispatch: dispatch.dispatch,
            });
          });
        });
      }
    },

    runEffects(dispatch) {
      const runBucketPhase = createBucketTraceRunner(readTransitionTraceSession(dispatch.dispatch));
      for (const bucket of buckets) {
        const effects = bucket.runtime.effects;
        if (!dispatch.touched.has(bucket.runtime.kind) || !effects) continue;
        const runtimeKind = bucket.runtime.kind;
        const invocations = runBucketPhase("effects.resolve", runtimeKind, () =>
          effects.resolveInvocations({
            ...createStorageActionViews(dispatch.action, dispatch),
            state: bucket.state,
            manager: managerContext,
            dispatch: dispatch.dispatch,
          }),
        );
        runBucketPhase("effects.invoke", runtimeKind, () => {
          for (const invocation of invocations) {
            effects.invoke({
              invocation,
              ...createStorageActionViews(dispatch.action, dispatch),
              state: bucket.state,
              manager: managerContext,
              dispatch: dispatch.dispatch,
            });
          }
        });
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
  };
};

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
