import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type CallExpression,
  type Expression,
  type VariableDeclaration,
} from "ts-morph";
import type { SourceLocation } from "../types";
import type { SourceAdapter } from "./source";

export type LiteFsmApiName = "createMachine" | "createConfig" | "createReducer" | "createEffect" | "MachineManager";

export type ApiProvenance = {
  apiName: LiteFsmApiName;
  importedName: LiteFsmApiName;
  localName: string;
  source: "@lite-fsm/core";
  loc?: SourceLocation;
};

export type LocalConstBinding = {
  name: string;
  initializer: Expression;
  declaration: VariableDeclaration;
  loc?: SourceLocation;
};

export type SourceCatalogOptions = {
  apiImports?: readonly ApiProvenance[];
  allowAmbientApi?: boolean;
};

export type SourceCatalog = {
  apiImports: ReadonlyMap<string, ApiProvenance>;
  localConsts: ReadonlyMap<string, LocalConstBinding>;
  localValueBindings: ReadonlySet<string>;
  calls: readonly CallExpression[];
  resolveApiIdentifier(localName: string, apiName: LiteFsmApiName): "import" | "ambient" | undefined;
  getConstBinding(name: string): LocalConstBinding | undefined;
};

const LITE_FSM_CORE_SOURCE = "@lite-fsm/core";
const LITE_FSM_CORE_ALIAS = "lite-fsm";
const KNOWN_API_NAMES = new Set<LiteFsmApiName>([
  "createMachine",
  "createConfig",
  "createReducer",
  "createEffect",
  "MachineManager",
]);

const isLiteFsmApiName = (name: string): name is LiteFsmApiName => {
  return KNOWN_API_NAMES.has(name as LiteFsmApiName);
};

const isCoreModuleSpecifier = (moduleSpecifier: string): boolean => {
  return moduleSpecifier === LITE_FSM_CORE_SOURCE || moduleSpecifier === LITE_FSM_CORE_ALIAS;
};

const addNamedDeclarationBinding = (
  bindings: Set<string>,
  declaration: { getName: () => string | undefined },
) => {
  const name = declaration.getName();
  if (name) bindings.add(name);
};

export const createSourceCatalog = (
  source: SourceAdapter,
  options: SourceCatalogOptions = {},
): SourceCatalog => {
  const apiImports = new Map<string, ApiProvenance>();
  const localConsts = new Map<string, LocalConstBinding>();
  const localValueBindings = new Set<string>();
  const allowAmbientApi = options.allowAmbientApi ?? true;

  for (const apiImport of options.apiImports ?? []) {
    apiImports.set(apiImport.localName, apiImport);
  }

  for (const declaration of source.sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue;

    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) localValueBindings.add(defaultImport.getText());

    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) localValueBindings.add(namespaceImport.getText());

    const moduleSpecifier = declaration.getModuleSpecifierValue();
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.isTypeOnly()) continue;

      const importedName = specifier.getNameNode().getText();
      const localName = specifier.getAliasNode()?.getText() ?? importedName;
      localValueBindings.add(localName);

      if (!isCoreModuleSpecifier(moduleSpecifier) || !isLiteFsmApiName(importedName)) continue;

      apiImports.set(localName, {
        apiName: importedName,
        importedName,
        localName,
        source: LITE_FSM_CORE_SOURCE,
        loc: source.locFromNode(specifier),
      });
    }
  }

  for (const parameter of source.sourceFile.getDescendantsOfKind(SyntaxKind.Parameter)) {
    const nameNode = parameter.getNameNode();
    if (Node.isIdentifier(nameNode)) localValueBindings.add(nameNode.getText());
  }

  for (const declaration of source.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;

    const name = nameNode.getText();
    localValueBindings.add(name);

    const statement = declaration.getVariableStatement();
    if (statement?.getDeclarationKind() !== VariableDeclarationKind.Const) continue;

    const initializer = declaration.getInitializer();
    if (!initializer) continue;

    localConsts.set(name, {
      name,
      initializer,
      declaration,
      loc: source.locFromNode(declaration),
    });
  }

  for (const declaration of source.sourceFile.getFunctions()) addNamedDeclarationBinding(localValueBindings, declaration);
  for (const declaration of source.sourceFile.getClasses()) addNamedDeclarationBinding(localValueBindings, declaration);
  for (const declaration of source.sourceFile.getEnums()) addNamedDeclarationBinding(localValueBindings, declaration);

  const calls = source.sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .sort((left, right) => left.getStart() - right.getStart());

  return {
    apiImports,
    localConsts,
    localValueBindings,
    calls,
    resolveApiIdentifier(localName, apiName) {
      const imported = apiImports.get(localName);
      if (imported?.apiName === apiName) return "import";
      if (allowAmbientApi && localName === apiName && !localValueBindings.has(localName)) return "ambient";

      return undefined;
    },
    getConstBinding(name) {
      return localConsts.get(name);
    },
  };
};
