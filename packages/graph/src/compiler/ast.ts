import {
  Node,
  type BindingName,
  type CallExpression,
  type Expression,
  type ObjectLiteralExpression,
  type Statement,
} from "ts-morph";
import type { GraphCondition, GraphTransition, SourceLocation } from "../types";
import type { PartialEvaluator } from "./evaluator/types";

type Confidence = GraphTransition["confidence"];

export const unwrapTransparent = (expression: Expression): Expression => {
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

export const propertyNameText = (node: Node): string | undefined => {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) return node.getLiteralText();

  return undefined;
};

export const bindingNameText = (nameNode: BindingName): string | undefined => {
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
};

export const readMachineOptions = (call: CallExpression): ObjectLiteralExpression | undefined => {
  const [firstArgument] = call.getArguments();
  if (!firstArgument || !Node.isExpression(firstArgument)) return undefined;

  const options = unwrapTransparent(firstArgument);
  return Node.isObjectLiteralExpression(options) ? options : undefined;
};

export const readMachineOption = (options: ObjectLiteralExpression, key: string): Expression | undefined => {
  for (const property of options.getProperties()) {
    if (Node.isPropertyAssignment(property) && propertyNameText(property.getNameNode()) === key) {
      return property.getInitializerOrThrow();
    }
    if (Node.isShorthandPropertyAssignment(property) && property.getName() === key) {
      return property.getNameNode();
    }
  }

  return undefined;
};

export const statementsFromBranch = (statement: Statement): readonly Statement[] => {
  return Node.isBlock(statement) ? statement.getStatements() : [statement];
};

export const isActionTypeAccess = (expression: Expression, actionName: string | undefined): boolean => {
  if (!actionName) return false;

  const unwrapped = unwrapTransparent(expression);
  if (!Node.isPropertyAccessExpression(unwrapped)) return false;

  const receiver = unwrapTransparent(unwrapped.getExpression());
  return Node.isIdentifier(receiver) && receiver.getText() === actionName && unwrapped.getName() === "type";
};

export const condition = (
  text: string,
  kind: GraphCondition["kind"],
  loc?: SourceLocation,
): GraphCondition => ({
  text,
  kind,
  loc,
});

export const combineConfidence = (left: Confidence, right: Confidence | undefined): Confidence => {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "partial" || right === "partial") return "partial";

  return "exact";
};

export const stringFromExpression = (
  expression: Expression,
  evaluator: PartialEvaluator,
): string | undefined => {
  const result = evaluator.evaluateExpression(expression);

  return result.kind === "known" && result.value.kind === "string" ? result.value.value : undefined;
};
