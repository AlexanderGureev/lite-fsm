import { describe, expect, test } from "tstyche";
import { analyzeLiteFsmGraph, compileLiteFsmGraph, selectMachineGraph } from "@lite-fsm/graph";
import type {
  AnalyzeLiteFsmGraphOptions,
  CompileLiteFsmGraphOptions,
  GraphAnalysisResult,
  GraphAnalysisRuleId,
  GraphAnalysisScope,
  GraphDiagnostic,
  GraphEmission,
  GraphReducerCase,
  GraphRouting,
  GraphRoutingTarget,
  GraphState,
  GraphTransition,
  GraphValueSummary,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
  LiteFsmGraphResult,
  MachineSelector,
  SelectMachineGraphResult,
} from "@lite-fsm/graph";
import type { Assert, NotAny, NotNever } from "./_helpers";

describe("@lite-fsm/graph public API", () => {
  test("compileLiteFsmGraph возвращает graph result", () => {
    const result = compileLiteFsmGraph("", { parser: "static", filename: "machine.ts" });
    const selected = selectMachineGraph(result.document, { index: 0 });
    const analyzed = analyzeLiteFsmGraph(result.document, {
      rules: ["unknown-target"],
      scope: { kind: "document" },
    });

    expect(result).type.toBe<LiteFsmGraphResult>();
    expect(result.document).type.toBe<LiteFsmGraphDocument>();
    expect(result.diagnostics).type.toBe<GraphDiagnostic[]>();
    expect(selected).type.toBe<SelectMachineGraphResult>();
    expect(analyzed).type.toBe<GraphAnalysisResult>();
    expect(analyzed.diagnostics).type.toBe<GraphDiagnostic[]>();
  });

  test("selectMachineGraph сужает результат по ok", () => {
    const result = selectMachineGraph(compileLiteFsmGraph("").document);

    if (result.ok) {
      expect(result.machine).type.toBe<LiteFsmGraphMachine>();
      expect(result.diagnostics).type.toBe<GraphDiagnostic[]>();
    } else {
      expect(result.candidates).type.toBe<LiteFsmGraphMachine[]>();
      expect(result.diagnostics).type.toBe<GraphDiagnostic[]>();
    }
  });

  test("public IR типы доступны без any/never leaks в основных discriminants", () => {
    type Checks = [
      Assert<NotAny<LiteFsmGraphMachine["kind"]>>,
      Assert<NotNever<LiteFsmGraphMachine["kind"]>>,
      Assert<NotAny<GraphState["kind"]>>,
      Assert<NotAny<GraphTransition["layer"]>>,
      Assert<NotAny<GraphReducerCase["confidence"]>>,
      Assert<NotAny<GraphEmission["routing"]>>,
      Assert<NotAny<GraphRouting>>,
      Assert<NotAny<GraphRoutingTarget>>,
      Assert<NotAny<GraphValueSummary["kind"]>>,
      Assert<NotAny<MachineSelector>>,
      Assert<NotAny<SelectMachineGraphResult>>,
      Assert<NotAny<CompileLiteFsmGraphOptions>>,
      Assert<NotAny<AnalyzeLiteFsmGraphOptions>>,
      Assert<NotAny<GraphAnalysisScope>>,
      Assert<NotAny<GraphAnalysisRuleId>>,
      Assert<NotAny<GraphAnalysisResult>>,
    ];

    expect<Checks>().type.not.toBe<never>();
  });

  test("GraphAnalysisScope сужается по discriminants", () => {
    const scope = {} as GraphAnalysisScope;
    const rule = "effect-event-acceptance" satisfies GraphAnalysisRuleId;

    if (scope.kind === "machine") {
      expect(scope.machineId).type.toBe<string>();
    }

    if (scope.kind === "manager") {
      expect(scope.managerId).type.toBe<string>();
    }

    expect(rule).type.toBe<"effect-event-acceptance">();
  });

  test("GraphEmission routing сужается по discriminants", () => {
    const emission = {} as GraphEmission;

    if (emission.routing.kind === "actor") {
      expect(emission.routing.target).type.toBe<GraphRoutingTarget>();
    }

    const target = {} as GraphRoutingTarget;
    if (target.kind === "selfField") {
      expect(target.field).type.toBe<"actorId" | "groupId" | "groupTag">();
    }

    if (target.kind === "array") {
      expect(target.items).type.toBe<GraphRoutingTarget[]>();
    }
  });
});
