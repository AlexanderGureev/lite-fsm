import type { ActionInterceptorResult } from "../../plugin";
import type { AnyEvent, ManagerAction } from "../../types";
import { isSystemAction, LiteFsmError } from "../../utils";
import type { StorageActionStageResult, StorageReduceResult } from "./storage";

type PlainRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const formatKnownFields = (fields: readonly string[]): string => fields.map((field) => `'${field}'`).join(", ");

const throwInvalidStorageCallbackResult = (source: string, expected: string): never => {
  throw new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
    `[lite-fsm] ${source} returned invalid callback result; expected ${expected}.`,
  );
};

const throwInvalidPluginCallbackResult = (source: string, expected: string): never => {
  throw new LiteFsmError(
    "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT",
    `[lite-fsm] ${source} returned invalid callback result; expected ${expected}.`,
  );
};

const assertKnownFields = (
  source: string,
  result: PlainRecord,
  fields: ReadonlySet<string>,
  throwInvalid: (source: string, expected: string) => never,
  expected: string,
) => {
  for (const field of Object.keys(result)) {
    if (fields.has(field)) continue;
    throwInvalid(source, expected);
  }
};

export const assertReplacementAction = (source: string, action: unknown): ManagerAction<AnyEvent> => {
  if (action === null || typeof action !== "object" || Array.isArray(action)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_REPLACEMENT_ACTION",
      `[lite-fsm] ${source} returned invalid replacement action; expected an object with string 'type'.`,
    );
  }

  if (typeof (action as { readonly type?: unknown }).type !== "string") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_REPLACEMENT_ACTION",
      `[lite-fsm] ${source} returned invalid replacement action; expected an object with string 'type'.`,
    );
  }

  if (isSystemAction(action as { readonly type?: unknown })) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_REPLACEMENT_ACTION",
      `[lite-fsm] ${source} returned reserved system replacement action '${(action as { readonly type: string }).type}'.`,
    );
  }

  return action as ManagerAction<AnyEvent>;
};

const storageActionStageFields = new Set(["type", "action"]);
const storageActionStageExpected = "undefined, { type: 'drop' }, or { type: 'replace', action }";

export const assertStorageActionStageResult = (
  source: string,
  result: unknown,
): StorageActionStageResult => {
  if (result === undefined) return undefined;
  if (!isPlainObject(result)) {
    return throwInvalidStorageCallbackResult(source, storageActionStageExpected);
  }

  assertKnownFields(
    source,
    result,
    storageActionStageFields,
    throwInvalidStorageCallbackResult,
    storageActionStageExpected,
  );

  if (result.type === "drop") {
    if ("action" in result) return throwInvalidStorageCallbackResult(source, storageActionStageExpected);
    return { type: "drop" };
  }

  if (result.type === "replace") {
    if (!("action" in result)) return throwInvalidStorageCallbackResult(source, storageActionStageExpected);
    return { type: "replace", action: assertReplacementAction(source, result.action) };
  }

  return throwInvalidStorageCallbackResult(source, storageActionStageExpected);
};

const storageReduceFields = new Set(["type"]);
const storageReduceExpected = "undefined or { type: 'skip' }";

export const assertStorageReduceResult = (source: string, result: unknown): StorageReduceResult => {
  if (result === undefined) return undefined;
  if (!isPlainObject(result)) {
    return throwInvalidStorageCallbackResult(source, storageReduceExpected);
  }

  assertKnownFields(source, result, storageReduceFields, throwInvalidStorageCallbackResult, storageReduceExpected);
  if (result.type === "skip") return { type: "skip" };

  return throwInvalidStorageCallbackResult(source, storageReduceExpected);
};

export const assertStorageAcceptsEventResult = (source: string, result: unknown): boolean => {
  if (typeof result === "boolean") return result;

  return throwInvalidStorageCallbackResult(source, "a boolean");
};

const pluginInterceptorFields = new Set(["action", "skipDelivery", "stopInterceptors"]);
const pluginInterceptorExpected = `undefined or a plain object with known fields ${formatKnownFields([
  "action",
  "skipDelivery",
  "stopInterceptors",
])}`;

export const assertPluginInterceptorResult = (
  source: string,
  result: unknown,
): ActionInterceptorResult => {
  if (result === undefined) return undefined;
  if (!isPlainObject(result)) {
    return throwInvalidPluginCallbackResult(source, pluginInterceptorExpected);
  }

  assertKnownFields(
    source,
    result,
    pluginInterceptorFields,
    throwInvalidPluginCallbackResult,
    pluginInterceptorExpected,
  );

  if ("skipDelivery" in result && typeof result.skipDelivery !== "boolean") {
    return throwInvalidPluginCallbackResult(source, pluginInterceptorExpected);
  }
  if ("stopInterceptors" in result && typeof result.stopInterceptors !== "boolean") {
    return throwInvalidPluginCallbackResult(source, pluginInterceptorExpected);
  }

  return {
    ...("action" in result && result.action !== undefined
      ? { action: assertReplacementAction(source, result.action) }
      : {}),
    ...("skipDelivery" in result ? { skipDelivery: result.skipDelivery as boolean } : {}),
    ...("stopInterceptors" in result ? { stopInterceptors: result.stopInterceptors as boolean } : {}),
  };
};

const compileTemplateFields = new Set(["data"]);
const compileTemplateExpected = "undefined or a plain object with the only public field 'data'";

export const assertPublicCompileTemplateResult = (source: string, result: unknown): void | { readonly data?: unknown } => {
  if (result === undefined) return undefined;
  if (!isPlainObject(result)) {
    return throwInvalidStorageCallbackResult(source, compileTemplateExpected);
  }

  assertKnownFields(source, result, compileTemplateFields, throwInvalidStorageCallbackResult, compileTemplateExpected);
  return result;
};
