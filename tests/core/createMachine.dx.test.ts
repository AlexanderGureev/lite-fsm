import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceText = `
import { createMachine as baseCreateMachine } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type Evt = FSMEvent<"SPAWN"> | FSMEvent<"DONE"> | FSMEvent<"GO">;

const createMachine: TypedCreateMachineFn<Evt> = baseCreateMachine;

createMachine({
  config: {
    idle: { GO: "ready" },
    ready: {},
  },
  initialState: "idle",
  initialContext: {},
});

createMachine({
  config: {
    idle: { GO: "ready" },
    ready: {},
  },
  initialState: "idle",
  initialContext: {},
  dehydrate: () => ({ ok: true }),
  hydrate: (prev, snapshot) => ({
    state: prev.state,
    context: snapshot,
  }),
});

createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
});

createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  persistence: "snapshot",
});

createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  persistence: "snapshot",
  hydrate: (prev, snapshot: { ok: boolean }) => ({
    state: prev?.state ?? "pending",
    context: {},
  }),
});

createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  persistence: "snapshot",
  dehydrate: () => ({ ok: true }),
});

createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  persistence: "snapshot",
  dehydrate: () => ({ ok: true }),
  hydrate: (prev, snapshot) => ({
    state: prev?.state ?? "pending",
    context: snapshot,
  }),
});

baseCreateMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  persistence: "snapshot",
  dehydrate: () => ({ ok: true }),
  hydrate: (prev, snapshot) => ({
    state: prev?.state ?? "pending",
    context: snapshot,
  }),
});
`;

const actorHooksCompletionMarker = "/* actor-hooks-completion */";
const completionSourceTextWithMarker = `
import { createMachine as baseCreateMachine } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type Evt = FSMEvent<"SPAWN"> | FSMEvent<"DONE">;

const createMachine: TypedCreateMachineFn<Evt> = baseCreateMachine;

// @ts-expect-error!
createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  dehydrate: () => ({ ok: true }),
  hydrate: (prev: { state: "pending"; context: {} } | undefined, _snapshot: { ok: boolean }) => ({
    state: prev?.state ?? "pending",
    context: {},
  }),
  ${actorHooksCompletionMarker}
});
`;
const completionSourceText = completionSourceTextWithMarker.replace(actorHooksCompletionMarker, "");
const actorHooksCompletionPosition = completionSourceTextWithMarker.indexOf(actorHooksCompletionMarker);

const fileName = path.join(process.cwd(), "tests/core/createMachine.dx.fixture.ts");
const completionFileName = path.join(process.cwd(), "tests/core/createMachine.completion.fixture.ts");
const typeScriptDxTestTimeout = 30_000;
const options: ts.CompilerOptions = {
  strict: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2020,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  noEmit: true,
  paths: {
    "@lite-fsm/core": ["./packages/core/src/index.ts"],
  },
};

const createProgram = () => {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.normalize(name) === path.normalize(fileName)) {
      return ts.createSourceFile(name, sourceText, languageVersion, true);
    }

    return getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  };

  return ts.createProgram([fileName], options, host);
};

const createLanguageService = () => {
  const files = new Map([[completionFileName, completionSourceText]]);
  return ts.createLanguageService({
    getScriptFileNames: () => [completionFileName],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const content = files.get(name) ?? ts.sys.readFile(name);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  });
};

const getConfigContextualTypes = (program: ts.Program) => {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFiles().find((file) => file.fileName.endsWith("createMachine.dx.fixture.ts"));
  if (!sourceFile) return [];

  const types: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "config" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const type = checker.getContextualType(node.initializer);
      types.push(type ? checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation) : "");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return types;
};

// === Расширенные DX-кейсы =====================================================

const dependenciesSourceText = `
import { createMachine as baseCreateMachine, defineMachine } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type Evt = FSMEvent<"SPAWN"> | FSMEvent<"DONE">;
type Deps = { fetcher: (url: string) => Promise<{ ok: boolean }>; logger: { info: (msg: string) => void } };

const createMachine: TypedCreateMachineFn<Evt> = baseCreateMachine;

// (1) defineMachine factory с явными generics: deps в effect должен включать Deps + ActorDefaultDeps.
defineMachine<Evt, Deps>().create({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  effects: {
    pending: ({ fetcher, logger, self, transition }) => {
      logger.info(self.actorId);
      void fetcher("https://example.com");
      transition.unscoped({ type: "DONE" });
    },
  },
});

// (2) Snapshot chain: dehydrate -> {ok: boolean}, hydrate snapshot должен типизироваться как {ok: boolean}.
createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: { count: 0 },
  persistence: "snapshot",
  dehydrate: () => ({ ok: true as const, count: 1 }),
  hydrate: (prev, snapshot) => ({
    state: prev?.state ?? "pending",
    context: { count: snapshot.ok ? snapshot.count : 0 },
  }),
});
`;

const dependenciesFileName = path.join(process.cwd(), "tests/core/createMachine.dependencies.fixture.ts");

const createDependenciesProgram = () => {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.normalize(name) === path.normalize(dependenciesFileName)) {
      return ts.createSourceFile(name, dependenciesSourceText, languageVersion, true);
    }

    return getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  };

  return ts.createProgram([dependenciesFileName], options, host);
};

const invalidConfigSourceText = `
import { createMachine as baseCreateMachine } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type Evt = FSMEvent<"SPAWN"> | FSMEvent<"DONE">;
const createMachine: TypedCreateMachineFn<Evt> = baseCreateMachine;

// (3) actor template c terminal state как ключом config -- невалидно.
createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
    __RESOLVED: { DONE: null },
  },
  initialState: "__INIT",
  initialContext: {},
});

// (4) actor target -> non-existent state.
createMachine({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "missing-state" },
  },
  initialState: "__INIT",
  initialContext: {},
});
`;

const invalidConfigFileName = path.join(process.cwd(), "tests/core/createMachine.invalid.fixture.ts");

const createInvalidConfigProgram = () => {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.normalize(name) === path.normalize(invalidConfigFileName)) {
      return ts.createSourceFile(name, invalidConfigSourceText, languageVersion, true);
    }

    return getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  };

  return ts.createProgram([invalidConfigFileName], options, host);
};

const defineMachineCompletionMarker = "/* defineMachine-completion */";
const defineMachineCompletionWithMarker = `
import { defineMachine } from "@lite-fsm/core";
import type { FSMEvent } from "@lite-fsm/core";

type Evt = FSMEvent<"SPAWN"> | FSMEvent<"DONE">;
type Deps = { fetcher: (url: string) => Promise<void> };

defineMachine<Evt, Deps>().create({
  config: {
    __INIT: { SPAWN: "pending" },
    pending: { DONE: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: {},
  ${defineMachineCompletionMarker}
});
`;
const defineMachineCompletionText = defineMachineCompletionWithMarker.replace(defineMachineCompletionMarker, "");
const defineMachineCompletionPosition = defineMachineCompletionWithMarker.indexOf(defineMachineCompletionMarker);
const defineMachineCompletionFile = path.join(
  process.cwd(),
  "tests/core/createMachine.defineMachine.completion.fixture.ts",
);

const createDefineMachineLanguageService = () => {
  const files = new Map([[defineMachineCompletionFile, defineMachineCompletionText]]);
  return ts.createLanguageService({
    getScriptFileNames: () => [defineMachineCompletionFile],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const content = files.get(name) ?? ts.sys.readFile(name);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  });
};

describe("createMachine DX-типы", () => {
  it("не дублирует contextual type config через intersection", () => {
    const program = createProgram();
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

    expect(messages).toEqual([]);
    expect(getConfigContextualTypes(program)).toEqual([
      '{ idle: { GO: "ready"; }; ready: {}; }',
      '{ idle: { GO: "ready"; }; ready: {}; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
      '{ __INIT: { SPAWN: "pending"; }; pending: { DONE: "__RESOLVED"; }; }',
    ]);
  }, typeScriptDxTestTimeout);

  it("подсказывает actor-поля, когда hydrate/dehydrate уже набраны до persistence", () => {
    const service = createLanguageService();
    const diagnostics = service.getSemanticDiagnostics(completionFileName);
    const completions = service.getCompletionsAtPosition(completionFileName, actorHooksCompletionPosition, {
      includeCompletionsWithObjectLiteralMethodSnippets: true,
    });
    const names = new Set(completions?.entries.map((entry) => entry.name) ?? []);

    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
    expect(names.has("persistence")).toBe(true);
    expect(names.has("effects")).toBe(true);
    expect(names.has("groupTag")).toBe(true);
    expect(names.has("reducer")).toBe(true);
  }, typeScriptDxTestTimeout);
});

describe("createMachine DX-типы — расширенные", () => {
  it(
    "MachineDependencies inference: deps в effect объединяет D и ActorDefaultDeps без diagnostics",
    () => {
      const program = createDependenciesProgram();
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const messages = diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

      expect(messages).toEqual([]);
    },
    typeScriptDxTestTimeout,
  );

  it(
    "invalid config (terminal как ключ / target несуществующего state) даёт TS diagnostics",
    () => {
      const program = createInvalidConfigProgram();
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const messages = diagnostics
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n");

      expect(messages.length).toBeGreaterThan(0);
      expect(messages).toMatch(/__RESOLVED|missing-state/);
    },
    typeScriptDxTestTimeout,
  );

  it(
    "defineMachine completion: предлагает поля actor template config'а",
    () => {
      const service = createDefineMachineLanguageService();
      const completions = service.getCompletionsAtPosition(
        defineMachineCompletionFile,
        defineMachineCompletionPosition,
        { includeCompletionsWithObjectLiteralMethodSnippets: true },
      );
      const names = new Set(completions?.entries.map((entry) => entry.name) ?? []);

      expect(names.has("effects")).toBe(true);
      expect(names.has("reducer")).toBe(true);
      expect(names.has("persistence")).toBe(true);
      expect(names.has("groupTag")).toBe(true);
    },
    typeScriptDxTestTimeout,
  );
});
