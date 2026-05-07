import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type BindingName,
  type CallExpression,
  type Expression,
  type FunctionExpression,
  type IfStatement,
  type MethodDeclaration,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type Statement,
  type SwitchStatement,
} from "ts-morph";
import type { GraphCondition, GraphDiagnostic, GraphRouting, GraphRoutingTarget, SourceLocation } from "../types";
import type { MachineCandidate } from "./candidates";
import type { EvaluatedGraphValue, EvaluationResult } from "./evaluator";
import type { CompilerContext, ConfigGraphSlice, EffectEmissionSlice, EffectsGraphSlice } from "./pipeline";

type EffectFunction = ArrowFunction | FunctionExpression | MethodDeclaration;

type EffectParameters = {
  transitionName: string;
  actionName?: string;
  selfName?: string;
};

type EffectBuildState = {
  sourceKey: string;
  machineKind: ConfigGraphSlice["kind"];
  parameters: EffectParameters;
  emissions: EffectEmissionSlice[];
  diagnostics: GraphDiagnostic[];
};

type RoutingRead = {
  routing: GraphRouting;
  confidence: EffectEmissionSlice["confidence"];
  diagnostics: GraphDiagnostic[];
};

type EventRead = {
  type: string;
  actionObject: ObjectLiteralExpression;
  diagnostics: GraphDiagnostic[];
};

const ACTOR_ROUTING_METHODS = new Set(["actor", "group", "tag", "unscoped"]);

const EMPTY_EFFECTS_SLICE: EffectsGraphSlice = {
  emissions: [],
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

const effectDiagnostic = (
  code: string,
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  loc,
});

const condition = (
  text: string,
  kind: GraphCondition["kind"],
  loc?: SourceLocation,
): GraphCondition => ({
  text,
  kind,
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

const knownEffectsObject = (
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

const knownEffectFunction = (
  value: EvaluatedGraphValue,
  context: CompilerContext,
): EffectFunction | GraphDiagnostic => {
  if (value.kind === "function") return effectFunctionFromKnownValue(value, value.loc);

  const effectExpression = value as Extract<EvaluatedGraphValue, { kind: "expression" }>;
  const result = context.evaluator.evaluateExpression(effectExpression.node, { expectedPosition: "effectEntry" });
  if (result.kind === "known") return effectFunctionFromKnownValue(result.value, result.loc);

  return diagnosticFromEvaluation(result, "effect");
};

const bindingNameText = (nameNode: BindingName): string | undefined => {
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
};

const bindingPropertyName = (element: { getPropertyNameNode(): Node | undefined; getNameNode(): BindingName }): string | undefined => {
  const propertyNameNode = element.getPropertyNameNode();
  if (!propertyNameNode) return bindingNameText(element.getNameNode());
  if (Node.isIdentifier(propertyNameNode)) return propertyNameNode.getText();
  if (Node.isStringLiteral(propertyNameNode)) return propertyNameNode.getLiteralText();

  return undefined;
};

const readEffectParameters = (
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
    const bindingName = bindingNameText(element.getNameNode());
    if (!propertyName || !bindingName) continue;

    if (propertyName === "transition") parameters.transitionName = bindingName;
    if (propertyName === "action") parameters.actionName = bindingName;
    if (propertyName === "self") parameters.selfName = bindingName;
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

const readObjectPropertyExpression = (
  objectLiteral: ObjectLiteralExpression,
  key: string,
): Expression | undefined => {
  for (const property of objectLiteral.getProperties()) {
    if (Node.isPropertyAssignment(property) && propertyNameText(property) === key) {
      return property.getInitializerOrThrow();
    }

    if (Node.isShorthandPropertyAssignment(property) && property.getName() === key) {
      return property.getNameNode();
    }
  }

  return undefined;
};

const stringFromExpression = (expression: Expression, context: CompilerContext): string | undefined => {
  const result = context.evaluator.evaluateExpression(expression);

  return result.kind === "known" && result.value.kind === "string" ? result.value.value : undefined;
};

const labelFromEvaluation = (expression: Expression, context: CompilerContext): string => {
  const result = context.evaluator.evaluateExpression(expression);
  if (result.kind === "external" || result.kind === "dynamic") return result.label;
  if (result.kind === "unsupported") return result.code;

  return context.source.textOf(expression);
};

const combineConfidence = (
  left: EffectEmissionSlice["confidence"],
  right: EffectEmissionSlice["confidence"],
): EffectEmissionSlice["confidence"] => {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "partial" || right === "partial") return "partial";

  return "exact";
};

const routingTargetFromKnownArray = (
  items: readonly EvaluatedGraphValue[],
): GraphRoutingTarget | undefined => {
  const targetItems: GraphRoutingTarget[] = [];
  for (const item of items) {
    if (item.kind !== "string") return undefined;
    targetItems.push({ kind: "literal", value: item.value });
  }

  return { kind: "array", items: targetItems };
};

const routingTargetFromExpression = (
  expression: Expression,
  parameters: EffectParameters,
  context: CompilerContext,
): { target: GraphRoutingTarget; confidence: EffectEmissionSlice["confidence"]; diagnostics: GraphDiagnostic[] } => {
  const unwrapped = unwrapTransparentExpression(expression);
  if (parameters.selfName && Node.isPropertyAccessExpression(unwrapped)) {
    const receiver = unwrapTransparentExpression(unwrapped.getExpression());
    const field = unwrapped.getName();
    if (
      Node.isIdentifier(receiver) &&
      receiver.getText() === parameters.selfName &&
      (field === "actorId" || field === "groupId" || field === "groupTag")
    ) {
      return {
        target: { kind: "selfField", field },
        confidence: "exact",
        diagnostics: [],
      };
    }
  }

  if (Node.isArrayLiteralExpression(unwrapped)) {
    const items = unwrapped.getElements().map((item) => routingTargetFromExpression(item, parameters, context));
    const diagnostics = items.flatMap((item) => item.diagnostics);
    const confidence = items.reduce<EffectEmissionSlice["confidence"]>(
      (current, item) => combineConfidence(current, item.confidence),
      "exact",
    );

    return {
      target: { kind: "array", items: items.map((item) => item.target) },
      confidence,
      diagnostics,
    };
  }

  const result = context.evaluator.evaluateExpression(unwrapped);
  if (result.kind === "known" && result.value.kind === "string") {
    return {
      target: { kind: "literal", value: result.value.value },
      confidence: "exact",
      diagnostics: [],
    };
  }

  if (result.kind === "known" && result.value.kind === "array") {
    const target = routingTargetFromKnownArray(result.value.items);
    if (target) {
      return {
        target,
        confidence: "exact",
        diagnostics: [],
      };
    }
  }

  const label = labelFromEvaluation(unwrapped, context);
  return {
    target: { kind: "dynamic", label },
    confidence: "partial",
    diagnostics: [
      effectDiagnostic(
        "LFG_EFFECT_DYNAMIC_ROUTING_TARGET",
        `Effect routing target '${label}' cannot be compiled statically.`,
        context.source.locFromNode(unwrapped),
      ),
    ],
  };
};

const readEvent = (
  actionExpression: Expression | undefined,
  context: CompilerContext,
): EventRead | GraphDiagnostic => {
  if (!actionExpression) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "Effect transition call must include an action object with a string literal type.",
    );
  }

  const unwrapped = unwrapTransparentExpression(actionExpression);
  if (!Node.isObjectLiteralExpression(unwrapped)) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      `Effect transition event '${context.source.textOf(unwrapped)}' must be an object literal with a static type.`,
      context.source.locFromNode(unwrapped),
    );
  }

  const typeExpression = readObjectPropertyExpression(unwrapped, "type");
  if (!typeExpression) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "Effect transition action must contain a type property.",
      context.source.locFromNode(unwrapped),
    );
  }

  const eventType = stringFromExpression(typeExpression, context);
  if (!eventType) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      `Effect transition event type '${context.source.textOf(typeExpression)}' cannot be compiled statically.`,
      context.source.locFromNode(typeExpression),
    );
  }

  return {
    type: eventType,
    actionObject: unwrapped,
    diagnostics: [],
  };
};

const routingFromMeta = (
  actionObject: ObjectLiteralExpression,
  parameters: EffectParameters,
  context: CompilerContext,
): RoutingRead => {
  const metaExpression = readObjectPropertyExpression(actionObject, "meta");
  if (!metaExpression) {
    return { routing: { kind: "default" }, confidence: "exact", diagnostics: [] };
  }

  const metaObject = unwrapTransparentExpression(metaExpression);
  if (!Node.isObjectLiteralExpression(metaObject)) {
    const label = context.source.textOf(metaObject);

    return {
      routing: { kind: "unknown", label },
      confidence: "unknown",
      diagnostics: [
        effectDiagnostic(
          "LFG_EFFECT_DYNAMIC_ROUTING_TARGET",
          `Effect routing meta '${label}' cannot be compiled statically.`,
          context.source.locFromNode(metaObject),
        ),
      ],
    };
  }

  const actorId = readObjectPropertyExpression(metaObject, "actorId");
  if (actorId) {
    const target = routingTargetFromExpression(actorId, parameters, context);
    return {
      routing: { kind: "actor", target: target.target },
      confidence: target.confidence,
      diagnostics: target.diagnostics,
    };
  }

  const groupId = readObjectPropertyExpression(metaObject, "groupId");
  if (groupId) {
    const target = routingTargetFromExpression(groupId, parameters, context);
    return {
      routing: { kind: "group", target: target.target },
      confidence: target.confidence,
      diagnostics: target.diagnostics,
    };
  }

  const groupTag = readObjectPropertyExpression(metaObject, "groupTag");
  if (groupTag) {
    const target = routingTargetFromExpression(groupTag, parameters, context);
    return {
      routing: { kind: "tag", target: target.target },
      confidence: target.confidence,
      diagnostics: target.diagnostics,
    };
  }

  return { routing: { kind: "default" }, confidence: "exact", diagnostics: [] };
};

const isTransitionIdentifier = (expression: Expression, parameters: EffectParameters): boolean => {
  const unwrapped = unwrapTransparentExpression(expression);

  return Node.isIdentifier(unwrapped) && unwrapped.getText() === parameters.transitionName;
};

const transitionCallMethod = (
  call: CallExpression,
  parameters: EffectParameters,
): "default" | "actor" | "group" | "tag" | "unscoped" | undefined => {
  const expression = call.getExpression();
  if (isTransitionIdentifier(expression, parameters)) return "default";

  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  if (!isTransitionIdentifier(expression.getExpression(), parameters)) return undefined;

  const method = expression.getName();
  return ACTOR_ROUTING_METHODS.has(method) ? (method as "actor" | "group" | "tag" | "unscoped") : undefined;
};

const isAllowedTransitionIdentifierUse = (identifier: Node): boolean => {
  const parent = identifier.getParentOrThrow();

  if (Node.isCallExpression(parent) && parent.getExpression() === identifier) return true;

  if (!Node.isPropertyAccessExpression(parent) || parent.getExpression() !== identifier) return false;
  const call = parent.getParent();

  return (
    Node.isCallExpression(call) &&
    call.getExpression() === parent &&
    ACTOR_ROUTING_METHODS.has(parent.getName())
  );
};

const isFunctionLikeNode = (node: Node): boolean => {
  return (
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isMethodDeclaration(node)
  );
};

const isInsideNestedFunction = (node: Node, root: Node): boolean => {
  if (node === root) return false;

  let current = node.getParent();

  while (current && current !== root) {
    if (isFunctionLikeNode(current)) return true;
    current = current.getParent();
  }

  return false;
};

const detectEscapedTransition = (
  node: Node,
  state: EffectBuildState,
  context: CompilerContext,
) => {
  const rootIsFunction = isFunctionLikeNode(node);

  for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getText() !== state.parameters.transitionName) continue;
    if (!rootIsFunction && !isInsideNestedFunction(identifier, node) && isAllowedTransitionIdentifierUse(identifier)) {
      continue;
    }

    state.diagnostics.push(
      effectDiagnostic(
        "LFG_EFFECT_TRANSITION_ESCAPED",
        "transition escaped from effect; emitted events may be incomplete.",
        context.source.locFromNode(identifier),
      ),
    );
  }
};

const transitionCallsFromExpression = (expression: Expression): CallExpression[] => {
  const calls = expression.getDescendantsOfKind(SyntaxKind.CallExpression);
  const directCalls = Node.isCallExpression(expression) ? [expression, ...calls] : calls;

  return directCalls.filter((call) => !isInsideNestedFunction(call, expression));
};

const readActorRoutingCall = (
  method: "actor" | "group" | "tag" | "unscoped",
  call: CallExpression,
  state: EffectBuildState,
  context: CompilerContext,
): RoutingRead | GraphDiagnostic => {
  if (state.machineKind !== "actorTemplate") {
    return effectDiagnostic(
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
      `transition.${method} routing is only supported for actor template effects.`,
      context.source.locFromNode(call),
    );
  }

  if (method === "unscoped") return { routing: { kind: "unscoped" }, confidence: "exact", diagnostics: [] };

  const targetExpression = call.getArguments()[0] as Expression;
  const target = routingTargetFromExpression(targetExpression, state.parameters, context);
  return {
    routing: { kind: method, target: target.target },
    confidence: target.confidence,
    diagnostics: target.diagnostics,
  };
};

const addEmissionFromCall = (
  call: CallExpression,
  guard: GraphCondition | undefined,
  baseConfidence: EffectEmissionSlice["confidence"],
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
    : readActorRoutingCall(method, call, state, context);
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
  baseConfidence: EffectEmissionSlice["confidence"],
  state: EffectBuildState,
  context: CompilerContext,
) => {
  detectEscapedTransition(expression, state, context);
  if (isFunctionLikeNode(expression)) return;

  for (const call of transitionCallsFromExpression(expression)) {
    addEmissionFromCall(call, guard, baseConfidence, state, context);
  }
};

const statementsFromBranch = (statement: Statement): Statement[] => {
  return Node.isBlock(statement) ? statement.getStatements() : [statement];
};

const compileIfStatement = (
  ifStatement: IfStatement,
  baseConfidence: EffectEmissionSlice["confidence"],
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

    compileStatements(
      statementsFromBranch(current.getThenStatement()),
      branchGuard,
      baseConfidence,
      state,
      context,
    );

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

const isActionTypeAccess = (expression: Expression, actionName: string | undefined): boolean => {
  if (!actionName) return false;

  const unwrapped = unwrapTransparentExpression(expression);
  if (!Node.isPropertyAccessExpression(unwrapped)) return false;

  const receiver = unwrapTransparentExpression(unwrapped.getExpression());
  return Node.isIdentifier(receiver) && receiver.getText() === actionName && unwrapped.getName() === "type";
};

const compileSwitchStatement = (
  switchStatement: SwitchStatement,
  baseConfidence: EffectEmissionSlice["confidence"],
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

  for (const clause of switchStatement.getCaseBlock().getClauses()) {
    if (Node.isCaseClause(clause)) {
      compileStatements(
        clause.getStatements(),
        condition(
          supportsSwitch ? `case ${context.source.textOf(clause.getExpression())}` : context.source.textOf(clause.getExpression()),
          supportsSwitch ? "switch-case" : "unknown",
          context.source.locFromNode(clause),
        ),
        supportsSwitch ? baseConfidence : combineConfidence(baseConfidence, "partial"),
        state,
        context,
      );
      continue;
    }

    compileStatements(
      clause.getStatements(),
      condition(supportsSwitch ? "default" : "default", supportsSwitch ? "else" : "unknown", context.source.locFromNode(clause)),
      supportsSwitch ? baseConfidence : combineConfidence(baseConfidence, "partial"),
      state,
      context,
    );
  }
};

const compileStatement = (
  statement: Statement,
  guard: GraphCondition | undefined,
  baseConfidence: EffectEmissionSlice["confidence"],
  state: EffectBuildState,
  context: CompilerContext,
) => {
  if (Node.isBlock(statement)) {
    compileStatements(statement.getStatements(), guard, baseConfidence, state, context);
    return;
  }

  if (Node.isIfStatement(statement)) {
    compileIfStatement(statement, baseConfidence, state, context);
    return;
  }

  if (Node.isSwitchStatement(statement)) {
    compileSwitchStatement(statement, baseConfidence, state, context);
    return;
  }

  if (Node.isExpressionStatement(statement)) {
    compileExpression(statement.getExpression(), guard, baseConfidence, state, context);
    return;
  }

  if (Node.isReturnStatement(statement)) {
    const expression = statement.getExpression();
    if (expression) compileExpression(expression, guard, baseConfidence, state, context);
    return;
  }

  if (Node.isVariableStatement(statement)) {
    for (const declaration of statement.getDeclarationList().getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (initializer) compileExpression(initializer, guard, baseConfidence, state, context);
    }
    return;
  }

  if (Node.isFunctionDeclaration(statement)) {
    detectEscapedTransition(statement, state, context);
  }
};

function compileStatements(
  statements: readonly Statement[],
  guard: GraphCondition | undefined,
  baseConfidence: EffectEmissionSlice["confidence"],
  state: EffectBuildState,
  context: CompilerContext,
) {
  for (const statement of statements) {
    compileStatement(statement, guard, baseConfidence, state, context);
  }
}

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
  const body = Node.isArrowFunction(effect)
    ? effect.getBody()
    : Node.isMethodDeclaration(effect)
      ? effect.getBodyOrThrow()
      : effect.getBody();

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
  const options = readMachineOptions(candidate);
  if (!options) return EMPTY_EFFECTS_SLICE;

  const effectsOption = readOption(options, "effects");
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
