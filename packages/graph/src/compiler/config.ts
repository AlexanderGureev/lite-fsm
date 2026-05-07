import { Node, type Expression, type ObjectLiteralExpression, type PropertyAssignment } from "ts-morph";
import type { GraphDiagnostic, GraphTarget, GraphValueSummary, SourceLocation } from "../types";
import type { MachineCandidate } from "./candidates";
import type { CompilerContext, ConfigGraphSlice, ConfigStateSlice, ConfigTransitionSlice } from "./pipeline";
import type {
  EvaluatedGraphObjectProperty,
  EvaluatedGraphValue,
  EvaluationResult,
} from "./evaluator";

type MachineOption = {
  value: Expression;
  loc?: SourceLocation;
};

type ConfigBuildState = {
  diagnostics: GraphDiagnostic[];
  states: ConfigStateSlice[];
  stateKeys: Set<string>;
  transitions: ConfigTransitionSlice[];
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

const readMachineOptions = (
  candidate: MachineCandidate,
  context: CompilerContext,
): ObjectLiteralExpression | GraphDiagnostic => {
  const [firstArgument] = candidate.call.getArguments();
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return {
      code: "LFG_UNSUPPORTED_MACHINE_OPTIONS",
      severity: "warning",
      message: "createMachine call must have an object literal options argument.",
      loc: context.source.locFromNode(candidate.call),
    };
  }

  const options = unwrapTransparentExpression(firstArgument);
  if (!Node.isObjectLiteralExpression(options)) {
    return {
      code: "LFG_UNSUPPORTED_MACHINE_OPTIONS",
      severity: "warning",
      message: "createMachine options must be an object literal for graph compilation.",
      loc: context.source.locFromNode(options),
    };
  }

  return options;
};

const readOption = (options: ObjectLiteralExpression, key: string, context: CompilerContext): MachineOption | undefined => {
  for (const property of options.getProperties()) {
    if (Node.isPropertyAssignment(property) && propertyNameText(property) === key) {
      return {
        value: property.getInitializerOrThrow(),
        loc: context.source.locFromNode(property),
      };
    }

    if (Node.isShorthandPropertyAssignment(property) && property.getName() === key) {
      return {
        value: property.getNameNode(),
        loc: context.source.locFromNode(property),
      };
    }
  }

  return undefined;
};

const diagnosticFromEvaluation = (
  result: Exclude<EvaluationResult, { kind: "known" }>,
  fallbackCode: string,
): GraphDiagnostic => {
  if (result.kind === "external") {
    return {
      code: "LFG_UNRESOLVED_CONFIG",
      severity: "warning",
      message: `Config value '${result.label}' cannot be resolved from the current source string.`,
      loc: result.loc,
    };
  }
  if (result.kind === "dynamic") {
    return {
      code: "LFG_DYNAMIC_CONFIG",
      severity: "warning",
      message: "Config expression is dynamic and cannot be compiled statically.",
      loc: result.loc,
    };
  }

  return {
    code: result.code === "LFG_UNSUPPORTED_DYNAMIC_KEY" ? result.code : fallbackCode,
    severity: "warning",
    message: result.message,
    loc: result.loc,
  };
};

const diagnosticForValue = (
  code: string,
  message: string,
  value: EvaluatedGraphValue,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  loc: value.loc,
});

const knownObject = (result: EvaluationResult): Extract<EvaluatedGraphValue, { kind: "object" }> | undefined => {
  return result.kind === "known" && result.value.kind === "object" ? result.value : undefined;
};

const knownString = (result: EvaluationResult): string | undefined => {
  return result.kind === "known" && result.value.kind === "string" ? result.value.value : undefined;
};

const addState = (state: ConfigBuildState, key: string, loc?: SourceLocation) => {
  if (state.stateKeys.has(key)) return;

  state.stateKeys.add(key);
  state.states.push({ key, loc });
};

const targetLabelForValue = (value: EvaluatedGraphValue): string => {
  if (value.kind === "external") return value.label;
  if (value.kind === "dynamic") return value.label;
  if (value.kind === "unsupported") return value.code;

  return value.kind;
};

const createUnknownTarget = (value: EvaluatedGraphValue): GraphTarget => {
  if (value.kind === "unsupported") return { kind: "unknown", label: value.code };

  return { kind: "unknown", label: value.kind };
};

const configStateDiagnostic = (
  stateKey: string,
  value: EvaluatedGraphValue,
): GraphDiagnostic => {
  if (value.kind === "unsupported" && value.code === "LFG_UNSUPPORTED_DYNAMIC_KEY") {
    return diagnosticForValue(value.code, value.message, value);
  }

  return diagnosticForValue(
    "LFG_UNSUPPORTED_CONFIG_STATE",
    `Config state '${stateKey}' must be an object literal of event targets.`,
    value,
  );
};

const appendTransition = (
  build: ConfigBuildState,
  sourceKey: string,
  event: EvaluatedGraphObjectProperty,
  targetLabel: string | null,
  target?: GraphTarget,
) => {
  build.transitions.push({
    sourceKey,
    event: { type: event.key, source: "config" },
    targetLabel,
    target,
    order: build.transitions.length,
    confidence: target?.kind === "dynamic" || target?.kind === "unknown" ? "unknown" : "exact",
    loc: event.loc,
  });
};

const compileTarget = (
  build: ConfigBuildState,
  sourceKey: string,
  event: EvaluatedGraphObjectProperty,
) => {
  const target = event.value;
  if (target.kind === "undefined") return;

  if (target.kind === "string") {
    if (target.value === "*") {
      build.diagnostics.push(
        diagnosticForValue(
          "LFG_UNSUPPORTED_TARGET",
          "Transition target '*' is reserved for wildcard sources and cannot be used as a target.",
          target,
        ),
      );
      appendTransition(build, sourceKey, event, target.value, { kind: "unknown", label: target.value });
      return;
    }

    addState(build, target.value);
    appendTransition(build, sourceKey, event, target.value);
    return;
  }

  if (target.kind === "null") {
    appendTransition(build, sourceKey, event, null);
    return;
  }

  if (target.kind === "external" || target.kind === "dynamic") {
    const label = targetLabelForValue(target);
    build.diagnostics.push(
      diagnosticForValue(
        "LFG_DYNAMIC_TARGET",
        target.kind === "external"
          ? `Transition target '${target.label}' cannot be resolved from the current source string.`
          : `Transition target '${label}' is dynamic and cannot be compiled statically.`,
        target,
      ),
    );
    appendTransition(build, sourceKey, event, label, { kind: "dynamic", label });
    return;
  }

  build.diagnostics.push(
    diagnosticForValue(
      "LFG_UNSUPPORTED_TARGET",
      `Transition target of kind '${target.kind}' is not supported by the config graph compiler.`,
      target,
    ),
  );
  appendTransition(build, sourceKey, event, targetLabelForValue(target), createUnknownTarget(target));
};

const compileConfigObject = (config: Extract<EvaluatedGraphValue, { kind: "object" }>): ConfigBuildState => {
  const build: ConfigBuildState = {
    diagnostics: [],
    states: [],
    stateKeys: new Set(),
    transitions: [],
  };

  for (const stateProperty of config.properties) {
    addState(build, stateProperty.key, stateProperty.loc);
  }

  for (const stateProperty of config.properties) {
    if (stateProperty.value.kind !== "object") {
      build.diagnostics.push(configStateDiagnostic(stateProperty.key, stateProperty.value));
      continue;
    }

    for (const eventProperty of stateProperty.value.properties) {
      compileTarget(build, stateProperty.key, eventProperty);
    }
  }

  return build;
};

const summarizeKnownInitialContext = (
  value: EvaluatedGraphValue,
  expression: Expression,
  context: CompilerContext,
): GraphValueSummary => {
  if (value.kind === "object" && value.properties.length === 0) return { kind: "empty", text: "{}" };
  if (value.kind === "object") return { kind: "object", text: context.source.textOf(expression) };
  if (value.kind === "array") return { kind: "array", text: context.source.textOf(expression) };

  return { kind: "literal", text: context.source.textOf(expression) };
};

const summarizeInitialContext = (
  option: MachineOption | undefined,
  context: CompilerContext,
): GraphValueSummary | undefined => {
  if (!option) return undefined;

  const result = context.evaluator.evaluateExpression(option.value);
  if (result.kind === "known") return summarizeKnownInitialContext(result.value, option.value, context);
  if (result.kind === "external") return { kind: "external", text: result.label };
  if (result.kind === "dynamic") return { kind: "dynamic", text: result.label };

  return { kind: "unknown", text: result.message };
};

const readInitialState = (
  option: MachineOption | undefined,
  diagnostics: GraphDiagnostic[],
  context: CompilerContext,
): string | undefined => {
  if (!option) return undefined;

  const result = context.evaluator.evaluateExpression(option.value);
  const value = knownString(result);
  if (value !== undefined) return value;

  diagnostics.push({
    code: "LFG_UNSUPPORTED_INITIAL_STATE",
    severity: "warning",
    message: "initialState must resolve to a string literal.",
    loc: result.loc,
  });

  return undefined;
};

const readGroupTag = (
  option: MachineOption | undefined,
  diagnostics: GraphDiagnostic[],
  context: CompilerContext,
): string | undefined => {
  if (!option) return undefined;

  const result = context.evaluator.evaluateExpression(option.value);
  const value = knownString(result);
  if (value !== undefined) return value;

  diagnostics.push({
    code: "LFG_UNSUPPORTED_GROUP_TAG",
    severity: "warning",
    message: "groupTag must resolve to a string literal.",
    loc: result.loc,
  });

  return undefined;
};

const readPersistence = (
  option: MachineOption | undefined,
  diagnostics: GraphDiagnostic[],
  context: CompilerContext,
): "runtime" | "snapshot" | "unknown" | undefined => {
  if (!option) return undefined;

  const result = context.evaluator.evaluateExpression(option.value);
  const value = knownString(result);
  if (value === "runtime" || value === "snapshot") return value;

  diagnostics.push({
    code: "LFG_UNSUPPORTED_PERSISTENCE",
    severity: "warning",
    message: "persistence must resolve to 'runtime' or 'snapshot'.",
    loc: result.loc,
  });

  return "unknown";
};

export const compileConfigGraph = (
  candidate: MachineCandidate,
  context: CompilerContext,
): ConfigGraphSlice => {
  const diagnostics: GraphDiagnostic[] = [];
  const options = readMachineOptions(candidate, context);
  if ("code" in options) {
    return {
      kind: "unknown",
      states: [],
      transitions: [],
      diagnostics: [options],
    };
  }

  const configOption = readOption(options, "config", context);
  const initialState = readInitialState(readOption(options, "initialState", context), diagnostics, context);
  const initialContextSummary = summarizeInitialContext(readOption(options, "initialContext", context), context);
  const groupTag = readGroupTag(readOption(options, "groupTag", context), diagnostics, context);
  const persistence = readPersistence(readOption(options, "persistence", context), diagnostics, context);

  if (!configOption) {
    diagnostics.push({
      code: "LFG_MISSING_MACHINE_CONFIG",
      severity: "warning",
      message: "createMachine options must include a config property for graph compilation.",
      loc: context.source.locFromNode(options),
    });

    return {
      kind: "unknown",
      initialState,
      initialContextSummary,
      groupTag,
      persistence,
      states: [],
      transitions: [],
      diagnostics,
    };
  }

  const configResult = context.evaluator.evaluateExpression(configOption.value, { expectedPosition: "config" });
  const config = knownObject(configResult);
  if (!config) {
    diagnostics.push(
      configResult.kind === "known"
        ? {
            code: "LFG_UNSUPPORTED_CONFIG",
            severity: "warning",
            message: "Machine config must resolve to an object literal.",
            loc: configResult.loc,
          }
        : diagnosticFromEvaluation(configResult, "LFG_UNSUPPORTED_CONFIG"),
    );

    return {
      kind: "unknown",
      initialState,
      initialContextSummary,
      groupTag,
      persistence,
      states: [],
      transitions: [],
      diagnostics,
    };
  }

  const configBuild = compileConfigObject(config);
  diagnostics.push(...configBuild.diagnostics);

  return {
    kind: configBuild.stateKeys.has("__INIT") ? "actorTemplate" : "domain",
    initialState,
    initialContextSummary,
    groupTag,
    persistence,
    states: configBuild.states,
    transitions: configBuild.transitions,
    diagnostics,
  };
};
