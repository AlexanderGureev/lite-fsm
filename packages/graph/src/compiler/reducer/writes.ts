import {
  Node,
  SyntaxKind,
  type BinaryExpression,
  type Expression,
  type Statement,
} from "ts-morph";
import type { GraphCondition, GraphDiagnostic, GraphTransition, SourceLocation } from "../../types";
import {
  bindingNameText,
  condition,
  isActionTypeAccess,
  propertyNameText,
  stringFromExpression,
  unwrapTransparent,
} from "../ast";
import type { EvaluationResult } from "../evaluator/types";
import type { CompilerContext, ReducerTargetSlice } from "../pipeline";
import { reducerDiagnostic, type ReducerParameters } from "./setup";

type Confidence = GraphTransition["confidence"];

export type RawReducerTarget =
  | { kind: "literal"; label: string; loc?: SourceLocation }
  | { kind: "nextState"; loc?: SourceLocation }
  | { kind: "graph"; targetLabel: string | null; target: ReducerTargetSlice["target"]; loc?: SourceLocation };

export type ReducerWrite = {
  targets: RawReducerTarget[];
  guard?: GraphCondition;
  confidence: Confidence;
};

export type BranchRead = {
  writes: ReducerWrite[];
  diagnostics: GraphDiagnostic[];
};

type TargetRead = {
  targets: RawReducerTarget[];
  diagnostics: GraphDiagnostic[];
  confidence: Confidence;
  guard?: GraphCondition;
};

const eventTypeFromEquality = (
  expression: BinaryExpression,
  actionName: string,
  context: CompilerContext,
): string | undefined => {
  if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken) return undefined;

  const left = expression.getLeft();
  const right = expression.getRight();
  if (isActionTypeAccess(left, actionName)) return stringFromExpression(right, context.evaluator);
  if (isActionTypeAccess(right, actionName)) return stringFromExpression(left, context.evaluator);

  return undefined;
};

export const eventTypeFromCondition = (
  expression: Expression,
  actionName: string,
  context: CompilerContext,
): string | undefined => {
  const unwrapped = unwrapTransparent(expression);
  if (!Node.isBinaryExpression(unwrapped)) return undefined;

  if (unwrapped.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken) {
    const left = eventTypeFromCondition(unwrapped.getLeft(), actionName, context);
    const right = eventTypeFromCondition(unwrapped.getRight(), actionName, context);

    if (left && right && left !== right) return undefined;
    return left ?? right;
  }

  return eventTypeFromEquality(unwrapped, actionName, context);
};

const targetDiagnostic = (expression: Expression, context: CompilerContext): GraphDiagnostic => {
  return reducerDiagnostic(
    "LFG_UNSUPPORTED_REDUCER_TARGET",
    `Reducer state target '${context.source.textOf(expression)}' cannot be compiled statically.`,
    context.source.locFromNode(expression),
  );
};

const graphTargetFromEvaluation = (result: EvaluationResult): RawReducerTarget => {
  const label =
    result.kind === "external" || result.kind === "dynamic"
      ? result.label
      : result.kind === "unsupported"
        ? result.code
        : result.value.kind;

  return {
    kind: "graph",
    targetLabel: label,
    target:
      result.kind === "external" || result.kind === "dynamic"
        ? { kind: "dynamic", label }
        : { kind: "unknown", label },
    loc: result.loc,
  };
};

const readTargetExpression = (
  expression: Expression,
  parameters: ReducerParameters,
  context: CompilerContext,
): TargetRead => {
  const unwrapped = unwrapTransparent(expression);

  if (Node.isConditionalExpression(unwrapped)) {
    const ternaryGuard = condition(
      context.source.textOf(unwrapped.getCondition()),
      "ternary",
      context.source.locFromNode(unwrapped.getCondition()),
    );
    const trueBranch = readTargetExpression(unwrapped.getWhenTrue(), parameters, context);
    const falseBranch = readTargetExpression(unwrapped.getWhenFalse(), parameters, context);

    return {
      targets: [...trueBranch.targets, ...falseBranch.targets],
      diagnostics: [...trueBranch.diagnostics, ...falseBranch.diagnostics],
      confidence: trueBranch.confidence === "unknown" || falseBranch.confidence === "unknown" ? "unknown" : "partial",
      guard: ternaryGuard,
    };
  }

  if (Node.isIdentifier(unwrapped) && parameters.nextStateName && unwrapped.getText() === parameters.nextStateName) {
    return {
      targets: [{ kind: "nextState", loc: context.source.locFromNode(unwrapped) }],
      diagnostics: [],
      confidence: "exact",
    };
  }

  const evaluated = context.evaluator.evaluateExpression(unwrapped);
  if (evaluated.kind === "known" && evaluated.value.kind === "string") {
    return {
      targets: [{ kind: "literal", label: evaluated.value.value, loc: evaluated.value.loc }],
      diagnostics: [],
      confidence: "exact",
    };
  }

  return {
    targets: [graphTargetFromEvaluation(evaluated)],
    diagnostics: [targetDiagnostic(unwrapped, context)],
    confidence: "unknown",
  };
};

const isStateIdentifier = (expression: Expression, parameters: ReducerParameters, aliases: ReadonlySet<string>): boolean => {
  const unwrapped = unwrapTransparent(expression);
  return Node.isIdentifier(unwrapped) && (unwrapped.getText() === parameters.stateName || aliases.has(unwrapped.getText()));
};

const writeFromTargetRead = (target: TargetRead): ReducerWrite => ({
  targets: target.targets,
  guard: target.guard,
  confidence: target.confidence,
});

const readStateAssignment = (
  expression: Expression,
  parameters: ReducerParameters,
  aliases: ReadonlySet<string>,
  context: CompilerContext,
): BranchRead => {
  if (!Node.isBinaryExpression(expression) || expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return { writes: [], diagnostics: [] };
  }

  const left = expression.getLeft();
  if (Node.isElementAccessExpression(left) && isStateIdentifier(left.getExpression(), parameters, aliases)) {
    return {
      writes: [],
      diagnostics: [
        reducerDiagnostic(
          "LFG_UNSUPPORTED_REDUCER_MUTATION",
          "Reducer compiler does not support computed state assignments.",
          context.source.locFromNode(left),
        ),
      ],
    };
  }

  if (!Node.isPropertyAccessExpression(left)) return { writes: [], diagnostics: [] };

  const receiver = unwrapTransparent(left.getExpression());
  if (!Node.isIdentifier(receiver) || left.getName() !== "state") return { writes: [], diagnostics: [] };

  if (aliases.has(receiver.getText())) {
    return {
      writes: [],
      diagnostics: [
        reducerDiagnostic(
          "LFG_UNSUPPORTED_REDUCER_MUTATION",
          "Reducer compiler does not follow aliases of the reducer state parameter.",
          context.source.locFromNode(left),
        ),
      ],
    };
  }

  if (receiver.getText() !== parameters.stateName) return { writes: [], diagnostics: [] };

  const target = readTargetExpression(expression.getRight(), parameters, context);

  return {
    writes: [writeFromTargetRead(target)],
    diagnostics: target.diagnostics,
  };
};

export const readReturnState = (
  expression: Expression | undefined,
  parameters: ReducerParameters,
  context: CompilerContext,
): BranchRead => {
  if (!expression) return { writes: [], diagnostics: [] };

  const unwrapped = unwrapTransparent(expression);
  if (!Node.isObjectLiteralExpression(unwrapped)) return { writes: [], diagnostics: [] };

  for (const property of unwrapped.getProperties()) {
    if (!Node.isPropertyAssignment(property) || propertyNameText(property.getNameNode()) !== "state") continue;

    const target = readTargetExpression(property.getInitializerOrThrow(), parameters, context);

    return {
      writes: [writeFromTargetRead(target)],
      diagnostics: target.diagnostics,
    };
  }

  return { writes: [], diagnostics: [] };
};

const callUsesStateParameter = (
  expression: Expression,
  parameters: ReducerParameters,
  aliases: ReadonlySet<string>,
): boolean => {
  if (!Node.isCallExpression(expression)) return false;

  return expression.getArguments().some((argument) => Node.isExpression(argument) && isStateIdentifier(argument, parameters, aliases));
};

const appendBranchRead = (target: BranchRead, source: BranchRead) => {
  target.writes.push(...source.writes);
  target.diagnostics.push(...source.diagnostics);
};

export const collectWritesFromStatements = (
  statements: readonly Statement[],
  parameters: ReducerParameters,
  context: CompilerContext,
  aliases: Set<string> = new Set(),
): BranchRead => {
  const result: BranchRead = { writes: [], diagnostics: [] };

  for (const statement of statements) {
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarationList().getDeclarations()) {
        const name = bindingNameText(declaration.getNameNode());
        const initializer = declaration.getInitializer();
        if (name && initializer && isStateIdentifier(initializer, parameters, aliases)) aliases.add(name);
      }
      continue;
    }

    if (Node.isExpressionStatement(statement)) {
      const expression = statement.getExpression();
      appendBranchRead(result, readStateAssignment(expression, parameters, aliases, context));
      if (callUsesStateParameter(expression, parameters, aliases)) {
        result.diagnostics.push(
          reducerDiagnostic(
            "LFG_UNSUPPORTED_REDUCER_MUTATION",
            "Reducer compiler does not support state mutation through helper calls.",
            context.source.locFromNode(expression),
          ),
        );
      }
      continue;
    }

    if (Node.isReturnStatement(statement)) {
      appendBranchRead(result, readReturnState(statement.getExpression(), parameters, context));
      continue;
    }

    if (Node.isBlock(statement)) {
      appendBranchRead(result, collectWritesFromStatements(statement.getStatements(), parameters, context, aliases));
    }
  }

  return result;
};
