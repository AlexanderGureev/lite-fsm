import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

declare const __LITE_FSM_CREATE_PROJECT_DEPENDENCIES__: Readonly<Record<string, string>> | undefined;

type PackageJson = {
  version: string;
  devDependencies?: Record<string, string>;
};

/* v8 ignore start -- jiti dev-runner fallback; build and tests inject these values through bundler define. */
const readPackageJson = (workspaceRoot: string, path: string): PackageJson => {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8")) as PackageJson;
};

const readWorkspaceDependencyVersions = (): Readonly<Record<string, string>> => {
  const workspaceRoot = fileURLToPath(new URL("../../../..", import.meta.url));
  const corePackage = readPackageJson(workspaceRoot, "packages/core/package.json");
  const middlewarePackage = readPackageJson(workspaceRoot, "packages/middleware/package.json");
  const reactPackage = readPackageJson(workspaceRoot, "packages/react/package.json");
  const rootPackage = readPackageJson(workspaceRoot, "package.json");

  return {
    "@lite-fsm/core": `^${corePackage.version}`,
    "@lite-fsm/middleware": `^${middlewarePackage.version}`,
    "@lite-fsm/react": `^${reactPackage.version}`,
    immer: rootPackage.devDependencies?.immer ?? "^11.1.0",
  };
};
/* v8 ignore stop */

/* v8 ignore next 4 -- build and tests define the constant; fallback is covered by the ignored dev-runner path above. */
const definedCreateProjectDependencies =
  typeof __LITE_FSM_CREATE_PROJECT_DEPENDENCIES__ === "undefined"
    ? undefined
    : __LITE_FSM_CREATE_PROJECT_DEPENDENCIES__;

export const createProjectLiteFsmDependencies =
  definedCreateProjectDependencies ??
  /* v8 ignore next -- fallback is used only by the jiti dev runner. */
  readWorkspaceDependencyVersions();
