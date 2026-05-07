import {
  Node,
  type ComputedPropertyName,
  type Expression,
  type ObjectLiteralExpression,
} from "ts-morph";
import {
  known,
  type EvaluatedGraphObjectProperty,
  type EvaluatedGraphValue,
  type EvaluationResult,
  type EvaluatorRule,
  type EvaluatorRuleContext,
  type IncompleteEvaluationResult,
  type ObjectPropertyValueResult,
} from "./types";

const partialValueFromResult = (result: IncompleteEvaluationResult): EvaluatedGraphValue => {
  switch (result.kind) {
    case "external":
      return { kind: "external", label: result.label, loc: result.loc };
    case "dynamic":
      return { kind: "dynamic", label: result.label, loc: result.loc };
    case "unsupported":
      return {
        kind: "unsupported",
        code: result.code,
        message: result.message,
        loc: result.loc,
      };
  }
};

const shouldPreservePartialObjectValue = (context: EvaluatorRuleContext): boolean => {
  return context.options.expectedPosition === "config";
};

const readObjectPropertyValue = (
  result: EvaluationResult,
  context: EvaluatorRuleContext,
): ObjectPropertyValueResult => {
  if (result.kind === "known") return { ok: true, value: result.value };
  if (shouldPreservePartialObjectValue(context)) return { ok: true, value: partialValueFromResult(result) };

  return { ok: false, result };
};

const expressionValue = (expression: Expression, context: EvaluatorRuleContext): EvaluatedGraphValue => {
  const loc = context.source.locFromNode(expression);

  return {
    kind: "expression",
    node: expression,
    text: context.source.textOf(expression),
    loc,
  };
};

const isStringKnown = (result: EvaluationResult): result is Extract<EvaluationResult, { kind: "known" }> & {
  value: Extract<EvaluatedGraphValue, { kind: "string" }>;
} => result.kind === "known" && result.value.kind === "string";

const propertyNameFromComputed = (
  nameNode: ComputedPropertyName,
  context: EvaluatorRuleContext,
): string | EvaluationResult => {
  const expression = nameNode.getExpression();
  const evaluated = context.evaluate(expression, { expectedPosition: "computedKey" }, context.state);
  if (isStringKnown(evaluated)) return evaluated.value.value;

  return {
    kind: "unsupported",
    code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    message: "Computed object key must resolve to a local string literal.",
    loc: context.source.locFromNode(nameNode),
  };
};

const propertyNameFromNode = (nameNode: Node, context: EvaluatorRuleContext): string | EvaluationResult => {
  if (Node.isIdentifier(nameNode)) return nameNode.getText();
  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) return nameNode.getLiteralText();
  if (Node.isComputedPropertyName(nameNode)) return propertyNameFromComputed(nameNode, context);

  return {
    kind: "unsupported",
    code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    message: "Object property key is not supported by the partial evaluator.",
    loc: context.source.locFromNode(nameNode),
  };
};

const evaluateObjectLiteralProperties = (
  objectLiteral: ObjectLiteralExpression,
  context: EvaluatorRuleContext,
): EvaluationResult | EvaluatedGraphObjectProperty[] => {
  const properties: EvaluatedGraphObjectProperty[] = [];
  const nestedExpectedPosition =
    context.options.expectedPosition === "config" ||
    context.options.expectedPosition === "managerMap" ||
    context.options.expectedPosition === "effects"
      ? context.options.expectedPosition
      : "unknown";

  for (const property of objectLiteral.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      const spreadResult = context.evaluate(
        property.getExpression(),
        { expectedPosition: nestedExpectedPosition },
        context.state,
      );
      if (spreadResult.kind !== "known" || spreadResult.value.kind !== "object") {
        return {
          kind: "unsupported",
          code: "LFG_UNSUPPORTED_OBJECT_SPREAD",
          message: "Object spread must resolve to a local object literal.",
          loc: context.source.locFromNode(property),
        };
      }

      properties.push(...spreadResult.value.properties);
      continue;
    }

    if (Node.isShorthandPropertyAssignment(property)) {
      if (context.options.expectedPosition === "managerMap" || context.options.expectedPosition === "effects") {
        properties.push({
          key: property.getName(),
          value: expressionValue(property.getNameNode(), context),
          loc: context.source.locFromNode(property),
        });
        continue;
      }

      const value = context.evaluate(property.getNameNode(), { expectedPosition: nestedExpectedPosition }, context.state);
      const propertyValue = readObjectPropertyValue(value, context);
      if (!propertyValue.ok) return propertyValue.result;

      properties.push({
        key: property.getName(),
        value: propertyValue.value,
        loc: context.source.locFromNode(property),
      });
      continue;
    }

    if (Node.isPropertyAssignment(property)) {
      const key = propertyNameFromNode(property.getNameNode(), context);
      if (typeof key !== "string") return key;

      const initializer = property.getInitializerOrThrow();
      if (initializer.getText().trim() === "") {
        return {
          kind: "unsupported",
          code: "LFG_UNSUPPORTED_EMPTY_PROPERTY",
          message: "Object property has no initializer.",
          loc: context.source.locFromNode(property),
        };
      }

      if (context.options.expectedPosition === "managerMap" || context.options.expectedPosition === "effects") {
        properties.push({
          key,
          value: expressionValue(initializer, context),
          loc: context.source.locFromNode(property),
        });
        continue;
      }

      const value = context.evaluate(initializer, { expectedPosition: nestedExpectedPosition }, context.state);
      const propertyValue = readObjectPropertyValue(value, context);
      if (!propertyValue.ok) return propertyValue.result;

      properties.push({
        key,
        value: propertyValue.value,
        loc: context.source.locFromNode(property),
      });
      continue;
    }

    if (Node.isMethodDeclaration(property)) {
      const key = propertyNameFromNode(property.getNameNode(), context);
      if (typeof key !== "string") return key;
      const loc = context.source.locFromNode(property);

      properties.push({
        key,
        value: { kind: "function", node: property as unknown as Expression, loc },
        loc,
      });
      continue;
    }

    return {
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_OBJECT_PROPERTY",
      message: "Object property form is not supported by the partial evaluator.",
      loc: context.source.locFromNode(property),
    };
  }

  return properties;
};

export const objectRule: EvaluatorRule = {
  name: "object",
  match(node) {
    return Node.isObjectLiteralExpression(node);
  },
  read(node, context) {
    const objectLiteral = node as ObjectLiteralExpression;
    const properties = evaluateObjectLiteralProperties(objectLiteral, context);
    if (!Array.isArray(properties)) return properties;

    const loc = context.source.locFromNode(objectLiteral);
    return known({ kind: "object", properties, loc }, loc);
  },
};
