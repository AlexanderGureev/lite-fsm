import type { GraphAnalysisRule } from "./context";
import { actorTemplateShapeRule } from "./rules/actor-template-shape";
import { deadEndStateRule } from "./rules/dead-end-state";
import { effectEventAcceptanceRule } from "./rules/effect-event-acceptance";
import { reducerConfigConsistencyRule } from "./rules/reducer-config-consistency";
import { unreachableStateRule } from "./rules/unreachable-state";
import { unknownTargetRule } from "./rules/unknown-target";
import { wildcardShadowingRule } from "./rules/wildcard-shadowing";

export const analysisRules: readonly GraphAnalysisRule[] = [
  unknownTargetRule,
  unreachableStateRule,
  deadEndStateRule,
  actorTemplateShapeRule,
  reducerConfigConsistencyRule,
  effectEventAcceptanceRule,
  wildcardShadowingRule,
];
