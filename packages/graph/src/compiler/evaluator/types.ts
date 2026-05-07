import type { Expression } from "ts-morph";
import type { SourceLocation } from "../../types";
import type { SourceCatalog } from "../catalog";
import type { SourceAdapter } from "../source";

export type EvaluationExpectedPosition =
  | "config"
  | "reducer"
  | "effects"
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

export type EvaluationState = {
  seenIdentifiers: ReadonlySet<string>;
};

export type IncompleteEvaluationResult = Exclude<EvaluationResult, { kind: "known" }>;

export type ObjectPropertyValueResult =
  | { ok: true; value: EvaluatedGraphValue }
  | { ok: false; result: IncompleteEvaluationResult };

export type EvaluatorRuleContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
  evaluate(node: Expression, options?: EvaluateExpressionOptions, state?: EvaluationState): EvaluationResult;
  state: EvaluationState;
  options: Required<EvaluateExpressionOptions>;
};

export type EvaluatorRule = {
  name: string;
  match(node: Expression, context: EvaluatorRuleContext): boolean;
  read(node: Expression, context: EvaluatorRuleContext): EvaluationResult;
};

export type PartialEvaluator = {
  evaluateExpression(node: Expression, options?: EvaluateExpressionOptions): EvaluationResult;
};

export const known = (value: EvaluatedGraphValue, loc?: SourceLocation): EvaluationResult => ({
  kind: "known",
  value,
  loc,
});
