import { Node, type CallExpression, type Expression } from "ts-morph";
import type { LiteFsmApiName } from "../catalog";
import {
  known,
  type EvaluatedGraphObjectProperty,
  type EvaluatedGraphValue,
  type EvaluationExpectedPosition,
  type EvaluatorRule,
  type EvaluatorRuleContext,
} from "./types";

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

export const transparentWrapperRule: EvaluatorRule = {
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
