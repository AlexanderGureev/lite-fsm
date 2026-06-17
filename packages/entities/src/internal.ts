import { LiteFsmError } from "@lite-fsm/core";

export const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export const isDev = (): boolean =>
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

export const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);
