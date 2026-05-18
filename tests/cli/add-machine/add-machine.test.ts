import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { createProgram } from "../../../packages/cli/src/cli/create-program";
import type { CliContext } from "../../../packages/cli/src/cli/context";
import { normalizeAddMachineOptions } from "../../../packages/cli/src/add-machine/options";
import { normalizeMachineName } from "../../../packages/cli/src/add-machine/name";
import { patchStoreIndex } from "../../../packages/cli/src/add-machine/patch-index";
import { patchStoreTypes } from "../../../packages/cli/src/add-machine/patch-types";
import { createMachineFileContents } from "../../../packages/cli/src/add-machine/template";
import {
  applyAddMachinePlan,
  createAddMachinePlan,
  runAddMachine,
} from "../../../packages/cli/src/add-machine/run-add-machine";
import { runAddMachineCommand } from "../../../packages/cli/src/add-machine/command";
import { applyLiteFsmStoreOverlay } from "../../../packages/cli/src/create-project/templates/shared-store";
import { normalizeAbsolutePath } from "../../../packages/cli/src/project/source-cache";
import { createCliTestContext, type MemoryFileSystem } from "../helpers/memory-fs";

const generatedIndex = `import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { app } from "./machines/app";
import type { AppEvents } from "./types";

export const machines = {
  app,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const makeStore = () => {
  const manager = MachineManager<AppMachines, AppEvents>(machines, {
    middleware: [immerMiddleware],
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  return manager;
};
`;

const generatedCreateMachine = `import type { TypedCreateMachineFn } from "@lite-fsm/core";
import { createMachine as createLiteFsmMachine } from "@lite-fsm/core";
import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createLiteFsmMachine;
`;

const generatedDeps = `import type { AppState } from ".";

export type AppDeps = {
  getState: () => AppState;
};
`;

const generatedHooks = `import { useManager, useSelector, useTransition } from "@lite-fsm/react";
import type { AppMachines, AppState } from ".";
import type { AppEvents } from "./types";

export const useAppManager = () => useManager<AppMachines, AppEvents>();
export const useAppSelector = <R>(selector: (state: AppState) => R) => useSelector<AppMachines, R>(selector);
export const useAppTransition = () => useTransition<AppEvents>();
`;

const generatedAppMachine = `import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"DO_INIT">;

export const app = createMachine({
  config: {
    IDLE: { DO_INIT: "READY" },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
});
`;

const aggregatorTypes = `import type * as app from "./machines/app";

export type AppEvents = app.Events;
`;

const oldInlineTypes = `import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_INIT">;
`;

type StoreFilesInput = {
  root?: string;
  types?: string;
  index?: string;
};

const createContext = (
  files: Record<string, string> = {},
  cwd = "/project",
  options: Parameters<typeof createCliTestContext>[2] = {},
) => createCliTestContext({ "/project/.keep": "", ...files }, cwd, options);

const storeFiles = (typesOrInput: string | StoreFilesInput = oldInlineTypes, index = generatedIndex): Record<string, string> => {
  const input = typeof typesOrInput === "string" ? { types: typesOrInput, index } : typesOrInput;
  const root = input.root ?? "/project";
  const types = input.types ?? oldInlineTypes;
  const storeIndex = input.index ?? index;

  return {
    [`${root}/src/store/create-machine.ts`]: generatedCreateMachine,
    [`${root}/src/store/deps.ts`]: generatedDeps,
    [`${root}/src/store/hooks.ts`]: generatedHooks,
    [`${root}/src/store/index.ts`]: storeIndex,
    [`${root}/src/store/types.ts`]: types,
    [`${root}/src/store/machines/app.ts`]: generatedAppMachine,
  };
};

const expectSuccess = async (context: CliContext & { fs: MemoryFileSystem }, name = "user-session") => {
  const result = await runAddMachineCommand(context, { name });

  expect(result).toEqual({ exitCode: 0, diagnostics: [] });
  return {
    machine: context.fs.getFile("/project/src/store/machines/user-session.ts") ?? "",
    index: context.fs.getFile("/project/src/store/index.ts") ?? "",
    types: context.fs.getFile("/project/src/store/types.ts") ?? "",
  };
};

const moduleDeclarations = {
  "/project/node_modules/@lite-fsm/core/index.d.ts": `export type FSMEvent<T extends string, P = never> = [P] extends [never] ? { type: T } : { type: T; payload: P };
export type TypedCreateMachineFn<AppEvents, AppDeps> = <TConfig extends Record<string, unknown>, TContext extends object>(machine: {
  config: TConfig;
  initialState: keyof TConfig & string;
  initialContext: TContext;
  effects?: Record<string, (deps: AppDeps) => void | Promise<void>>;
}) => {
  config: TConfig;
  initialState: keyof TConfig & string;
  initialContext: TContext;
  effects?: Record<string, (deps: AppDeps) => void | Promise<void>>;
};
export declare const createMachine: TypedCreateMachineFn<any, any>;
export type MachinesState<S> = { [K in keyof S]: { state: string; context: object } };
export declare function MachineManager<S, E>(machines: S, options?: unknown): {
  getState: () => MachinesState<S>;
  setDependencies(deps: unknown): void;
  transition(event: E): E;
};
`,
  "/project/node_modules/@lite-fsm/middleware/immer.d.ts": "export declare const immerMiddleware: unknown;\n",
  "/project/node_modules/@lite-fsm/react/index.d.ts": `export declare function useManager<S, E>(): unknown;
export declare function useSelector<S, R>(selector: (state: import("@lite-fsm/core").MachinesState<S>) => R, equalityFn?: (oldValue: R, newValue: R) => boolean): R;
export declare function useTransition<E>(): (event: E) => E;
`,
};

const assertStoreTypeChecks = (context: CliContext & { fs: MemoryFileSystem }): void => {
  for (const [path, contents] of Object.entries(moduleDeclarations)) {
    context.fs.writeFile(path, contents);
  }

  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
  };
  const defaultHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getCurrentDirectory: () => "/project",
    fileExists: (fileName) => context.fs.fileExists(normalizeAbsolutePath(fileName)) || defaultHost.fileExists(fileName),
    readFile: (fileName) => context.fs.getFile(normalizeAbsolutePath(fileName)) ?? defaultHost.readFile(fileName),
    directoryExists: (directoryName) => context.fs.directoryExists(normalizeAbsolutePath(directoryName)) || defaultHost.directoryExists?.(directoryName) === true,
    realpath: (path) => normalizeAbsolutePath(path),
    getSourceFile(fileName, languageVersion) {
      const source = host.readFile(fileName);
      return source === undefined ? undefined : ts.createSourceFile(fileName, source, languageVersion, true);
    },
  };
  const program = ts.createProgram(["/project/src/store/index.ts"], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
};

describe("add-machine options и name", () => {
  it("валидирует обязательное строковое имя", () => {
    expect(normalizeAddMachineOptions({ name: " user-session " })).toEqual({
      ok: true,
      options: { name: "user-session" },
    });
    expect(normalizeAddMachineOptions({})).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Machine name is required." })],
    });
    expect(normalizeAddMachineOptions({ name: 1 })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
    });
  });

  it("нормализует kebab-case, snake_case, camelCase и PascalCase", () => {
    expect(normalizeMachineName(" user-session ")).toEqual({
      ok: true,
      machine: {
        rawName: "user-session",
        fileName: "user-session",
        exportName: "userSession",
        eventType: "DO_USER_SESSION_INIT",
        eventNamespace: "userSession",
      },
    });
    expect(normalizeMachineName("user_session")).toEqual({
      ok: true,
      machine: expect.objectContaining({ fileName: "user-session", exportName: "userSession" }),
    });
    expect(normalizeMachineName("userSession")).toEqual({
      ok: true,
      machine: expect.objectContaining({ fileName: "user-session", exportName: "userSession" }),
    });
    expect(normalizeMachineName("UserSession")).toEqual({
      ok: true,
      machine: expect.objectContaining({ fileName: "user-session", exportName: "userSession" }),
    });
    expect(normalizeMachineName("apiClient2")).toEqual({
      ok: true,
      machine: expect.objectContaining({
        fileName: "api-client2",
        exportName: "apiClient2",
        eventType: "DO_API_CLIENT2_INIT",
      }),
    });
    expect(normalizeMachineName("user2_session3")).toEqual({
      ok: true,
      machine: expect.objectContaining({
        fileName: "user2-session3",
        exportName: "user2Session3",
        eventType: "DO_USER2_SESSION3_INIT",
      }),
    });
  });

  it("отклоняет имена, которые не дают безопасный JS identifier", () => {
    for (const name of ["", "user--session", "user__session", "-user", "_user", "user_", "1user", "user.session", "user session", "юзер", "class", "true"]) {
      expect(normalizeMachineName(name)).toEqual({
        ok: false,
        diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
      });
    }
  });
});

describe("add-machine patchers", () => {
  const normalizedMachine = normalizeMachineName("user-session");
  const machine = normalizedMachine.ok ? normalizedMachine.machine : undefined;

  it("патчит index.ts import и machines key", () => {
    expect(machine).toBeDefined();
    const patched = patchStoreIndex(generatedIndex, machine!);

    expect(patched).toEqual({ ok: true, contents: expect.stringContaining('import { userSession } from "./machines/user-session";') });
    expect(patched.ok && patched.contents).toContain("  app,\n  userSession,");
  });

  it("добавляет index.ts import после последнего machine import и сохраняет остальные imports", () => {
    expect(machine).toBeDefined();
    const source = `import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { app } from "./machines/app";
import { billingFlow } from "./machines/billing-flow";
import type { AppEvents } from "./types";

export const machines = {
  app,
  billingFlow,
};
`;
    const patched = patchStoreIndex(source, machine!);

    expect(patched.ok && patched.contents).toContain(`import { app } from "./machines/app";
import { billingFlow } from "./machines/billing-flow";
import { userSession } from "./machines/user-session";
import type { AppEvents } from "./types";`);
    expect(patched.ok && patched.contents).toContain("  app,\n  billingFlow,\n  userSession,");
  });

  it("поддерживает пустой machines object, но отклоняет неподдержанный index.ts", () => {
    expect(machine).toBeDefined();
    expect(patchStoreIndex(`import { app } from "./machines/app";\n\nexport const machines = {\n\n};\n`, machine!)).toEqual({
      ok: true,
      contents: expect.stringContaining("export const machines = {\n  userSession,\n};"),
    });
    expect(patchStoreIndex("export const machines = { app };\n", machine!)).toEqual({
      ok: false,
      message: "src/store/index.ts does not match the generated lite-fsm store shape.",
    });
    expect(patchStoreIndex(`import app from "./machines/app";

export const machines = {
  app,
};
`, machine!)).toEqual({
      ok: false,
      message: "src/store/index.ts does not match the generated lite-fsm store shape.",
    });
  });

  it("патчит старый inline AppEvents формат", () => {
    expect(machine).toBeDefined();
    const patched = patchStoreTypes(oldInlineTypes, machine!);

    expect(patched).toEqual({
      ok: true,
      contents: `import type { FSMEvent } from "@lite-fsm/core";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | FSMEvent<"DO_INIT">
  | userSession.Events;
`,
    });
  });

  it("поддерживает inline multi-literal и union из FSMEvent", () => {
    expect(machine).toBeDefined();
    const multi = patchStoreTypes(`import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_INIT" | "DO_OTHER_INIT">;
`, machine!);
    const union = patchStoreTypes(`import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_INIT"> | FSMEvent<"DO_OTHER_INIT">;
`, machine!);

    expect(multi.ok && multi.contents).toContain('  | FSMEvent<"DO_INIT" | "DO_OTHER_INIT">\n  | userSession.Events;');
    expect(union.ok && union.contents).toContain('  | FSMEvent<"DO_INIT">\n  | FSMEvent<"DO_OTHER_INIT">\n  | userSession.Events;');
  });

  it("сохраняет top-level union внутри FSMEvent payload-like string literals и вставляет import после machine imports", () => {
    expect(machine).toBeDefined();
    const source = `import type { FSMEvent } from "@lite-fsm/core";
import type * as app from "./machines/app";
import type { AppDeps } from "./deps";

export type AppEvents =
  | app.Events
  | FSMEvent<"DO_A|B">;
`;
    const patched = patchStoreTypes(source, machine!);

    expect(patched.ok && patched.contents).toContain(`import type * as app from "./machines/app";
import type * as userSession from "./machines/user-session";
import type { AppDeps } from "./deps";`);
    expect(patched.ok && patched.contents).toContain('  | app.Events\n  | FSMEvent<"DO_A|B">\n  | userSession.Events;');
  });

  it("поддерживает aggregator и mixed multiline union", () => {
    expect(machine).toBeDefined();
    const aggregator = patchStoreTypes(aggregatorTypes, machine!);
    const mixed = patchStoreTypes(`import type { FSMEvent } from "@lite-fsm/core";
import type * as app from "./machines/app";

export type AppEvents =
  | FSMEvent<"DO_LEGACY">
  | app.Events;
`, machine!);

    expect(aggregator.ok && aggregator.contents).toBe(`import type * as app from "./machines/app";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | app.Events
  | userSession.Events;
`);
    expect(mixed.ok && mixed.contents).toContain('  | FSMEvent<"DO_LEGACY">\n  | app.Events\n  | userSession.Events;');
  });

  it("добавляет import в файл без import-ов и отклоняет сложный AppEvents", () => {
    expect(machine).toBeDefined();
    expect(patchStoreTypes("export type AppEvents = app.Events;\n", machine!)).toEqual({
      ok: true,
      contents: `import type * as userSession from "./machines/user-session";
export type AppEvents =
  | app.Events
  | userSession.Events;
`,
    });
    expect(patchStoreTypes("export type AppEvents = FSMEvent<'DO_INIT'>;\n", machine!)).toEqual({
      ok: false,
      message: "src/store/types.ts AppEvents is too complex to patch automatically. Add machine Events manually.",
    });
    expect(patchStoreTypes("export type AppEvents = ;\n", machine!)).toEqual({
      ok: false,
      message: "src/store/types.ts AppEvents is too complex to patch automatically. Add machine Events manually.",
    });
    expect(patchStoreTypes("export type Other = app.Events;\n", machine!)).toEqual({
      ok: false,
      message: "src/store/types.ts does not export AppEvents in a supported generated shape.",
    });
    expect(patchStoreTypes("import type { AppDeps } from './deps';\n\nexport type AppEvents = app.Events;\n", machine!)).toEqual({
      ok: true,
      contents: `import type { AppDeps } from './deps';
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | app.Events
  | userSession.Events;
`,
    });
  });
});

describe("add-machine run flow", () => {
  it("создает machine file, патчит index.ts/types.ts и печатает success output", async () => {
    const context = createContext(storeFiles());
    const files = await expectSuccess(context);

    expect(files.machine).toBe(createMachineFileContents({
      rawName: "user-session",
      fileName: "user-session",
      exportName: "userSession",
      eventType: "DO_USER_SESSION_INIT",
      eventNamespace: "userSession",
    }));
    expect(files.machine).toContain('export type Events = FSMEvent<"DO_USER_SESSION_INIT">');
    expect(files.machine).toContain("export const userSession = createMachine");
    expect(files.index).toContain('import { userSession } from "./machines/user-session";');
    expect(files.index).toContain("  app,\n  userSession,");
    expect(files.types).toContain('import type * as userSession from "./machines/user-session";');
    expect(files.types).toContain("  | userSession.Events;");
    expect(context.stdout.text()).toBe(`Added machine userSession.

Files:
  src/store/machines/user-session.ts
  src/store/index.ts
  src/store/types.ts

Use:
  transition({ type: "DO_USER_SESSION_INIT" })
`);
  });

  it("работает с aggregator shape и через createProgram boundary", async () => {
    const context = createContext(storeFiles(aggregatorTypes));
    const program = createProgram(context);
    const result = await program.parse(["node", "lite-fsm", "add-machine", "user-session"]);

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.fs.getFile("/project/src/store/types.ts")).toContain("  | app.Events\n  | userSession.Events;");
    expect(context.stdout.text()).toContain("Added machine userSession.");
  });

  it("работает относительно cwd вложенного проекта", async () => {
    const context = createContext(storeFiles({ root: "/workspace/apps/demo", types: aggregatorTypes }), "/workspace/apps/demo");
    const result = await runAddMachineCommand(context, { name: "account-profile" });

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.fs.getFile("/workspace/apps/demo/src/store/machines/account-profile.ts")).toContain("export const accountProfile = createMachine");
    expect(context.fs.getFile("/project/src/store/machines/account-profile.ts")).toBeUndefined();
  });

  it("возвращает diagnostics в stderr для missing name и invalid name", async () => {
    const context = createContext(storeFiles());
    const missing = await runAddMachineCommand(context, {});
    const invalid = await runAddMachineCommand(context, { name: "1bad" });

    expect(missing.diagnostics).toEqual([expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })]);
    expect(invalid.diagnostics).toEqual([expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })]);
    expect(context.stderr.text()).toContain("Machine name is required.");
    expect(context.stderr.text()).toContain("Invalid machine name '1bad'.");
  });

  it("завершается store-not-found без записей", async () => {
    const context = createContext({ "/project/src/store/index.ts": generatedIndex });
    const missingIndex = createContext({
      "/project/src/store/create-machine.ts": generatedCreateMachine,
      "/project/src/store/types.ts": oldInlineTypes,
      "/project/src/store/machines/app.ts": generatedAppMachine,
    });
    const result = await runAddMachineCommand(context, { name: "user-session" });
    const indexResult = await runAddMachineCommand(missingIndex, { name: "user-session" });

    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "LFC_ADD_MACHINE_STORE_NOT_FOUND" })]);
    expect(indexResult.diagnostics).toEqual([expect.objectContaining({ code: "LFC_ADD_MACHINE_STORE_NOT_FOUND" })]);
    expect(context.fs.getFile("/project/src/store/machines/user-session.ts")).toBeUndefined();
  });

  it("возвращает все missing store paths в одном diagnostic", async () => {
    const context = createContext({
      "/project/src/store/create-machine.ts": generatedCreateMachine,
    });
    const result = await runAddMachineCommand(context, { name: "user-session" });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFC_ADD_MACHINE_STORE_NOT_FOUND",
        message: expect.stringContaining("src/store/index.ts, src/store/types.ts, src/store/machines"),
      }),
    ]);
  });

  it("возвращает store-not-found при ошибке чтения generated store", () => {
    const context = createContext(storeFiles());
    const stringThrowContext = createContext(storeFiles());
    const readFile = vi.spyOn(context.fs, "readFile").mockImplementation((path: string) => {
      if (path.endsWith("/src/store/index.ts")) throw new Error("no read");
      return createContext(storeFiles()).fs.readFile(path);
    });
    const stringThrowReadFile = vi.spyOn(stringThrowContext.fs, "readFile").mockImplementation((path: string) => {
      if (path.endsWith("/src/store/types.ts")) throw "no read";
      return createContext(storeFiles()).fs.readFile(path);
    });

    const result = createAddMachinePlan(context, { name: "user-session" });
    const stringThrowResult = createAddMachinePlan(stringThrowContext, { name: "user-session" });

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_STORE_NOT_FOUND" })],
    });
    expect(stringThrowResult).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_STORE_NOT_FOUND" })],
    });
    readFile.mockRestore();
    stringThrowReadFile.mockRestore();
  });

  it("останавливается на preflight conflicts без изменений", async () => {
    const existingFile = createContext({
      ...storeFiles(),
      "/project/src/store/machines/user-session.ts": "old",
    });
    const existingKey = createContext(storeFiles(oldInlineTypes, generatedIndex.replace("  app,\n", "  app,\n  userSession,\n")));
    const existingImport = createContext(storeFiles(`import type * as userSession from "./machines/user-session";

export type AppEvents = app.Events;
`));
    const existingMember = createContext(storeFiles(`import type * as app from "./machines/app";

export type AppEvents =
  | app.Events
  | userSession.Events;
`));
    const existingLiteral = createContext(storeFiles(`import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_USER_SESSION_INIT">;
`));

    for (const context of [existingFile, existingKey, existingImport, existingMember, existingLiteral]) {
      const result = await runAddMachineCommand(context, { name: "user-session" });
      expect(result.diagnostics).toEqual([expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT" })]);
    }
    expect(existingFile.fs.getFile("/project/src/store/machines/user-session.ts")).toBe("old");
  });

  it("возвращает все найденные preflight conflicts и ничего не пишет", async () => {
    const context = createContext({
      ...storeFiles(`import type * as userSession from "./machines/user-session";

export type AppEvents =
  | userSession.Events
  | FSMEvent<"DO_USER_SESSION_INIT">;
`, generatedIndex.replace("  app,\n", "  app,\n  userSession,\n")),
      "/project/src/store/machines/user-session.ts": "old",
    });
    const beforeIndex = context.fs.getFile("/project/src/store/index.ts");
    const beforeTypes = context.fs.getFile("/project/src/store/types.ts");
    const result = await runAddMachineCommand(context, { name: "user-session" });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/machines/user-session.ts already exists." }),
      expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/index.ts machines already contains userSession." }),
      expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/types.ts already imports namespace userSession." }),
      expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/types.ts AppEvents already contains userSession.Events." }),
      expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/types.ts AppEvents already contains DO_USER_SESSION_INIT." }),
    ]);
    expect(context.fs.getFile("/project/src/store/index.ts")).toBe(beforeIndex);
    expect(context.fs.getFile("/project/src/store/types.ts")).toBe(beforeTypes);
    expect(context.fs.getFile("/project/src/store/machines/user-session.ts")).toBe("old");
  });

  it("не считает userSession.Events вне AppEvents union конфликтом", async () => {
    const context = createContext(storeFiles(`import type * as app from "./machines/app";

// userSession.Events appears in a note, but AppEvents does not include it yet.
export type AppEvents = app.Events;
`));
    const result = await runAddMachineCommand(context, { name: "user-session" });

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.fs.getFile("/project/src/store/types.ts")).toContain("  | app.Events\n  | userSession.Events;");
  });

  it("детектит конфликт existing machine export в index.ts", async () => {
    const context = createContext(storeFiles(oldInlineTypes, generatedIndex.replace(
      'import { app } from "./machines/app";',
      'import { app } from "./machines/app";\nimport { userSession } from "./machines/legacy";',
    )));
    const result = await runAddMachineCommand(context, { name: "user-session" });

    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT" })]);
  });

  it("детектит shorthand и explicit machine keys в index.ts", async () => {
    const shorthand = createContext(storeFiles(oldInlineTypes, generatedIndex.replace("  app,\n", "  app,\n  userSession,\n")));
    const explicit = createContext(storeFiles(oldInlineTypes, generatedIndex.replace("  app,\n", "  app,\n  userSession: app,\n")));

    expect(await runAddMachineCommand(shorthand, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/index.ts machines already contains userSession." })],
    });
    expect(await runAddMachineCommand(explicit, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_CONFLICT", message: "src/store/index.ts machines already contains userSession." })],
    });
  });

  it("возвращает patch failed для unsupported index.ts и unsupported AppEvents", async () => {
    const badIndex = createContext(storeFiles(oldInlineTypes, "export const machines = { app };\n"));
    const badTypes = createContext(storeFiles(`import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"LOGIN", { email: string }>;
`));
    const missingAlias = createContext(storeFiles("export type Other = app.Events;\n"));

    expect(await runAddMachineCommand(badIndex, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_PATCH_FAILED" })],
    });
    expect(await runAddMachineCommand(badTypes, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_PATCH_FAILED" })],
    });
    expect(await runAddMachineCommand(missingAlias, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_PATCH_FAILED" })],
    });
  });

  it("не создает machine file, если один из patchers падает", async () => {
    const badTypes = createContext(storeFiles("export type AppEvents = CustomEvents;\n"));
    const beforeIndex = badTypes.fs.getFile("/project/src/store/index.ts");

    const result = await runAddMachineCommand(badTypes, { name: "user-session" });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_ADD_MACHINE_PATCH_FAILED" })],
    });
    expect(badTypes.fs.getFile("/project/src/store/machines/user-session.ts")).toBeUndefined();
    expect(badTypes.fs.getFile("/project/src/store/index.ts")).toBe(beforeIndex);
  });

  it("возвращает write failed во время apply", async () => {
    const createWriteFailure = createContext(storeFiles(), "/project", { writeError: new Error("readonly") });
    const updateWriteFailure = createContext(storeFiles(), "/project", { writeError: "readonly" });
    const plan = {
      machine: {
        rawName: "user-session",
        fileName: "user-session",
        exportName: "userSession",
        eventType: "DO_USER_SESSION_INIT",
        eventNamespace: "userSession",
      },
      files: {
        create: [],
        update: [{ relativePath: "src/store/index.ts", contents: generatedIndex }],
      },
    };

    expect(await runAddMachine(createWriteFailure, { name: "user-session" })).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_WRITE_FAILED", message: expect.stringContaining("readonly") })],
    });
    expect(applyAddMachinePlan(updateWriteFailure, plan)).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_WRITE_FAILED", message: expect.stringContaining("readonly") })],
    });
  });

  it("сохраняет create template aggregator и type-check после create overlay + add-machine", async () => {
    const context = createContext();
    expect(applyLiteFsmStoreOverlay(context, "/project")).toEqual({ ok: true });

    const result = await runAddMachineCommand(context, { name: "user-session" });

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.fs.getFile("/project/src/store/machines/app.ts")).toContain('export type Events = FSMEvent<"DO_INIT">');
    expect(context.fs.getFile("/project/src/store/types.ts")).toContain('import type * as app from "./machines/app";');
    expect(context.fs.getFile("/project/src/store/types.ts")).toContain("  | app.Events\n  | userSession.Events;");
    assertStoreTypeChecks(context);
  });
});
