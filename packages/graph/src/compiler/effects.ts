import {
  Node,
  type Block,
  type CallExpression,
  type Expression,
  type ExpressionStatement,
  type IfStatement,
  type ReturnStatement,
  type Statement,
  type SwitchStatement,
  type VariableStatement,
} from "ts-morph";
import type { GraphCondition, GraphDiagnostic, GraphTransition } from "../types";
import {
  combineConfidence,
  condition,
  isActionTypeAccess,
  readMachineOption,
  readMachineOptions,
  statementsFromBranch,
} from "./ast";
import type { MachineCandidate } from "./candidates";
import type { CompilerContext, ConfigGraphSlice, EffectEmissionSlice, EffectsGraphSlice } from "./pipeline";
import {
  EMPTY_EFFECTS_SLICE,
  effectDiagnostic,
  knownEffectFunction,
  knownEffectsObject,
  readEffectParameters,
  type EffectFunction,
  type EffectParameters,
} from "./effects/setup";
import {
  detectEscapedTransition,
  isFunctionLike,
  readActorRoutingCall,
  readEvent,
  routingFromMeta,
  transitionCallMethod,
  transitionCallsFromExpression,
} from "./effects/routing";

type Confidence = GraphTransition["confidence"];

type EffectBuildState = {
  sourceKey: string;
  machineKind: ConfigGraphSlice["kind"];
  parameters: EffectParameters;
  emissions: EffectEmissionSlice[];
  diagnostics: GraphDiagnostic[];
};

type EffectStatementRule = {
  name: string;
  match(statement: Statement): boolean;
  compile(
    statement: Statement,
    guard: GraphCondition | undefined,
    baseConfidence: Confidence,
    state: EffectBuildState,
    context: CompilerContext,
  ): void;
};

const addEmissionFromCall = (
  call: CallExpression,
  guard: GraphCondition | undefined,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  const method = transitionCallMethod(call, state.parameters);
  if (!method) return;

  const args = call.getArguments();
  const actionExpression = method === "default" || method === "unscoped" ? args[0] : args[1];
  const event = readEvent(Node.isExpression(actionExpression) ? actionExpression : undefined, context);
  if ("code" in event) {
    state.diagnostics.push(event);
    return;
  }

  const routing = method === "default"
    ? routingFromMeta(event.actionObject, state.parameters, context)
    : readActorRoutingCall(method, call, state.machineKind, state.parameters, context);
  if ("code" in routing) {
    state.diagnostics.push(routing);
    return;
  }

  state.diagnostics.push(...event.diagnostics, ...routing.diagnostics);
  state.emissions.push({
    sourceKey: state.sourceKey,
    event: { type: event.type, source: "effect" },
    routing: routing.routing,
    origin: "effect",
    guard,
    confidence: combineConfidence(baseConfidence, routing.confidence),
    loc: context.source.locFromNode(call),
  });
};

const compileExpression = (
  expression: Expression,
  guard: GraphCondition | undefined,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  detectEscapedTransition(expression, state.parameters.transitionName, state.diagnostics, context);
  if (isFunctionLike(expression)) return;

  for (const call of transitionCallsFromExpression(expression)) {
    addEmissionFromCall(call, guard, baseConfidence, state, context);
  }
};

const compileIfStatement = (
  ifStatement: IfStatement,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  let current: IfStatement | undefined = ifStatement;
  let branchIndex = 0;

  while (current) {
    const expression = current.getExpression();
    const branchGuard = condition(
      context.source.textOf(expression),
      branchIndex === 0 ? "if" : "else-if",
      context.source.locFromNode(expression),
    );

    compileStatements(statementsFromBranch(current.getThenStatement()), branchGuard, baseConfidence, state, context);

    const elseStatement = current.getElseStatement();
    if (!elseStatement) return;
    if (Node.isIfStatement(elseStatement)) {
      current = elseStatement;
      branchIndex += 1;
      continue;
    }

    compileStatements(
      statementsFromBranch(elseStatement),
      condition("else", "else", context.source.locFromNode(elseStatement)),
      baseConfidence,
      state,
      context,
    );
    return;
  }
};

const compileSwitchStatement = (
  switchStatement: SwitchStatement,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  const supportsSwitch = isActionTypeAccess(switchStatement.getExpression(), state.parameters.actionName);
  if (!supportsSwitch) {
    state.diagnostics.push(
      effectDiagnostic(
        "LFG_UNSUPPORTED_EFFECT_BRANCH",
        "Effect switch must inspect action.type to attach exact branch labels.",
        context.source.locFromNode(switchStatement.getExpression()),
      ),
    );
  }

  const clauseConfidence = supportsSwitch ? baseConfidence : combineConfidence(baseConfidence, "partial");

  for (const clause of switchStatement.getCaseBlock().getClauses()) {
    if (Node.isCaseClause(clause)) {
      const clauseText = context.source.textOf(clause.getExpression());
      compileStatements(
        clause.getStatements(),
        condition(
          supportsSwitch ? `case ${clauseText}` : clauseText,
          supportsSwitch ? "switch-case" : "unknown",
          context.source.locFromNode(clause),
        ),
        clauseConfidence,
        state,
        context,
      );
      continue;
    }

    compileStatements(
      clause.getStatements(),
      condition("default", supportsSwitch ? "else" : "unknown", context.source.locFromNode(clause)),
      clauseConfidence,
      state,
      context,
    );
  }
};

const EFFECT_STATEMENT_RULES: readonly EffectStatementRule[] = [
  {
    name: "block",
    match: Node.isBlock,
    compile(statement, guard, baseConfidence, state, context) {
      compileStatements((statement as Block).getStatements(), guard, baseConfidence, state, context);
    },
  },
  {
    name: "if-statement",
    match: Node.isIfStatement,
    compile(statement, _guard, baseConfidence, state, context) {
      compileIfStatement(statement as IfStatement, baseConfidence, state, context);
    },
  },
  {
    name: "switch-statement",
    match: Node.isSwitchStatement,
    compile(statement, _guard, baseConfidence, state, context) {
      compileSwitchStatement(statement as SwitchStatement, baseConfidence, state, context);
    },
  },
  {
    name: "expression-statement",
    match: Node.isExpressionStatement,
    compile(statement, guard, baseConfidence, state, context) {
      compileExpression((statement as ExpressionStatement).getExpression(), guard, baseConfidence, state, context);
    },
  },
  {
    name: "return-statement",
    match: Node.isReturnStatement,
    compile(statement, guard, baseConfidence, state, context) {
      const expression = (statement as ReturnStatement).getExpression();
      if (expression) compileExpression(expression, guard, baseConfidence, state, context);
    },
  },
  {
    name: "variable-statement",
    match: Node.isVariableStatement,
    compile(statement, guard, baseConfidence, state, context) {
      for (const declaration of (statement as VariableStatement).getDeclarationList().getDeclarations()) {
        const initializer = declaration.getInitializer();
        if (initializer) compileExpression(initializer, guard, baseConfidence, state, context);
      }
    },
  },
  {
    name: "function-declaration",
    match: Node.isFunctionDeclaration,
    compile(statement, _guard, _baseConfidence, state, context) {
      detectEscapedTransition(statement, state.parameters.transitionName, state.diagnostics, context);
    },
  },
];

const compileStatement = (
  statement: Statement,
  guard: GraphCondition | undefined,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  const rule = EFFECT_STATEMENT_RULES.find((candidate) => candidate.match(statement));
  if (rule) rule.compile(statement, guard, baseConfidence, state, context);
};

function compileStatements(
  statements: readonly Statement[],
  guard: GraphCondition | undefined,
  baseConfidence: Confidence,
  state: EffectBuildState,
  context: CompilerContext,
) {
  for (const statement of statements) {
    compileStatement(statement, guard, baseConfidence, state, context);
  }
}

const effectBody = (effect: EffectFunction): Node => {
  if (Node.isMethodDeclaration(effect)) return effect.getBodyOrThrow();

  return effect.getBody();
};

const compileEffectFunction = (
  sourceKey: string,
  effect: EffectFunction,
  config: ConfigGraphSlice,
  context: CompilerContext,
): EffectsGraphSlice => {
  const parameters = readEffectParameters(effect, context);
  if ("code" in parameters) {
    return {
      emissions: [],
      diagnostics: [parameters],
    };
  }

  const state: EffectBuildState = {
    sourceKey,
    machineKind: config.kind,
    parameters,
    emissions: [],
    diagnostics: [],
  };
  const body = effectBody(effect);

  if (Node.isBlock(body)) {
    compileStatements(body.getStatements(), undefined, "exact", state, context);
  } else {
    compileExpression(body as Expression, undefined, "exact", state, context);
  }

  return {
    emissions: state.emissions,
    diagnostics: state.diagnostics,
  };
};

export const compileEffectsGraph = (
  candidate: MachineCandidate,
  config: ConfigGraphSlice,
  context: CompilerContext,
): EffectsGraphSlice => {
  const options = readMachineOptions(candidate.call);
  if (!options) return EMPTY_EFFECTS_SLICE;

  const effectsOption = readMachineOption(options, "effects");
  if (!effectsOption) return EMPTY_EFFECTS_SLICE;

  const effectsResult = context.evaluator.evaluateExpression(effectsOption, { expectedPosition: "effects" });
  const effects = knownEffectsObject(effectsResult);
  if ("code" in effects) {
    return {
      emissions: [],
      diagnostics: [effects],
    };
  }

  const emissions: EffectEmissionSlice[] = [];
  const diagnostics: GraphDiagnostic[] = [];

  for (const property of effects.properties) {
    const effect = knownEffectFunction(property.value, context);
    if ("code" in effect) {
      diagnostics.push(effect);
      continue;
    }

    const entry = compileEffectFunction(property.key, effect, config, context);
    emissions.push(...entry.emissions);
    diagnostics.push(...(entry.diagnostics as GraphDiagnostic[]));
  }

  return {
    emissions,
    diagnostics,
  };
};
