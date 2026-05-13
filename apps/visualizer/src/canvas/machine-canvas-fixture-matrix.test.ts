import { compileLiteFsmGraph } from "@lite-fsm/graph";
import {
  buildGraphVisualizerModel,
  buildMachineFlowModel,
  type MachineFlowEdgeGroup,
  type MachineFlowModel,
  type MachineFlowNode,
} from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import {
  machineCanvasOnboardingSource,
  machineCanvasXstateSource,
} from "../../tests/fixtures/machine-canvas-sources";
import { buildMachineCanvasRenderDraft } from "./layout-machine-canvas";

const readyFlow = (source: string, machineId: string): Extract<MachineFlowModel, { status: "ready" }> => {
  const compiled = compileLiteFsmGraph(source, { filename: `${machineId}.ts` });
  const model = buildGraphVisualizerModel(compiled.document);
  const flow = buildMachineFlowModel({ model, machineId });

  expect(flow.status).toBe("ready");
  if (flow.status !== "ready") throw new Error(`Expected ready flow for ${machineId}.`);

  return flow;
};

const nodeByLabel = (
  flow: Extract<MachineFlowModel, { status: "ready" }>,
  label: string,
): MachineFlowNode => {
  const node = flow.nodes.find((candidate) => candidate.label === label);
  if (!node) throw new Error(`Missing node ${label}.`);

  return node;
};

const edgeByLabel = (
  flow: Extract<MachineFlowModel, { status: "ready" }>,
  label: string,
): MachineFlowEdgeGroup => {
  const edge = flow.edgeGroups.find((candidate) => candidate.label === label);
  if (!edge) throw new Error(`Missing edge ${label}.`);

  return edge;
};

describe("матрица фикстур machine canvas", () => {
  it("компилирует compact onboarding visual story без playground imports", () => {
    const flow = readyFlow(machineCanvasOnboardingSource, "onboarding");
    const wildcardState = flow.nodes.find((node) => node.ref.kind === "wildcard-state");
    const wildcardEffect = flow.nodes.find((node) => node.ref.kind === "wildcard-effect");
    const groupedWildcardRoute = edgeByLabel(flow, "SUBSCRIPTION_HYDRATED");
    const resolveLifecycle = edgeByLabel(flow, "CHECK_ONBOARDING_RESOLVE");
    const rejectLifecycle = edgeByLabel(flow, "CHECK_ONBOARDING_REJECT");
    const selfLoop = edgeByLabel(flow, "PING");
    const emissionOnly = edgeByLabel(flow, "ONBOARDING_TRACE");
    const draft = buildMachineCanvasRenderDraft(flow);

    expect(flow.machine).toMatchObject({
      machineId: "onboarding",
      initialState: "IDLE",
      counters: expect.objectContaining({
        states: 5,
        emissions: 3,
      }),
    });
    expect(flow.machine.counters.reducerBranches).toBeGreaterThan(0);
    expect(wildcardState).toMatchObject({ label: "*", role: "wildcard" });
    expect(wildcardEffect).toMatchObject({ label: "*", role: "effect-source" });
    expect(groupedWildcardRoute).toMatchObject({
      count: 2,
      kind: "accepted-transition",
      producerCategory: "external",
    });
    expect(resolveLifecycle).toMatchObject({
      kind: "self-emitted-transition",
      producerCategory: "self-emitted",
      layer: "mixed",
    });
    expect(rejectLifecycle).toMatchObject({
      kind: "self-emitted-transition",
      producerCategory: "self-emitted",
    });
    expect(resolveLifecycle.rows.map((row) => row.rowKind)).toEqual(["config", "effect"]);
    expect(resolveLifecycle.producers[0]).toMatchObject({
      machineId: "onboarding",
      sourceStateKey: "CHECK_ONBOARDING",
      routingLabel: "default",
    });
    expect(selfLoop).toMatchObject({ direction: "self", targetNodeId: nodeByLabel(flow, "CHECK_ONBOARDING").nodeId });
    expect(emissionOnly).toMatchObject({
      kind: "emission-only",
      producerCategory: "self-emitted",
    });
    expect(emissionOnly.targetNodeId).toBeUndefined();
    expect(draft.emissionOnlyGroups.map((group) => group.label)).toEqual(["ONBOARDING_TRACE"]);
    expect(draft.nodes.find((node) => node.id === wildcardEffect?.nodeId)?.emissionGroups.map((group) => group.label)).toEqual([
      "ONBOARDING_TRACE",
    ]);
    expect(draft.edges.some((edge) => edge.label === "ONBOARDING_TRACE")).toBe(false);
  });

  it("компилирует selected xstate fixture machines в canvas flow stories", () => {
    const renamed = readyFlow(machineCanvasXstateSource, "renamedImportMachine");
    const helperWrapped = readyFlow(machineCanvasXstateSource, "helperWrappedMachine");
    const computed = readyFlow(machineCanvasXstateSource, "computedKeysMachine");
    const wildcardEffect = readyFlow(machineCanvasXstateSource, "wildcardEffectMachine");
    const actorTemplate = readyFlow(machineCanvasXstateSource, "actorTemplate");
    const dynamicTarget = readyFlow(machineCanvasXstateSource, "dynamicTargetMachine");
    const escapedTransition = readyFlow(machineCanvasXstateSource, "escapedTransitionMachine");

    expect(renamed.nodes.map((node) => node.label)).toEqual(["IDLE", "ACTIVE"]);
    expect(helperWrapped.machine.counters.reducerBranches).toBeGreaterThan(0);
    expect(helperWrapped.edgeGroups.map((edge) => edge.label)).toContain("COMPLETE_HELPER");
    expect(computed.nodes.map((node) => node.label)).toEqual(["CLOSED", "OPENED"]);
    expect(wildcardEffect.nodes.some((node) => node.ref.kind === "wildcard-effect")).toBe(true);
    expect(wildcardEffect.edgeGroups.some((edge) => edge.kind === "emission-only")).toBe(true);

    expect(actorTemplate.machine).toMatchObject({
      kind: "actorTemplate",
      groupTag: "jobs",
      initialState: "__INIT",
    });
    expect(nodeByLabel(actorTemplate, "__INIT")).toMatchObject({ role: "spawn" });
    expect(nodeByLabel(actorTemplate, "__RESOLVED")).toMatchObject({ role: "terminal" });
    expect(nodeByLabel(actorTemplate, "__REJECTED")).toMatchObject({ role: "terminal" });
    expect(nodeByLabel(actorTemplate, "__CANCELLED")).toMatchObject({ role: "terminal" });
    expect(actorTemplate.nodes.map((node) => node.label)).not.toContain("job-1");
    expect(
      actorTemplate.edgeGroups.some((edge) =>
        edge.producers.some((producer) => producer.routingLabel === "actor:job-1"),
      ),
    ).toBe(true);
    expect(
      actorTemplate.edgeGroups.some((edge) =>
        edge.producers.some((producer) => producer.routingLabel === "tag:self.groupTag"),
      ),
    ).toBe(true);

    expect(dynamicTarget.nodes.some((node) => node.ref.kind === "synthetic-target" && node.ref.targetKind === "dynamic")).toBe(
      true,
    );
    expect(edgeByLabel(dynamicTarget, "GO")).toMatchObject({ kind: "accepted-transition" });
    expect(escapedTransition.machine.counters.diagnostics).toBeGreaterThan(0);
    expect(escapedTransition.machine.badges.some((badge) => badge.kind === "diagnostic")).toBe(true);
  });
});
