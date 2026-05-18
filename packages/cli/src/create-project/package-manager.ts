import type { CreateProjectCss } from "./css/types.js";
import type { ExternalCommandOutputFilter, ExternalCommandStage } from "./dependencies.js";
import type { CreateProjectTemplate } from "./templates/types.js";

export type CreateProjectPackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type PackageManagerCommand = {
  command: string;
  args: readonly string[];
  outputFilter?: ExternalCommandOutputFilter;
};

export type ScaffoldCommandInput = {
  packageManager: CreateProjectPackageManager;
  template: CreateProjectTemplate;
  css: CreateProjectCss;
  target: string;
};

const nextArgs = (css: CreateProjectCss): readonly string[] => [
  "--yes",
  "--ts",
  "--app",
  "--src-dir",
  "--import-alias",
  "@/*",
  "--skip-install",
  "--no-agents-md",
  css === "tailwind" ? "--tailwind" : "--no-tailwind",
];

const nextScaffoldCommand = ({ css, packageManager, target }: ScaffoldCommandInput): PackageManagerCommand => {
  const args = nextArgs(css);

  switch (packageManager) {
    case "pnpm":
      return { command: "pnpm", args: ["create", "next-app@latest", target, ...args, "--use-pnpm"] };
    case "npm":
      return { command: "npm", args: ["create", "next-app@latest", target, "--", ...args, "--use-npm"] };
    case "yarn":
      return { command: "yarn", args: ["create", "next-app", target, ...args, "--use-yarn"] };
    case "bun":
      return { command: "bun", args: ["create", "next-app@latest", target, ...args, "--use-bun"] };
  }
};

const viteScaffoldCommand = ({ packageManager, target }: ScaffoldCommandInput): PackageManagerCommand => {
  switch (packageManager) {
    case "pnpm":
      return {
        command: "pnpm",
        args: ["create", "vite@latest", target, "--template", "react-ts"],
        outputFilter: "create-vite-next-steps",
      };
    case "npm":
      return {
        command: "npm",
        args: ["create", "vite@latest", target, "--", "--template", "react-ts"],
        outputFilter: "create-vite-next-steps",
      };
    case "yarn":
      return {
        command: "yarn",
        args: ["create", "vite", target, "--template", "react-ts"],
        outputFilter: "create-vite-next-steps",
      };
    case "bun":
      return {
        command: "bun",
        args: ["create", "vite@latest", target, "--template", "react-ts"],
        outputFilter: "create-vite-next-steps",
      };
  }
};

export const createScaffoldCommand = (input: ScaffoldCommandInput): PackageManagerCommand => {
  return input.template === "next" ? nextScaffoldCommand(input) : viteScaffoldCommand(input);
};

export const createInstallCommand = (packageManager: CreateProjectPackageManager): PackageManagerCommand => {
  switch (packageManager) {
    case "pnpm":
      return { command: "pnpm", args: ["install"] };
    case "npm":
      return { command: "npm", args: ["install"] };
    case "yarn":
      return { command: "yarn", args: ["install"] };
    case "bun":
      return { command: "bun", args: ["install"] };
  }
};

export const createDevCommand = (packageManager: CreateProjectPackageManager): string => {
  switch (packageManager) {
    case "pnpm":
      return "pnpm dev";
    case "npm":
      return "npm run dev";
    case "yarn":
      return "yarn dev";
    case "bun":
      return "bun run dev";
  }
};

export const commandLine = (command: Pick<PackageManagerCommand, "command" | "args">): string => {
  return [command.command, ...command.args].join(" ");
};

export const createExternalCommand = (
  command: PackageManagerCommand,
  cwd: string,
  stage: ExternalCommandStage,
) => ({
  ...command,
  cwd,
  stage,
});
