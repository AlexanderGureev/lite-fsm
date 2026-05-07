import { describe, expect, it } from "vitest";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import {
  createPartialEvaluator,
  type EvaluationExpectedPosition,
} from "../../packages/graph/src/compiler/evaluator";
import { createSourceAdapter } from "../../packages/graph/src/compiler/source";

const setup = (sourceText: string) => {
  const source = createSourceAdapter(sourceText, { filename: "evaluator.ts" });
  const catalog = createSourceCatalog(source);
  const evaluator = createPartialEvaluator(source, catalog);

  return { catalog, evaluator };
};

const evaluateConst = (
  sourceText: string,
  name: string,
  expectedPosition: EvaluationExpectedPosition = "unknown",
) => {
  const { catalog, evaluator } = setup(sourceText);
  const initializer = catalog.getConstBinding(name)?.initializer;
  if (!initializer) throw new Error(`Missing initializer for ${name}`);

  return evaluator.evaluateExpression(initializer, { expectedPosition });
};

const evaluateConstWithoutOptions = (sourceText: string, name: string) => {
  const { catalog, evaluator } = setup(sourceText);
  const initializer = catalog.getConstBinding(name)?.initializer;
  if (!initializer) throw new Error(`Missing initializer for ${name}`);

  return evaluator.evaluateExpression(initializer);
};

describe("PartialEvaluator", () => {
  it("раскрывает literals, arrays, objects, spreads, computed keys, as const и satisfies", () => {
    const result = evaluateConst(
      `
        const EVENT = "OPEN";
        const base = { IDLE: { RESET: "IDLE" } } as const;
        const config = ({
          ...base,
          [EVENT]: ["value", 1, true, null],
          nested: { answer: 42 },
        } satisfies Record<string, unknown>);
      `,
      "config",
    );

    expect(result.kind).toBe("known");
    if (result.kind !== "known" || result.value.kind !== "object") throw new Error("Expected object result");

    expect(result.value.properties.map((property) => property.key)).toEqual(["IDLE", "OPEN", "nested"]);
    expect(result.value.properties[1]?.value).toMatchObject({
      kind: "array",
      items: [
        { kind: "string", value: "value" },
        { kind: "number", value: 1 },
        { kind: "boolean", value: true },
        { kind: "null" },
      ],
    });
  });

  it("раскрывает no-substitution template, false, function expression, numeric keys, string keys и methods", () => {
    const result = evaluateConst(
      `
        const methodName = "run";
        const value = {
          label: \`READY\`,
          disabled: false,
          "string-key": function () {},
          1: "numeric",
          [methodName]() {},
        };
      `,
      "value",
    );

    expect(result.kind).toBe("known");
    if (result.kind !== "known" || result.value.kind !== "object") throw new Error("Expected object result");

    expect(result.value.properties.map((property) => [property.key, property.value.kind])).toEqual([
      ["label", "string"],
      ["disabled", "boolean"],
      ["string-key", "function"],
      ["1", "string"],
      ["run", "function"],
    ]);
  });

  it("раскрывает type assertion и shorthand property из local const", () => {
    const result = evaluateConst(
      `
        const event = <string>"GO";
        const value = { event };
      `,
      "value",
    );

    expect(result).toMatchObject({
      kind: "known",
      value: {
        kind: "object",
        properties: [
          {
            key: "event",
            value: { kind: "string", value: "GO" },
          },
        ],
      },
    });
  });

  it("возвращает controlled results для external и dynamic expressions", () => {
    const external = evaluateConst("const value = externalValue;", "value");
    const dynamic = evaluateConst("const target = getRuntimeTarget();", "target");
    const withoutOptions = evaluateConstWithoutOptions('const value = "ok";', "value");

    expect(external).toMatchObject({
      kind: "external",
      label: "externalValue",
    });
    expect(dynamic).toMatchObject({
      kind: "dynamic",
      label: "getRuntimeTarget()",
    });
    expect(withoutOptions).toMatchObject({
      kind: "known",
      value: { kind: "string", value: "ok" },
    });
  });

  it("пробрасывает controlled result из массива, shorthand и spread", () => {
    expect(evaluateConst("const value = [externalValue];", "value")).toMatchObject({
      kind: "external",
      label: "externalValue",
    });
    expect(evaluateConst("const value = { externalValue };", "value")).toMatchObject({
      kind: "external",
      label: "externalValue",
    });
    expect(evaluateConst("const value = { key: externalValue };", "value")).toMatchObject({
      kind: "external",
      label: "externalValue",
    });
    expect(evaluateConst("const value = { ...externalObject };", "value")).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_OBJECT_SPREAD",
    });
  });

  it("разрешает transparent wrappers только в ожидаемых позициях", () => {
    const source = `
      import { createConfig, createEffect, createReducer } from "@lite-fsm/core";

      const cfg = createConfig({ IDLE: { GO: "DONE" }, DONE: {} });
      const reducer = createReducer((state) => state);
      const effect = createEffect({
        type: "latest",
        effect: ({ transition }) => transition({ type: "DONE" }),
        cancelFn: () => () => false,
      });
    `;
    const configResult = evaluateConst(source, "cfg", "config");
    const configWrongPosition = evaluateConst(source, "cfg", "unknown");
    const reducerResult = evaluateConst(source, "reducer", "reducer");
    const effectResult = evaluateConst(source, "effect", "effectEntry");

    expect(configResult.kind).toBe("known");
    expect(configResult.kind === "known" ? configResult.value.kind : undefined).toBe("object");
    expect(configWrongPosition.kind).toBe("dynamic");
    expect(reducerResult.kind === "known" ? reducerResult.value : undefined).toMatchObject({
      kind: "function",
      wrapper: { kind: "createReducer" },
    });
    expect(effectResult.kind === "known" ? effectResult.value : undefined).toMatchObject({
      kind: "function",
      wrapper: {
        kind: "createEffect",
        type: { kind: "string", value: "latest" },
        cancelFn: { kind: "function" },
      },
    });
  });

  it("в managerMap сохраняет values как expressions и раскрывает nested manager spreads", () => {
    const result = evaluateConst(
      `
        const computed = "computed";
        const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const base = { first };
        const managerMap = {
          ...base,
          [computed]: (first as const),
          inline: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        };
      `,
      "managerMap",
      "managerMap",
    );

    expect(result.kind).toBe("known");
    if (result.kind !== "known" || result.value.kind !== "object") throw new Error("Expected object result");

    expect(result.value.properties.map((property) => [property.key, property.value.kind])).toEqual([
      ["first", "expression"],
      ["computed", "expression"],
      ["inline", "expression"],
    ]);
    expect(
      result.value.properties.map((property) => (property.value.kind === "expression" ? property.value.text : "")),
    ).toEqual(["first", "(first as const)", 'createMachine({ config: {}, initialState: "IDLE", initialContext: {} })']);
  });

  it("разрешает ambient transparent wrappers, но не wrappers из чужого import-а", () => {
    const ambient = evaluateConst("const cfg = createConfig({ IDLE: {} });", "cfg", "config");
    const importedElsewhere = evaluateConst(
      `
        import { createConfig } from "other";
        const cfg = createConfig({ IDLE: {} });
      `,
      "cfg",
      "config",
    );
    const memberCall = evaluateConst(
      `
        const cfg = helpers.createConfig({ IDLE: {} });
      `,
      "cfg",
      "config",
    );

    expect(ambient.kind === "known" ? ambient.value.kind : undefined).toBe("object");
    expect(importedElsewhere).toMatchObject({
      kind: "dynamic",
      label: "createConfig({ IDLE: {} })",
    });
    expect(memberCall).toMatchObject({
      kind: "dynamic",
      label: "helpers.createConfig({ IDLE: {} })",
    });
  });

  it("возвращает controlled errors для некорректных wrapper arguments", () => {
    const missingReducer = evaluateConst(
      `
        import { createReducer } from "@lite-fsm/core";
        const reducer = createReducer();
      `,
      "reducer",
      "reducer",
    );
    const externalReducer = evaluateConst(
      `
        import { createReducer } from "@lite-fsm/core";
        const reducer = createReducer(externalReducerFn);
      `,
      "reducer",
      "reducer",
    );
    const missingEffect = evaluateConst(
      `
        import { createEffect } from "@lite-fsm/core";
        const effect = createEffect({ type: "latest" });
      `,
      "effect",
      "effectEntry",
    );
    const dynamicEffectOptions = evaluateConst(
      `
        import { createEffect } from "@lite-fsm/core";
        const effect = createEffect(getOptions());
      `,
      "effect",
      "effectEntry",
    );

    expect(missingReducer).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_WRAPPER",
    });
    expect(externalReducer).toMatchObject({
      kind: "external",
      label: "externalReducerFn",
    });
    expect(missingEffect).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_CREATE_EFFECT",
    });
    expect(dynamicEffectOptions).toMatchObject({
      kind: "dynamic",
      label: "getOptions()",
    });
  });

  it("возвращает unsupported для dynamic computed key без обращения к файловой системе", () => {
    const result = evaluateConst(
      `
        const config = {
          [getKey()]: "value",
        };
      `,
      "config",
    );

    expect(result).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    });
  });

  it("возвращает unsupported для нестандартных object keys и пустого initializer", () => {
    const bigintKey = evaluateConst(
      `
        const value = {
          1n: "value",
        };
      `,
      "value",
    );
    const privateKey = evaluateConst(
      `
        const value = {
          #secret: "value",
        };
      `,
      "value",
    );
    const emptyInitializer = evaluateConst(
      `
        const value = {
          key: ,
        };
      `,
      "value",
    );

    expect(bigintKey).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    });
    expect(privateKey).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    });
    expect(emptyInitializer).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_EMPTY_PROPERTY",
    });
  });

  it("возвращает unsupported для object property forms, const cycles и неизвестных expressions", () => {
    const getter = evaluateConst(
      `
        const value = {
          get computed() {
            return "x";
          },
        };
      `,
      "value",
    );
    const dynamicMethod = evaluateConst(
      `
        const value = {
          [getName()]() {},
        };
      `,
      "value",
    );
    const cycle = evaluateConst(
      `
        const a = b;
        const b = a;
      `,
      "a",
    );
    const binary = evaluateConst("const value = 1 + 2;", "value");

    expect(getter).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_OBJECT_PROPERTY",
    });
    expect(dynamicMethod).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
    });
    expect(cycle).toMatchObject({
      kind: "unsupported",
      code: "LFG_CONST_CYCLE",
    });
    expect(binary).toMatchObject({
      kind: "unsupported",
      code: "LFG_UNSUPPORTED_EXPRESSION",
    });
  });
});
