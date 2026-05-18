import { spawn } from "node:child_process";
import type { CliContext } from "../cli/context.js";

export type ExternalCommandStage = "scaffold" | "install";

export type ExternalCommand = {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  stage: ExternalCommandStage;
};

export type ExternalCommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export type CreateProjectDependencies = {
  runCommand: (command: ExternalCommand) => Promise<ExternalCommandResult>;
};

const STDERR_TAIL_LIMIT = 4_000;

const appendBoundedTail = (tail: string, chunk: string): string => {
  const next = `${tail}${chunk}`;
  return next.length > STDERR_TAIL_LIMIT ? next.slice(-STDERR_TAIL_LIMIT) : next;
};

const createCommandEnvironment = (
  context: CliContext,
  command: ExternalCommand,
): NodeJS.ProcessEnv => ({
  ...process.env,
  ...context.env,
  ...command.env,
});

export const runExternalCommand = (
  context: CliContext,
  command: ExternalCommand,
): Promise<ExternalCommandResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, [...command.args], {
      cwd: command.cwd,
      env: createCommandEnvironment(context, command),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const forwardSignal = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    const cleanup = (): void => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      context.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = appendBoundedTail(stderr, text);
      context.stderr.write(chunk);
    });
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (exitCode) => {
      cleanup();
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
};

export const createNodeCreateProjectDependencies = (context: CliContext): CreateProjectDependencies => ({
  runCommand: (command) => runExternalCommand(context, command),
});
