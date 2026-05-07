import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type BinaryExpression,
  type BindingName,
  type Expression,
  type FunctionExpression,
  type IfStatement,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type Statement,
  type SwitchStatement,
} from "ts-morph";
import type { GraphCondition, GraphDiagnostic, SourceLocation } from "../types";
import type { MachineCandidate } from "./candidates";
import type {
  CompilerContext,
  ConfigGraphSlice,
  ConfigTransitionSlice,
  ReducerCaseSlice,
  ReducerGraphSlice,
  ReducerTargetSlice,
  ReducerTransitionSlice,
} from "./pipeline";
import type { EvaluationResult } from "./evaluator";

type ReducerFunction = ArrowFunction | FunctionExpression;

type ReducerParameters = {
  stateName: string;
  actionName: string;
  nextStateName?: string;
};

type RawReducerTarget =
  | { kind: "literal"; label: string; loc?: SourceLocation }
  | { kind: "nextState"; loc?: SourceLocation }
  | { kind: "graph"; targetLabel: string | null; target: ReducerTargetSlice["target"]; loc?: SourceLocation };

type ReducerWrite = {
  targets: RawReducerTarget[];
  guard?: GraphCondition;
  confidence: ReducerCaseSlice["confidence"];
};

type BranchRead = {
  writes: ReducerWrite[];
  diagnostics: GraphDiagnostic[];
};

type AcceptedTransition = Pick<ConfigTransitionSlice, "sourceKey" | "event" | "targetLabel" | "target" | "confidence" | "loc">;

type BuildState = {
  acceptedTransitions: AcceptedTransition[];
  acceptedEvents: string[];
  explicitEvents: Set<string>;
  diagnostics: GraphDiagnostic[];
  cases: ReducerCaseSlice[];
  transitions: ReducerTransitionSlice[];
};

const EMPTY_REDUCER_SLICE: ReducerGraphSlice = {
  reducerCases: [],
  transitions: [],
  diagnostics: [],
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

const propertyNameText = (property: PropertyAssignment): string | undefined => {
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) return nameNode.getText();
  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) return nameNode.getLiteralText();

  return undefined;
};

const readMachineOptions = (candidate: MachineCandidate): ObjectLiteralExpression | undefined => {
  const [firstArgument] = candidate.call.getArguments();
  if (!firstArgument || !Node.isExpression(firstArgument)) return undefined;

  const options = unwrapTransparentExpression(firstArgument);
  return Node.isObjectLiteralExpression(options) ? options : undefined;
};

const readOption = (options: ObjectLiteralExpression, key: string): Expression | undefined => {
  for (const property of options.getProperties()) {
    if (Node.isPropertyAssignment(property) && propertyNameText(property) === key) {
      return property.getInitializerOrThrow();
    }

    if (Node.isShorthandPropertyAssignment(property) && property.getName() === key) {
      return property.getNameNode();
    }
  }

  return undefined;
};

const reducerDiagnostic = (
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

  return reducerDiagnostic(
    "LFG_UNSUPPORTED_REDUCER",
    result.message,
    result.loc,
  );
};

const knownReducerFunction = (result: EvaluationResult): ReducerFunction | GraphDiagnostic => {
  if (result.kind === "known" && result.value.kind === "function") {
    return unwrapTransparentExpression(result.value.node) as ReducerFunction;
  }

  if (result.kind === "known") {
    return reducerDiagnostic("LFG_UNSUPPORTED_REDUCER", "Machine reducer must resolve to a function.", result.loc);
  }

  return diagnosticFromEvaluation(result);
};

const bindingNameText = (nameNode: BindingName): string | undefined => {
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
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

const readReducerParameters = (
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

const condition = (
  text: string,
  kind: GraphCondition["kind"],
  loc?: SourceLocation,
): GraphCondition => ({
  text,
  kind,
  loc,
});

const isActionTypeAccess = (expression: Expression, actionName: string): boolean => {
  const unwrapped = unwrapTransparentExpression(expression);
  if (!Node.isPropertyAccessExpression(unwrapped)) return false;

  const receiver = unwrapTransparentExpression(unwrapped.getExpression());
  return Node.isIdentifier(receiver) && receiver.getText() === actionName && unwrapped.getName() === "type";
};

const stringFromExpression = (expression: Expression, context: CompilerContext): string | undefined => {
  const evaluated = context.evaluator.evaluateExpression(expression);

  return evaluated.kind === "known" && evaluated.value.kind === "string" ? evaluated.value.value : undefined;
};

const eventTypeFromEquality = (
  expression: BinaryExpression,
  actionName: string,
  context: CompilerContext,
): string | undefined => {
  if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken) return undefined;

  const left = expression.getLeft();
  const right = expression.getRight();
  if (isActionTypeAccess(left, actionName)) return stringFromExpression(right, context);
  if (isActionTypeAccess(right, actionName)) return stringFromExpression(left, context);

  return undefined;
};

const eventTypeFromCondition = (
  expression: Expression,
  actionName: string,
  context: CompilerContext,
): string | undefined => {
  const unwrapped = unwrapTransparentExpression(expression);
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
): { targets: RawReducerTarget[]; diagnostics: GraphDiagnostic[]; confidence: ReducerCaseSlice["confidence"]; guard?: GraphCondition } => {
  const unwrapped = unwrapTransparentExpression(expression);

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
  const unwrapped = unwrapTransparentExpression(expression);
  return Node.isIdentifier(unwrapped) && (unwrapped.getText() === parameters.stateName || aliases.has(unwrapped.getText()));
};

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

  const receiver = unwrapTransparentExpression(left.getExpression());
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
    writes: [
      {
        targets: target.targets,
        guard: target.guard,
        confidence: target.confidence,
      },
    ],
    diagnostics: target.diagnostics,
  };
};

const readReturnState = (
  expression: Expression | undefined,
  parameters: ReducerParameters,
  context: CompilerContext,
): BranchRead => {
  if (!expression) return { writes: [], diagnostics: [] };

  const unwrapped = unwrapTransparentExpression(expression);
  if (!Node.isObjectLiteralExpression(unwrapped)) return { writes: [], diagnostics: [] };

  for (const property of unwrapped.getProperties()) {
    if (!Node.isPropertyAssignment(property) || propertyNameText(property) !== "state") continue;

    const target = readTargetExpression(property.getInitializerOrThrow(), parameters, context);

    return {
      writes: [
        {
          targets: target.targets,
          guard: target.guard,
          confidence: target.confidence,
        },
      ],
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

const collectWritesFromStatements = (
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

const statementsFromBranch = (statement: Statement): readonly Statement[] => {
  return Node.isBlock(statement) ? statement.getStatements() : [statement];
};

const acceptedTransitionsForEvent = (state: BuildState, eventType: string): AcceptedTransition[] => {
  return state.acceptedTransitions.filter((transition) => transition.event.type === eventType);
};

const targetKey = (target: ReducerTargetSlice): string => {
  if (target.target) return `${target.target.kind}:${JSON.stringify(target.target)}`;

  return target.targetLabel ?? "self";
};

const uniqueTargets = (targets: readonly ReducerTargetSlice[]): ReducerTargetSlice[] => {
  const seen = new Set<string>();
  const result: ReducerTargetSlice[] = [];

  for (const target of targets) {
    const key = targetKey(target);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(target);
  }

  return result;
};

const resolveRawTargetForCase = (
  target: RawReducerTarget,
  acceptedTransitions: readonly AcceptedTransition[],
): ReducerTargetSlice[] => {
  if (target.kind === "literal") return [{ targetLabel: target.label, loc: target.loc }];
  if (target.kind === "graph") return [{ targetLabel: target.targetLabel, target: target.target, loc: target.loc }];

  if (acceptedTransitions.length === 0) {
    return [
      {
        targetLabel: "nextState",
        target: { kind: "dynamic", label: "nextState" },
        loc: target.loc,
      },
    ];
  }

  return uniqueTargets(
    acceptedTransitions.map((transition) => ({
      targetLabel: transition.targetLabel,
      target: transition.target,
      loc: transition.loc,
    })),
  );
};

const resolveRawTargetForTransition = (
  target: RawReducerTarget,
  acceptedTransition: AcceptedTransition,
): ReducerTargetSlice => {
  if (target.kind === "literal") return { targetLabel: target.label, loc: target.loc };
  if (target.kind === "graph") return { targetLabel: target.targetLabel, target: target.target, loc: target.loc };

  return {
    targetLabel: acceptedTransition.targetLabel,
    target: acceptedTransition.target,
    loc: target.loc,
  };
};

const combineConfidence = (
  left: ReducerCaseSlice["confidence"],
  right: ReducerCaseSlice["confidence"] | undefined,
): ReducerCaseSlice["confidence"] => {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "partial" || right === "partial") return "partial";

  return "exact";
};

const confidenceFromWrites = (writes: readonly ReducerWrite[], hasDiagnostics: boolean): ReducerCaseSlice["confidence"] => {
  if (writes.some((write) => write.confidence === "unknown")) return "unknown";
  if (hasDiagnostics || writes.some((write) => write.confidence === "partial")) return "partial";

  return "exact";
};

const addCase = (
  state: BuildState,
  eventType: string,
  writes: readonly ReducerWrite[],
  guard: GraphCondition | undefined,
  hasDiagnostics: boolean,
  loc: SourceLocation | undefined,
) => {
  const acceptedTransitions = acceptedTransitionsForEvent(state, eventType);
  const rawTargets = writes.flatMap((write) => write.targets);
  const targets = uniqueTargets(rawTargets.flatMap((target) => resolveRawTargetForCase(target, acceptedTransitions)));
  const caseIndex = state.cases.length;
  const confidence = confidenceFromWrites(writes, hasDiagnostics);
  const caseGuard = writes.find((write) => write.guard)?.guard ?? guard;

  state.cases.push({
    event: { type: eventType, source: "reducer" },
    guard: caseGuard,
    writesState: writes.length > 0,
    targets,
    confidence,
    loc,
  });
  state.explicitEvents.add(eventType);

  for (const acceptedTransition of acceptedTransitions) {
    for (const rawTarget of rawTargets) {
      const target = resolveRawTargetForTransition(rawTarget, acceptedTransition);

      state.transitions.push({
        sourceKey: acceptedTransition.sourceKey,
        event: { type: eventType, source: "reducer" },
        targetLabel: target.targetLabel,
        target: target.target,
        guard: caseGuard,
        reducerCaseIndex: caseIndex,
        confidence: combineConfidence(confidence, acceptedTransition.confidence),
        loc: target.loc,
      });
    }
  }
};

const addBranchCases = (
  state: BuildState,
  eventTypes: readonly string[],
  branch: BranchRead,
  guard: GraphCondition | undefined,
  loc?: SourceLocation,
) => {
  state.diagnostics.push(...branch.diagnostics);
  if (branch.writes.length === 0 && branch.diagnostics.length === 0) return;

  for (const eventType of eventTypes) addCase(state, eventType, branch.writes, guard, branch.diagnostics.length > 0, loc);
};

const remainingAcceptedEvents = (state: BuildState, excludedEvents: ReadonlySet<string>): string[] => {
  return state.acceptedEvents.filter((eventType) => !excludedEvents.has(eventType));
};

const inferFallbackEvents = (state: BuildState, chainEvents: ReadonlySet<string>): string[] => {
  const remaining = remainingAcceptedEvents(state, new Set([...state.explicitEvents, ...chainEvents]));
  if (remaining.length > 0) return remaining;

  return chainEvents.size === 1 ? [...chainEvents] : [];
};

const addUnsupportedBranchDiagnostic = (state: BuildState, branch: BranchRead, loc?: SourceLocation) => {
  state.diagnostics.push(...branch.diagnostics);
  if (branch.writes.length === 0 && branch.diagnostics.length === 0) return;

  state.diagnostics.push(
    reducerDiagnostic(
      "LFG_UNSUPPORTED_REDUCER_BRANCH",
      "Reducer branch must be guarded by a supported action.type check or inferable from config events.",
      loc,
    ),
  );
};

const compileIfStatement = (
  ifStatement: IfStatement,
  parameters: ReducerParameters,
  state: BuildState,
  context: CompilerContext,
) => {
  const chainEvents = new Set<string>();
  let current: IfStatement | undefined = ifStatement;
  let branchIndex = 0;

  while (current) {
    const expression = current.getExpression();
    const eventType = eventTypeFromCondition(expression, parameters.actionName, context);
    const branch = collectWritesFromStatements(statementsFromBranch(current.getThenStatement()), parameters, context);
    const guard = condition(
      context.source.textOf(expression),
      branchIndex === 0 ? "if" : "else-if",
      context.source.locFromNode(expression),
    );

    if (eventType) {
      chainEvents.add(eventType);
      addBranchCases(state, [eventType], branch, guard, context.source.locFromNode(current));
    } else {
      addUnsupportedBranchDiagnostic(state, branch, context.source.locFromNode(expression));
    }

    const elseStatement = current.getElseStatement();
    if (!elseStatement) return;
    if (Node.isIfStatement(elseStatement)) {
      current = elseStatement;
      branchIndex += 1;
      continue;
    }

    const elseBranch = collectWritesFromStatements(statementsFromBranch(elseStatement), parameters, context);
    const inferredEvents = inferFallbackEvents(state, chainEvents);
    if (inferredEvents.length === 0) {
      addUnsupportedBranchDiagnostic(state, elseBranch, context.source.locFromNode(elseStatement));
      return;
    }

    addBranchCases(
      state,
      inferredEvents,
      elseBranch,
      condition("else", "else", context.source.locFromNode(elseStatement)),
      context.source.locFromNode(elseStatement),
    );
    return;
  }
};

const compileSwitchStatement = (
  switchStatement: SwitchStatement,
  parameters: ReducerParameters,
  state: BuildState,
  context: CompilerContext,
) => {
  if (!isActionTypeAccess(switchStatement.getExpression(), parameters.actionName)) {
    state.diagnostics.push(
      reducerDiagnostic(
        "LFG_UNSUPPORTED_REDUCER_BRANCH",
        "Reducer switch must inspect action.type.",
        context.source.locFromNode(switchStatement.getExpression()),
      ),
    );
    return;
  }

  const switchEvents = new Set<string>();
  for (const clause of switchStatement.getCaseBlock().getClauses()) {
    const branch = collectWritesFromStatements(clause.getStatements(), parameters, context);
    if (Node.isCaseClause(clause)) {
      const eventType = stringFromExpression(clause.getExpression(), context);
      if (!eventType) {
        addUnsupportedBranchDiagnostic(state, branch, context.source.locFromNode(clause.getExpression()));
        continue;
      }

      switchEvents.add(eventType);
      addBranchCases(
        state,
        [eventType],
        branch,
        condition(`case ${context.source.textOf(clause.getExpression())}`, "switch-case", context.source.locFromNode(clause)),
        context.source.locFromNode(clause),
      );
      continue;
    }

    const inferredEvents = inferFallbackEvents(state, switchEvents);
    if (inferredEvents.length === 0) {
      addUnsupportedBranchDiagnostic(state, branch, context.source.locFromNode(clause));
      continue;
    }

    addBranchCases(
      state,
      inferredEvents,
      branch,
      condition("default", "else", context.source.locFromNode(clause)),
      context.source.locFromNode(clause),
    );
  }
};

const compileEventlessStatement = (
  statement: Statement,
  parameters: ReducerParameters,
  state: BuildState,
  context: CompilerContext,
) => {
  const branch = collectWritesFromStatements([statement], parameters, context);
  const inferredEvents = remainingAcceptedEvents(state, state.explicitEvents);
  if (inferredEvents.length === 0) {
    addUnsupportedBranchDiagnostic(state, branch, context.source.locFromNode(statement));
    return;
  }

  addBranchCases(state, inferredEvents, branch, undefined, context.source.locFromNode(statement));
};

const compileReducerStatements = (
  statements: readonly Statement[],
  parameters: ReducerParameters,
  state: BuildState,
  context: CompilerContext,
) => {
  for (const statement of statements) {
    if (Node.isIfStatement(statement)) {
      compileIfStatement(statement, parameters, state, context);
      continue;
    }

    if (Node.isSwitchStatement(statement)) {
      compileSwitchStatement(statement, parameters, state, context);
      continue;
    }

    compileEventlessStatement(statement, parameters, state, context);
  }
};

const acceptedEventsFromConfig = (config: ConfigGraphSlice): string[] => {
  const events: string[] = [];

  for (const transition of config.transitions) {
    if (!events.includes(transition.event.type)) events.push(transition.event.type);
  }

  return events;
};

const createBuildState = (config: ConfigGraphSlice): BuildState => ({
  acceptedTransitions: config.transitions,
  acceptedEvents: acceptedEventsFromConfig(config),
  explicitEvents: new Set(),
  diagnostics: [],
  cases: [],
  transitions: [],
});

export const compileReducerGraph = (
  candidate: MachineCandidate,
  config: ConfigGraphSlice,
  context: CompilerContext,
): ReducerGraphSlice => {
  const options = readMachineOptions(candidate);
  if (!options) return EMPTY_REDUCER_SLICE;

  const reducerOption = readOption(options, "reducer");
  if (!reducerOption) return EMPTY_REDUCER_SLICE;

  const reducerResult = context.evaluator.evaluateExpression(reducerOption, { expectedPosition: "reducer" });
  const reducer = knownReducerFunction(reducerResult);
  if ("code" in reducer) {
    return {
      reducerCases: [],
      transitions: [],
      diagnostics: [reducer],
    };
  }

  const parameters = readReducerParameters(reducer, context);
  if ("code" in parameters) {
    return {
      reducerCases: [],
      transitions: [],
      diagnostics: [parameters],
    };
  }

  const state = createBuildState(config);
  const body = reducer.getBody();
  if (Node.isBlock(body)) {
    compileReducerStatements(body.getStatements(), parameters, state, context);
  } else {
    const expressionBody = body as Expression;
    const branch = readReturnState(expressionBody, parameters, context);
    addBranchCases(state, state.acceptedEvents, branch, undefined, context.source.locFromNode(expressionBody));
  }

  return {
    reducerCases: state.cases,
    transitions: state.transitions,
    diagnostics: state.diagnostics,
  };
};
