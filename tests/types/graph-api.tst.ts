import { describe, expect, test } from "tstyche";
import { compileLiteFsmGraph } from "@lite-fsm/graph";
import type {
  CompileLiteFsmGraphOptions,
  GraphDiagnostic,
  GraphEmission,
  GraphState,
  GraphTransition,
  GraphValueSummary,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
  LiteFsmGraphResult,
  MachineSelector,
} from "@lite-fsm/graph";
import type { Assert, NotAny, NotNever } from "./_helpers";

describe("@lite-fsm/graph public API", () => {
  test("compileLiteFsmGraph возвращает graph result", () => {
    const result = compileLiteFsmGraph("", { parser: "static", filename: "machine.ts" });

    expect(result).type.toBe<LiteFsmGraphResult>();
    expect(result.document).type.toBe<LiteFsmGraphDocument>();
    expect(result.diagnostics).type.toBe<GraphDiagnostic[]>();
  });

  test("public IR типы доступны без any/never leaks в основных discriminants", () => {
    type Checks = [
      Assert<NotAny<LiteFsmGraphMachine["kind"]>>,
      Assert<NotNever<LiteFsmGraphMachine["kind"]>>,
      Assert<NotAny<GraphState["kind"]>>,
      Assert<NotAny<GraphTransition["layer"]>>,
      Assert<NotAny<GraphEmission["routing"]>>,
      Assert<NotAny<GraphValueSummary["kind"]>>,
      Assert<NotAny<MachineSelector>>,
      Assert<NotAny<CompileLiteFsmGraphOptions>>,
    ];

    expect<Checks>().type.not.toBe<never>();
  });
});
