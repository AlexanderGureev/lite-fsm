// Bucket-loop dispatch operations: prepare/reduce/commit/reactions/effects/condition по всем
// зарегистрированным storage runtime. Извлечено из createMachineManagerFactory, чтобы оставить
// в фабрике только pipeline-orchestration и lifecycle, а bucket-iteration жил в одном месте.

import type { AnyEvent, MachinesState, MachineStore, ManagerAction } from "../../types";
import type { RuntimeBucket } from "./snapshot";
import {
  type ManagerRuntimeContext,
  STORAGE_ACTION_DROP,
  type StorageDispatchContext,
  type StoragePrepareActionResult,
} from "./storage";

type Action = ManagerAction<AnyEvent>;

export type BucketRuntime<S extends MachineStore> = {
  prepareAction(action: Action, options: unknown, dispatch: StorageDispatchContext): StoragePrepareActionResult;
  beginReduce(action: Action, dispatch: StorageDispatchContext): void;
  reduce(action: Action, dispatch: StorageDispatchContext): MachinesState<S>;
  commit(dispatch: StorageDispatchContext): void;
  runReactions(action: Action, dispatch: StorageDispatchContext): void;
  runEffects(dispatch: StorageDispatchContext): void;
  condition(predicate: (action: Action) => boolean): Promise<boolean>;
};

export const createBucketRuntime = <S extends MachineStore>(
  buckets: readonly RuntimeBucket[],
  managerContext: ManagerRuntimeContext,
  resolveRoute: (action: Action) => StorageDispatchContext["route"],
  defaultStorageKind: string,
): BucketRuntime<S> => ({
  prepareAction(action, options, dispatch) {
    let prepared = action;
    for (const bucket of buckets) {
      if (!bucket.runtime.prepareAction) continue;
      const result = bucket.runtime.prepareAction({
        action: prepared,
        options,
        state: bucket.state,
        manager: managerContext,
        dispatch,
      });
      if (result === STORAGE_ACTION_DROP) return STORAGE_ACTION_DROP;
      prepared = result;
      dispatch.preparedAction = prepared;
      dispatch.route = resolveRoute(prepared);
    }
    return prepared;
  },

  beginReduce(action, dispatch) {
    for (const bucket of buckets) {
      if (!bucket.runtime.beginReduce) continue;
      const result = bucket.runtime.beginReduce({
        action,
        state: bucket.state,
        manager: managerContext,
        dispatch,
      });
      if (result !== false) dispatch.touched.add(bucket.runtime.kind);
    }
  },

  reduce(action, dispatch) {
    for (const bucket of buckets) {
      for (const template of bucket.templates) {
        if (!bucket.runtime.acceptsEvent({ template, action, state: bucket.state, dispatch })) continue;
        const result = bucket.runtime.reduce({
          template,
          action,
          state: bucket.state,
          manager: managerContext,
          dispatch,
        });
        if (result !== false) dispatch.touched.add(bucket.runtime.kind);
      }
    }
    return dispatch.nextState as MachinesState<S>;
  },

  commit(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind)) continue;
      bucket.runtime.commit({ state: bucket.state, manager: managerContext, dispatch });
    }
  },

  runReactions(action, dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.reactions) continue;
      bucket.runtime.reactions.run({ action, state: bucket.state, manager: managerContext, dispatch });
    }
  },

  runEffects(dispatch) {
    for (const bucket of buckets) {
      if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.effects) continue;
      for (const invocation of bucket.runtime.effects.resolveInvocations({
        state: bucket.state,
        manager: managerContext,
        dispatch,
      })) {
        bucket.runtime.effects.invoke({ invocation, state: bucket.state, manager: managerContext, dispatch });
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
