import {
  Node,
  type ArrowFunction,
  type BindingName,
  type FunctionExpression,
  type MethodDeclaration,
} from "ts-morph";
import type { GraphDiagnostic, SourceLocation } from "../../types";
import { bindingNameText } from "../ast";
import type { EvaluatedGraphValue, EvaluationResult } from "../evaluator/types";
import type { CompilerContext, EffectsGraphSlice } from "../pipeline";

export type EffectFunction = ArrowFunction | FunctionExpression | MethodDeclaration;

export type EffectParameters = {
  transitionName: string;
  actionName?: string;
  selfName?: string;
};

export const EMPTY_EFFECTS_SLICE: EffectsGraphSlice = {
  emissions: [],
  diagnostics: [],
};

export const effectDiagnostic = (
  code: string,
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  loc,
});

const diagnosticFromEvaluation = (
  result: Exclude<EvaluationResult, { kind: "known" }>,
  subject: "effects" | "effect",
): GraphDiagnostic => {
  if (result.kind === "external") {
    return effectDiagnostic(
      subject === "effects" ? "LFG_UNRESOLVED_EFFECTS" : "LFG_UNRESOLVED_EFFECT",
      `${subject === "effects" ? "Effects value" : "Effect entry"} '${result.label}' cannot be resolved from the current source string.`,
      result.loc,
    );
  }

  if (result.kind === "dynamic") {
    return effectDiagnostic(
      subject === "effects" ? "LFG_DYNAMIC_EFFECTS" : "LFG_DYNAMIC_EFFECT",
      `${subject === "effects" ? "Effects expression" : "Effect entry"} is dynamic and cannot be compiled statically.`,
      result.loc,
    );
  }

  return effectDiagnostic(
    subject === "effects" ? "LFG_UNSUPPORTED_EFFECTS" : "LFG_UNSUPPORTED_EFFECT",
    result.message,
    result.loc,
  );
};

export const knownEffectsObject = (
  result: EvaluationResult,
): Extract<EvaluatedGraphValue, { kind: "object" }> | GraphDiagnostic => {
  if (result.kind === "known" && result.value.kind === "object") return result.value;

  if (result.kind === "known") {
    return effectDiagnostic("LFG_UNSUPPORTED_EFFECTS", "Machine effects must resolve to an object literal.", result.loc);
  }

  return diagnosticFromEvaluation(result, "effects");
};

const effectFunctionFromKnownValue = (
  value: EvaluatedGraphValue,
  loc: SourceLocation | undefined,
): EffectFunction | GraphDiagnostic => {
  if (value.kind !== "function") {
    return effectDiagnostic("LFG_UNSUPPORTED_EFFECT", "Effect entry must resolve to a function.", loc);
  }

  const node = value.node;
  if (Node.isMethodDeclaration(node)) return node;

  return node as ArrowFunction | FunctionExpression;
};

export const knownEffectFunction = (
  value: EvaluatedGraphValue,
  context: CompilerContext,
): EffectFunction | GraphDiagnostic => {
  if (value.kind === "function") return effectFunctionFromKnownValue(value, value.loc);

  const effectExpression = value as Extract<EvaluatedGraphValue, { kind: "expression" }>;
  const result = context.evaluator.evaluateExpression(effectExpression.node, { expectedPosition: "effectEntry" });
  if (result.kind === "known") return effectFunctionFromKnownValue(result.value, result.loc);

  return diagnosticFromEvaluation(result, "effect");
};

const bindingPropertyName = (element: { getPropertyNameNode(): Node | undefined; getNameNode(): BindingName }): string | undefined => {
  const propertyNameNode = element.getPropertyNameNode();
  if (!propertyNameNode) return bindingNameText(element.getNameNode());
  if (Node.isIdentifier(propertyNameNode)) return propertyNameNode.getText();
  if (Node.isStringLiteral(propertyNameNode)) return propertyNameNode.getLiteralText();

  return undefined;
};

export const readEffectParameters = (
  effect: EffectFunction,
  context: CompilerContext,
): EffectParameters | GraphDiagnostic => {
  const [payloadParam] = effect.getParameters();
  if (!payloadParam) {
    return effectDiagnostic(
      "LFG_UNSUPPORTED_EFFECT",
      "Effect compiler requires a parameter containing transition.",
      context.source.locFromNode(effect),
    );
  }

  const nameNode = payloadParam.getNameNode();
  if (Node.isIdentifier(nameNode) && nameNode.getText() === "transition") {
    return { transitionName: nameNode.getText() };
  }

  if (!Node.isObjectBindingPattern(nameNode)) {
    return effectDiagnostic(
      "LFG_UNSUPPORTED_EFFECT",
      "Effect compiler requires an object binding parameter containing transition.",
      context.source.locFromNode(payloadParam),
    );
  }

  const parameters: Partial<EffectParameters> = {};
  for (const element of nameNode.getElements()) {
    const propertyName = bindingPropertyName(element);
    const elementBindingName = bindingNameText(element.getNameNode());
    if (!propertyName || !elementBindingName) continue;

    if (propertyName === "transition") parameters.transitionName = elementBindingName;
    if (propertyName === "action") parameters.actionName = elementBindingName;
    if (propertyName === "self") parameters.selfName = elementBindingName;
  }

  if (!parameters.transitionName) {
    return effectDiagnostic(
      "LFG_UNSUPPORTED_EFFECT",
      "Effect compiler requires a transition binding.",
      context.source.locFromNode(payloadParam),
    );
  }

  return parameters as EffectParameters;
};
