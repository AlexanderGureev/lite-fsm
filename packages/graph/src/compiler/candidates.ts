import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ObjectLiteralExpression,
} from "ts-morph";
import type { SourceLocation } from "../types";
import { propertyNameText, readMachineOptions, unwrapTransparent } from "./ast";
import type { LiteFsmApiName, SourceCatalog } from "./catalog";
import type { SourceAdapter } from "./source";

export type ApiCallProvenance = "import" | "ambient";

export type MachineCandidate = {
  call: CallExpression;
  index: number;
  variableName?: string;
  exportName?: string;
  managerKeys: string[];
  isDefaultExport: boolean;
  provenance: ApiCallProvenance;
  loc?: SourceLocation;
};

export type ManagerCandidate = {
  call: CallExpression;
  index: number;
  variableName?: string;
  exportName?: string;
  provenance: ApiCallProvenance;
  loc?: SourceLocation;
};

export type CandidateDiscoveryResult = {
  machines: MachineCandidate[];
  managers: ManagerCandidate[];
};

type AssignmentNames = {
  variableName?: string;
  exportName?: string;
  isDefaultExport: boolean;
};

const MACHINE_CONFIG_KEYS = ["config", "initialState", "initialContext"] as const;

const objectLiteralHasMachineShape = (objectLiteral: ObjectLiteralExpression): boolean => {
  const keys = new Set<string>();

  for (const property of objectLiteral.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      keys.add(property.getName());
      continue;
    }

    if (!Node.isPropertyAssignment(property)) continue;

    const key = propertyNameText(property.getNameNode());
    if (key) keys.add(key);
  }

  return MACHINE_CONFIG_KEYS.every((key) => keys.has(key));
};

const firstArgumentLooksLikeMachineConfig = (call: CallExpression): boolean => {
  const options = readMachineOptions(call);
  return options !== undefined && objectLiteralHasMachineShape(options);
};

const readCalleeIdentifier = (call: CallExpression): string | undefined => {
  const expression = call.getExpression();
  if (!Node.isIdentifier(expression)) return undefined;

  return expression.getText();
};

const resolveApiCall = (
  call: CallExpression,
  catalog: SourceCatalog,
  apiName: LiteFsmApiName,
): ApiCallProvenance | undefined => {
  const calleeName = readCalleeIdentifier(call);
  if (!calleeName) return undefined;

  return catalog.resolveApiIdentifier(calleeName, apiName);
};

const isExportedVariableDeclaration = (call: CallExpression): boolean => {
  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const variableStatement = variableDeclaration?.getVariableStatement();

  return Boolean(variableStatement?.hasExportKeyword());
};

const getVariableName = (call: CallExpression): string | undefined => {
  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!variableDeclaration) return undefined;

  const initializer = variableDeclaration.getInitializer();
  if (!initializer || unwrapTransparent(initializer) !== call) return undefined;

  const nameNode = variableDeclaration.getNameNode();
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
};

const readAssignmentNames = (call: CallExpression): AssignmentNames => {
  const exportAssignment = call.getFirstAncestorByKind(SyntaxKind.ExportAssignment);
  if (exportAssignment && exportAssignment.getExpression() === call) {
    return {
      exportName: "default",
      isDefaultExport: true,
    };
  }

  const variableName = getVariableName(call);
  const exportName = variableName && isExportedVariableDeclaration(call) ? variableName : undefined;

  return {
    variableName,
    exportName,
    isDefaultExport: false,
  };
};

const collectInlineMachineManagerKeys = (
  managers: readonly CallExpression[],
  catalog: SourceCatalog,
): Map<CallExpression, string[]> => {
  const keysByCall = new Map<CallExpression, string[]>();

  for (const managerCall of managers) {
    const objectArgument = readMachineOptions(managerCall);
    if (!objectArgument) continue;

    for (const property of objectArgument.getProperties()) {
      if (!Node.isPropertyAssignment(property)) continue;

      const key = propertyNameText(property.getNameNode());
      const initializer = property.getInitializer();
      if (!key || !initializer || !Node.isCallExpression(initializer)) continue;

      const provenance = resolveApiCall(initializer, catalog, "createMachine");
      if (!provenance) continue;
      if (provenance === "ambient" && !firstArgumentLooksLikeMachineConfig(initializer)) continue;

      const current = keysByCall.get(initializer) ?? [];
      current.push(key);
      keysByCall.set(initializer, current);
    }
  }

  return keysByCall;
};

export const discoverCandidates = (source: SourceAdapter, catalog: SourceCatalog): CandidateDiscoveryResult => {
  const managerCalls = catalog.calls.filter((call) => resolveApiCall(call, catalog, "MachineManager") !== undefined);
  const inlineManagerKeys = collectInlineMachineManagerKeys(managerCalls, catalog);

  const machineCandidates: MachineCandidate[] = [];
  for (const call of catalog.calls) {
    const provenance = resolveApiCall(call, catalog, "createMachine");
    if (!provenance) continue;
    if (provenance === "ambient" && !firstArgumentLooksLikeMachineConfig(call)) continue;

    machineCandidates.push({
      call,
      index: 0,
      ...readAssignmentNames(call),
      managerKeys: inlineManagerKeys.get(call) ?? [],
      provenance,
      loc: source.locFromNode(call),
    });
  }

  const machines = machineCandidates
    .sort((left, right) => left.call.getStart() - right.call.getStart())
    .map((candidate, index) => ({ ...candidate, index }));

  const managerCandidates: ManagerCandidate[] = [];
  for (const call of managerCalls) {
    const provenance = resolveApiCall(call, catalog, "MachineManager") as ApiCallProvenance;

    const names = readAssignmentNames(call);
    managerCandidates.push({
      call,
      index: 0,
      variableName: names.variableName,
      exportName: names.exportName,
      provenance,
      loc: source.locFromNode(call),
    });
  }

  const managers = managerCandidates
    .sort((left, right) => left.call.getStart() - right.call.getStart())
    .map((candidate, index) => ({ ...candidate, index }));

  return { machines, managers };
};
