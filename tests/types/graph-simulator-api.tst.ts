import { describe, expect, test } from "tstyche";
import * as graphRoot from "@lite-fsm/graph";
import type { GraphDiagnostic, GraphJsonObject, GraphJsonValue, LiteFsmGraphDocument } from "@lite-fsm/graph";
import {
  createGraphSimulator,
  createMachineGraphSimulator,
  type GraphEvaluationPolicy,
  type GraphSendFailureReason,
  type GraphSimulationConsumption,
  type GraphSimulationSlice,
  type GraphSimulationSliceRef,
  type GraphSimulationSnapshot,
  type GraphSimulator,
} from "@lite-fsm/graph/simulator";

import type { Assert, NotAny } from "./_helpers";

const document = {} as LiteFsmGraphDocument;
const domainSlice = { kind: "domain", machineId: "machine" } satisfies GraphSimulationSliceRef;

describe("@lite-fsm/graph/simulator public API", () => {
  test("root import не раскрывает simulator runtime", () => {
    // @ts-expect-error!
    graphRoot.createGraphSimulator;
    expect(createGraphSimulator(document)).type.toBe<GraphSimulator>();
    expect(createMachineGraphSimulator(document, "machine")).type.toBe<GraphSimulator>();
  });

  test("event input принимает payload и meta", () => {
    const simulator = createGraphSimulator(document);
    const payload = { count: 1, nested: [true, null, "x"] } satisfies GraphJsonValue;

    simulator.send({
      event: {
        type: "GO",
        payload,
        meta: {
          actorId: ["actor-a", "actor-b"],
          groupId: "group",
          senderGroupTag: "workers",
        },
      },
    });
  });

  test("sendFromTransition принимает payload и отклоняет routing meta", () => {
    const simulator = createGraphSimulator(document);

    simulator.sendFromTransition({
      slice: domainSlice,
      transitionId: "transition",
      payload: { ok: true },
    });
    simulator.sendFromTransition({
      slice: domainSlice,
      transitionId: "transition",
      // @ts-expect-error!
      meta: { actorId: "actor" },
    });
    simulator.sendFromEmission({
      slice: domainSlice,
      emissionId: "emission",
      // @ts-expect-error!
      meta: { groupTag: "workers" },
    });
  });

  test("initial context override принимает только JSON object", () => {
    const context = { ok: true, values: [1, "x", null] } satisfies GraphJsonObject;
    createGraphSimulator(document, {
      initialContextOverrides: [{ slice: domainSlice, context }],
    });

    createGraphSimulator(document, {
      initialContextOverrides: [
        {
          slice: domainSlice,
          // @ts-expect-error!
          context: { fn: () => null },
        },
      ],
    });

    createGraphSimulator(document, {
      initialContextOverrides: [
        {
          slice: domainSlice,
          // @ts-expect-error!
          context: [],
        },
      ],
    });
  });

  test("slice refs и result unions сужаются по discriminants", () => {
    const slice = {} as GraphSimulationSliceRef;
    if (slice.kind === "actor") {
      expect(slice.actorId).type.toBe<string>();
    }
    if (slice.kind === "domain") {
      expect(slice.machineId).type.toBe<string>();
    }

    const result = createGraphSimulator(document).send({ event: { type: "GO" } });
    if (result.ok) {
      expect(result.snapshot).type.toBe<GraphSimulationSnapshot>();
      expect(result.step.consumed).type.toBe<readonly GraphSimulationConsumption[]>();
    } else {
      expect(result.reason).type.toBe<GraphSendFailureReason>();
      expect(result.diagnostics).type.toBe<readonly GraphDiagnostic[]>();
    }
  });

  test("branch/evaluator policy types не требуют DOM или app types", () => {
    const policy: GraphEvaluationPolicy = {
      evaluateTransition(input) {
        expect(input.slice).type.toBe<GraphSimulationSlice>();
        return { kind: "unchanged", candidates: input.candidates };
      },
      reduceContext(input) {
        return { kind: "unchanged", context: input.previousContext };
      },
    };

    createGraphSimulator(document, { branchPolicy: { kind: "deterministic-first" }, evaluationPolicy: policy });

    type Checks = [
      Assert<NotAny<GraphEvaluationPolicy>>,
      Assert<NotAny<GraphSimulationSliceRef>>,
      Assert<NotAny<GraphSimulationSnapshot>>,
    ];

    expect<Checks>().type.not.toBe<never>();
  });
});
