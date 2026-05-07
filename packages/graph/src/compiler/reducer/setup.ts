import {
  Node,
  type ArrowFunction,
  type BindingName,
  type FunctionExpression,
} from "ts-morph";
import type { GraphDiagnostic, SourceLocation } from "../../types";
import { bindingNameText, unwrapTransparent } from "../ast";
import type { EvaluationResult } from "../evaluator/types";
import type { CompilerContext, ReducerGraphSlice } from "../pipeline";

export type ReducerFunction = ArrowFunction | FunctionExpression;

export type ReducerParameters = {
  stateName: string;
  actionName: string;
  nextStateName?: string;
};

export const EMPTY_REDUCER_SLICE: ReducerGraphSlice = {
  reducerCases: [],
  transitions: [],
  diagnostics: [],
};

export const reducerDiagnostic = (
  code: string,
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  loc,
});

const diagnosticFromEvaluation = (result: Exclude<EvaluationResult, { kind: "known" }>): GraphDiagnostic => {
  if (result.kind === "external") {
    return reducerDiagnostic(
      "LFG_UNRESOLVED_REDUCER",
      `Reducer '${result.label}' cannot be resolved from the current source string.`,
      result.loc,
    );
  }

  if (result.kind === "dynamic") {
    return reducerDiagnostic(
      "LFG_DYNAMIC_REDUCER",
      "Reducer expression is dynamic and cannot be compiled statically.",
      result.loc,
    );
  }

  return reducerDiagnostic("LFG_UNSUPPORTED_REDUCER", result.message, result.loc);
};

export const knownReducerFunction = (result: EvaluationResult): ReducerFunction | GraphDiagnostic => {
  if (result.kind === "known" && result.value.kind === "function") {
    return unwrapTransparent(result.value.node) as ReducerFunction;
  }
  if (result.kind === "known") {
    return reducerDiagnostic("LFG_UNSUPPORTED_REDUCER", "Machine reducer must resolve to a function.", result.loc);
  }

  return diagnosticFromEvaluation(result);
};

const readDestructuredNextStateName = (nameNode: BindingName): string | undefined => {
  if (!Node.isObjectBindingPattern(nameNode)) return undefined;

  for (const element of nameNode.getElements()) {
    const propertyNameNode = element.getPropertyNameNode();
    const bindingNameNode = element.getNameNode();
    const propertyName = propertyNameNode && Node.isIdentifier(propertyNameNode) ? propertyNameNode.getText() : undefined;
    const bindingName = bindingNameText(bindingNameNode);

    if (!propertyName && bindingName === "nextState") return bindingName;
    if (propertyName === "nextState" && bindingName) return bindingName;
  }

  return undefined;
};

export const readReducerParameters = (
  reducer: ReducerFunction,
  context: CompilerContext,
): ReducerParameters | GraphDiagnostic => {
  const [stateParam, actionParam, metaParam] = reducer.getParameters();
  const stateName = stateParam ? bindingNameText(stateParam.getNameNode()) : undefined;
  const actionName = actionParam ? bindingNameText(actionParam.getNameNode()) : undefined;

  if (!stateName || !actionName) {
    return reducerDiagnostic(
      "LFG_UNSUPPORTED_REDUCER",
      "Reducer compiler requires identifier state and action parameters.",
      context.source.locFromNode(reducer),
    );
  }

  return {
    stateName,
    actionName,
    nextStateName: metaParam ? readDestructuredNextStateName(metaParam.getNameNode()) : undefined,
  };
};
