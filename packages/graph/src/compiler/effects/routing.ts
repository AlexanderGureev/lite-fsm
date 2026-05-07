import {
  Node,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type ObjectLiteralExpression,
} from "ts-morph";
import type { GraphDiagnostic, GraphRouting, GraphRoutingTarget, GraphTransition } from "../../types";
import { combineConfidence, readMachineOption, stringFromExpression, unwrapTransparent } from "../ast";
import type { EvaluatedGraphValue } from "../evaluator/types";
import type { CompilerContext } from "../pipeline";
import type { EffectParameters } from "./setup";
import { effectDiagnostic } from "./setup";

type Confidence = GraphTransition["confidence"];

export type ActorRoutingMethod = "actor" | "group" | "tag" | "unscoped";
export type TransitionCallMethod = "default" | ActorRoutingMethod;

export type RoutingRead = {
  routing: GraphRouting;
  confidence: Confidence;
  diagnostics: GraphDiagnostic[];
};

type RoutingTargetRead = {
  target: GraphRoutingTarget;
  confidence: Confidence;
  diagnostics: GraphDiagnostic[];
};

export type EventRead = {
  type: string;
  actionObject: ObjectLiteralExpression;
  diagnostics: GraphDiagnostic[];
};

const ACTOR_ROUTING_METHODS = new Set<ActorRoutingMethod>(["actor", "group", "tag", "unscoped"]);

const SELF_ROUTING_FIELDS = new Set(["actorId", "groupId", "groupTag"]);

const labelFromEvaluation = (expression: Expression, context: CompilerContext): string => {
  const result = context.evaluator.evaluateExpression(expression);
  if (result.kind === "external" || result.kind === "dynamic") return result.label;
  if (result.kind === "unsupported") return result.code;

  return context.source.textOf(expression);
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
): RoutingTargetRead => {
  const unwrapped = unwrapTransparent(expression);
  if (parameters.selfName && Node.isPropertyAccessExpression(unwrapped)) {
    const receiver = unwrapTransparent(unwrapped.getExpression());
    const field = unwrapped.getName();
    if (
      Node.isIdentifier(receiver) &&
      receiver.getText() === parameters.selfName &&
      SELF_ROUTING_FIELDS.has(field)
    ) {
      return {
        target: { kind: "selfField", field: field as "actorId" | "groupId" | "groupTag" },
        confidence: "exact",
        diagnostics: [],
      };
    }
  }

  if (Node.isArrayLiteralExpression(unwrapped)) {
    const items = unwrapped.getElements().map((item) => routingTargetFromExpression(item, parameters, context));
    const diagnostics = items.flatMap((item) => item.diagnostics);
    const confidence = items.reduce<Confidence>((current, item) => combineConfidence(current, item.confidence), "exact");

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

export const readEvent = (
  actionExpression: Expression | undefined,
  context: CompilerContext,
): EventRead | GraphDiagnostic => {
  if (!actionExpression) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "Effect transition call must include an action object with a string literal type.",
    );
  }

  const unwrapped = unwrapTransparent(actionExpression);
  if (!Node.isObjectLiteralExpression(unwrapped)) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      `Effect transition event '${context.source.textOf(unwrapped)}' must be an object literal with a static type.`,
      context.source.locFromNode(unwrapped),
    );
  }

  const typeExpression = readMachineOption(unwrapped, "type");
  if (!typeExpression) {
    return effectDiagnostic(
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "Effect transition action must contain a type property.",
      context.source.locFromNode(unwrapped),
    );
  }

  const eventType = stringFromExpression(typeExpression, context.evaluator);
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

const routingFromMetaField = (
  metaObject: ObjectLiteralExpression,
  field: "actorId" | "groupId" | "groupTag",
  routingKind: "actor" | "group" | "tag",
  parameters: EffectParameters,
  context: CompilerContext,
): RoutingRead | undefined => {
  const expression = readMachineOption(metaObject, field);
  if (!expression) return undefined;

  const target = routingTargetFromExpression(expression, parameters, context);
  return {
    routing: { kind: routingKind, target: target.target },
    confidence: target.confidence,
    diagnostics: target.diagnostics,
  };
};

export const routingFromMeta = (
  actionObject: ObjectLiteralExpression,
  parameters: EffectParameters,
  context: CompilerContext,
): RoutingRead => {
  const metaExpression = readMachineOption(actionObject, "meta");
  if (!metaExpression) {
    return { routing: { kind: "default" }, confidence: "exact", diagnostics: [] };
  }

  const metaObject = unwrapTransparent(metaExpression);
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

  return (
    routingFromMetaField(metaObject, "actorId", "actor", parameters, context) ??
    routingFromMetaField(metaObject, "groupId", "group", parameters, context) ??
    routingFromMetaField(metaObject, "groupTag", "tag", parameters, context) ??
    { routing: { kind: "default" }, confidence: "exact", diagnostics: [] }
  );
};

const isTransitionIdentifier = (expression: Expression, parameters: EffectParameters): boolean => {
  const unwrapped = unwrapTransparent(expression);

  return Node.isIdentifier(unwrapped) && unwrapped.getText() === parameters.transitionName;
};

export const transitionCallMethod = (
  call: CallExpression,
  parameters: EffectParameters,
): TransitionCallMethod | undefined => {
  const expression = call.getExpression();
  if (isTransitionIdentifier(expression, parameters)) return "default";

  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  if (!isTransitionIdentifier(expression.getExpression(), parameters)) return undefined;

  const method = expression.getName();
  return ACTOR_ROUTING_METHODS.has(method as ActorRoutingMethod) ? (method as ActorRoutingMethod) : undefined;
};

const isAllowedTransitionIdentifierUse = (identifier: Node): boolean => {
  const parent = identifier.getParentOrThrow();

  if (Node.isCallExpression(parent) && parent.getExpression() === identifier) return true;

  if (!Node.isPropertyAccessExpression(parent) || parent.getExpression() !== identifier) return false;
  const call = parent.getParent();

  return (
    Node.isCallExpression(call) &&
    call.getExpression() === parent &&
    ACTOR_ROUTING_METHODS.has(parent.getName() as ActorRoutingMethod)
  );
};

export const isFunctionLike = (node: Node): boolean => {
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
    if (isFunctionLike(current)) return true;
    current = current.getParent();
  }

  return false;
};

export const detectEscapedTransition = (
  node: Node,
  transitionName: string,
  diagnostics: GraphDiagnostic[],
  context: CompilerContext,
) => {
  const rootIsFunction = isFunctionLike(node);

  for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getText() !== transitionName) continue;
    if (!rootIsFunction && !isInsideNestedFunction(identifier, node) && isAllowedTransitionIdentifierUse(identifier)) {
      continue;
    }

    diagnostics.push(
      effectDiagnostic(
        "LFG_EFFECT_TRANSITION_ESCAPED",
        "transition escaped from effect; emitted events may be incomplete.",
        context.source.locFromNode(identifier),
      ),
    );
  }
};

export const transitionCallsFromExpression = (expression: Expression): CallExpression[] => {
  const calls = expression.getDescendantsOfKind(SyntaxKind.CallExpression);
  const directCalls = Node.isCallExpression(expression) ? [expression, ...calls] : calls;

  return directCalls.filter((call) => !isInsideNestedFunction(call, expression));
};

export const readActorRoutingCall = (
  method: ActorRoutingMethod,
  call: CallExpression,
  machineKind: "domain" | "actorTemplate" | "unknown" | undefined,
  parameters: EffectParameters,
  context: CompilerContext,
): RoutingRead | GraphDiagnostic => {
  if (machineKind !== "actorTemplate") {
    return effectDiagnostic(
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
      `transition.${method} routing is only supported for actor template effects.`,
      context.source.locFromNode(call),
    );
  }

  if (method === "unscoped") return { routing: { kind: "unscoped" }, confidence: "exact", diagnostics: [] };

  const targetExpression = call.getArguments()[0] as Expression;
  const target = routingTargetFromExpression(targetExpression, parameters, context);
  return {
    routing: { kind: method, target: target.target },
    confidence: target.confidence,
    diagnostics: target.diagnostics,
  };
};
