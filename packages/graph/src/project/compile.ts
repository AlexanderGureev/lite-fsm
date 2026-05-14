import type {
  CompileLiteFsmGraphProjectOptions,
  GraphDiagnostic,
  GraphSource,
  LiteFsmGraphProjectFile,
  LiteFsmGraphProjectResult,
} from "../types";
import { assembleGraphDocument } from "../compiler/assembler";
import { compileMachineSlice, createCompilerContext } from "../compiler/compile-machine";
import type { MachineCandidate } from "../compiler/candidates";
import { normalizeDiagnostics } from "../compiler/diagnostics";
import { createPartialEvaluator } from "../compiler/evaluator";
import type { ManagerLinkSlice } from "../compiler/manager";
import type { MachineGraphSlice } from "../compiler/pipeline";
import type { SourceCatalog } from "../compiler/catalog";
import { projectDiagnostic } from "./diagnostics";
import { createHelperProvenance } from "./helper-provenance";
import { createProjectModuleResolver } from "./imports";
import { createProjectMachineResolver } from "./machine-resolution";
import { readProjectManagerMap } from "./manager-map";
import { selectProjectManager } from "./manager-selection";
import { exportedPath, normalizeProjectPath, projectRootFromOptions } from "./path";
import { createProjectSourceCache, type ProjectSourceUnit } from "./source-units";

type CanonicalMachine = {
  candidate: MachineCandidate;
  unit: ProjectSourceUnit;
  catalog: SourceCatalog;
};

const createProjectSource = (
  entryFileName: string,
  projectRoot: string,
  files: readonly LiteFsmGraphProjectFile[],
): GraphSource => {
  const entryExportedPath = exportedPath(entryFileName, projectRoot);

  return {
    filename: entryExportedPath,
    language: "ts",
    kind: "project",
    entryFileName: entryExportedPath,
    files: files.map((file) => ({
      fileName: file.fileName,
      language: file.language,
      hash: file.hash,
    })),
  };
};

const createResult = (
  entryFileName: string,
  projectRoot: string,
  files: readonly LiteFsmGraphProjectFile[],
  machineSlices: readonly MachineGraphSlice[],
  managerLinks: readonly ManagerLinkSlice[],
  diagnostics: readonly GraphDiagnostic[],
): LiteFsmGraphProjectResult => {
  const document = assembleGraphDocument({
    source: createProjectSource(entryFileName, projectRoot, files),
    machineSlices,
    managerLinks,
    diagnostics,
  });

  return {
    document,
    diagnostics: document.diagnostics,
    files,
  };
};

const compilerFailure = (
  entryFileName: string,
  projectRoot: string,
  error: unknown,
): LiteFsmGraphProjectResult => {
  const diagnostics = normalizeDiagnostics([
    {
      code: "LFG_COMPILER_ERROR",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
    },
  ]);

  return createResult(entryFileName, projectRoot, [], [], [], diagnostics);
};

const canonicalMachineKey = (unit: ProjectSourceUnit, candidate: MachineCandidate): string => {
  return `${unit.fileName}\0${candidate.call.getStart()}`;
};

const compileProjectMachineSlices = (machines: readonly CanonicalMachine[]): MachineGraphSlice[] => {
  return machines.map(({ candidate, unit, catalog }) => {
    const evaluator = createPartialEvaluator(unit.source, catalog);
    const context = createCompilerContext(unit.source, catalog, evaluator);

    return compileMachineSlice(candidate, context);
  });
};

const applyProjectPreferredIds = (
  machines: readonly CanonicalMachine[],
  refs: readonly ManagerLinkSlice["refs"][number][],
): void => {
  const keysByCandidate = new Map<MachineCandidate, string[]>();
  const keyCounts = new Map<string, number>();

  for (const ref of refs) {
    keyCounts.set(ref.key, (keyCounts.get(ref.key) ?? 0) + 1);
    keysByCandidate.set(ref.machineCandidate, [...(keysByCandidate.get(ref.machineCandidate) ?? []), ref.key]);
  }

  for (const machine of machines) {
    const keys = keysByCandidate.get(machine.candidate)!;
    if (keys.length === 1 && keyCounts.get(keys[0] as string) === 1) {
      machine.candidate.preferredId = keys[0];
    }
  }
};

const diagnosticsWithResolvedSeverity = (
  diagnostics: readonly GraphDiagnostic[],
  hasResolvedMachines: boolean,
): GraphDiagnostic[] => {
  if (hasResolvedMachines) return [...diagnostics];

  return diagnostics.map((diagnostic) =>
    diagnostic.code === "LFG_PROJECT_MODULE_PARSE_ERROR"
      ? { ...diagnostic, severity: "error" as const }
      : diagnostic,
  );
};

export const compileLiteFsmGraphProject = (
  options: CompileLiteFsmGraphProjectOptions,
): LiteFsmGraphProjectResult => {
  const entryFileName = normalizeProjectPath(options.entryFileName);
  const projectRoot = projectRootFromOptions(entryFileName, options.projectRoot);

  try {
    const sourceCache = createProjectSourceCache(options.host, projectRoot);
    const resolver = createProjectModuleResolver(options.host, sourceCache);
    const entryUnit = sourceCache.read(entryFileName, "entry");

    if (!entryUnit) {
      const files = sourceCache.listFiles();

      return createResult(entryFileName, projectRoot, files, [], [], sourceCache.diagnostics);
    }

    const selectedManager = selectProjectManager(entryUnit);
    if (!selectedManager.ok) {
      const files = sourceCache.listFiles();

      return createResult(entryFileName, projectRoot, files, [], [], [
        ...sourceCache.diagnostics,
        ...selectedManager.diagnostics,
      ]);
    }
    const manager = selectedManager.value;

    const managerMap = readProjectManagerMap(manager, entryUnit, resolver);
    if (!managerMap.ok) {
      const files = sourceCache.listFiles();
      const managerLinks: ManagerLinkSlice[] = [{ manager, refs: [], diagnostics: managerMap.diagnostics }];

      return createResult(entryFileName, projectRoot, files, [], managerLinks, [
        ...sourceCache.diagnostics,
        ...resolver.diagnostics,
      ]);
    }

    const helpers = createHelperProvenance(resolver);
    const machineResolver = createProjectMachineResolver(resolver, helpers);
    const canonicalByCall = new Map<string, CanonicalMachine>();
    const canonicalMachines: CanonicalMachine[] = [];
    const managerRefs: ManagerLinkSlice["refs"] = [];
    const diagnostics: GraphDiagnostic[] = [...managerMap.value.diagnostics];

    for (const entry of managerMap.value.entries) {
      const resolved = machineResolver.resolve(entry, entryUnit);
      if (!resolved.ok) {
        diagnostics.push(...resolved.diagnostics);
        continue;
      }

      const { candidate: resolvedCandidate, unit, catalog } = resolved.value;
      const key = canonicalMachineKey(unit, resolvedCandidate);
      let canonical = canonicalByCall.get(key);
      if (!canonical) {
        const candidate = {
          ...resolvedCandidate,
          index: canonicalMachines.length,
          managerKeys: [],
        };
        canonical = {
          candidate,
          unit,
          catalog,
        };
        canonicalByCall.set(key, canonical);
        canonicalMachines.push(canonical);
      }

      managerRefs.push({
        key: entry.key,
        machineCandidate: canonical.candidate,
        loc: entry.loc,
      });
      diagnostics.push(...resolved.diagnostics);
    }

    if (managerRefs.length === 0) {
      diagnostics.push(
        projectDiagnostic(
          "LFG_PROJECT_NO_MACHINE_ENTRIES",
          "error",
          "Selected MachineManager map did not resolve any local machine entries.",
          manager.loc,
        ),
      );
    }

    const machineSlices = compileProjectMachineSlices(canonicalMachines);
    applyProjectPreferredIds(canonicalMachines, managerRefs);
    const managerLinks: ManagerLinkSlice[] = [
      {
        manager,
        refs: managerRefs,
        diagnostics: [],
      },
    ];
    const files = sourceCache.listFiles();

    return createResult(entryFileName, projectRoot, files, machineSlices, managerLinks, [
      ...diagnosticsWithResolvedSeverity(sourceCache.diagnostics, managerRefs.length > 0),
      ...resolver.diagnostics,
      ...diagnostics,
    ]);
  } catch (error) {
    return compilerFailure(entryFileName, projectRoot, error);
  }
};
