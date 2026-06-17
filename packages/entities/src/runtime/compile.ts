import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import { hasOwn } from "../internal";
import {
  isEntityResourceDescriptor,
  type EntityColumnSchema,
  type EntityContextSchema,
  type EntityResourceSchema,
  type EntitySpawnSchema,
} from "../schema";
import { ENTITY_DESPAWNED } from "./lifecycle";

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

export type EntityReducePlan = {
  readonly eventCode: number;
  readonly acceptStateCodes: readonly number[];
  readonly allDefaultTransitionsIdentity: boolean;
  readonly hasNonIdentityDefaultTransition: boolean;
  readonly mayEnterEffectState: boolean;
  readonly hasDespawnOnStates: boolean;
  readonly hasReaction: boolean;
  readonly mayEnterTerminalState: boolean;
  readonly requiresReducerCall: boolean;
};

export type EntityTemplateMetadata = {
  readonly templateKey: string;
  readonly config: Record<string, Record<string, string | null | undefined> | undefined>;
  readonly initialContext: EntityColumnSchema;
  readonly resourceSchema: EntityResourceSchema;
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
  readonly despawnLifecycleStateMask: Uint8Array;
  readonly effectsByStateCode: readonly (EntityActorEffect | undefined)[];
  readonly reactionsByEventType: Readonly<Record<string, EntityActorReaction>>;
  readonly reactionsByEventCode: readonly (EntityActorReaction | undefined)[];
  readonly reducePlansByEventCode: readonly EntityReducePlan[];
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

const configError = (templateKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${templateKey}' has invalid storage: "entity" config: ${reason}.`,
  );

const splitEntityContextSchema = (
  schema: EntityContextSchema,
): { readonly initialContext: EntityColumnSchema; readonly resourceSchema: EntityResourceSchema } => {
  const initialContext = Object.create(null) as Record<string, EntityColumnSchema[string]>;
  const resourceSchema = Object.create(null) as Record<string, EntityResourceSchema[string]>;

  for (const [name, descriptor] of Object.entries(schema)) {
    if (isEntityResourceDescriptor(descriptor)) {
      resourceSchema[name] = descriptor;
      continue;
    }

    initialContext[name] = descriptor;
  }

  return { initialContext, resourceSchema };
};

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

export const isTerminalStateCode = (code: number): boolean =>
  code === ENTITY_RESOLVED_STATE_CODE || code === ENTITY_REJECTED_STATE_CODE || code === ENTITY_CANCELLED_STATE_CODE;

export const hasDespawnOnStates = (despawnStateMask: Uint8Array): boolean => {
  for (let stateCode = 0; stateCode < despawnStateMask.length; stateCode += 1) {
    if (despawnStateMask[stateCode] === 1) return true;
  }
  return false;
};

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
  const contextSchema = splitEntityContextSchema(machine.initialContext);

  return {
    templateKey,
    config,
    initialContext: contextSchema.initialContext,
    resourceSchema: contextSchema.resourceSchema,
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
    despawnLifecycleStateMask: new Uint8Array(publicStates.length + 1),
    effectsByStateCode: compileEffectsByStateCode(templateKey, stateCodeByName, machine.effects),
    reactionsByEventType: compileReactionsByEventType(templateKey, eventTypes, machine.reactions),
    reactionsByEventCode: [],
    reducePlansByEventCode: [],
    ...(typeof machine.reducer === "function" ? { reducer: machine.reducer as EntityActorReducer } : {}),
  };
};

const compileDespawnLifecycleStateMask = (
  metadata: EntityTemplateMetadata,
  eventCodeByType: Readonly<Record<string, number>>,
  transitionTable: Int16Array,
): Uint8Array => {
  const mask = new Uint8Array(metadata.stateSlotCount);
  const eventCode = eventCodeByType[ENTITY_DESPAWNED];
  if (eventCode === undefined) return mask;
  if (!metadata.reducer && !hasOwn(metadata.reactionsByEventType, ENTITY_DESPAWNED)) return mask;

  const offset = eventCode * metadata.stateSlotCount;
  for (let stateSlot = 0; stateSlot < metadata.stateSlotCount; stateSlot += 1) {
    if (transitionTable[offset + stateSlot] !== ENTITY_NO_TRANSITION) mask[stateSlot] = 1;
  }

  return mask;
};

const compileReducePlan = (
  metadata: EntityTemplateMetadata,
  eventCode: number,
  transitionTable: Int16Array,
  acceptStateCodes: readonly number[],
  hasReaction: boolean,
  templateHasDespawnOnStates: boolean,
): EntityReducePlan => {
  let allDefaultTransitionsIdentity = true;
  let hasNonIdentityDefaultTransition = false;
  let mayEnterEffectState = false;
  let mayEnterTerminalState = false;
  const offset = eventCode * metadata.stateSlotCount;

  for (const sourceCode of acceptStateCodes) {
    const targetCode = transitionTable[offset + stateSlotForCode(sourceCode)];

    if (targetCode !== sourceCode) {
      allDefaultTransitionsIdentity = false;
      hasNonIdentityDefaultTransition = true;
    }
    if (targetCode >= 0 && targetCode !== sourceCode && metadata.effectsByStateCode[targetCode]) {
      mayEnterEffectState = true;
    }
    if (isTerminalStateCode(targetCode)) mayEnterTerminalState = true;
  }

  return {
    eventCode,
    acceptStateCodes,
    allDefaultTransitionsIdentity,
    hasNonIdentityDefaultTransition,
    mayEnterEffectState,
    hasDespawnOnStates: templateHasDespawnOnStates,
    hasReaction,
    mayEnterTerminalState,
    requiresReducerCall: metadata.reducer !== undefined,
  };
};

const compileReducePlansByEventCode = (
  metadata: EntityTemplateMetadata,
  eventCount: number,
  transitionTable: Int16Array,
  acceptStateCodesByEventCode: readonly (readonly number[])[],
  reactionsByEventCode: readonly (EntityActorReaction | undefined)[],
): readonly EntityReducePlan[] => {
  const templateHasDespawnOnStates = hasDespawnOnStates(metadata.despawnStateMask);
  const plans: EntityReducePlan[] = [];

  for (let eventCode = 0; eventCode < eventCount; eventCode += 1) {
    plans[eventCode] = compileReducePlan(
      metadata,
      eventCode,
      transitionTable,
      acceptStateCodesByEventCode[eventCode],
      reactionsByEventCode[eventCode] !== undefined,
      templateHasDespawnOnStates,
    );
  }

  return plans;
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
    despawnLifecycleStateMask: compileDespawnLifecycleStateMask(metadata, eventCodeByType, transitionTable),
    reactionsByEventCode,
    reducePlansByEventCode: compileReducePlansByEventCode(
      metadata,
      eventCount,
      transitionTable,
      acceptStateCodesByEventCode,
      reactionsByEventCode,
    ),
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
