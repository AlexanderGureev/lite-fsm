import { Node, SyntaxKind } from "ts-morph";
import type { GraphDiagnostic, LiteFsmGraphProjectHost, LiteFsmGraphProjectModuleResolution } from "../types";
import { propertyNameText } from "../compiler/ast";
import { diagnosticFromModuleResolution } from "./diagnostics";
import { normalizeProjectPath } from "./path";
import type { ProjectFileRole, ProjectSourceCache, ProjectSourceUnit } from "./source-units";

export type NamedImportBinding = {
  localName: string;
  importedName: string;
  moduleSpecifier: string;
  loc?: GraphDiagnostic["loc"];
};

export type NamespaceImportBinding = {
  localName: string;
  moduleSpecifier: string;
  loc?: GraphDiagnostic["loc"];
};

export type NamespaceMemberBinding = {
  localName: string;
  namespaceName: string;
  exportName: string;
  loc?: GraphDiagnostic["loc"];
};

export type NamespaceRestBinding = {
  localName: string;
  namespaceName: string;
  omittedExports: readonly string[];
  loc?: GraphDiagnostic["loc"];
};

export type UnsupportedNamespaceRestBinding = {
  localName: string;
  loc?: GraphDiagnostic["loc"];
};

export type ProjectImportTable = {
  namedImports: ReadonlyMap<string, NamedImportBinding>;
  namespaceImports: ReadonlyMap<string, NamespaceImportBinding>;
  namespaceMembers: ReadonlyMap<string, NamespaceMemberBinding>;
  namespaceRests: ReadonlyMap<string, NamespaceRestBinding>;
  unsupportedNamespaceRests: ReadonlyMap<string, UnsupportedNamespaceRestBinding>;
};

type MutableProjectImportTable = {
  namedImports: Map<string, NamedImportBinding>;
  namespaceImports: Map<string, NamespaceImportBinding>;
  namespaceMembers: Map<string, NamespaceMemberBinding>;
  namespaceRests: Map<string, NamespaceRestBinding>;
  unsupportedNamespaceRests: Map<string, UnsupportedNamespaceRestBinding>;
};

const bindingPropertyName = (element: { getPropertyNameNode(): Node | undefined; getNameNode(): Node }): string | undefined => {
  const propertyNameNode = element.getPropertyNameNode();
  if (!propertyNameNode) {
    return element.getNameNode().getText();
  }

  return propertyNameText(propertyNameNode);
};

const createImportTable = (): MutableProjectImportTable => ({
  namedImports: new Map(),
  namespaceImports: new Map(),
  namespaceMembers: new Map(),
  namespaceRests: new Map(),
  unsupportedNamespaceRests: new Map(),
});

const readImportDeclarations = (
  unit: ProjectSourceUnit,
  table: MutableProjectImportTable,
): void => {
  for (const declaration of unit.source.sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue;

    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      table.namespaceImports.set(namespaceImport.getText(), {
        localName: namespaceImport.getText(),
        moduleSpecifier,
        loc: unit.source.locFromNode(namespaceImport),
      });
    }

    for (const specifier of declaration.getNamedImports()) {
      if (specifier.isTypeOnly()) continue;

      const importedName = specifier.getNameNode().getText();
      const localName = specifier.getAliasNode()?.getText() ?? importedName;
      table.namedImports.set(localName, {
        localName,
        importedName,
        moduleSpecifier,
        loc: unit.source.locFromNode(specifier),
      });
    }
  }
};

const readNamespaceDestructuring = (
  unit: ProjectSourceUnit,
  table: MutableProjectImportTable,
): void => {
  for (const declaration of unit.source.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();
    const initializer = declaration.getInitializer();
    if (!Node.isObjectBindingPattern(nameNode) || !initializer || !Node.isIdentifier(initializer)) continue;

    const namespaceName = initializer.getText();
    const isNamespaceImport = table.namespaceImports.has(namespaceName);

    const omittedExports: string[] = [];
    for (const element of nameNode.getElements()) {
      const elementNameNode = element.getNameNode();
      const localName = Node.isIdentifier(elementNameNode) ? elementNameNode.getText() : undefined;
      if (!localName) continue;

      if (element.getText().trim().startsWith("...")) {
        if (!isNamespaceImport) {
          table.unsupportedNamespaceRests.set(localName, {
            localName,
            loc: unit.source.locFromNode(element),
          });
          continue;
        }

        table.namespaceRests.set(localName, {
          localName,
          namespaceName,
          omittedExports: [...omittedExports],
          loc: unit.source.locFromNode(element),
        });
        continue;
      }

      const exportName = bindingPropertyName(element);
      if (!exportName) continue;

      if (!isNamespaceImport) continue;

      omittedExports.push(exportName);
      table.namespaceMembers.set(localName, {
        localName,
        namespaceName,
        exportName,
        loc: unit.source.locFromNode(element),
      });
    }
  }
};

export const readImportTable = (unit: ProjectSourceUnit): ProjectImportTable => {
  const table = createImportTable();
  readImportDeclarations(unit, table);
  readNamespaceDestructuring(unit, table);

  return table;
};

export type ProjectModuleResolver = {
  readonly diagnostics: GraphDiagnostic[];
  addRole(unit: ProjectSourceUnit, role: ProjectFileRole): void;
  resolve(unit: ProjectSourceUnit, moduleSpecifier: string): LiteFsmGraphProjectModuleResolution;
  readResolvedImport(
    unit: ProjectSourceUnit,
    moduleSpecifier: string,
    role?: ProjectFileRole,
    loc?: GraphDiagnostic["loc"],
  ): ProjectSourceUnit | undefined;
};

export const createProjectModuleResolver = (
  host: LiteFsmGraphProjectHost,
  sourceCache: ProjectSourceCache,
): ProjectModuleResolver => {
  const diagnostics: GraphDiagnostic[] = [];
  const resolutions = new Map<string, LiteFsmGraphProjectModuleResolution>();

  const addRole = (unit: ProjectSourceUnit, role: ProjectFileRole): void => {
    sourceCache.addRole(unit, role);
  };

  const resolve = (unit: ProjectSourceUnit, moduleSpecifier: string): LiteFsmGraphProjectModuleResolution => {
    const key = `${unit.fileName}\0${moduleSpecifier}`;
    const existing = resolutions.get(key);
    if (existing) return existing;

    const resolution = host.resolveModule({
      fromFileName: unit.fileName,
      moduleSpecifier,
    });
    const normalized =
      resolution.kind === "resolved"
        ? { ...resolution, fileName: normalizeProjectPath(resolution.fileName) }
        : resolution;

    resolutions.set(key, normalized);
    return normalized;
  };

  const readResolvedImport = (
    unit: ProjectSourceUnit,
    moduleSpecifier: string,
    role?: ProjectFileRole,
    loc?: GraphDiagnostic["loc"],
  ): ProjectSourceUnit | undefined => {
    const resolution = resolve(unit, moduleSpecifier);
    if (resolution.kind === "resolved") return sourceCache.read(resolution.fileName, role, loc);

    if (resolution.kind === "not-found" || resolution.kind === "unsupported-extension") {
      diagnostics.push(diagnosticFromModuleResolution(resolution, loc));
    }

    return undefined;
  };

  return {
    diagnostics,
    addRole,
    resolve,
    readResolvedImport,
  };
};
