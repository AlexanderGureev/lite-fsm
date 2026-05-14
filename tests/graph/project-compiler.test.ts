import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compileLiteFsmGraphProject,
  type LiteFsmGraphProjectHost,
  type LiteFsmGraphProjectModuleResolution,
} from "@lite-fsm/graph";
import { diagnosticFromModuleResolution } from "../../packages/graph/src/project/diagnostics";
import { dirname as projectDirname, exportedPath, normalizeProjectPath, projectRootFromOptions } from "../../packages/graph/src/project/path";

type HostFileMap = Record<string, string>;

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const normalize = (fileName: string): string => fileName.replace(/\\/g, "/");

const hasUnsupportedExtension = (moduleSpecifier: string): string | undefined => {
  const segments = moduleSpecifier.split("/");
  const lastSegment = segments[segments.length - 1] ?? moduleSpecifier;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1) return undefined;

  const extension = lastSegment.slice(dotIndex);
  return extension === ".ts" ? undefined : extension;
};

const resolveTsCandidate = (baseFileName: string, exists: (fileName: string) => boolean): string | undefined => {
  const candidates = [baseFileName, `${baseFileName}.ts`, join(baseFileName, "index.ts")].map(normalize);

  return candidates.find(exists);
};

const createMemoryHost = (
  files: HostFileMap,
  aliases: Record<string, string> = {},
): LiteFsmGraphProjectHost => {
  const normalizedFiles = new Map(Object.entries(files).map(([fileName, source]) => [normalize(fileName), source]));
  const exists = (fileName: string) => normalizedFiles.has(normalize(fileName));

  return {
    readSource(fileName) {
      return normalizedFiles.get(normalize(fileName));
    },
    resolveModule({ fromFileName, moduleSpecifier }) {
      if (moduleSpecifier === "@lite-fsm/core" || moduleSpecifier === "lite-fsm") {
        return { kind: "core", moduleSpecifier };
      }
      if (moduleSpecifier.startsWith("lite-fsm/")) return { kind: "external", moduleSpecifier };

      const unsupported = hasUnsupportedExtension(moduleSpecifier);
      if (unsupported) return { kind: "unsupported-extension", moduleSpecifier, extension: unsupported };

      if (moduleSpecifier.startsWith(".")) {
        const resolvedFileName = resolveTsCandidate(resolve(dirname(fromFileName), moduleSpecifier), exists);

        return resolvedFileName
          ? { kind: "resolved", fileName: normalize(resolvedFileName) }
          : { kind: "not-found", moduleSpecifier };
      }

      for (const [prefix, targetRoot] of Object.entries(aliases)) {
        if (!moduleSpecifier.startsWith(prefix)) continue;

        const resolvedFileName = resolveTsCandidate(resolve(targetRoot, moduleSpecifier.slice(prefix.length)), exists);
        return resolvedFileName
          ? { kind: "resolved", fileName: normalize(resolvedFileName) }
          : { kind: "not-found", moduleSpecifier };
      }

      return { kind: "external", moduleSpecifier };
    },
  };
};

const createFileSystemHost = (
  aliases: Record<string, string> = {},
): LiteFsmGraphProjectHost => {
  const exists = (fileName: string) => existsSync(normalize(fileName)) && statSync(normalize(fileName)).isFile();

  return {
    readSource(fileName) {
      const normalized = normalize(fileName);
      return exists(normalized) ? readFileSync(normalized, "utf8") : undefined;
    },
    resolveModule({ fromFileName, moduleSpecifier }): LiteFsmGraphProjectModuleResolution {
      if (moduleSpecifier === "@lite-fsm/core" || moduleSpecifier === "lite-fsm") {
        return { kind: "core", moduleSpecifier };
      }
      if (moduleSpecifier.startsWith("lite-fsm/")) return { kind: "external", moduleSpecifier };

      const unsupported = hasUnsupportedExtension(moduleSpecifier);
      if (unsupported) return { kind: "unsupported-extension", moduleSpecifier, extension: unsupported };

      if (moduleSpecifier.startsWith(".")) {
        const resolvedFileName = resolveTsCandidate(resolve(dirname(fromFileName), moduleSpecifier), exists);

        return resolvedFileName
          ? { kind: "resolved", fileName: normalize(resolvedFileName) }
          : { kind: "not-found", moduleSpecifier };
      }

      for (const [prefix, targetRoot] of Object.entries(aliases)) {
        if (!moduleSpecifier.startsWith(prefix)) continue;

        const resolvedFileName = resolveTsCandidate(resolve(targetRoot, moduleSpecifier.slice(prefix.length)), exists);
        return resolvedFileName
          ? { kind: "resolved", fileName: normalize(resolvedFileName) }
          : { kind: "not-found", moduleSpecifier };
      }

      return { kind: "external", moduleSpecifier };
    },
  };
};

const machineKeys = (result: ReturnType<typeof compileLiteFsmGraphProject>): string[] => {
  return result.document.managers[0]?.machineRefs.map((ref) => ref.key) ?? [];
};

const diagnosticCodes = (result: ReturnType<typeof compileLiteFsmGraphProject>): string[] => {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
};

describe("compileLiteFsmGraphProject", () => {
  it("нормализует project paths и module resolution diagnostics", () => {
    expect(normalizeProjectPath("C:\\repo\\\\store\\index.ts")).toBe("C:/repo/store/index.ts");
    expect(projectDirname("/")).toBe("/");
    expect(projectDirname("/repo/store/index.ts")).toBe("/repo/store");
    expect(projectDirname("store.ts")).toBe(".");
    expect(projectRootFromOptions("/repo/store/index.ts", undefined)).toBe("/repo/store");
    expect(projectRootFromOptions("/repo/store/index.ts", "/repo")).toBe("/repo");
    expect(exportedPath("/repo", "/repo")).toBe(".");
    expect(exportedPath("/repo/store.ts", "/repo/")).toBe("store.ts");
    expect(exportedPath("/external/store.ts", "/repo")).toBe("/external/store.ts");
    expect(
      diagnosticFromModuleResolution({ kind: "unsupported-extension", moduleSpecifier: "./x.json", extension: ".json" }, undefined),
    ).toMatchObject({ code: "LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION" });
    expect(diagnosticFromModuleResolution({ kind: "not-found", moduleSpecifier: "./missing" }, undefined)).toMatchObject({
      code: "LFG_PROJECT_MODULE_NOT_FOUND",
    });
  });

  it("собирает same-file manager и machine без чтения filesystem", () => {
    const entry = normalize(resolve("/project/store.ts"));
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";

        export const light = createMachine({
          config: { idle: { SWITCH: "on" }, on: { SWITCH: "idle" } },
          initialState: "idle",
          initialContext: {},
        });

        export const manager = MachineManager({ light });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: "/project", host });

    expect(machineKeys(result)).toEqual(["light"]);
    expect(result.document.source).toMatchObject({
      kind: "project",
      entryFileName: "store.ts",
    });
    expect(result.document.machines[0]?.states.map((state) => state.key)).toEqual(["idle", "on"]);
    expect(result.document.machines[0]?.loc?.fileName).toBe("store.ts");
    expect(result.files).toEqual([
      expect.objectContaining({
        fileName: "store.ts",
        roles: ["entry", "machine"],
      }),
    ]);
  });

  it("раскрывает direct imports, named barrels, aliases и namespace rest", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store/index.ts`;
    const host = createMemoryHost(
      {
        [entry]: `
          import { MachineManager } from "lite-fsm";
          import { machines as externalMachines } from "@player/store";
          import * as machines from "./machines";
          const { root, ...rest } = machines;
          const cfg = { root, ...rest, ...externalMachines };
          export const manager = MachineManager(cfg);
        `,
        [`${root}/store/machines/index.ts`]: `
          export { root } from "./root";
          export { flow as renamedFlow } from "./flow";
        `,
        [`${root}/store/machines/root.ts`]: `
          import { createMachine } from "@/store/create-machine";
          export const root = createMachine({
            config: { IDLE: { START: "READY" }, READY: {} },
            initialState: "IDLE",
            initialContext: {},
          });
        `,
        [`${root}/store/machines/flow.ts`]: `
          import { createConfig, createMachine } from "@/store/create-machine";
          const config = createConfig({ READY: { STOP: "DONE" }, DONE: {} });
          export const flow = createMachine({ config, initialState: "READY", initialContext: {} });
        `,
        [`${root}/store/create-machine.ts`]: `
          import type { TypedCreateConfigFn, TypedCreateMachineFn } from "lite-fsm";
          import { createConfig as baseCreateConfig, createMachine as baseCreateMachine } from "lite-fsm";
          export const createMachine: TypedCreateMachineFn<never, never> = baseCreateMachine;
          export const createConfig: TypedCreateConfigFn<never> = baseCreateConfig;
        `,
      },
      { "@/": root },
    );

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["root", "renamedFlow"]);
    expect(result.document.machines.map((machine) => machine.id)).toEqual(["root", "renamedFlow"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED",
    ]);
    expect(result.files.map((file) => [file.fileName, file.roles])).toEqual([
      ["store/index.ts", ["entry"]],
      ["store/machines/index.ts", ["barrel"]],
      ["store/machines/root.ts", ["machine"]],
      ["store/create-machine.ts", ["helper"]],
      ["store/machines/flow.ts", ["machine"]],
    ]);
  });

  it("не резолвит type-only и недостижимые imports при export const manager map", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const files: HostFileMap = {
      [entry]: `
        import type { StoreDeps } from "./types";
        import { MachineManager } from "@lite-fsm/core";
        import { ignored } from "./ignored";
        import { middleware } from "lite-fsm/middleware";
        import { machine } from "./machines";
        export const cfg = { primary: machine, "secondary-key": machine };
        export const manager = MachineManager(cfg, { deps: {} as StoreDeps });
        void ignored;
        void middleware;
      `,
      [`${root}/machines/index.ts`]: `export { machine } from "./machine";`,
      [`${root}/machines/machine.ts`]: `
        import type { MachineContext } from "../types";
        import { createMachine } from "@lite-fsm/core";
        import { SERVICE } from "../runtime-service";
        export const machine = createMachine({
          config: { IDLE: { START: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {} as MachineContext,
        });
        void SERVICE;
      `,
      [`${root}/ignored.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        export const ignored = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/runtime-service.ts`]: `export const SERVICE = {};`,
      [`${root}/types.ts`]: `export type StoreDeps = {}; export type MachineContext = {};`,
    };
    const baseHost = createMemoryHost(files);
    const readFiles: string[] = [];
    const resolvedSpecifiers: string[] = [];
    const host: LiteFsmGraphProjectHost = {
      readSource(fileName) {
        readFiles.push(normalize(fileName));
        return baseHost.readSource(fileName);
      },
      resolveModule(input) {
        resolvedSpecifiers.push(input.moduleSpecifier);
        return baseHost.resolveModule(input);
      },
    };

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["primary", "secondary-key"]);
    expect(result.document.machines).toEqual([
      expect.objectContaining({ id: "machine", managerKeys: ["primary", "secondary-key"] }),
    ]);
    expect(readFiles).toEqual([entry, `${root}/machines/index.ts`, `${root}/machines/machine.ts`]);
    expect(resolvedSpecifiers).toEqual(["./machines", "./machine", "@lite-fsm/core"]);
  });

  it("возвращает blocking diagnostic при нескольких managers", () => {
    const entry = normalize(resolve("/project/store.ts"));
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        export const first = MachineManager({});
        export const second = MachineManager({});
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: "/project", host });

    expect(result.document.managers).toHaveLength(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_PROJECT_MANAGER_AMBIGUOUS",
        severity: "error",
      }),
    ]);
  });

  it("поддерживает arrow factory и block factory, но отклоняет nested manager", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        const machine = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        export const makeStore = () => {
          const manager = MachineManager({ machine });
          manager.setDependencies({});
          return manager;
        };
        export const ignored = () => () => MachineManager({ machine });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["machine"]);
    expect(diagnosticCodes(result)).not.toContain("LFG_PROJECT_MANAGER_AMBIGUOUS");

    const nestedHost = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        export const makeStore = () => () => MachineManager({});
      `,
    });
    const nested = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host: nestedHost });

    expect(nested.document.managers).toHaveLength(0);
    expect(diagnosticCodes(nested)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const expressionStatement = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          MachineManager({});
        `,
      }),
    });

    expect(expressionStatement.document.managers).toHaveLength(1);

    const unsupportedBlockFactory = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const makeStore = () => {
            MachineManager({});
            return null;
          };
        `,
      }),
    });

    expect(diagnosticCodes(unsupportedBlockFactory)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const factoryInsideFunction = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          function setup() {
            const makeStore = () => MachineManager({});
            return makeStore;
          }
        `,
      }),
    });

    expect(diagnosticCodes(factoryInsideFunction)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const nestedFunctionInsideFactory = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const makeStore = () => {
            function inner() {
              return MachineManager({});
            }
            return inner;
          };
        `,
      }),
    });

    expect(diagnosticCodes(nestedFunctionInsideFactory)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const expressionBodyObject = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const makeStore = () => ({ manager: MachineManager({}) });
        `,
      }),
    });

    expect(diagnosticCodes(expressionBodyObject)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const exportDefaultManager = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export default MachineManager({});
        `,
      }),
    });

    expect(diagnosticCodes(exportDefaultManager)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const wrappedTopLevelInitializer = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const manager = wrap(MachineManager({}));
        `,
      }),
    });

    expect(diagnosticCodes(wrappedTopLevelInitializer)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const objectTopLevelInitializer = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const setup = { manager: MachineManager({}) };
        `,
      }),
    });

    expect(diagnosticCodes(objectTopLevelInitializer)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);

    const destructuredManager = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const { manager } = MachineManager({});
        `,
      }),
    });

    expect(diagnosticCodes(destructuredManager)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);
  });

  it("возвращает project diagnostics для entry, manager map и compiler failures", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const missing = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({}),
    });

    expect(missing.diagnostics).toEqual([
      expect.objectContaining({ code: "LFG_PROJECT_ENTRY_NOT_FOUND", severity: "error" }),
    ]);

    const dynamicMap = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          const getMachines = () => ({});
          export const manager = MachineManager(getMachines());
        `,
      }),
    });

    expect(dynamicMap.document.managers[0]?.machineRefs).toEqual([]);
    expect(diagnosticCodes(dynamicMap)).toEqual(["LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"]);

    const unknownIdentifierMap = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const manager = MachineManager(machines);
        `,
      }),
    });

    expect(diagnosticCodes(unknownIdentifierMap)).toEqual(["LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"]);

    const nonObjectIdentifierMap = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          const machines = build();
          export const manager = MachineManager(machines);
        `,
      }),
    });

    expect(diagnosticCodes(nonObjectIdentifierMap)).toEqual(["LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"]);

    const missingMap = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const manager = MachineManager();
        `,
      }),
    });

    expect(diagnosticCodes(missingMap)).toEqual(["LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"]);

    const thrown = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: {
        readSource() {
          throw new Error("broken host");
        },
        resolveModule() {
          return { kind: "external", moduleSpecifier: "never" };
        },
      },
    });

    expect(thrown.diagnostics).toEqual([
      expect.objectContaining({ code: "LFG_COMPILER_ERROR", message: "broken host" }),
    ]);

    const thrownString = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: {
        readSource() {
          throw "broken string";
        },
        resolveModule() {
          return { kind: "external", moduleSpecifier: "never" };
        },
      },
    });

    expect(thrownString.diagnostics).toEqual([
      expect.objectContaining({ code: "LFG_COMPILER_ERROR", message: "broken string" }),
    ]);

    const entryParseWithoutMachines = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          export const manager = MachineManager({});
          const broken =
        `,
      }),
    });

    expect(entryParseWithoutMachines.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LFG_PROJECT_ENTRY_PARSE_ERROR", severity: "error" }),
        expect.objectContaining({ code: "LFG_PROJECT_NO_MACHINE_ENTRIES", severity: "error" }),
      ]),
    );

    const wrongManagerImport = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "other-fsm";
          export const manager = MachineManager({});
        `,
      }),
    });

    expect(diagnosticCodes(wrongManagerImport)).toEqual(["LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED"]);

    const wrongAliasedManagerImport = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager as MM } from "other-fsm";
          export const manager = MM({});
        `,
      }),
    });

    expect(diagnosticCodes(wrongAliasedManagerImport)).toEqual(["LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED"]);

    const ambientManager = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          export const manager = MachineManager({});
        `,
      }),
    });

    expect(diagnosticCodes(ambientManager)).toEqual(["LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED"]);

    const namespaceManagerAccess = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import * as core from "@lite-fsm/core";
          export const manager = core.MachineManager({});
        `,
      }),
    });

    expect(diagnosticCodes(namespaceManagerAccess)).toEqual(["LFG_PROJECT_MANAGER_NOT_FOUND"]);
  });

  it("диагностирует unsupported manager entries, spreads и namespace rest", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        const ok = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        const source = { ok };
        const { ...rest } = source;
        const cycle = { ...cycle };
        export const manager = MachineManager({
          ...source,
          ...rest,
          ...cycle,
          ...build(),
          duplicate: ok,
          duplicate: ok,
          ["computed"]: ok,
          inline: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
          unsupported: 123,
          method() {
            return ok;
          },
        });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["ok", "duplicate"]);
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining([
      "LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED",
      "LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED",
      "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED",
    ]));
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED")).toHaveLength(5);
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code === "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED")
        .every((diagnostic) => diagnostic.severity === "error"),
    ).toBe(true);
  });

  it("раскрывает namespace member access и alias destructuring из barrel", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import * as machines from "./machines";
        const { root: appRoot, ...rest } = machines;
        const prop = "root";
        const { nested: { ignored } } = machines;
        const { [prop]: computed } = machines;
        const plain = { appRoot };
        const { appRoot: plainRoot } = plain;
        export const manager = MachineManager({ appRoot, direct: machines.root, ...rest });
      `,
      [`${root}/machines/index.ts`]: `
        export { root } from "./root";
        export { secondary } from "./secondary";
      `,
      [`${root}/machines/root.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        export const root = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/machines/secondary.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        export const secondary = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["appRoot", "direct", "secondary"]);
    expect(result.document.machines.map((machine) => machine.id)).toEqual(["root", "secondary"]);
    expect(result.document.machines[0]?.managerKeys).toEqual(["appRoot", "direct"]);
  });

  it("диагностирует namespace imports, если target не является project barrel", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import * as missing from "./missing";
        const { root } = missing;
        const localNamespace = {};
        export const manager = MachineManager({ member: missing.root, root, local: localNamespace.root });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
        "LFG_PROJECT_NO_MACHINE_ENTRIES",
      ]),
    );
  });

  it("диагностирует module resolution, barrels и unsupported createMachine provenance", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        import { missing } from "./missing";
        import { unsupported } from "./unsupported.json";
        import { fromStar } from "./star";
        import { missingReExport } from "./barrel";
        import { cycled } from "./cycle-a";
        import { externalCreateMachine } from "./external-create-machine";
        const local = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        export const manager = MachineManager({
          local,
          missing,
          unsupported,
          fromStar,
          missingReExport,
          cycled,
          externalCreateMachine,
        });
      `,
      [`${root}/star.ts`]: `export * from "./local";`,
      [`${root}/barrel.ts`]: `export { missingReExport } from "./really-missing";`,
      [`${root}/cycle-a.ts`]: `export { cycled } from "./cycle-b";`,
      [`${root}/cycle-b.ts`]: `export { cycled } from "./cycle-a";`,
      [`${root}/external-create-machine.ts`]: `
        import { createMachine } from "external-fsm";
        export const externalCreateMachine = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["local"]);
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "LFG_PROJECT_MODULE_NOT_FOUND",
        "LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION",
        "LFG_PROJECT_BARREL_UNSUPPORTED",
        "LFG_PROJECT_MODULE_CYCLE",
        "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED",
        "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED",
      ]),
    );

    const externalMachineImport = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: root,
      host: createMemoryHost({
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          import { externalMachine } from "external-machines";
          export const manager = MachineManager({ externalMachine });
        `,
      }),
    });

    expect(diagnosticCodes(externalMachineImport)).toEqual(
      expect.arrayContaining(["LFG_PROJECT_MACHINE_UNRESOLVED", "LFG_PROJECT_NO_MACHINE_ENTRIES"]),
    );
  });

  it("не принимает ambient createMachine в project machine files", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { ambient } from "./ambient";
        export const manager = MachineManager({ ambient });
      `,
      [`${root}/ambient.ts`]: `
        export const ambient = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(result.document.machines).toHaveLength(0);
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED",
        "LFG_PROJECT_NO_MACHINE_ENTRIES",
      ]),
    );
  });

  it("поддерживает local export aliases и диагностирует missing/function exports", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { alias, fn, weird, noSuch } from "./local-exports";
        export const manager = MachineManager({ alias, fn, weird, noSuch });
      `,
      [`${root}/local-exports.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        const machine = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        const source = { weird: 1 };
        export const { weird } = source;
        export { machine as alias };
        export function fn() {
          return null;
        }
        export default function() {}
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["alias"]);
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining(["LFG_PROJECT_MACHINE_UNRESOLVED", "LFG_PROJECT_EXPORT_NOT_FOUND"]),
    );
  });

  it("диагностирует helper provenance edge cases без потери module diagnostics", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const missingHelper = `${root}/missing-helper.ts`;
    const files: HostFileMap = {
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { missingTarget } from "./missing-target";
        import { missingExport } from "./missing-export";
        import { functionHelper } from "./function-helper";
        import { localAliasHelper } from "./local-alias-helper";
        import { missingNestedHelper } from "./missing-nested-helper";
        import { typedLocalAliasHelper } from "./typed-local-alias-helper";
        import { badValue } from "./bad-value";
        export const manager = MachineManager({
          missingTarget,
          missingExport,
          functionHelper,
          localAliasHelper,
          missingNestedHelper,
          typedLocalAliasHelper,
          badValue,
        });
      `,
      [`${root}/missing-target.ts`]: `
        import { createMachine } from "./missing-helper";
        export const missingTarget = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/missing-export.ts`]: `
        import { createMachine } from "./empty-helper";
        export const missingExport = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/empty-helper.ts`]: `export const other = 1;`,
      [`${root}/function-helper.ts`]: `
        import { createMachine } from "./function-helper-lib";
        export const functionHelper = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/function-helper-lib.ts`]: `export function createMachine() { return null; }`,
      [`${root}/local-alias-helper.ts`]: `
        import { createMachine } from "./local-alias-helper-lib";
        export const localAliasHelper = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/local-alias-helper-lib.ts`]: `
        const other = null;
        export const createMachine = other;
      `,
      [`${root}/missing-nested-helper.ts`]: `
        import { createMachine } from "./missing-nested-helper-lib";
        export const missingNestedHelper = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/missing-nested-helper-lib.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        import { createMachine as baseCreateMachine } from "./missing-base";
        export const createMachine: TypedCreateMachineFn<never, never> = baseCreateMachine;
      `,
      [`${root}/typed-local-alias-helper.ts`]: `
        import { createMachine } from "./typed-local-alias-helper-lib";
        export const typedLocalAliasHelper = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/typed-local-alias-helper-lib.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        const other = null;
        export const createMachine: TypedCreateMachineFn<never, never> = other;
      `,
      [`${root}/bad-value.ts`]: `
        import { createMachine } from "./local-alias-helper-lib";
        export const badValue = 123;
      `,
    };
    const host = createMemoryHost(files);
    const hostWithResolvedMissing: LiteFsmGraphProjectHost = {
      readSource: host.readSource,
      resolveModule(request) {
        if (request.moduleSpecifier === "./missing-helper") {
          return { kind: "resolved", fileName: missingHelper };
        }

        return host.resolveModule(request);
      },
    };

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host: hostWithResolvedMissing });

    expect(result.document.machines).toHaveLength(0);
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "LFG_PROJECT_MODULE_NOT_FOUND",
        "LFG_PROJECT_EXPORT_NOT_FOUND",
        "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED",
        "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED",
        "LFG_PROJECT_NO_MACHINE_ENTRIES",
      ]),
    );
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED")).toHaveLength(5);
  });

  it("диагностирует spread edge cases в manager map", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        import * as missingNamespace from "./missing-namespace";
        import * as star from "./star";
        import { localSpread } from "./spread-source";
        import { createReducer as coreSpread } from "@lite-fsm/core";
        import { externalSpread } from "external-machines";
        const ok = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        const source = { ok };
        const duplicateSource = { ok };
        const machines = build();
        const { ...missingRest } = missingNamespace;
        const { ...starRest } = star;
        export const manager = MachineManager({
          ...missingRest,
          ...starRest,
          ...unknownSpread,
          ...localSpread,
          ...coreSpread,
          ...externalSpread,
          ...machines,
          ...source,
          ...duplicateSource,
          ok,
          ok,
        });
      `,
      [`${root}/star.ts`]: `export * from "./machines";`,
      [`${root}/machines.ts`]: `export const ignored = 1;`,
      [`${root}/spread-source.ts`]: `export const localSpread = {};`,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["ok"]);
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
        "LFG_PROJECT_BARREL_UNSUPPORTED",
        "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED",
        "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED",
      ]),
    );
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED").length).toBeGreaterThanOrEqual(5);
  });

  it("доказывает typed helper wrappers через re-export chain и кэширует provenance", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { first } from "./first";
        import { second } from "./second";
        export const manager = MachineManager({ first, second });
      `,
      [`${root}/first.ts`]: `
        import { createMachine } from "./helpers";
        export const first = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/second.ts`]: `
        import { createMachine } from "./helpers";
        export const second = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/helpers.ts`]: `export { createMachine } from "./base-helper";`,
      [`${root}/base-helper.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        import { createMachine as baseCreateMachine } from "@lite-fsm/core";
        export const createMachine: TypedCreateMachineFn<never, never> = baseCreateMachine;
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["first", "second"]);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED")).toEqual([]);
  });

  it("диагностирует invalid и cyclic typed helper wrappers", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { invalid } from "./invalid";
        import { cycled } from "./cycled";
        export const manager = MachineManager({ invalid, cycled });
      `,
      [`${root}/invalid.ts`]: `
        import { createMachine } from "./invalid-helper";
        export const invalid = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/invalid-helper.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        export const createMachine: TypedCreateMachineFn<never, never> = (() => null);
      `,
      [`${root}/cycled.ts`]: `
        import { createMachine } from "./helper-a";
        export const cycled = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/helper-a.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        import { createMachine as helperB } from "./helper-b";
        export const createMachine: TypedCreateMachineFn<never, never> = helperB;
      `,
      [`${root}/helper-b.ts`]: `
        import type { TypedCreateMachineFn } from "@lite-fsm/core";
        import { createMachine as helperA } from "./helper-a";
        export const createMachine: TypedCreateMachineFn<never, never> = helperA;
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(result.document.machines).toHaveLength(0);
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED")).toHaveLength(2);
    expect(diagnosticCodes(result)).toContain("LFG_PROJECT_NO_MACHINE_ENTRIES");
  });

  it("отклоняет helper wrappers без простого TypedCreate annotation", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { typeQuery } from "./type-query";
        import { untyped } from "./untyped";
        import { wrongType } from "./wrong-type";
        export const manager = MachineManager({ typeQuery, untyped, wrongType });
      `,
      [`${root}/type-query.ts`]: `
        import { createMachine } from "./type-query-helper";
        export const typeQuery = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/type-query-helper.ts`]: `
        import { createMachine as baseCreateMachine } from "@lite-fsm/core";
        export const createMachine: typeof baseCreateMachine = baseCreateMachine;
      `,
      [`${root}/untyped.ts`]: `
        import { createMachine } from "./untyped-helper";
        export const untyped = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/untyped-helper.ts`]: `
        import { createMachine as baseCreateMachine } from "@lite-fsm/core";
        export const createMachine = baseCreateMachine;
      `,
      [`${root}/wrong-type.ts`]: `
        import { createMachine } from "./wrong-type-helper";
        export const wrongType = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
      `,
      [`${root}/wrong-type-helper.ts`]: `
        import type { TypedCreateConfigFn } from "@lite-fsm/core";
        import { createMachine as baseCreateMachine } from "@lite-fsm/core";
        export const createMachine: TypedCreateConfigFn<never> = baseCreateMachine;
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(result.document.machines).toHaveLength(0);
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED")).toHaveLength(3);
    expect(diagnosticCodes(result).filter((code) => code === "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED")).toHaveLength(3);
    expect(diagnosticCodes(result)).toContain("LFG_PROJECT_NO_MACHINE_ENTRIES");
  });

  it("не использует manager key как machine id, если declaration имеет несколько manager keys", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        export const shared = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        export const manager = MachineManager({ first: shared, second: shared });
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(machineKeys(result)).toEqual(["first", "second"]);
    expect(result.document.machines).toEqual([
      expect.objectContaining({ id: "shared", managerKeys: ["first", "second"] }),
    ]);
  });

  it("поднимает module parse diagnostic до error, если не осталось resolved machines", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { broken } from "./broken";
        export const manager = MachineManager({ broken });
      `,
      [`${root}/broken.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        export const broken =
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LFG_PROJECT_MODULE_PARSE_ERROR", severity: "error" }),
        expect.objectContaining({ code: "LFG_PROJECT_MACHINE_UNRESOLVED", severity: "warning" }),
        expect.objectContaining({ code: "LFG_PROJECT_NO_MACHINE_ENTRIES", severity: "error" }),
      ]),
    );
  });

  it("использует директорию entry как projectRoot fallback и absolute exported path вне root", () => {
    const entry = normalize(resolve("/project/store/index.ts"));
    const external = normalize(resolve("/external/machine.ts"));
    const host = createMemoryHost(
      {
        [entry]: `
          import { MachineManager } from "@lite-fsm/core";
          import { external } from "/external/machine";
          export const manager = MachineManager({ external });
        `,
        [external]: `
          import { createMachine } from "@lite-fsm/core";
          export const external = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        `,
      },
      { "/external/": "/external" },
    );

    const result = compileLiteFsmGraphProject({ entryFileName: entry, host });

    expect(result.document.source.entryFileName).toBe("index.ts");
    expect(result.files.map((file) => file.fileName)).toEqual(["index.ts", external]);
  });

  it("сохраняет fileName в diagnostics и не склеивает одинаковые offsets из разных files", () => {
    const root = normalize(resolve("/project"));
    const entry = `${root}/store.ts`;
    const host = createMemoryHost({
      [entry]: `
        import { MachineManager } from "@lite-fsm/core";
        import { a } from "./a";
        import { b } from "./b";
        export const manager = MachineManager({ a, b });
      `,
      [`${root}/a.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        const options = { config: {}, initialState: "IDLE", initialContext: {} };
        export const a = createMachine(options);
      `,
      [`${root}/b.ts`]: `
        import { createMachine } from "@lite-fsm/core";
        const options = { config: {}, initialState: "IDLE", initialContext: {} };
        export const b = createMachine(options);
      `,
    });

    const result = compileLiteFsmGraphProject({ entryFileName: entry, projectRoot: root, host });
    const unsupported = result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT",
    );

    expect(unsupported.map((diagnostic) => diagnostic.loc?.fileName)).toEqual(["a.ts", "b.ts"]);
    expect(new Set(unsupported.map((diagnostic) => diagnostic.loc?.fileName)).size).toBe(2);
    expect(result.diagnostics.map((diagnostic) => `${diagnostic.loc?.fileName ?? ""}:${diagnostic.code}`)).toEqual([
      "a.ts:LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT",
      "b.ts:LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT",
      "store.ts:LFG_PROJECT_NO_MACHINE_ENTRIES",
    ]);
    expect(result.document.source.files).toEqual(
      result.files.map((file) => ({
        fileName: file.fileName,
        language: file.language,
        hash: file.hash,
      })),
    );
    expect(result.document.machines).toHaveLength(0);
  });

  it("собирает canonical real-store-shape fixture", () => {
    const fixtureRoot = normalize(resolve(workspaceRoot, "packages/graph/test-fixtures/real-store-shape"));
    const entry = `${fixtureRoot}/store/index.ts`;
    const result = compileLiteFsmGraphProject({
      entryFileName: entry,
      projectRoot: fixtureRoot,
      host: createFileSystemHost({ "@/": fixtureRoot }),
    });

    expect(machineKeys(result)).toEqual(["root", "router", "theme", "appAnalytics", "eventNavigation"]);
    expect(result.document.machines.map((machine) => machine.id)).toEqual([
      "root",
      "router",
      "theme",
      "appAnalytics",
      "eventNavigation",
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.document.machines.flatMap((machine) => machine.transitions.map((transition) => transition.event.type))).toContain(
      "DO_INIT",
    );
    expect(result.document.machines.flatMap((machine) => machine.emissions.map((emission) => emission.event.type))).toContain(
      "NAVIGATION_EVENT_SEND",
    );
  });
});

describe("compileLiteFsmGraphProject playground smoke", () => {
  const cases: Array<{ entry: string; keys: string[] }> = [
    {
      entry: "apps/playground/app/examples/actor-canvas/store/index.ts",
      keys: ["canvasBoard", "canvasNetwork", "canvasStroke"],
    },
    {
      entry: "apps/playground/app/examples/album-download/store/index.ts",
      keys: ["albumDownload", "trackDownload"],
    },
    { entry: "apps/playground/app/examples/lamp/store/index.ts", keys: ["lamp"] },
    { entry: "apps/playground/app/examples/likes-v2/store/index.ts", keys: ["likesV2", "likeSync"] },
    { entry: "apps/playground/app/examples/likes/store/index.ts", keys: ["likes", "likesPending"] },
    {
      entry: "apps/playground/app/examples/persist/store/index.ts",
      keys: ["chatThread", "chatComposer", "chatSession"],
    },
    {
      entry: "apps/playground/app/examples/roguelite/store/index.ts",
      keys: [
        "gameSession",
        "playerInput",
        "bootSystem",
        "enemySpawner",
        "movementSystem",
        "projectileMotionSystem",
        "playerAutoFire",
        "combatSystem",
        "playerBody",
        "enemyBody",
        "enemyHealth",
        "enemyHitFeedback",
        "projectileBody",
      ],
    },
    { entry: "apps/playground/app/examples/ssr-demo-2/store/index.ts", keys: ["grid", "entityList"] },
    { entry: "apps/playground/app/examples/ssr-demo-3/store/index.ts", keys: ["grid", "entityList"] },
    {
      entry: "apps/playground/app/examples/ssr-demo/store/index.ts",
      keys: ["profileSession", "widgetFeed"],
    },
    {
      entry: "apps/playground/app/examples/test-example/store/index.ts",
      keys: ["onboarding", "profile"],
    },
  ];

  it.each(cases)("собирает $entry", ({ entry, keys }) => {
    const playgroundRoot = normalize(resolve(workspaceRoot, "apps/playground"));
    const entryFileName = normalize(resolve(workspaceRoot, entry));
    const result = compileLiteFsmGraphProject({
      entryFileName,
      projectRoot: playgroundRoot,
      host: createFileSystemHost({ "@/": playgroundRoot }),
    });

    expect(machineKeys(result)).toEqual(keys);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});
