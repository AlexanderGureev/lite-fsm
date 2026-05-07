import { describe, expect, test } from "tstyche";
import { compileLiteFsmGraph, selectMachineGraph } from "@lite-fsm/graph";
import type {
  CompileLiteFsmGraphOptions,
  GraphDiagnostic,
  GraphEmission,
  GraphReducerCase,
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

    expect(result).type.toBe<LiteFsmGraphResult>();
    expect(result.document).type.toBe<LiteFsmGraphDocument>();
    expect(result.diagnostics).type.toBe<GraphDiagnostic[]>();
    expect(selected).type.toBe<SelectMachineGraphResult>();
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
      Assert<NotAny<GraphValueSummary["kind"]>>,
      Assert<NotAny<MachineSelector>>,
      Assert<NotAny<SelectMachineGraphResult>>,
      Assert<NotAny<CompileLiteFsmGraphOptions>>,
    ];

    expect<Checks>().type.not.toBe<never>();
  });
});
