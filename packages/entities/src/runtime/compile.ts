import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import type { EntityContextSchema, EntitySpawnSchema } from "../schema";

export const ENTITY_INIT_STATE = "__INIT";
export const ENTITY_INIT_STATE_CODE = -1;
export const ENTITY_RESOLVED_STATE_CODE = -2;
export const ENTITY_REJECTED_STATE_CODE = -3;
export const ENTITY_CANCELLED_STATE_CODE = -4;
export const ENTITY_NO_TRANSITION = -32768;
export const ENTITY_INVALID_TRANSITION_TARGET = -32767;

type EntityActorReducer = (
  state: { readonly state: string; readonly context: Record<string, unknown> },
  action: ManagerAction<AnyEvent>,
  meta: Record<string, unknown>,
) => unknown;

export type EntityActorEffect = (deps: Record<string, unknown>) => unknown;
export type EntityActorReaction = (deps: Record<string, unknown>) => unknown;

export type EntityTemplateMetadata = {
  readonly templateKey: string;
  readonly config: Record<string, Record<string, string | null | undefined> | undefined>;
  readonly initialContext: EntityContextSchema;
  readonly spawnSchema: EntitySpawnSchema;
  readonly publicStates: readonly string[];
  readonly stateCodeByName: Readonly<Record<string, number>>;
  readonly eventTypes: readonly string[];
  readonly eventAcceptMask: Uint8Array;
  readonly transitionTable: Int16Array;
  readonly transitionTargetByCell: Readonly<Record<number, string>>;
  readonly acceptStateCodesByEventCode: readonly (readonly number[])[];
  readonly stateSlotCount: number;
  readonly despawnStateMask: Uint8Array;
  readonly effectsByStateCode: readonly (EntityActorEffect | undefined)[];
  readonly reactionsByEventType: Readonly<Record<string, EntityActorReaction>>;
  readonly reactionsByEventCode: readonly (EntityActorReaction | undefined)[];
  readonly reducer?: EntityActorReducer;
};

export type EntityCompiledRuntimeMetadata = {
  readonly eventCodeByType: Readonly<Record<string, number>>;
  readonly eventTypesByCode: readonly string[];
  readonly metadataByKey: Readonly<Record<string, EntityTemplateMetadata>>;
};

const nonPublicStateNames = new Set(["__INIT", "__RESOLVED", "__REJECTED", "__CANCELLED", "*"]);
const specialDespawnStateNames = new Set(["__INIT", "__RESOLVED", "__REJECTED", "__CANCELLED"]);
const terminalStateCodeByName: Readonly<Record<string, number>> = {
  __RESOLVED: ENTITY_RESOLVED_STATE_CODE,
  __REJECTED: ENTITY_REJECTED_STATE_CODE,
  __CANCELLED: ENTITY_CANCELLED_STATE_CODE,
};
const terminalStateNameByCode: Readonly<Record<number, string>> = {
  [ENTITY_RESOLVED_STATE_CODE]: "__RESOLVED",
  [ENTITY_REJECTED_STATE_CODE]: "__REJECTED",
  [ENTITY_CANCELLED_STATE_CODE]: "__CANCELLED",
};

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const configError = (templateKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${templateKey}' has invalid storage: "entity" config: ${reason}.`,
  );

const getSourceStateCode = (
  metadata: Pick<EntityTemplateMetadata, "stateCodeByName">,
  state: string,
): number | undefined => {
  if (state === ENTITY_INIT_STATE) return ENTITY_INIT_STATE_CODE;
  return metadata.stateCodeByName[state];
};

const getTargetStateCode = (
  metadata: Pick<EntityTemplateMetadata, "stateCodeByName">,
  state: string,
): number | undefined => {
  if (state === ENTITY_INIT_STATE) return ENTITY_INIT_STATE_CODE;
  return terminalStateCodeByName[state] ?? metadata.stateCodeByName[state];
};

const stateSlotForCode = (code: number): number => code + 1;

const collectTemplateEventTypes = (
  config: Record<string, Record<string, string | null | undefined> | undefined>,
): readonly string[] => {
  const eventTypes: string[] = [];
  const seen = new Set<string>();

  for (const transitions of Object.values(config)) {
    if (!transitions) continue;
    for (const eventType of Object.keys(transitions)) {
      if (seen.has(eventType)) continue;
      seen.add(eventType);
      eventTypes.push(eventType);
    }
  }

  return eventTypes;
};

const normalizeDespawnOn = (templateKey: string, value: unknown): readonly string[] => {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((state) => typeof state === "string")) return value;

  throw configError(templateKey, "despawnOn must be a state name or a readonly array of state names");
};

const compileDespawnStateMask = (
  templateKey: string,
  config: Record<string, unknown>,
  stateCodeByName: Readonly<Record<string, number>>,
  value: unknown,
): Uint8Array => {
  const mask = new Uint8Array(Object.keys(stateCodeByName).length);

  for (const state of normalizeDespawnOn(templateKey, value)) {
    if (specialDespawnStateNames.has(state)) {
      throw configError(templateKey, `despawnOn cannot reference special state '${state}'`);
    }
    if (!hasOwn(config, state)) {
      throw configError(templateKey, `despawnOn references unknown state '${state}'`);
    }

    const stateCode = stateCodeByName[state];
    if (stateCode === undefined) {
      throw configError(templateKey, `despawnOn references non-public state '${state}'`);
    }

    mask[stateCode] = 1;
  }

  return mask;
};

const compileEffectsByStateCode = (
  templateKey: string,
  stateCodeByName: Readonly<Record<string, number>>,
  value: unknown,
): readonly (EntityActorEffect | undefined)[] => {
  const effectsByStateCode: Array<EntityActorEffect | undefined> = Array.from({
    length: Object.keys(stateCodeByName).length,
  });
  if (value === undefined) return effectsByStateCode;

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw configError(templateKey, "effects must be a plain object keyed by public state names");
  }

  for (const [state, effect] of Object.entries(value)) {
    if (state === "*") {
      throw configError(templateKey, 'wildcard "*" effects are not supported for storage: "entity"');
    }
    if (!hasOwn(stateCodeByName, state)) {
      throw configError(templateKey, `effects references unknown public state '${state}'`);
    }
    if (typeof effect !== "function") {
      throw configError(templateKey, `effect for state '${state}' must be a function`);
    }

    effectsByStateCode[stateCodeByName[state]] = effect as EntityActorEffect;
  }

  return effectsByStateCode;
};

const compileReactionsByEventType = (
  templateKey: string,
  eventTypes: readonly string[],
  value: unknown,
): Readonly<Record<string, EntityActorReaction>> => {
  const reactionsByEventType = Object.create(null) as Record<string, EntityActorReaction>;
  if (value === undefined) return reactionsByEventType;

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw configError(templateKey, "reactions must be a plain object keyed by event names");
  }

  const knownEvents = new Set(eventTypes);
  for (const [eventType, reaction] of Object.entries(value)) {
    if (!knownEvents.has(eventType)) {
      throw configError(templateKey, `reactions references event '${eventType}' that is not accepted by config`);
    }
    if (typeof reaction !== "function") {
      throw configError(templateKey, `reaction for event '${eventType}' must be a function`);
    }

    reactionsByEventType[eventType] = reaction as EntityActorReaction;
  }

  return reactionsByEventType;
};

export const compileEntityTemplate = (
  templateKey: string,
  machine: {
    readonly config: object;
    readonly initialContext: EntityContextSchema;
    readonly spawnSchema: EntitySpawnSchema;
    readonly despawnOn?: unknown;
    readonly effects?: unknown;
    readonly reactions?: unknown;
    readonly reducer?: unknown;
  },
): EntityTemplateMetadata => {
  const config = machine.config as Record<string, Record<string, string | null | undefined> | undefined>;
  const publicStates = Object.keys(config).filter((state) => !nonPublicStateNames.has(state));
  const stateCodeByName = Object.fromEntries(publicStates.map((state, index) => [state, index]));
  const eventTypes = collectTemplateEventTypes(config);

  return {
    templateKey,
    config,
    initialContext: machine.initialContext,
    spawnSchema: machine.spawnSchema,
    publicStates,
    stateCodeByName,
    eventTypes,
    eventAcceptMask: new Uint8Array(0),
    transitionTable: new Int16Array(0),
    transitionTargetByCell: Object.create(null) as Record<number, string>,
    acceptStateCodesByEventCode: [],
    stateSlotCount: publicStates.length + 1,
    despawnStateMask: compileDespawnStateMask(templateKey, config, stateCodeByName, machine.despawnOn),
    effectsByStateCode: compileEffectsByStateCode(templateKey, stateCodeByName, machine.effects),
    reactionsByEventType: compileReactionsByEventType(templateKey, eventTypes, machine.reactions),
    reactionsByEventCode: [],
    ...(typeof machine.reducer === "function" ? { reducer: machine.reducer as EntityActorReducer } : {}),
  };
};

const compileTemplateWithEventCodes = (
  metadata: EntityTemplateMetadata,
  eventCodeByType: Readonly<Record<string, number>>,
  eventCount: number,
): EntityTemplateMetadata => {
  const eventAcceptMask = new Uint8Array(eventCount);
  const transitionTable = new Int16Array(eventCount * metadata.stateSlotCount);
  transitionTable.fill(ENTITY_NO_TRANSITION);
  const transitionTargetByCell = Object.create(null) as Record<number, string>;
  const acceptStateCodesByEventCode = Array.from({ length: eventCount }, () => [] as number[]);
  const reactionsByEventCode: Array<EntityActorReaction | undefined> = Array.from({ length: eventCount });

  for (const [sourceState, transitions] of Object.entries(metadata.config)) {
    if (!transitions) continue;

    const sourceCode = getSourceStateCode(metadata, sourceState);
    if (sourceCode === undefined) continue;

    for (const [eventType, target] of Object.entries(transitions)) {
      const eventCode = eventCodeByType[eventType];
      if (eventCode === undefined) continue;

      const targetState = target === null || target === undefined ? sourceState : target;
      const targetCode = getTargetStateCode(metadata, targetState);
      const cell = eventCode * metadata.stateSlotCount + stateSlotForCode(sourceCode);
      eventAcceptMask[eventCode] = 1;
      acceptStateCodesByEventCode[eventCode].push(sourceCode);

      if (targetCode === undefined) {
        transitionTable[cell] = ENTITY_INVALID_TRANSITION_TARGET;
        transitionTargetByCell[cell] = targetState;
        continue;
      }

      transitionTable[cell] = targetCode;
    }
  }

  for (const [eventType, reaction] of Object.entries(metadata.reactionsByEventType)) {
    const eventCode = eventCodeByType[eventType];
    /* v8 ignore next -- reactions are validated against template eventTypes before global event codes are built. */
    if (eventCode !== undefined) reactionsByEventCode[eventCode] = reaction;
  }

  return {
    ...metadata,
    eventAcceptMask,
    transitionTable,
    transitionTargetByCell,
    acceptStateCodesByEventCode,
    reactionsByEventCode,
  };
};

export const compileEntityRuntimeMetadata = (
  templates: readonly EntityTemplateMetadata[],
): EntityCompiledRuntimeMetadata => {
  const eventCodeByType = Object.create(null) as Record<string, number>;
  const eventTypesByCode: string[] = [];

  for (const template of templates) {
    for (const eventType of template.eventTypes) {
      if (hasOwn(eventCodeByType, eventType)) continue;
      eventCodeByType[eventType] = eventTypesByCode.length;
      eventTypesByCode.push(eventType);
    }
  }

  const metadataByKey = Object.create(null) as Record<string, EntityTemplateMetadata>;
  for (const template of templates) {
    metadataByKey[template.templateKey] = compileTemplateWithEventCodes(
      template,
      eventCodeByType,
      eventTypesByCode.length,
    );
  }

  return { eventCodeByType, eventTypesByCode, metadataByKey };
};

export const getEntityStateName = (metadata: EntityTemplateMetadata, code: number): string | undefined => {
  if (code === ENTITY_INIT_STATE_CODE) return ENTITY_INIT_STATE;
  if (code < ENTITY_INIT_STATE_CODE) return terminalStateNameByCode[code];
  return metadata.publicStates[code];
};

export const getEntityStateCode = (metadata: EntityTemplateMetadata, state: string): number | undefined =>
  getTargetStateCode(metadata, state);
