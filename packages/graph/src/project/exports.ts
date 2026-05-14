import { Node, type VariableDeclaration } from "ts-morph";
import type { GraphDiagnostic } from "../types";
import { projectDiagnostic } from "./diagnostics";
import type { ProjectFileRole, ProjectSourceUnit } from "./source-units";
import type { ProjectModuleResolver } from "./imports";

export type ProjectExportEntry =
  | {
      kind: "local";
      exportName: string;
      localName: string;
      declaration?: VariableDeclaration;
      loc?: GraphDiagnostic["loc"];
    }
  | {
      kind: "re-export";
      exportName: string;
      importedName: string;
      moduleSpecifier: string;
      loc?: GraphDiagnostic["loc"];
    }
  | {
      kind: "unsupported";
      exportName?: string;
      loc?: GraphDiagnostic["loc"];
    };

export type ResolvedProjectExport =
  | {
      ok: true;
      unit: ProjectSourceUnit;
      exportName: string;
      localName: string;
      declaration?: VariableDeclaration;
    }
  | { ok: false; diagnostics: GraphDiagnostic[] };

type SupportedProjectExportEntry = Exclude<ProjectExportEntry, { kind: "unsupported" }>;

const exportNameOfSpecifier = (specifier: { getNameNode(): Node; getAliasNode(): Node | undefined }): string => {
  return specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText();
};

export const listNamedExports = (unit: ProjectSourceUnit): ProjectExportEntry[] => {
  const entries: ProjectExportEntry[] = [];

  for (const statement of unit.source.sourceFile.getStatements()) {
    if (Node.isVariableStatement(statement) && statement.hasExportKeyword()) {
      for (const declaration of statement.getDeclarations()) {
        const nameNode = declaration.getNameNode();
        if (!Node.isIdentifier(nameNode)) continue;

        entries.push({
          kind: "local",
          exportName: nameNode.getText(),
          localName: nameNode.getText(),
          declaration,
          loc: unit.source.locFromNode(declaration),
        });
      }
      continue;
    }

    if (Node.isFunctionDeclaration(statement) && statement.hasExportKeyword()) {
      const name = statement.getName();
      if (!name) continue;

      entries.push({
        kind: "local",
        exportName: name,
        localName: name,
        loc: unit.source.locFromNode(statement),
      });
      continue;
    }

    if (!Node.isExportDeclaration(statement) || statement.isTypeOnly()) continue;

    const moduleSpecifier = statement.getModuleSpecifierValue();
    const namedExports = statement.getNamedExports();
    if (namedExports.length === 0) {
      entries.push({
        kind: "unsupported",
        loc: unit.source.locFromNode(statement),
      });
      continue;
    }

    for (const specifier of namedExports) {
      const importedName = specifier.getNameNode().getText();
      const exportName = exportNameOfSpecifier(specifier);

      if (moduleSpecifier) {
        entries.push({
          kind: "re-export",
          exportName,
          importedName,
          moduleSpecifier,
          loc: unit.source.locFromNode(specifier),
        });
        continue;
      }

      entries.push({
        kind: "local",
        exportName,
        localName: importedName,
        loc: unit.source.locFromNode(specifier),
      });
    }
  }

  return entries;
};

export const resolveProjectExport = (
  unit: ProjectSourceUnit,
  exportName: string,
  resolver: ProjectModuleResolver,
  finalRole: ProjectFileRole,
  seen: ReadonlySet<string> = new Set(),
): ResolvedProjectExport => {
  const cycleKey = `${unit.fileName}\0${exportName}`;
  if (seen.has(cycleKey)) {
    return {
      ok: false,
      diagnostics: [
        projectDiagnostic(
          "LFG_PROJECT_MODULE_CYCLE",
          "warning",
          `Export '${exportName}' participates in a module cycle.`,
        ),
      ],
    };
  }

  const entries = listNamedExports(unit);
  const entry = entries.find(
    (candidate): candidate is SupportedProjectExportEntry =>
      candidate.kind !== "unsupported" && candidate.exportName === exportName,
  );
  if (!entry) {
    const unsupportedEntry = entries.find((candidate) => candidate.kind === "unsupported");
    if (unsupportedEntry) {
      return {
        ok: false,
        diagnostics: [
          projectDiagnostic(
            "LFG_PROJECT_BARREL_UNSUPPORTED",
            "warning",
            "Only named re-exports are supported in project graph barrels.",
            unsupportedEntry.loc,
          ),
        ],
      };
    }

    return {
      ok: false,
      diagnostics: [
        projectDiagnostic(
          "LFG_PROJECT_EXPORT_NOT_FOUND",
          "warning",
          `Export '${exportName}' was not found in '${unit.exportedFileName}'.`,
        ),
      ],
    };
  }

  if (entry.kind === "local") {
    resolver.addRole(unit, finalRole);
    return {
      ok: true,
      unit,
      exportName: entry.exportName,
      localName: entry.localName,
      declaration: entry.declaration,
    };
  }

  resolver.addRole(unit, "barrel");
  const diagnosticStart = resolver.diagnostics.length;
  const target = resolver.readResolvedImport(unit, entry.moduleSpecifier, undefined, entry.loc);
  if (!target) return { ok: false, diagnostics: resolver.diagnostics.slice(diagnosticStart) };

  return resolveProjectExport(
    target,
    entry.importedName,
    resolver,
    finalRole,
    new Set([...seen, cycleKey]),
  );
};
