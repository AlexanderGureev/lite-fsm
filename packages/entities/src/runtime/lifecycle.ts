import { LiteFsmError } from "@lite-fsm/core";

export type LiteFsmEntityLifecycleEvents =
  | { readonly type: "ENTITY_SPAWNED" }
  | { readonly type: "ENTITY_DESPAWNED" };

export const ENTITY_SPAWNED: LiteFsmEntityLifecycleEvents["type"] = "ENTITY_SPAWNED";
export const ENTITY_DESPAWNED: LiteFsmEntityLifecycleEvents["type"] = "ENTITY_DESPAWNED";

const lifecycleEventTypes = new Set<string>([ENTITY_SPAWNED, ENTITY_DESPAWNED]);

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isObjectMap = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

const lifecycleConfigError = (machineKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' has invalid storage: "entity" config: ${reason}.`,
  );

export const isEntityLifecycleEventType = (
  eventType: string,
): eventType is LiteFsmEntityLifecycleEvents["type"] => lifecycleEventTypes.has(eventType);

export const assertPublicEntityLifecycleDispatch = (eventType: string): void => {
  if (!isEntityLifecycleEventType(eventType)) return;

  throw new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm/entities] public dispatch of internal entity lifecycle event '${eventType}' is not allowed.`,
  );
};

export const assertEntityInitLifecycleConfig = (machineKey: string, config: unknown): void => {
  if (!isObjectMap(config)) {
    throw lifecycleConfigError(machineKey, "config must be a plain object");
  }

  if (!hasOwn(config, "__INIT")) {
    throw lifecycleConfigError(machineKey, "config.__INIT must be a transition map");
  }

  const initTransitions = (config as Record<string, unknown>).__INIT;
  if (!isObjectMap(initTransitions)) {
    throw lifecycleConfigError(machineKey, "config.__INIT must be a transition map");
  }

  for (const eventType of Object.keys(initTransitions)) {
    if (eventType === ENTITY_SPAWNED) continue;
    throw lifecycleConfigError(
      machineKey,
      `custom event edge '${eventType}' from __INIT is not allowed; use '${ENTITY_SPAWNED}'`,
    );
  }
};
