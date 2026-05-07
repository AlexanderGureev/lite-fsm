import { Node, type Expression } from "ts-morph";
import type { GraphDiagnostic, SourceLocation } from "../types";
import type { MachineCandidate, ManagerCandidate } from "./candidates";
import type { CompilerContext } from "./pipeline";
import type { EvaluatedGraphValue, EvaluationResult } from "./evaluator";

export type ManagerLinkRef = {
  key: string;
  machineCandidate: MachineCandidate;
  loc?: SourceLocation;
};

export type ManagerLinkSlice = {
  manager: ManagerCandidate;
  refs: ManagerLinkRef[];
  diagnostics: GraphDiagnostic[];
};

const unwrapTransparentExpression = (expression: Expression): Expression => {
  let current = expression;

  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isTypeAssertion(current)
  ) {
    current = current.getExpression();
  }

  return current;
};

const managerMapDiagnostic = (
  code: string,
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  loc,
});

const diagnosticFromEvaluation = (result: EvaluationResult): GraphDiagnostic => {
  if (result.kind === "external") {
    return managerMapDiagnostic(
      "LFG_UNRESOLVED_MANAGER_MAP",
      `Manager machine map '${result.label}' cannot be resolved from the current source string.`,
      result.loc,
    );
  }

  if (result.kind === "dynamic") {
    return managerMapDiagnostic(
      "LFG_DYNAMIC_MANAGER_MAP",
      "Manager machine map is dynamic and cannot be compiled statically.",
      result.loc,
    );
  }

  if (result.kind === "unsupported") {
    return managerMapDiagnostic(result.code, result.message, result.loc);
  }

  return managerMapDiagnostic(
    "LFG_UNSUPPORTED_MANAGER_MAP",
    "MachineManager first argument must resolve to an object literal machine map.",
    result.loc,
  );
};

const evaluateManagerMap = (
  manager: ManagerCandidate,
  context: CompilerContext,
): Extract<EvaluatedGraphValue, { kind: "object" }> | GraphDiagnostic => {
  const [firstArgument] = manager.call.getArguments();
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return managerMapDiagnostic(
      "LFG_UNSUPPORTED_MANAGER_MAP",
      "MachineManager call must have an object literal or local const machine map as the first argument.",
      context.source.locFromNode(manager.call),
    );
  }

  const result = context.evaluator.evaluateExpression(firstArgument, { expectedPosition: "managerMap" });
  if (result.kind === "known" && result.value.kind === "object") return result.value;

  return diagnosticFromEvaluation(result);
};

const findMachineCandidate = (
  expression: Expression,
  candidates: readonly MachineCandidate[],
): MachineCandidate | undefined => {
  const unwrapped = unwrapTransparentExpression(expression);
  if (Node.isCallExpression(unwrapped)) {
    return candidates.find((candidate) => candidate.call === unwrapped);
  }

  if (Node.isIdentifier(unwrapped)) {
    const name = unwrapped.getText();

    return candidates.find((candidate) => candidate.variableName === name);
  }

  return undefined;
};

const linkManager = (
  manager: ManagerCandidate,
  candidates: readonly MachineCandidate[],
  context: CompilerContext,
): ManagerLinkSlice => {
  const map = evaluateManagerMap(manager, context);
  if ("code" in map) {
    return {
      manager,
      refs: [],
      diagnostics: [map],
    };
  }

  const refs: ManagerLinkRef[] = [];
  const diagnostics: GraphDiagnostic[] = [];

  for (const property of map.properties) {
    if (property.value.kind !== "expression") {
      diagnostics.push(
        managerMapDiagnostic(
          "LFG_UNSUPPORTED_MANAGER_ENTRY",
          `Manager entry '${property.key}' must reference a createMachine call or local machine variable.`,
          property.loc,
        ),
      );
      continue;
    }

    const machineCandidate = findMachineCandidate(property.value.node, candidates);
    if (!machineCandidate) {
      diagnostics.push(
        managerMapDiagnostic(
          "LFG_UNRESOLVED_MANAGER_ENTRY",
          `Manager entry '${property.key}' does not reference a machine included in the graph document.`,
          property.value.loc,
        ),
      );
      continue;
    }

    refs.push({
      key: property.key,
      machineCandidate,
      loc: property.loc,
    });
  }

  return {
    manager,
    refs,
    diagnostics,
  };
};

export const linkManagers = (
  managers: readonly ManagerCandidate[],
  candidates: readonly MachineCandidate[],
  context: CompilerContext,
): ManagerLinkSlice[] => managers.map((manager) => linkManager(manager, candidates, context));
