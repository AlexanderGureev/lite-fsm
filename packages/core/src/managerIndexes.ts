// Per-manager helpers и предвычисленные action indexes; строятся один раз при init.

import { hasOwn, isTerminal, resolveTransitionTarget } from "./actor";
import type { MachineStore } from "./types";

type ManagerConfig<S extends MachineStore> = S;
type TransitionGraph = Record<string, Record<string, unknown> | undefined>;
type RuntimeConfig = { config: TransitionGraph; groupTag?: string };

export type ManagerIndexes = {
  // domain: actionType → keys с edge для этого type.
  domainReduceIndex: Map<string, string[]>;
  // domain без edges — type-агностичные reducer'ы (всегда reduce).
  domainAlwaysReduce: string[];
  // actor templates: actionType → keys с не-__INIT edge для этого type.
  actorReduceIndex: Map<string, string[]>;
  // actor spawn: actionType → groupTag → templateKeys[] из __INIT edges.
  actorSpawnIndex: Map<string, Map<string, string[]>>;
};

export type ConfigHelpers = {
  groupTagForTemplate: (templateKey: string) => string;
  hasActorTransition: (templateKey: string, source: string, action: { type: string }) => boolean;
  isPublicActorState: (templateKey: string, actorState: string) => boolean;
};

// Сборщик reduce-индекса: actionType → keys с edge в accept'ed source. Также возвращает
// keys без edges (для domain — type-агностичные reducer'ы).
const buildReduceIndex = (
  keys: readonly string[],
  transitionGraph: (key: string) => TransitionGraph,
  acceptSource: (source: string) => boolean,
): { index: Map<string, string[]>; keysWithoutEdges: string[] } => {
  const draft = new Map<string, Set<string>>();
  const keysWithoutEdges: string[] = [];

  for (const key of keys) {
    let hasEdge = false;
    for (const [source, edges] of Object.entries(transitionGraph(key))) {
      if (!edges || !acceptSource(source)) continue;
      for (const actionType of Object.keys(edges)) {
        hasEdge = true;
        let bucket = draft.get(actionType);
        if (!bucket) draft.set(actionType, (bucket = new Set()));
        bucket.add(key);
      }
    }
    if (!hasEdge) keysWithoutEdges.push(key);
  }

  const index = new Map<string, string[]>();
  for (const [actionType, bucket] of draft) index.set(actionType, [...bucket]);
  return { index, keysWithoutEdges };
};

// actionType → groupTag → templateKeys[] (только из __INIT edges).
const buildActorSpawnIndex = (
  actorTemplateKeys: readonly string[],
  transitionGraph: (key: string) => TransitionGraph,
  groupTagForTemplate: (templateKey: string) => string,
): Map<string, Map<string, string[]>> => {
  const index = new Map<string, Map<string, string[]>>();
  for (const templateKey of actorTemplateKeys) {
    const groupTag = groupTagForTemplate(templateKey);
    /* v8 ignore next -- actor template всегда имеет __INIT (см. validateActorTemplateConfig). */
    for (const actionType of Object.keys(transitionGraph(templateKey).__INIT ?? {})) {
      let groups = index.get(actionType);
      if (!groups) index.set(actionType, (groups = new Map()));
      let templates = groups.get(groupTag);
      if (!templates) groups.set(groupTag, (templates = []));
      templates.push(templateKey);
    }
  }
  return index;
};

export const buildManagerIndexes = <S extends MachineStore>(
  config: ManagerConfig<S>,
  actorTemplateKeys: readonly string[],
  domainKeys: readonly string[],
  groupTagForTemplate: (templateKey: string) => string,
): ManagerIndexes => {
  const transitionGraph = (key: string): TransitionGraph =>
    (config[key as keyof S] as { config: TransitionGraph }).config;

  const domain = buildReduceIndex(domainKeys, transitionGraph, () => true);
  const actor = buildReduceIndex(actorTemplateKeys, transitionGraph, (source) => source !== "__INIT");
  const spawn = buildActorSpawnIndex(actorTemplateKeys, transitionGraph, groupTagForTemplate);

  return {
    domainReduceIndex: domain.index,
    domainAlwaysReduce: domain.keysWithoutEdges,
    actorReduceIndex: actor.index,
    actorSpawnIndex: spawn,
  };
};

// Per-manager helpers поверх actor.ts с привязкой к config'у. Нужны и для init, и для hot path.
export const createConfigHelpers = <S extends MachineStore>(config: ManagerConfig<S>): ConfigHelpers => {
  const getConfig = (key: string) => config[key as keyof S] as RuntimeConfig;
  const transitionGraph = (key: string): TransitionGraph => getConfig(key).config;

  const groupTagForTemplate = (templateKey: string): string => getConfig(templateKey).groupTag ?? templateKey;

  // Принимает ли template action из source (учитывая wildcard для не-__INIT).
  const hasActorTransition = (templateKey: string, source: string, action: { type: string }): boolean =>
    resolveTransitionTarget(transitionGraph(templateKey), source, action.type, true) !== undefined;

  // Public state: не __INIT, не terminal, присутствует в config.
  const isPublicActorState = (templateKey: string, actorState: string): boolean => {
    if (actorState === "__INIT" || isTerminal(actorState)) return false;
    return hasOwn(getConfig(templateKey).config, actorState);
  };

  return { groupTagForTemplate, hasActorTransition, isPublicActorState };
};
