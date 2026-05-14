import { Node, type Expression } from "ts-morph";
import type { GraphDiagnostic } from "../types";
import { readMachineOptions, unwrapTransparent } from "../compiler/ast";
import { discoverCandidates, type MachineCandidate } from "../compiler/candidates";
import type { SourceCatalog } from "../compiler/catalog";
import { projectDiagnostic } from "./diagnostics";
import { resolveProjectExport } from "./exports";
import type { HelperProvenance } from "./helper-provenance";
import { readImportTable } from "./imports";
import type { ProjectImportTable, ProjectModuleResolver } from "./imports";
import type { ProjectManagerEntry } from "./manager-map";
import type { ProjectStep } from "./result";
import { projectFail, projectOk } from "./result";
import type { ProjectSourceUnit } from "./source-units";

export type ResolvedProjectMachine = {
  candidate: MachineCandidate;
  unit: ProjectSourceUnit;
  catalog: SourceCatalog;
};

export type ProjectMachineResolver = {
  resolve(entry: ProjectManagerEntry): ProjectStep<ResolvedProjectMachine>;
};

type CandidateCacheEntry = {
  catalog: SourceCatalog;
  diagnostics: GraphDiagnostic[];
  candidates: MachineCandidate[];
};

type MachineReference =
  | {
      kind: "identifier";
      name: string;
      loc?: GraphDiagnostic["loc"];
    }
  | {
      kind: "namespace-access";
      namespaceName: string;
      exportName: string;
      loc?: GraphDiagnostic["loc"];
    };

const isCreateMachineLikeCall = (unit: ProjectSourceUnit, localName: string): boolean => {
  const binding = unit.catalog.getConstBinding(localName);
  const initializer = binding ? unwrapTransparent(binding.initializer) : undefined;
  if (!initializer || !Node.isCallExpression(initializer)) return false;

  const expression = initializer.getExpression();

  return Node.isIdentifier(expression) && expression.getText() === "createMachine";
};

const helperDiagnostics = (diagnostics: readonly GraphDiagnostic[]): GraphDiagnostic[] => {
  return diagnostics.filter((diagnostic) => diagnostic.code === "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED");
};

export const createProjectMachineResolver = (
  resolver: ProjectModuleResolver,
  helpers: HelperProvenance,
): ProjectMachineResolver => {
  const candidateCache = new Map<string, CandidateCacheEntry>();

  const candidatesFor = (unit: ProjectSourceUnit): CandidateCacheEntry => {
    const cached = candidateCache.get(unit.fileName);
    if (cached) return cached;

    const catalog = helpers.createCatalog(unit);
    const candidates = discoverCandidates(unit.source, catalog.catalog).machines;
    const entry: CandidateCacheEntry = {
      catalog: catalog.catalog,
      diagnostics: catalog.diagnostics,
      candidates,
    };

    candidateCache.set(unit.fileName, entry);
    return entry;
  };

  const findLocalMachine = (
    unit: ProjectSourceUnit,
    localName: string,
    loc?: GraphDiagnostic["loc"],
  ): ProjectStep<ResolvedProjectMachine> => {
    const cached = candidatesFor(unit);
    const candidate = cached.candidates.find(
      (item) => item.variableName === localName || item.exportName === localName,
    );
    if (!candidate) {
      const relatedHelperDiagnostics = helperDiagnostics(cached.diagnostics);
      if (isCreateMachineLikeCall(unit, localName)) {
        return projectFail([
          ...cached.diagnostics,
          projectDiagnostic(
            "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED",
            "warning",
            `Machine '${localName}' uses a createMachine call whose provenance is not supported.`,
            loc,
          ),
        ]);
      }
      if (relatedHelperDiagnostics.length > 0) return projectFail(relatedHelperDiagnostics);

      return projectFail([
        ...cached.diagnostics,
        projectDiagnostic(
          "LFG_PROJECT_MACHINE_UNRESOLVED",
          "warning",
          `Binding '${localName}' does not resolve to a supported createMachine declaration.`,
          loc,
        ),
      ]);
    }

    if (!readMachineOptions(candidate.call)) {
      return projectFail([
        ...cached.diagnostics,
        projectDiagnostic(
          "LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT",
          "warning",
          `Machine '${localName}' uses an unsupported createMachine first argument.`,
          candidate.loc,
        ),
      ]);
    }

    resolver.addRole(unit, "machine");

    return projectOk({ candidate, unit, catalog: cached.catalog }, cached.diagnostics);
  };

  const resolveExportedMachine = (
    unit: ProjectSourceUnit,
    exportName: string,
    loc?: GraphDiagnostic["loc"],
  ): ProjectStep<ResolvedProjectMachine> => {
    const resolved = resolveProjectExport(unit, exportName, resolver, "machine");
    if (!resolved.ok) return projectFail(resolved.diagnostics);

    return findLocalMachine(resolved.unit, resolved.localName, loc);
  };

  const resolveIdentifier = (
    name: string,
    unit: ProjectSourceUnit,
    imports: ProjectImportTable,
    loc?: GraphDiagnostic["loc"],
  ): ProjectStep<ResolvedProjectMachine> => {
    const namespaceMember = imports.namespaceMembers.get(name);
    if (namespaceMember) {
      const namespaceImport = imports.namespaceImports.get(namespaceMember.namespaceName)!;

      const namespaceUnit = resolver.readResolvedImport(unit, namespaceImport.moduleSpecifier, "barrel", namespaceImport.loc);
      if (!namespaceUnit) {
        return projectFail([
          projectDiagnostic(
            "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
            "warning",
            `Namespace '${namespaceMember.namespaceName}' could not be resolved to project source.`,
            namespaceImport.loc,
          ),
        ]);
      }

      return resolveExportedMachine(namespaceUnit, namespaceMember.exportName, namespaceMember.loc);
    }

    const namedImport = imports.namedImports.get(name);
    if (namedImport) {
      const target = resolver.readResolvedImport(unit, namedImport.moduleSpecifier, undefined, namedImport.loc);
      if (!target) {
        return projectFail([
          projectDiagnostic(
            "LFG_PROJECT_MACHINE_UNRESOLVED",
            "warning",
            `Machine import '${name}' could not be resolved to project source.`,
            namedImport.loc,
          ),
        ]);
      }

      return resolveExportedMachine(target, namedImport.importedName, namedImport.loc);
    }

    return findLocalMachine(unit, name, loc);
  };

  const readExpressionReference = (
    expression: Expression,
    unit: ProjectSourceUnit,
  ): ProjectStep<MachineReference> => {
    const unwrapped = unwrapTransparent(expression);

    if (Node.isIdentifier(unwrapped)) {
      return projectOk({
        kind: "identifier",
        name: unwrapped.getText(),
        loc: unit.source.locFromNode(unwrapped),
      });
    }

    if (Node.isPropertyAccessExpression(unwrapped) && Node.isIdentifier(unwrapped.getExpression())) {
      return projectOk({
        kind: "namespace-access",
        namespaceName: unwrapped.getExpression().getText(),
        exportName: unwrapped.getName(),
        loc: unit.source.locFromNode(unwrapped),
      });
    }

    if (Node.isCallExpression(unwrapped)) {
      return projectFail([
        projectDiagnostic(
          "LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED",
          "warning",
          "Inline createMachine calls in manager maps are not supported by project graph compilation.",
          unit.source.locFromNode(unwrapped),
        ),
      ]);
    }

    return projectFail([
      projectDiagnostic(
        "LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED",
        "warning",
        "Manager entry must reference a local or imported machine binding.",
        unit.source.locFromNode(expression),
      ),
    ]);
  };

  const resolveNamespaceAccess = (
    reference: Extract<MachineReference, { kind: "namespace-access" }>,
    unit: ProjectSourceUnit,
    imports: ProjectImportTable,
  ): ProjectStep<ResolvedProjectMachine> => {
    const namespaceImport = imports.namespaceImports.get(reference.namespaceName);
    if (!namespaceImport) {
      return projectFail([
        projectDiagnostic(
          "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
          "warning",
          `Namespace '${reference.namespaceName}' is not a supported project import.`,
          reference.loc,
        ),
      ]);
    }

    const namespaceUnit = resolver.readResolvedImport(unit, namespaceImport.moduleSpecifier, "barrel", namespaceImport.loc);
    if (!namespaceUnit) {
      return projectFail([
        projectDiagnostic(
          "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
          "warning",
          `Namespace '${reference.namespaceName}' could not be resolved to project source.`,
          namespaceImport.loc,
        ),
      ]);
    }

    return resolveExportedMachine(namespaceUnit, reference.exportName, reference.loc);
  };

  const resolveMachineReference = (
    reference: MachineReference,
    unit: ProjectSourceUnit,
  ): ProjectStep<ResolvedProjectMachine> => {
    const imports = readImportTable(unit);
    if (reference.kind === "identifier") return resolveIdentifier(reference.name, unit, imports, reference.loc);

    return resolveNamespaceAccess(reference, unit, imports);
  };

  const resolveExpression = (
    expression: Expression,
    unit: ProjectSourceUnit,
  ): ProjectStep<ResolvedProjectMachine> => {
    const reference = readExpressionReference(expression, unit);
    if (!reference.ok) return reference;

    return resolveMachineReference(reference.value, unit);
  };

  const resolve = (entry: ProjectManagerEntry): ProjectStep<ResolvedProjectMachine> => {
    if (entry.kind === "namespace-export") {
      return resolveExportedMachine(entry.namespaceUnit, entry.exportName, entry.loc);
    }

    return resolveExpression(entry.expression, entry.unit);
  };

  return { resolve };
};
