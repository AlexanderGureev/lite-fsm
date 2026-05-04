// Общие фикстуры для тестов actor MachineManager.
// Сьюты routing, lifecycle и middleware переиспользуют один и тот же шаблон likeSync.

import type { AnyEvent, FSMEvent, GenericMiddleware, MachineConfig, MiddlewareApi } from "../../src/core/types";

export type LikeConfig = {
  __INIT: { LIKE: "PENDING" };
  PENDING: { BUMP: null; OK: "__RESOLVED" };
  "*": { CANCEL: "__CANCELLED" };
};

export type LikeEvent =
  | FSMEvent<"LIKE", { id: string }>
  | FSMEvent<"BUMP">
  | FSMEvent<"OK">
  | FSMEvent<"CANCEL">
  | FSMEvent<"PING">
  | FSMEvent<"DOMAIN">;

export type LikeSyncContext = { id: string; count: number };
export type LikeSyncTemplate = MachineConfig<LikeConfig, LikeSyncContext, LikeEvent>;

const likeReducer: LikeSyncTemplate["reducer"] = (state, action, meta) => {
  if (action.type === "LIKE") {
    return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
  }
  if (action.type === "BUMP") {
    return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
  }
  return { state: meta.nextState, context: state.context };
};

export const createLikeSync = (): LikeSyncTemplate => ({
  config: {
    __INIT: { LIKE: "PENDING" },
    PENDING: { BUMP: null, OK: "__RESOLVED" },
    "*": { CANCEL: "__CANCELLED" },
  },
  initialState: "__INIT",
  initialContext: { id: "", count: 0 },
  reducer: likeReducer,
});

export type SnapshotLikeSyncTemplate = MachineConfig<LikeConfig, LikeSyncContext, LikeEvent, {}, any> & {
  persistence: "snapshot";
};

export const createSnapshotLikeSync = (
  overrides: Partial<SnapshotLikeSyncTemplate> = {},
): SnapshotLikeSyncTemplate =>
  ({
    config: {
      __INIT: { LIKE: "PENDING" },
      PENDING: { BUMP: null, OK: "__RESOLVED" },
      "*": { CANCEL: "__CANCELLED" },
    },
    initialState: "__INIT",
    initialContext: { id: "", count: 0 },
    persistence: "snapshot",
    reducer: likeReducer,
    ...overrides,
  }) as SnapshotLikeSyncTemplate;

// Общая фабрика middleware, используемая тестами replacement-reconcile.
// Делает trusted root replacement через replaceReducer + transition.
export type LikeStateLike = { likeSync: Record<string, unknown>; otherSync?: Record<string, unknown> };
export type ReplacingMiddleware = GenericMiddleware & {
  replace: (action?: AnyEvent) => void;
};

export const createReplacingMiddleware = (
  triggerType: LikeEvent["type"],
  mutate: (next: LikeStateLike) => LikeStateLike,
): ReplacingMiddleware => {
  let api: MiddlewareApi<LikeStateLike, LikeEvent> | undefined;

  const middleware = ((middlewareApi: MiddlewareApi<LikeStateLike, LikeEvent>) => {
    api = middlewareApi;
    middlewareApi.replaceReducer((reducer) => (state, action) => {
      const next = reducer(state, action);
      return action.type === triggerType ? (mutate(next as LikeStateLike) as typeof state) : next;
    });
    return (next: (action: AnyEvent) => AnyEvent) => (action: AnyEvent) => next(action);
  }) as unknown as ReplacingMiddleware;

  middleware.replace = (action = { type: triggerType }) => {
    if (!api) throw new Error("replaceReducer middleware api is not initialized.");
    api.transition(action as LikeEvent);
  };

  return middleware;
};
