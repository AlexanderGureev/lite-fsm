// `compose(f, g, h)(x) === f(g(h(x)))`. Поддерживает и обычную, и middleware-стиль композицию.
export function compose(): <T>(x: T) => T;
export function compose<A, R>(f1: (a: A) => R): (a: A) => R;
export function compose<A, B, R>(f1: (b: B) => R, f2: (a: A) => B): (a: A) => R;
export function compose<A, B, C, R>(f1: (c: C) => R, f2: (b: B) => C, f3: (a: A) => B): (a: A) => R;
export function compose<A, B, C, D, R>(f1: (d: D) => R, f2: (c: C) => D, f3: (b: B) => C, f4: (a: A) => B): (a: A) => R;
export function compose<A, B, C, D, E, R>(
  f1: (e: E) => R,
  f2: (d: D) => E,
  f3: (c: C) => D,
  f4: (b: B) => C,
  f5: (a: A) => B,
): (a: A) => R;

// Overload для middleware-композиции.
export function compose<T, R = T>(
  ...fns: Array<(next: (action: T) => R) => (action: T) => R>
): (next: (action: T) => R) => (action: T) => R;

export function compose(...fns: Array<(...args: any[]) => any>) {
  if (fns.length === 0) {
    return <T>(x: T) => x;
  }

  return fns.reduce(
    (a, b) =>
      (...args: any[]) =>
        a(b(...args)),
  );
}

export const WILDCARD = "*";
export const LITE_FSM_SYSTEM_ACTION_PREFIX = "@@lite-fsm/";
export const HYDRATE_ACTION_TYPE = "@@lite-fsm/HYDRATE";
export const VOID_REDUCER_MIDDLEWARE_MARKER = "__liteFsmAllowVoidReducer";
export const VOID_REDUCER_ERROR =
  "Reducer returned undefined. Return the next state, or use immerMiddleware to mutate draft state without return.";

// Middleware декларирует поддержку void-reducer статическим маркером (см. `immerMiddleware`).
export const supportsVoidReducer = (middleware: unknown): boolean =>
  typeof middleware === "function" && VOID_REDUCER_MIDDLEWARE_MARKER in middleware;

export type LiteFsmErrorCode =
  | "LITE_FSM_ACTOR_DISPOSED"
  | "LITE_FSM_INVALID_ACTOR_CONFIG"
  | "LITE_FSM_INVALID_ACTOR_SLICE"
  | "LITE_FSM_INVALID_GENERATED_ID"
  | "LITE_FSM_INVALID_HYDRATION_ENVELOPE"
  | "LITE_FSM_INVALID_OPTIONS"
  | "LITE_FSM_STANDALONE_ACTOR_TEMPLATE";

export class LiteFsmError extends Error {
  constructor(
    public readonly code: LiteFsmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LiteFsmError";
  }
}

export const validateGeneratedId = (id: unknown, kind: "actor" | "group"): string => {
  if (typeof id !== "string" || id.length === 0) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_GENERATED_ID",
      `[lite-fsm] generate${kind === "actor" ? "Actor" : "Group"}Id must return a non-empty string.`,
    );
  }
  return id;
};

export const isSystemAction = (action: { type?: unknown }): action is { type: `${typeof LITE_FSM_SYSTEM_ACTION_PREFIX}${string}` } =>
  typeof action.type === "string" && action.type.startsWith(LITE_FSM_SYSTEM_ACTION_PREFIX);

/* v8 ignore next 2 */
export const IS_DEV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

export const deepFreeze = <T>(obj: T): T => {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(Reflect.get(obj, key));
  }
  return obj;
};
