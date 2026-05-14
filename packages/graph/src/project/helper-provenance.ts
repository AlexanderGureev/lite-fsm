import { Node, SyntaxKind, type TypeReferenceNode } from "ts-morph";
import type { GraphDiagnostic } from "../types";
import { unwrapTransparent } from "../compiler/ast";
import {
  createSourceCatalog,
  type ApiProvenance,
  type LiteFsmApiName,
  type LocalConstBinding,
  type SourceCatalog,
} from "../compiler/catalog";
import { projectDiagnostic } from "./diagnostics";
import { resolveProjectExport } from "./exports";
import { readImportTable } from "./imports";
import type { ProjectModuleResolver } from "./imports";
import type { ProjectSourceUnit } from "./source-units";

export type ProjectCatalogResult = {
  catalog: SourceCatalog;
  diagnostics: GraphDiagnostic[];
};

type HelperApiName = Exclude<LiteFsmApiName, "MachineManager">;

const HELPER_API_NAMES: readonly HelperApiName[] = [
  "createMachine",
  "createConfig",
  "createReducer",
  "createEffect",
];

const TYPED_HELPER_TYPE_NAMES = {
  createMachine: "TypedCreateMachineFn",
  createConfig: "TypedCreateConfigFn",
  createReducer: "TypedCreateReducerFn",
  createEffect: "TypedCreateEffectFn",
} satisfies Record<HelperApiName, string>;

const isHelperApiName = (name: string): name is HelperApiName => {
  return HELPER_API_NAMES.includes(name as HelperApiName);
};

const provenanceForImport = (
  apiName: HelperApiName,
  localName: string,
  loc?: GraphDiagnostic["loc"],
): ApiProvenance => ({
  apiName,
  importedName: apiName,
  localName,
  source: "@lite-fsm/core",
  loc,
});

const hasTypedHelperAnnotation = (binding: LocalConstBinding, apiName: HelperApiName): boolean => {
  const typeNode = binding.declaration.getTypeNode();
  if (!typeNode) return false;
  if (typeNode.getKind() !== SyntaxKind.TypeReference) return false;

  return (typeNode as TypeReferenceNode).getTypeName().getText() === TYPED_HELPER_TYPE_NAMES[apiName];
};

export type HelperProvenance = {
  createCatalog(unit: ProjectSourceUnit): ProjectCatalogResult;
};

export const createHelperProvenance = (resolver: ProjectModuleResolver): HelperProvenance => {
  const proven = new Map<string, boolean>();

  const proveLocalHelper = (
    unit: ProjectSourceUnit,
    localName: string,
    apiName: HelperApiName,
    seen: ReadonlySet<string>,
  ): boolean => {
    const key = `${unit.fileName}\0${localName}\0${apiName}`;
    const cached = proven.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return false;

    const remember = (result: boolean): boolean => {
      proven.set(key, result);
      return result;
    };

    const binding = unit.catalog.getConstBinding(localName);
    if (!binding || !hasTypedHelperAnnotation(binding, apiName)) {
      return remember(false);
    }

    const initializer = unwrapTransparent(binding.initializer);
    if (!Node.isIdentifier(initializer)) {
      return remember(false);
    }

    const initializerName = initializer.getText();
    if (unit.catalog.resolveApiIdentifier(initializerName, apiName) === "import") {
      return remember(true);
    }

    const imported = readImportTable(unit).namedImports.get(initializerName);
    if (!imported || !isHelperApiName(imported.importedName)) {
      return remember(false);
    }

    const target = resolver.readResolvedImport(unit, imported.moduleSpecifier, undefined, imported.loc);
    if (!target) {
      return remember(false);
    }

    const resolved = resolveProjectExport(target, imported.importedName, resolver, "helper");
    const result =
      resolved.ok &&
      proveLocalHelper(resolved.unit, resolved.localName, apiName, new Set([...seen, key]));

    return remember(result);
  };

  const createCatalog = (unit: ProjectSourceUnit): ProjectCatalogResult => {
    const apiImports: ApiProvenance[] = [];
    const diagnostics: GraphDiagnostic[] = [];
    const imports = readImportTable(unit);

    for (const namedImport of imports.namedImports.values()) {
      if (!isHelperApiName(namedImport.importedName)) continue;

      const resolution = resolver.resolve(unit, namedImport.moduleSpecifier);
      if (resolution.kind === "core") continue;
      if (resolution.kind !== "resolved") {
        diagnostics.push(
          projectDiagnostic(
            "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED",
            "warning",
            `Helper '${namedImport.localName}' could not be proven as a lite-fsm helper wrapper.`,
            namedImport.loc,
          ),
        );
        continue;
      }

      const target = resolver.readResolvedImport(unit, namedImport.moduleSpecifier, undefined, namedImport.loc);
      if (!target) continue;

      const resolved = resolveProjectExport(target, namedImport.importedName, resolver, "helper");
      if (!resolved.ok) {
        diagnostics.push(...resolved.diagnostics);
        continue;
      }

      if (proveLocalHelper(resolved.unit, resolved.localName, namedImport.importedName, new Set())) {
        apiImports.push(provenanceForImport(namedImport.importedName, namedImport.localName, namedImport.loc));
        continue;
      }

      diagnostics.push(
        projectDiagnostic(
          "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED",
          "warning",
          `Helper '${namedImport.localName}' is not a supported typed wrapper over '${namedImport.importedName}'.`,
          namedImport.loc,
        ),
      );
    }

    return {
      catalog: createSourceCatalog(unit.source, { apiImports, allowAmbientApi: false }),
      diagnostics,
    };
  };

  return { createCatalog };
};
