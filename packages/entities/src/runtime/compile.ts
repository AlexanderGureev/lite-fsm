import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import type { EntityContextSchema, EntitySpawnSchema } from "../schema";

export const ENTITY_INIT_STATE = "__INIT";
export const ENTITY_INIT_STATE_CODE = -1;
export const ENTITY_NO_TRANSITION = -32768;
export const ENTITY_INVALID_TRANSITION_TARGET = -32767;

type EntityActorReducer = (
  state: { readonly state: string; readonly context: Record<string, unknown> },
  action: ManagerAction<AnyEvent>,
  meta: Record<string, unknown>,
) => unknown;

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
  readonly reducer?: EntityActorReducer;
};

export type EntityCompiledRuntimeMetadata = {
  readonly eventCodeByType: Readonly<Record<string, number>>;
  readonly eventTypesByCode: readonly string[];
  readonly metadataByKey: Readonly<Record<string, EntityTemplateMetadata>>;
};

const nonPublicStateNames = new Set(["__INIT", "__RESOLVED", "__REJECTED", "__CANCELLED", "*"]);

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const getStateCode = (metadata: Pick<EntityTemplateMetadata, "stateCodeByName">, state: string): number | undefined => {
  if (state === ENTITY_INIT_STATE) return ENTITY_INIT_STATE_CODE;
  return metadata.stateCodeByName[state];
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

export const compileEntityTemplate = (
  templateKey: string,
  machine: {
    readonly config: object;
    readonly initialContext: EntityContextSchema;
    readonly spawnSchema: EntitySpawnSchema;
    readonly reducer?: unknown;
  },
): EntityTemplateMetadata => {
  const config = machine.config as Record<string, Record<string, string | null | undefined> | undefined>;
  const publicStates = Object.keys(config).filter((state) => !nonPublicStateNames.has(state));
  const stateCodeByName = Object.fromEntries(publicStates.map((state, index) => [state, index]));

  return {
    templateKey,
    config,
    initialContext: machine.initialContext,
    spawnSchema: machine.spawnSchema,
    publicStates,
    stateCodeByName,
    eventTypes: collectTemplateEventTypes(config),
    eventAcceptMask: new Uint8Array(0),
    transitionTable: new Int16Array(0),
    transitionTargetByCell: Object.create(null) as Record<number, string>,
    acceptStateCodesByEventCode: [],
    stateSlotCount: publicStates.length + 1,
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

  for (const [sourceState, transitions] of Object.entries(metadata.config)) {
    if (!transitions) continue;

    const sourceCode = getStateCode(metadata, sourceState);
    if (sourceCode === undefined) continue;

    for (const [eventType, target] of Object.entries(transitions)) {
      const eventCode = eventCodeByType[eventType];
      if (eventCode === undefined) continue;

      const targetState = target === null || target === undefined ? sourceState : target;
      const targetCode = getStateCode(metadata, targetState);
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

  return {
    ...metadata,
    eventAcceptMask,
    transitionTable,
    transitionTargetByCell,
    acceptStateCodesByEventCode,
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
  return metadata.publicStates[code];
};

export const getEntityStateCode = (metadata: EntityTemplateMetadata, state: string): number | undefined =>
  getStateCode(metadata, state);
