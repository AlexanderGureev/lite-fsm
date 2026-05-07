import {
  Node,
  SyntaxKind,
  type ArrayLiteralExpression,
  type CallExpression,
  type ComputedPropertyName,
  type Expression,
  type Identifier,
  type ObjectLiteralExpression,
} from "ts-morph";
import type { SourceLocation } from "../types";
import type { LiteFsmApiName, SourceCatalog } from "./catalog";
import type { SourceAdapter } from "./source";

export type EvaluationExpectedPosition =
  | "config"
  | "reducer"
  | "effectEntry"
  | "computedKey"
  | "managerMap"
  | "unknown";

export type EvaluatedGraphObjectProperty = {
  key: string;
  value: EvaluatedGraphValue;
  loc?: SourceLocation;
};

export type EvaluatedGraphValue =
  | { kind: "string"; value: string; loc?: SourceLocation }
  | { kind: "number"; value: number; loc?: SourceLocation }
  | { kind: "boolean"; value: boolean; loc?: SourceLocation }
  | { kind: "undefined"; loc?: SourceLocation }
  | { kind: "null"; loc?: SourceLocation }
  | { kind: "array"; items: EvaluatedGraphValue[]; loc?: SourceLocation }
  | { kind: "object"; properties: EvaluatedGraphObjectProperty[]; loc?: SourceLocation }
  | {
      kind: "function";
      node: Expression;
      loc?: SourceLocation;
      wrapper?: {
        kind: "createReducer" | "createEffect";
        type?: EvaluatedGraphValue;
        cancelFn?: EvaluatedGraphValue;
      };
    }
  | { kind: "expression"; node: Expression; text: string; loc?: SourceLocation }
  | { kind: "external"; label: string; loc?: SourceLocation }
  | { kind: "dynamic"; label: string; loc?: SourceLocation }
  | { kind: "unsupported"; code: string; message: string; loc?: SourceLocation };

export type EvaluationResult =
  | { kind: "known"; value: EvaluatedGraphValue; loc?: SourceLocation }
  | { kind: "external"; label: string; loc?: SourceLocation }
  | { kind: "dynamic"; label: string; loc?: SourceLocation }
  | { kind: "unsupported"; code: string; message: string; loc?: SourceLocation };

export type EvaluateExpressionOptions = {
  expectedPosition?: EvaluationExpectedPosition;
};

type EvaluationState = {
  seenIdentifiers: ReadonlySet<string>;
};

type IncompleteEvaluationResult = Exclude<EvaluationResult, { kind: "known" }>;

type ObjectPropertyValueResult =
  | { ok: true; value: EvaluatedGraphValue }
  | { ok: false; result: IncompleteEvaluationResult };

type EvaluatorRuleContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
  evaluate(node: Expression, options?: EvaluateExpressionOptions, state?: EvaluationState): EvaluationResult;
  state: EvaluationState;
  options: Required<EvaluateExpressionOptions>;
};

type EvaluatorRule = {
  name: string;
  match(node: Expression, context: EvaluatorRuleContext): boolean;
  read(node: Expression, context: EvaluatorRuleContext): EvaluationResult;
};

export type PartialEvaluator = {
  evaluateExpression(node: Expression, options?: EvaluateExpressionOptions): EvaluationResult;
};

const defaultOptions = (options: EvaluateExpressionOptions | undefined): Required<EvaluateExpressionOptions> => ({
  expectedPosition: options?.expectedPosition ?? "unknown",
});

const known = (value: EvaluatedGraphValue, loc?: SourceLocation): EvaluationResult => ({
  kind: "known",
  value,
  loc,
});

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

const unwrapExpressionRule: EvaluatorRule = {
  name: "unwrap-expression",
  match(node) {
    return (
      Node.isParenthesizedExpression(node) ||
      Node.isAsExpression(node) ||
      Node.isSatisfiesExpression(node) ||
      Node.isTypeAssertion(node)
    );
  },
  read(node, context) {
    const expression = (node as Expression & { getExpression(): Expression }).getExpression();

    return context.evaluate(expression, context.options, context.state);
  },
};

const primitiveLiteralRule: EvaluatorRule = {
  name: "primitive-literal",
  match(node) {
    return (
      Node.isStringLiteral(node) ||
      Node.isNoSubstitutionTemplateLiteral(node) ||
      Node.isNumericLiteral(node) ||
      node.getKind() === SyntaxKind.TrueKeyword ||
      node.getKind() === SyntaxKind.FalseKeyword ||
      node.getKind() === SyntaxKind.NullKeyword
    );
  },
  read(node, context) {
    const loc = context.source.locFromNode(node);
    if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
      return known({ kind: "string", value: node.getLiteralText(), loc }, loc);
    }
    if (Node.isNumericLiteral(node)) {
      return known({ kind: "number", value: Number(node.getLiteralText()), loc }, loc);
    }
    if (node.getKind() === SyntaxKind.TrueKeyword || node.getKind() === SyntaxKind.FalseKeyword) {
      return known({ kind: "boolean", value: node.getKind() === SyntaxKind.TrueKeyword, loc }, loc);
    }
    return known({ kind: "null", loc }, loc);
  },
};

const functionRule: EvaluatorRule = {
  name: "function",
  match(node) {
    return Node.isArrowFunction(node) || Node.isFunctionExpression(node);
  },
  read(node, context) {
    const loc = context.source.locFromNode(node);
    return known({ kind: "function", node, loc }, loc);
  },
};

const arrayRule: EvaluatorRule = {
  name: "array",
  match(node) {
    return Node.isArrayLiteralExpression(node);
  },
  read(node, context) {
    const arrayLiteral = node as ArrayLiteralExpression;
    const items = arrayLiteral
      .getElements()
      .map((item) => context.evaluate(item, { expectedPosition: "unknown" }, context.state));
    const unsupportedItem = items.find((item) => item.kind !== "known");
    if (unsupportedItem) return unsupportedItem;

    const loc = context.source.locFromNode(arrayLiteral);
    return known(
      {
        kind: "array",
        items: items.map((item) => (item as Extract<EvaluationResult, { kind: "known" }>).value),
        loc,
      },
      loc,
    );
  },
};

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
    context.options.expectedPosition === "config" || context.options.expectedPosition === "managerMap"
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
      if (context.options.expectedPosition === "managerMap") {
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

      if (context.options.expectedPosition === "managerMap") {
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

const objectRule: EvaluatorRule = {
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

const expectedWrapperPosition: Record<LiteFsmApiName, EvaluationExpectedPosition | undefined> = {
  createMachine: undefined,
  createConfig: "config",
  createReducer: "reducer",
  createEffect: "effectEntry",
  MachineManager: undefined,
};

const readKnownApiCall = (
  node: Expression,
  context: EvaluatorRuleContext,
): { apiName: LiteFsmApiName; provenance: "import" | "ambient" } | undefined => {
  if (!Node.isCallExpression(node)) return undefined;

  const expression = node.getExpression();
  if (!Node.isIdentifier(expression)) return undefined;

  for (const apiName of Object.keys(expectedWrapperPosition) as LiteFsmApiName[]) {
    const provenance = context.catalog.resolveApiIdentifier(expression.getText(), apiName);
    if (provenance) return { apiName, provenance };
  }

  return undefined;
};

const findObjectProperty = (
  value: Extract<EvaluatedGraphValue, { kind: "object" }>,
  key: string,
): EvaluatedGraphObjectProperty | undefined => {
  return value.properties.find((property) => property.key === key);
};

const transparentWrapperRule: EvaluatorRule = {
  name: "transparent-wrapper",
  match(node, context) {
    const apiCall = readKnownApiCall(node, context);
    if (!apiCall) return false;

    return expectedWrapperPosition[apiCall.apiName] === context.options.expectedPosition;
  },
  read(node, context) {
    const call = node as CallExpression;
    const apiCall = readKnownApiCall(call, context);
    const [firstArgument] = call.getArguments();
    if (!apiCall || !firstArgument || !Node.isExpression(firstArgument)) {
      return {
        kind: "unsupported",
        code: "LFG_UNSUPPORTED_WRAPPER",
        message: "Transparent wrapper call is missing its required argument.",
        loc: context.source.locFromNode(call),
      };
    }

    if (apiCall.apiName === "createConfig") {
      return context.evaluate(firstArgument, { expectedPosition: "config" }, context.state);
    }

    if (apiCall.apiName === "createReducer") {
      const reducer = context.evaluate(firstArgument, { expectedPosition: "unknown" }, context.state);
      if (reducer.kind !== "known" || reducer.value.kind !== "function") return reducer;

      return known(
        {
          ...reducer.value,
          wrapper: { kind: "createReducer" },
        },
        reducer.loc,
      );
    }

    const effectOptions = context.evaluate(firstArgument, { expectedPosition: "unknown" }, context.state);
    if (effectOptions.kind !== "known" || effectOptions.value.kind !== "object") return effectOptions;

    const effect = findObjectProperty(effectOptions.value, "effect");
    if (!effect || effect.value.kind !== "function") {
      return {
        kind: "unsupported",
        code: "LFG_UNSUPPORTED_CREATE_EFFECT",
        message: "createEffect wrapper must contain an effect function.",
        loc: context.source.locFromNode(call),
      };
    }

    return known(
      {
        ...effect.value,
        wrapper: {
          kind: "createEffect",
          type: findObjectProperty(effectOptions.value, "type")?.value,
          cancelFn: findObjectProperty(effectOptions.value, "cancelFn")?.value,
        },
      },
      effect.loc,
    );
  },
};

const localConstIdentifierRule: EvaluatorRule = {
  name: "local-const-identifier",
  match(node) {
    return Node.isIdentifier(node);
  },
  read(node, context) {
    const name = (node as Identifier).getText();
    if (name === "undefined") {
      const loc = context.source.locFromNode(node);

      return known({ kind: "undefined", loc }, loc);
    }

    const binding = context.catalog.getConstBinding(name);
    if (!binding) {
      return {
        kind: "external",
        label: name,
        loc: context.source.locFromNode(node),
      };
    }
    if (context.state.seenIdentifiers.has(name)) {
      return {
        kind: "unsupported",
        code: "LFG_CONST_CYCLE",
        message: `Local const '${name}' depends on itself.`,
        loc: context.source.locFromNode(node),
      };
    }

    return context.evaluate(binding.initializer, context.options, {
      seenIdentifiers: new Set([...context.state.seenIdentifiers, name]),
    });
  },
};

const dynamicCallRule: EvaluatorRule = {
  name: "dynamic-call",
  match(node) {
    return Node.isCallExpression(node);
  },
  read(node, context) {
    return {
      kind: "dynamic",
      label: context.source.textOf(node),
      loc: context.source.locFromNode(node),
    };
  },
};

const unsupportedRule: EvaluatorRule = {
  name: "unsupported",
  match() {
    return true;
  },
  read(node, context) {
    return {
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_EXPRESSION",
      message: `Expression form '${SyntaxKind[node.getKind()]}' is not supported by the partial evaluator.`,
      loc: context.source.locFromNode(node),
    };
  },
};

const EVALUATOR_RULES: readonly EvaluatorRule[] = [
  unwrapExpressionRule,
  primitiveLiteralRule,
  functionRule,
  arrayRule,
  objectRule,
  transparentWrapperRule,
  localConstIdentifierRule,
  dynamicCallRule,
  unsupportedRule,
];

export const createPartialEvaluator = (source: SourceAdapter, catalog: SourceCatalog): PartialEvaluator => {
  const evaluateExpression = (
    node: Expression,
    options?: EvaluateExpressionOptions,
    state: EvaluationState = { seenIdentifiers: new Set() },
  ): EvaluationResult => {
    const context: EvaluatorRuleContext = {
      source,
      catalog,
      evaluate: evaluateExpression,
      state,
      options: defaultOptions(options),
    };
    const rule = EVALUATOR_RULES.find((resolver) => resolver.match(node, context)) as EvaluatorRule;

    return rule.read(node, context);
  };

  return { evaluateExpression };
};
