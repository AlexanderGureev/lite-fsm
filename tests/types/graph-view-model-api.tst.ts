import { describe, expect, test } from "tstyche";
import * as graphRoot from "@lite-fsm/graph";
import type { GraphDiagnostic, LiteFsmGraphDocument, LiteFsmGraphMachine } from "@lite-fsm/graph";
import {
  buildGraphVisualizerModel,
  buildMachineWorkbenchModel,
  type BuildGraphVisualizerModelOptions,
  type BuildMachineWorkbenchModelOptions,
  type GraphConfigRow,
  type GraphMachineWorkbenchModel,
  type GraphTargetView,
  type GraphVisualizerModel,
  type GraphVisualizerRowMappingIndex,
  type GraphVisualizerSimulationOverlayInput,
  type GraphWorkbenchCapability,
  type GraphWorkbenchRow,
} from "@lite-fsm/graph/view-model";

import type { Assert, NotAny, NotNever } from "./_helpers";

const document = {} as LiteFsmGraphDocument;
const machine = {} as LiteFsmGraphMachine;

describe("@lite-fsm/graph/view-model public API", () => {
  test("subpath экспортирует builders и root import их не раскрывает", () => {
    expect(buildGraphVisualizerModel(document)).type.toBe<GraphVisualizerModel>();
    expect(buildMachineWorkbenchModel(machine)).type.toBe<GraphMachineWorkbenchModel>();

    // @ts-expect-error!
    graphRoot.buildGraphVisualizerModel;
    // @ts-expect-error!
    graphRoot.buildMachineWorkbenchModel;
  });

  test("options принимают analyzer diagnostics и simulation facts", () => {
    const analysisDiagnostics = [] satisfies GraphDiagnostic[];
    const simulation = {
      currentStateIdsBySliceId: { "domain:flow": "flow:state:idle" },
      availableTransitionIdsBySliceId: { "domain:flow": ["flow:transition:config:idle:GO:0"] },
      firedRefs: [{ kind: "transition", machineId: "flow", transitionId: "transition", sliceId: "domain:flow" }],
    } satisfies GraphVisualizerSimulationOverlayInput;

    const graphOptions = { analysisDiagnostics, simulation } satisfies BuildGraphVisualizerModelOptions;
    const machineOptions = {
      simulation: {
        currentStateId: "flow:state:idle",
        availableTransitionIds: ["transition"],
      },
      collapse: { kind: "collapse-non-current-long-states", rowThreshold: 2 },
    } satisfies BuildMachineWorkbenchModelOptions;

    expect(graphOptions).type.toBeAssignableTo<BuildGraphVisualizerModelOptions>();
    expect(machineOptions).type.toBeAssignableTo<BuildMachineWorkbenchModelOptions>();
  });

  test("projection types не протекают any/never в ключевых discriminants", () => {
    type Checks = [
      Assert<NotAny<GraphVisualizerModel>>,
      Assert<NotAny<GraphVisualizerRowMappingIndex>>,
      Assert<NotAny<GraphWorkbenchRow>>,
      Assert<NotNever<GraphWorkbenchRow>>,
      Assert<NotAny<GraphWorkbenchCapability>>,
      Assert<NotAny<GraphConfigRow["foldedReducerTransitionIds"]>>,
      Assert<NotAny<GraphTargetView["kind"]>>,
    ];

    expect<Checks>().type.not.toBe<never>();
  });
});
