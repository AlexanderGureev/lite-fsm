import { spawn } from "node:child_process";
import type { CliContext } from "../cli/context.js";

export type ExternalCommandStage = "scaffold" | "install";
export type ExternalCommandOutputFilter = "create-vite-next-steps";

export type ExternalCommand = {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  stage: ExternalCommandStage;
  outputFilter?: ExternalCommandOutputFilter;
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
const CREATE_VITE_NEXT_STEPS_MARKER = "Done. Now run:";
const CREATE_VITE_NEXT_STEPS_TAIL_LIMIT = CREATE_VITE_NEXT_STEPS_MARKER.length + 8;

const appendBoundedTail = (tail: string, chunk: string): string => {
  const next = `${tail}${chunk}`;
  return next.length > STDERR_TAIL_LIMIT ? next.slice(-STDERR_TAIL_LIMIT) : next;
};

const createCreateViteNextStepsFilter = () => {
  let pending = "";
  let suppressing = false;

  return {
    write(text: string): string {
      if (suppressing) return "";

      const next = `${pending}${text}`;
      const markerIndex = next.indexOf(CREATE_VITE_NEXT_STEPS_MARKER);

      if (markerIndex !== -1) {
        suppressing = true;
        pending = "";

        const lineStart = next.lastIndexOf("\n", markerIndex);
        return lineStart === -1 ? "" : next.slice(0, lineStart + 1);
      }

      const emitLength = Math.max(0, next.length - CREATE_VITE_NEXT_STEPS_TAIL_LIMIT);
      pending = next.slice(emitLength);

      return next.slice(0, emitLength);
    },
    flush(): string {
      if (suppressing) return "";

      const text = pending;
      pending = "";
      return text;
    },
  };
};

const createStdoutFilter = (command: ExternalCommand) => {
  return command.outputFilter === "create-vite-next-steps" ? createCreateViteNextStepsFilter() : undefined;
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
    const stdoutFilter = createStdoutFilter(command);

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
      const text = chunk.toString("utf8");
      stdout += text;
      const output = stdoutFilter?.write(text) ?? text;
      if (output) context.stdout.write(output);
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
      const output = stdoutFilter?.flush();
      if (output) context.stdout.write(output);
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
