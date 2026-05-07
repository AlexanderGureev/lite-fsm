import {
  Node,
  type Expression,
  type IfStatement,
  type Statement,
  type SwitchStatement,
} from "ts-morph";
import type { GraphCondition, GraphDiagnostic, GraphTransition, SourceLocation } from "../types";
import {
  combineConfidence,
  condition,
  isActionTypeAccess,
  readMachineOption,
  readMachineOptions,
  statementsFromBranch,
  stringFromExpression,
} from "./ast";
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
import {
  EMPTY_REDUCER_SLICE,
  knownReducerFunction,
  readReducerParameters,
  reducerDiagnostic,
  type ReducerParameters,
} from "./reducer/setup";
import {
  collectWritesFromStatements,
  eventTypeFromCondition,
  readReturnState,
  type BranchRead,
  type RawReducerTarget,
  type ReducerWrite,
} from "./reducer/writes";

type Confidence = GraphTransition["confidence"];

type AcceptedTransition = Pick<ConfigTransitionSlice, "sourceKey" | "event" | "targetLabel" | "target" | "confidence" | "loc">;

type BuildState = {
  acceptedTransitions: AcceptedTransition[];
  acceptedEvents: string[];
  explicitEvents: Set<string>;
  diagnostics: GraphDiagnostic[];
  cases: ReducerCaseSlice[];
  transitions: ReducerTransitionSlice[];
};

type ReducerStatementRule = {
  name: string;
  match(statement: Statement): boolean;
  compile(statement: Statement, parameters: ReducerParameters, state: BuildState, context: CompilerContext): void;
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

const confidenceFromWrites = (writes: readonly ReducerWrite[], hasDiagnostics: boolean): Confidence => {
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
  const caseConfidence = confidenceFromWrites(writes, hasDiagnostics);
  const caseGuard = writes.find((write) => write.guard)?.guard ?? guard;

  state.cases.push({
    event: { type: eventType, source: "reducer" },
    guard: caseGuard,
    writesState: writes.length > 0,
    targets,
    confidence: caseConfidence,
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
        confidence: combineConfidence(caseConfidence, acceptedTransition.confidence),
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
      const eventType = stringFromExpression(clause.getExpression(), context.evaluator);
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

const REDUCER_STATEMENT_RULES: readonly ReducerStatementRule[] = [
  {
    name: "if-statement",
    match: Node.isIfStatement,
    compile(statement, parameters, state, context) {
      compileIfStatement(statement as IfStatement, parameters, state, context);
    },
  },
  {
    name: "switch-statement",
    match: Node.isSwitchStatement,
    compile(statement, parameters, state, context) {
      compileSwitchStatement(statement as SwitchStatement, parameters, state, context);
    },
  },
  {
    name: "eventless-statement",
    match: () => true,
    compile: compileEventlessStatement,
  },
];

const compileReducerStatements = (
  statements: readonly Statement[],
  parameters: ReducerParameters,
  state: BuildState,
  context: CompilerContext,
) => {
  for (const statement of statements) {
    const rule = REDUCER_STATEMENT_RULES.find((candidate) => candidate.match(statement)) as ReducerStatementRule;
    rule.compile(statement, parameters, state, context);
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
  const options = readMachineOptions(candidate.call);
  if (!options) return EMPTY_REDUCER_SLICE;

  const reducerOption = readMachineOption(options, "reducer");
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
