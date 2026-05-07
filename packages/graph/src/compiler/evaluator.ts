import {
  Node,
  SyntaxKind,
  type ArrayLiteralExpression,
  type Expression,
  type Identifier,
} from "ts-morph";
import type { SourceCatalog } from "./catalog";
import type { SourceAdapter } from "./source";
import { objectRule } from "./evaluator/object";
import {
  known,
  type EvaluateExpressionOptions,
  type EvaluationResult,
  type EvaluationState,
  type EvaluatorRule,
  type EvaluatorRuleContext,
  type PartialEvaluator,
} from "./evaluator/types";
import { transparentWrapperRule } from "./evaluator/wrappers";

const defaultOptions = (options: EvaluateExpressionOptions | undefined): Required<EvaluateExpressionOptions> => ({
  expectedPosition: options?.expectedPosition ?? "unknown",
});

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
