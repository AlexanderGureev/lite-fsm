import {
  Node,
  type Expression,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
} from "ts-morph";
import type { GraphDiagnostic, SourceLocation } from "../types";
import { propertyNameText, unwrapTransparent } from "../compiler/ast";
import type { ManagerCandidate } from "../compiler/candidates";
import { projectDiagnostic } from "./diagnostics";
import { readImportTable } from "./imports";
import type { NamespaceRestBinding, ProjectImportTable, ProjectModuleResolver } from "./imports";
import { listNamedExports, resolveProjectExport } from "./exports";
import type { ProjectStep } from "./result";
import { projectFail, projectOk } from "./result";
import type { ProjectSourceUnit } from "./source-units";

export type ProjectManagerEntry =
  | {
      kind: "expression";
      key: string;
      expression: Expression;
      unit: ProjectSourceUnit;
      loc?: SourceLocation;
    }
  | {
      kind: "namespace-export";
      key: string;
      namespaceUnit: ProjectSourceUnit;
      exportName: string;
      loc?: SourceLocation;
    };

export type ProjectManagerMap = {
  entries: ProjectManagerEntry[];
  diagnostics: GraphDiagnostic[];
};

export type ProjectManagerMapResult = ProjectStep<ProjectManagerMap>;

const expressionDiagnostic = (
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => projectDiagnostic("LFG_PROJECT_MANAGER_MAP_UNSUPPORTED", "error", message, loc);

const warningDiagnostic = (
  code:
    | "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED"
    | "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED"
    | "LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED"
    | "LFG_PROJECT_BARREL_UNSUPPORTED",
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => projectDiagnostic(code, "warning", message, loc);

const emptyManagerMap = (
  diagnostic: GraphDiagnostic,
): ProjectManagerMap => ({
  entries: [],
  diagnostics: [diagnostic],
});

const singleEntryManagerMap = (
  entry: ProjectManagerEntry,
): ProjectManagerMap => ({
  entries: [entry],
  diagnostics: [],
});

const readObjectLiteral = (
  expression: Expression,
  unit: ProjectSourceUnit,
): ProjectStep<ObjectLiteralExpression> => {
  const unwrapped = unwrapTransparent(expression);
  if (Node.isObjectLiteralExpression(unwrapped)) return projectOk(unwrapped);

  if (Node.isIdentifier(unwrapped)) {
    const binding = unit.catalog.getConstBinding(unwrapped.getText());
    const initializer = binding ? unwrapTransparent(binding.initializer) : undefined;
    if (initializer && Node.isObjectLiteralExpression(initializer)) return projectOk(initializer);
  }

  return projectFail([
    expressionDiagnostic(
      "MachineManager first argument must resolve to an object literal in the entry source file.",
      unit.source.locFromNode(expression),
    ),
  ]);
};

const objectBindingKey = (unit: ProjectSourceUnit, name: string): string => `${unit.fileName}\0${name}`;

const expandNamespaceExports = (
  namespaceUnit: ProjectSourceUnit,
  omittedExports: ReadonlySet<string>,
  loc?: SourceLocation,
): ProjectManagerMap => {
  const entries: ProjectManagerEntry[] = [];
  const diagnostics: GraphDiagnostic[] = [];

  for (const namedExport of listNamedExports(namespaceUnit)) {
    if (namedExport.kind === "unsupported") {
      diagnostics.push(
        warningDiagnostic(
          "LFG_PROJECT_BARREL_UNSUPPORTED",
          "Only named exports and named re-exports are supported in project graph barrels.",
          namedExport.loc,
        ),
      );
      continue;
    }

    if (omittedExports.has(namedExport.exportName)) continue;

    entries.push({
      kind: "namespace-export",
      key: namedExport.exportName,
      namespaceUnit,
      exportName: namedExport.exportName,
      loc,
    });
  }

  return { entries, diagnostics };
};

const expandNamespaceImport = (
  namespaceName: string,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  omittedExports: ReadonlySet<string>,
  loc?: SourceLocation,
): ProjectManagerMap => {
  const namespaceImport = imports.namespaceImports.get(namespaceName)!;

  const namespaceUnit = resolver.readResolvedImport(unit, namespaceImport.moduleSpecifier, "barrel", namespaceImport.loc);
  if (!namespaceUnit) {
    return emptyManagerMap(
      warningDiagnostic(
        "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED",
        `Namespace '${namespaceName}' could not be resolved to a project barrel.`,
        namespaceImport.loc,
      ),
    );
  }

  return expandNamespaceExports(namespaceUnit, omittedExports, loc);
};

const expandNamespaceRest = (
  rest: NamespaceRestBinding,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  loc?: SourceLocation,
): ProjectManagerMap => {
  return expandNamespaceImport(rest.namespaceName, imports, unit, resolver, new Set(rest.omittedExports), loc);
};

const expandNamedImport = (
  name: string,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  seenObjects: ReadonlySet<string>,
  loc?: SourceLocation,
): ProjectManagerMap | undefined => {
  const namedImport = imports.namedImports.get(name);
  if (!namedImport) return undefined;

  const resolution = resolver.resolve(unit, namedImport.moduleSpecifier);
  if (resolution.kind === "external" || resolution.kind === "core") {
    return emptyManagerMap(
      warningDiagnostic(
        "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED",
        `Manager map spread '${name}' comes from an external module and was skipped.`,
        loc,
      ),
    );
  }

  const targetUnit = resolver.readResolvedImport(unit, namedImport.moduleSpecifier, "barrel", namedImport.loc);
  if (!targetUnit) {
    return emptyManagerMap(
      warningDiagnostic(
        "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED",
        `Manager map spread '${name}' could not be resolved to project source.`,
        loc,
      ),
    );
  }

  const resolved = resolveProjectExport(targetUnit, namedImport.importedName, resolver, "barrel");
  if (!resolved.ok) return { entries: [], diagnostics: resolved.diagnostics };

  return expandSpreadBinding(resolved.localName, readImportTable(resolved.unit), resolved.unit, resolver, seenObjects, loc);
};

function expandSpreadBinding(
  name: string,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  seenObjects: ReadonlySet<string>,
  loc?: SourceLocation,
): ProjectManagerMap {
  const namespaceImport = imports.namespaceImports.get(name);
  if (namespaceImport) return expandNamespaceImport(namespaceImport.localName, imports, unit, resolver, new Set(), loc);

  const namespaceRest = imports.namespaceRests.get(name);
  if (namespaceRest) return expandNamespaceRest(namespaceRest, imports, unit, resolver, loc);
  if (imports.unsupportedNamespaceRests.has(name)) {
    return emptyManagerMap(
      warningDiagnostic(
        "LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED",
        `Namespace rest '${name}' must destructure a project namespace import.`,
        imports.unsupportedNamespaceRests.get(name)?.loc,
      ),
    );
  }

  const localConst = unit.catalog.getConstBinding(name);
  const initializer = localConst ? unwrapTransparent(localConst.initializer) : undefined;
  if (initializer && Node.isObjectLiteralExpression(initializer)) {
    const key = objectBindingKey(unit, name);
    if (seenObjects.has(key)) {
      return emptyManagerMap(
        expressionDiagnostic(
          `Manager map object spread '${name}' depends on itself.`,
          loc,
        ),
      );
    }

    return expandObjectLiteral(initializer, imports, unit, resolver, new Set([...seenObjects, key]));
  }

  const imported = expandNamedImport(name, imports, unit, resolver, seenObjects, loc);
  if (imported) return imported;

  return emptyManagerMap(
    expressionDiagnostic(
      `Manager map spread '${name}' is not supported.`,
      loc,
    ),
  );
}

const expandSpread = (
  expression: Expression,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  seenObjects: ReadonlySet<string>,
): ProjectManagerMap => {
  const unwrapped = unwrapTransparent(expression);
  if (!Node.isIdentifier(unwrapped)) {
    return emptyManagerMap(
      expressionDiagnostic(
        "Manager map spread must be a local object, namespace import/rest binding, or project import.",
        unit.source.locFromNode(expression),
      ),
    );
  }

  const name = unwrapped.getText();
  return expandSpreadBinding(name, imports, unit, resolver, seenObjects, unit.source.locFromNode(expression));
};

const duplicateKeyDiagnostic = (
  key: string,
  loc?: SourceLocation,
): GraphDiagnostic => expressionDiagnostic(`Duplicate manager key '${key}' was skipped.`, loc);

const appendEntries = (
  target: ProjectManagerEntry[],
  diagnostics: GraphDiagnostic[],
  seenKeys: Set<string>,
  entries: readonly ProjectManagerEntry[],
): void => {
  for (const entry of entries) {
    if (seenKeys.has(entry.key)) {
      diagnostics.push(duplicateKeyDiagnostic(entry.key, entry.loc));
      continue;
    }

    seenKeys.add(entry.key);
    target.push(entry);
  }
};

const readShorthandProperty = (
  property: ShorthandPropertyAssignment,
  unit: ProjectSourceUnit,
): ProjectManagerMap => {
  const key = property.getName();

  return singleEntryManagerMap({
    kind: "expression",
    key,
    expression: property.getNameNode(),
    unit,
    loc: unit.source.locFromNode(property),
  });
};

const readAssignedProperty = (
  property: PropertyAssignment,
  unit: ProjectSourceUnit,
): ProjectManagerMap => {
  const key = propertyNameText(property.getNameNode());
  const initializer = property.getInitializer();
  if (!key || !initializer) {
    return emptyManagerMap(
      expressionDiagnostic(
        "Manager map property must have a static key and initializer.",
        unit.source.locFromNode(property),
      ),
    );
  }

  return singleEntryManagerMap({
    kind: "expression",
    key,
    expression: initializer,
    unit,
    loc: unit.source.locFromNode(property),
  });
};

const readManagerProperty = (
  property: ObjectLiteralElementLike,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  seenObjects: ReadonlySet<string>,
): ProjectManagerMap => {
  if (Node.isSpreadAssignment(property)) return expandSpread(property.getExpression(), imports, unit, resolver, seenObjects);
  if (Node.isShorthandPropertyAssignment(property)) return readShorthandProperty(property, unit);
  if (Node.isPropertyAssignment(property)) return readAssignedProperty(property, unit);

  return emptyManagerMap(
    expressionDiagnostic(
      "Manager map entry form is not supported.",
      unit.source.locFromNode(property),
    ),
  );
};

function expandObjectLiteral(
  objectLiteral: ObjectLiteralExpression,
  imports: ProjectImportTable,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
  seenObjects: ReadonlySet<string>,
): ProjectManagerMap {
  const entries: ProjectManagerEntry[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const seenKeys = new Set<string>();

  for (const property of objectLiteral.getProperties()) {
    const expanded = readManagerProperty(property, imports, unit, resolver, seenObjects);
    appendEntries(entries, diagnostics, seenKeys, expanded.entries);
    diagnostics.push(...expanded.diagnostics);
  }

  return { entries, diagnostics };
}

export const readProjectManagerMap = (
  manager: ManagerCandidate,
  unit: ProjectSourceUnit,
  resolver: ProjectModuleResolver,
): ProjectManagerMapResult => {
  const [firstArgument] = manager.call.getArguments();
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return projectFail([
      expressionDiagnostic(
        "MachineManager call must have an object literal or same-file const machine map as the first argument.",
        unit.source.locFromNode(manager.call),
      ),
    ]);
  }

  const objectLiteral = readObjectLiteral(firstArgument, unit);
  if (!objectLiteral.ok) return objectLiteral;

  return projectOk(expandObjectLiteral(objectLiteral.value, readImportTable(unit), unit, resolver, new Set()));
};
