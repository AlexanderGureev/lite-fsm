import type { GraphEmission, GraphState, GraphTransition, LiteFsmGraphMachine, LiteFsmGraphManager } from "../types";
import type { GraphSourceAnchor } from "./types";

export const sourceAnchor = (
  kind: GraphSourceAnchor["kind"],
  loc: GraphSourceAnchor["loc"] | undefined,
): GraphSourceAnchor | undefined => {
  if (!loc) return undefined;

  return { kind, loc, editable: false };
};

export const sourceAnchors = (
  kind: GraphSourceAnchor["kind"],
  loc: GraphSourceAnchor["loc"] | undefined,
): readonly GraphSourceAnchor[] => {
  const anchor = sourceAnchor(kind, loc);
  return anchor ? [anchor] : [];
};

export const machineAnchors = (machine: LiteFsmGraphMachine): readonly GraphSourceAnchor[] =>
  sourceAnchors("machine", machine.loc);

export const managerAnchors = (manager: LiteFsmGraphManager): readonly GraphSourceAnchor[] =>
  sourceAnchors("manager", manager.loc);

export const stateAnchors = (state: GraphState): readonly GraphSourceAnchor[] => sourceAnchors("state", state.loc);

export const transitionAnchors = (transition: GraphTransition): readonly GraphSourceAnchor[] =>
  sourceAnchors(transition.layer === "config" ? "config-transition" : "reducer-branch", transition.loc);

export const emissionAnchors = (emission: GraphEmission): readonly GraphSourceAnchor[] =>
  sourceAnchors("effect-emission", emission.loc);
