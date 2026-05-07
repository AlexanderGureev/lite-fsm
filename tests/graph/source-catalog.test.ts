import { describe, expect, it } from "vitest";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import {
  createSourceAdapter,
  createVirtualFilename,
  inferGraphLanguage,
} from "../../packages/graph/src/compiler/source";

describe("SourceAdapter", () => {
  it("выводит language из filename и уважает explicit language override", () => {
    expect(inferGraphLanguage("machine.ts", undefined)).toBe("ts");
    expect(inferGraphLanguage("machine.tsx", undefined)).toBe("tsx");
    expect(inferGraphLanguage("machine.js", undefined)).toBe("js");
    expect(inferGraphLanguage("machine.jsx", undefined)).toBe("jsx");
    expect(inferGraphLanguage("machine.mjs", undefined)).toBe("unknown");
    expect(inferGraphLanguage("README", undefined)).toBe("unknown");
    expect(inferGraphLanguage("machine.ts", "jsx")).toBe("jsx");
    expect(inferGraphLanguage(undefined, undefined)).toBe("unknown");
  });

  it("создает virtual filename только когда filename не передан", () => {
    expect(createVirtualFilename("custom.ts", "js")).toBe("custom.ts");
    expect(createVirtualFilename(undefined, "unknown")).toBe("lite-fsm-graph-input.ts");
    expect(createVirtualFilename(undefined, "jsx")).toBe("lite-fsm-graph-input.jsx");
  });

  it("нормализует loc и сохраняет source text/textOf", () => {
    const source = createSourceAdapter("const value = 1;\n", { language: "ts" });
    const declaration = source.sourceFile.getVariableDeclarations()[0];
    if (!declaration) throw new Error("Expected variable declaration");

    expect(source.filename).toBe("lite-fsm-graph-input.ts");
    expect(source.language).toBe("ts");
    expect(source.sourceText).toBe("const value = 1;\n");
    expect(source.textOf(declaration)).toBe("value = 1");
    expect(source.locFromOffsets(-5, -1)).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    });
  });

  it("возвращает parse diagnostics с loc для неполного source", () => {
    const source = createSourceAdapter("const value = ", { filename: "broken.js" });

    expect(source.language).toBe("js");
    expect(source.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_SOURCE_PARSE_ERROR",
        severity: "error",
        loc: expect.objectContaining({
          start: expect.objectContaining({ offset: expect.any(Number) }),
        }),
      }),
    ]);
  });
});

describe("SourceCatalog", () => {
  it("строит import provenance, local consts, value bindings и call lookup", () => {
    const source = createSourceAdapter(
      `
        import type { createMachine as TypeMachine } from "@lite-fsm/core";
        import { type createConfig, createMachine as makeMachine, createEffect } from "@lite-fsm/core";
        import createMachine from "other-default";
        import * as MachineApi from "other-namespace";
        import { createReducer as externalReducer } from "other";

        const EVENT = "GO";
        let mutable = "NO";
        function MachineManager() {}
        export default function () {}
        class LocalClass {}
        export default class {}
        enum LocalEnum { A }

        makeMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        createEffect({ effect: () => {} });
      `,
      { filename: "catalog.ts" },
    );
    const catalog = createSourceCatalog(source);

    expect(catalog.resolveApiIdentifier("makeMachine", "createMachine")).toBe("import");
    expect(catalog.resolveApiIdentifier("createEffect", "createEffect")).toBe("import");
    expect(catalog.resolveApiIdentifier("createConfig", "createConfig")).toBe("ambient");
    expect(catalog.resolveApiIdentifier("TypeMachine", "createMachine")).toBeUndefined();
    expect(catalog.resolveApiIdentifier("createMachine", "createMachine")).toBeUndefined();
    expect(catalog.localValueBindings.has("MachineApi")).toBe(true);
    expect(catalog.resolveApiIdentifier("externalReducer", "createReducer")).toBeUndefined();
    expect(catalog.resolveApiIdentifier("MachineManager", "MachineManager")).toBeUndefined();
    expect(catalog.resolveApiIdentifier("createReducer", "createReducer")).toBe("ambient");
    expect(catalog.getConstBinding("EVENT")?.name).toBe("EVENT");
    expect(catalog.getConstBinding("mutable")).toBeUndefined();
    expect(catalog.localValueBindings.has("LocalClass")).toBe(true);
    expect(catalog.localValueBindings.has("LocalEnum")).toBe(true);
    expect(catalog.calls).toHaveLength(2);
  });

  it("игнорирует destructuring const как local const binding", () => {
    const source = createSourceAdapter('const { EVENT } = source;\nconst missing;\nconst VALUE = "ok";');
    const catalog = createSourceCatalog(source);

    expect(catalog.getConstBinding("EVENT")).toBeUndefined();
    expect(catalog.getConstBinding("missing")).toBeUndefined();
    expect(catalog.getConstBinding("VALUE")?.name).toBe("VALUE");
  });

  it("учитывает параметры как value bindings для защиты ambient detection", () => {
    const source = createSourceAdapter(`
      function run(createMachine: unknown) {
        createMachine;
      }
    `);
    const catalog = createSourceCatalog(source);

    expect(catalog.localValueBindings.has("createMachine")).toBe(true);
    expect(catalog.resolveApiIdentifier("createMachine", "createMachine")).toBeUndefined();
  });
});
