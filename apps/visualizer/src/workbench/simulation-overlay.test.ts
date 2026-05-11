import type {
  GraphAvailableTransition,
  GraphSimulationSnapshot,
  GraphSuggestedEmission,
} from "@lite-fsm/graph/simulator";
import { describe, expect, it } from "vitest";
import { buildSimulationOverlayInput, withInspectedStep } from "./simulation-overlay";

const snapshot = (): GraphSimulationSnapshot =>
  ({
    documentVersion: "doc",
    machineIds: ["player"],
    domainSlicesByMachineId: { player: "slice:player" },
    actorTemplateSlicesByMachineId: {},
    actorSliceIdsByMachineId: {},
    slices: {
      "slice:player": {
        sliceId: "slice:player",
        machineId: "player",
        stateId: "player:state:idle",
      },
    },
    timeline: {
      rootStepId: "root",
      currentStepId: "effect",
      linearStepIds: ["root", "effect"],
      childrenByStepId: {},
      stepsById: {
        root: {
          stepId: "root",
          index: 0,
          source: { kind: "initial" },
          rowRefs: [{ kind: "transition", machineId: "player", transitionId: "t:root", sliceId: "slice:player" }],
        },
        effect: {
          stepId: "effect",
          index: 1,
          source: { kind: "external" },
          rowRefs: [{ kind: "emission", machineId: "player", emissionId: "e:done", sliceId: "slice:player" }],
        },
      },
    },
  }) as unknown as GraphSimulationSnapshot;

describe("overlay симуляции", () => {
  it("строит overlay из snapshot, доступных transitions, suggested emissions и inspected step", () => {
    const overlay = buildSimulationOverlayInput({
      snapshot: snapshot(),
      inspectedStepId: "root",
      availableTransitions: [
        { sliceId: "slice:player", machineId: "player", transitionId: "t:play" },
        { sliceId: "slice:player", machineId: "player", transitionId: "t:play" },
      ] as unknown as readonly GraphAvailableTransition[],
      suggestedEmissions: [
        { sliceId: "slice:player", machineId: "player", emissionId: "e:done" },
        { sliceId: "slice:player", machineId: "player", emissionId: "e:done" },
      ] as unknown as readonly GraphSuggestedEmission[],
    });

    expect(overlay).toMatchObject({
      currentStateIdsBySliceId: { "slice:player": "player:state:idle" },
      currentStateIdsByMachineId: { player: "player:state:idle" },
      availableTransitionIdsBySliceId: { "slice:player": ["t:play"] },
      availableTransitionIdsByMachineId: { player: ["t:play"] },
      suggestedEmissionIdsBySliceId: { "slice:player": ["e:done"] },
      suggestedEmissionIdsByMachineId: { player: ["e:done"] },
      firedRefs: [{ kind: "emission", machineId: "player", emissionId: "e:done", sliceId: "slice:player" }],
      inspectedRefs: [{ kind: "transition", machineId: "player", transitionId: "t:root", sliceId: "slice:player" }],
    });
  });

  it("возвращает undefined без snapshot и сохраняет overlay без inspected snapshot", () => {
    expect(buildSimulationOverlayInput({ availableTransitions: [], suggestedEmissions: [] })).toBeUndefined();
    expect(withInspectedStep(undefined, snapshot(), "root")).toBeUndefined();
    expect(withInspectedStep({ recentlyFiredRowIds: ["row"] }, undefined, "root")).toEqual({ recentlyFiredRowIds: ["row"] });
    expect(withInspectedStep({ recentlyFiredRowIds: ["row"] }, snapshot(), "missing")).toEqual({
      recentlyFiredRowIds: ["row"],
      inspectedRefs: [],
    });
  });
});
