import type { GraphDiagnostic, LiteFsmGraphProjectFile, LiteFsmGraphProjectHost } from "../types";
import { createSourceCatalog, type SourceCatalog } from "../compiler/catalog";
import { createStableHash } from "../compiler/ids";
import { createSourceAdapter, type SourceAdapter } from "../compiler/source";
import { projectDiagnostic } from "./diagnostics";
import { exportedPath, normalizeProjectPath } from "./path";

export type ProjectFileRole = "entry" | "machine" | "barrel" | "helper";

export type ProjectSourceUnit = {
  fileName: string;
  exportedFileName: string;
  sourceText: string;
  hash: string;
  source: SourceAdapter;
  catalog: SourceCatalog;
  roles: Set<ProjectFileRole>;
  discoveryIndex: number;
};

const ROLE_ORDER: readonly ProjectFileRole[] = ["entry", "machine", "barrel", "helper"];

const sortRoles = (roles: ReadonlySet<ProjectFileRole>): ProjectFileRole[] => {
  return ROLE_ORDER.filter((role) => roles.has(role));
};

const parseDiagnostics = (unit: ProjectSourceUnit, role: ProjectFileRole): GraphDiagnostic[] => {
  const code = role === "entry" ? "LFG_PROJECT_ENTRY_PARSE_ERROR" : "LFG_PROJECT_MODULE_PARSE_ERROR";
  const severity = role === "entry" ? "error" : "warning";

  return unit.source.diagnostics.map((diagnostic) =>
    projectDiagnostic(code, severity, diagnostic.message, diagnostic.loc),
  );
};

export type ProjectSourceCache = {
  readonly diagnostics: GraphDiagnostic[];
  read(fileName: string, role?: ProjectFileRole, loc?: GraphDiagnostic["loc"]): ProjectSourceUnit | undefined;
  addRole(unit: ProjectSourceUnit, role: ProjectFileRole): void;
  listFiles(): LiteFsmGraphProjectFile[];
};

export const createProjectSourceCache = (
  host: LiteFsmGraphProjectHost,
  projectRoot: string,
): ProjectSourceCache => {
  const diagnostics: GraphDiagnostic[] = [];
  const units = new Map<string, ProjectSourceUnit>();

  const read = (
    fileName: string,
    role?: ProjectFileRole,
    loc?: GraphDiagnostic["loc"],
  ): ProjectSourceUnit | undefined => {
    const normalizedFileName = normalizeProjectPath(fileName);
    const existing = units.get(normalizedFileName);
    if (existing) {
      if (role) existing.roles.add(role);
      return existing;
    }

    const sourceText = host.readSource(normalizedFileName);
    if (sourceText === undefined) {
      const code = role === "entry" ? "LFG_PROJECT_ENTRY_NOT_FOUND" : "LFG_PROJECT_MODULE_NOT_FOUND";
      const severity = role === "entry" ? "error" : "warning";
      diagnostics.push(projectDiagnostic(code, severity, `Source file '${normalizedFileName}' could not be read.`, loc));
      return undefined;
    }

    const exportedFileName = exportedPath(normalizedFileName, projectRoot);
    const source = createSourceAdapter(sourceText, {
      filename: normalizedFileName,
      language: "ts",
      locFileName: exportedFileName,
    });
    const unit: ProjectSourceUnit = {
      fileName: normalizedFileName,
      exportedFileName,
      sourceText,
      hash: createStableHash(sourceText),
      source,
      catalog: createSourceCatalog(source, { allowAmbientApi: false }),
      roles: new Set(role ? [role] : []),
      discoveryIndex: units.size,
    };

    units.set(normalizedFileName, unit);
    diagnostics.push(...parseDiagnostics(unit, role ?? "barrel"));

    return unit;
  };

  const addRole = (unit: ProjectSourceUnit, role: ProjectFileRole): void => {
    unit.roles.add(role);
  };

  const listFiles = (): LiteFsmGraphProjectFile[] => {
    return [...units.values()]
      .sort((left, right) => left.discoveryIndex - right.discoveryIndex)
      .map((unit) => ({
        fileName: unit.exportedFileName,
        language: "ts" as const,
        roles: sortRoles(unit.roles),
        hash: unit.hash,
      }));
  };

  return {
    diagnostics,
    read,
    addRole,
    listFiles,
  };
};
