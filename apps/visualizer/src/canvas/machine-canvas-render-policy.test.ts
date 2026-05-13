import type { MachineFlowEdgeGroup, MachineFlowNode } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import {
  formatMachineCanvasEdgeLabel,
  MACHINE_CANVAS_ELK_OPTIONS,
  MACHINE_CANVAS_RENDER_POLICY,
  machineCanvasBadgeTone,
  machineCanvasDensityFor,
  machineCanvasEdgeKindStyle,
  machineCanvasLegendItems,
  machineCanvasNodeRoleStyle,
  machineCanvasNodeSizeFor,
  machineCanvasProducerCategoryStyle,
} from "./machine-canvas-render-policy";

const stateNode = (input: Partial<MachineFlowNode>): MachineFlowNode => ({
  nodeId: input.nodeId ?? "machine:state:idle",
  ref: input.ref ?? { kind: "state", stateId: "machine:state:idle" },
  label: input.label ?? "idle",
  role: input.role ?? "normal",
  badges: input.badges ?? [],
  sourceAnchors: [],
  diagnosticIds: [],
  stats: input.stats ?? { incoming: 0, outgoing: 0, selfLoops: 0, emissions: 0 },
});

const edgeGroup = (input: Partial<MachineFlowEdgeGroup>): MachineFlowEdgeGroup => ({
  groupId: input.groupId ?? "edge",
  sourceNodeId: input.sourceNodeId ?? "source",
  targetNodeId: input.targetNodeId ?? "target",
  direction: input.direction ?? "normal",
  kind: input.kind ?? "accepted-transition",
  layer: input.layer ?? "config",
  producerCategory: input.producerCategory ?? "external",
  label: input.label ?? "START",
  count: input.count ?? 1,
  rows: [],
  producers: [],
  sourceAnchors: [],
  diagnostics: [],
});

describe("machine canvas render policy", () => {
  it("мапит роли nodes, edge kinds, producer category и badge tones", () => {
    expect(machineCanvasNodeRoleStyle("normal").label).toBe("state");
    expect(machineCanvasNodeRoleStyle("current").className).toContain("current");
    expect(machineCanvasNodeRoleStyle("initial").label).toBe("initial");
    expect(machineCanvasNodeRoleStyle("terminal").label).toBe("terminal");
    expect(machineCanvasNodeRoleStyle("spawn").label).toBe("spawn");
    expect(machineCanvasNodeRoleStyle("wildcard").label).toBe("any state");
    expect(machineCanvasNodeRoleStyle("effect-source").label).toBe("effect source");
    expect(machineCanvasNodeRoleStyle("synthetic").label).toBe("synthetic target");

    expect(machineCanvasEdgeKindStyle("accepted-transition")).toMatchObject({
      label: "accepted",
      colorToken: "--vf-config",
    });
    expect(machineCanvasEdgeKindStyle("self-emitted-transition")).toMatchObject({
      label: "self-emitted",
      strokeDasharray: "6 4",
      colorToken: "--vf-effect",
    });
    expect(machineCanvasEdgeKindStyle("from-other-transition")).toMatchObject({
      label: "from other",
      strokeLinecap: "round",
      colorToken: "--vf-routing",
    });
    expect(machineCanvasEdgeKindStyle("emission-only")).toMatchObject({
      label: "emission only",
      colorToken: "--vf-effect",
    });

    expect(machineCanvasProducerCategoryStyle("external").label).toBe("external");
    expect(machineCanvasProducerCategoryStyle("self-emitted").className).toContain("self-emitted");
    expect(machineCanvasProducerCategoryStyle("from-other").description).toContain("another machine");

    expect(machineCanvasBadgeTone("initial")).toBe("accent");
    expect(machineCanvasBadgeTone("current")).toBe("accent");
    expect(machineCanvasBadgeTone("terminal")).toBe("muted");
    expect(machineCanvasBadgeTone("spawn")).toBe("actor");
    expect(machineCanvasBadgeTone("wildcard")).toBe("muted");
    expect(machineCanvasBadgeTone("effect-source")).toBe("effect");
    expect(machineCanvasBadgeTone("group-tag")).toBe("routing");
    expect(machineCanvasBadgeTone("persistence")).toBe("warning");
    expect(machineCanvasBadgeTone("context-scoped")).toBe("muted");
    expect(machineCanvasBadgeTone("diagnostic")).toBe("diagnostic");
    expect(machineCanvasBadgeTone("unknown")).toBe("muted");
  });

  it("фиксирует constants, grouped label и legend items", () => {
    expect(MACHINE_CANVAS_RENDER_POLICY.nodeMinWidth).toBe(160);
    expect(MACHINE_CANVAS_RENDER_POLICY.nodeMaxWidth).toBe(320);
    expect(MACHINE_CANVAS_RENDER_POLICY.edgeLabelMaxWidth).toBe(170);
    expect(MACHINE_CANVAS_RENDER_POLICY.labelCollisionPasses).toBe(4);
    expect(MACHINE_CANVAS_RENDER_POLICY.labelCollisionCandidateShifts).toEqual([0.12, -0.12, 0.22, -0.22, 0.32, -0.32]);
    expect(MACHINE_CANVAS_RENDER_POLICY.labelTMin).toBe(0.1);
    expect(MACHINE_CANVAS_RENDER_POLICY.labelTMax).toBe(0.9);
    expect(MACHINE_CANVAS_RENDER_POLICY.selfLoopBaseOpening).toBe(16);
    expect(MACHINE_CANVAS_RENDER_POLICY.selfLoopBaseReach).toBe(28);
    expect(MACHINE_CANVAS_RENDER_POLICY.selfLoopStepOpening).toBe(14);
    expect(MACHINE_CANVAS_RENDER_POLICY.selfLoopStepReach).toBe(22);
    expect(MACHINE_CANVAS_RENDER_POLICY.fitViewPadding).toBe(0.2);
    expect(MACHINE_CANVAS_RENDER_POLICY.minZoom).toBe(0.3);
    expect(MACHINE_CANVAS_RENDER_POLICY.maxZoom).toBe(1.6);
    expect(MACHINE_CANVAS_ELK_OPTIONS["elk.direction"]).toBe("RIGHT");
    expect(MACHINE_CANVAS_ELK_OPTIONS["elk.edgeRouting"]).toBe("ORTHOGONAL");

    expect(formatMachineCanvasEdgeLabel(edgeGroup({ label: "START", count: 1 }))).toBe("START");
    expect(formatMachineCanvasEdgeLabel(edgeGroup({ label: "START", count: 6 }))).toBe("START +5");
    expect(machineCanvasLegendItems().map((item) => item.label)).toEqual([
      "accepted",
      "self-emitted",
      "from other",
      "emission only",
    ]);
  });

  it("вычисляет density thresholds и стабильный размер node", () => {
    expect(machineCanvasDensityFor(12, 40)).toBe("normal");
    expect(machineCanvasDensityFor(13, 40)).toBe("dense");
    expect(machineCanvasDensityFor(30, 120)).toBe("dense");
    expect(machineCanvasDensityFor(31, 120)).toBe("very-dense");
    expect(machineCanvasDensityFor(30, 121)).toBe("very-dense");

    expect(machineCanvasNodeSizeFor(stateNode({ label: "idle" }))).toEqual({ width: 160, height: 70 });
    expect(
      machineCanvasNodeSizeFor(
        stateNode({
          label: "ready",
          badges: [{ kind: "initial", label: "initial" }],
          stats: { incoming: 1, outgoing: 4, selfLoops: 0, emissions: 0 },
        }),
      ),
    ).toEqual({ width: 160, height: 106 });
    expect(
      machineCanvasNodeSizeFor(
        stateNode({
          label: "state_with_a_really_really_really_really_long_name",
          badges: [{ kind: "terminal", label: "terminal" }],
        }),
      ).width,
    ).toBe(320);
  });
});
