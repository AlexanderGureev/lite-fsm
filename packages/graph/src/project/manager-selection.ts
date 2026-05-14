import { Node, SyntaxKind, type ArrowFunction, type CallExpression, type FunctionExpression } from "ts-morph";
import { unwrapTransparent } from "../compiler/ast";
import { discoverCandidates, type ManagerCandidate } from "../compiler/candidates";
import { projectDiagnostic } from "./diagnostics";
import { readImportTable } from "./imports";
import type { ProjectStep } from "./result";
import { projectFail, projectOk } from "./result";
import type { ProjectSourceUnit } from "./source-units";

const managerProvenanceUnsupported = (entryUnit: ProjectSourceUnit): boolean => {
  const imports = readImportTable(entryUnit);

  return entryUnit.catalog.calls.some((call) => {
    const expression = call.getExpression();
    if (!Node.isIdentifier(expression)) return false;

    const localName = expression.getText();
    if (entryUnit.catalog.resolveApiIdentifier(localName, "MachineManager") !== undefined) return false;
    if (localName === "MachineManager") return true;

    return imports.namedImports.get(localName)?.importedName === "MachineManager";
  });
};

const functionAncestorOf = (call: CallExpression): ArrowFunction | FunctionExpression | undefined => {
  const ancestors = call.getAncestors();

  return ancestors.find((ancestor): ancestor is ArrowFunction | FunctionExpression => {
    return Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor);
  });
};

const isTopLevelVariableInitializer = (call: CallExpression): boolean => {
  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!variableDeclaration) return false;

  const nameNode = variableDeclaration.getNameNode();
  if (!Node.isIdentifier(nameNode)) return false;

  const initializer = variableDeclaration.getInitializer();
  if (!initializer || unwrapTransparent(initializer) !== call) return false;

  const statement = variableDeclaration.getVariableStatement();

  return statement?.getParent() === call.getSourceFile();
};

const isTopLevelExpressionStatement = (call: CallExpression): boolean => {
  const statement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  if (!statement) return false;

  return unwrapTransparent(statement.getExpression()) === call && statement.getParent() === call.getSourceFile();
};

const isSupportedFactoryCall = (call: CallExpression, factory: ArrowFunction | FunctionExpression): boolean => {
  const factoryDeclaration = factory.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!factoryDeclaration || factoryDeclaration.getInitializer() !== factory) return false;
  if (factoryDeclaration.getVariableStatement()?.getParent() !== call.getSourceFile()) return false;

  const nestedFunction = call.getAncestors().find((ancestor) => {
    if (ancestor === factory) return false;

    return Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor) || Node.isFunctionDeclaration(ancestor);
  });
  if (nestedFunction) return false;

  const body = factory.getBody();
  if (Node.isCallExpression(body) && body === call) return true;
  if (!Node.isBlock(body)) return false;

  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const variableNameNode = variableDeclaration?.getNameNode();
  if (!variableDeclaration || variableDeclaration.getInitializer() !== call || !Node.isIdentifier(variableNameNode)) {
    return false;
  }

  const managerName = variableNameNode.getText();

  return body.getStatements().some((statement) => {
    if (!Node.isReturnStatement(statement)) return false;

    const expression = statement.getExpression();
    return Node.isIdentifier(expression) && expression.getText() === managerName;
  });
};

const isSupportedManagerCandidate = (manager: ManagerCandidate): boolean => {
  const factory = functionAncestorOf(manager.call);
  if (factory) return isSupportedFactoryCall(manager.call, factory);

  return isTopLevelVariableInitializer(manager.call) || isTopLevelExpressionStatement(manager.call);
};

export const selectProjectManager = (
  entryUnit: ProjectSourceUnit,
): ProjectStep<ManagerCandidate> => {
  const candidates = discoverCandidates(entryUnit.source, entryUnit.catalog).managers.filter(isSupportedManagerCandidate);

  if (candidates.length === 1) return projectOk(candidates[0] as ManagerCandidate);
  if (candidates.length > 1) {
    return projectFail([
      projectDiagnostic(
        "LFG_PROJECT_MANAGER_AMBIGUOUS",
        "error",
        "Project entry contains more than one supported MachineManager call.",
        candidates[1]?.loc,
      ),
    ]);
  }

  if (managerProvenanceUnsupported(entryUnit)) {
    return projectFail([
      projectDiagnostic(
        "LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED",
        "error",
        "MachineManager must be imported from @lite-fsm/core or lite-fsm.",
      ),
    ]);
  }

  return projectFail([
    projectDiagnostic(
      "LFG_PROJECT_MANAGER_NOT_FOUND",
      "error",
      "Project entry must contain a MachineManager call.",
    ),
  ]);
};
