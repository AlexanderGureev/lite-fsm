import { EventEmitter } from "node:events";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ExternalCommand } from "../../../packages/cli/src/create-project/dependencies";
import { createCliTestContext } from "../helpers/memory-fs";

type FakeChildProcess = EventEmitter & {
  stdout?: EventEmitter;
  stderr?: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

type SpawnOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: ["ignore", "pipe", "pipe"];
};

type SpawnImplementation = (command: string, args: string[], options: SpawnOptions) => FakeChildProcess;

const createFakeChildProcess = (streams = true): FakeChildProcess => {
  const child = new EventEmitter() as FakeChildProcess;
  child.kill = vi.fn();

  if (streams) {
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
  }

  return child;
};

const createSpawnMock = (child: FakeChildProcess) => vi.fn<SpawnImplementation>(() => child);

const importDependenciesWithSpawn = async (spawn: ReturnType<typeof createSpawnMock>) => {
  vi.resetModules();
  vi.doMock("node:child_process", () => ({ spawn }));

  return import("../../../packages/cli/src/create-project/dependencies");
};

const captureProcessSignals = () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();

  vi.spyOn(process, "once").mockImplementation(((event: string | symbol, listener: (...args: unknown[]) => void) => {
    listeners.set(String(event), listener as (...args: unknown[]) => void);

    return process;
  }) as typeof process.once);
  vi.spyOn(process, "off").mockImplementation(((event: string | symbol) => {
    listeners.delete(String(event));

    return process;
  }) as typeof process.off);

  return listeners;
};

const createCommand = (patch: Partial<ExternalCommand> = {}): ExternalCommand => ({
  command: "create-demo",
  args: ["--template", "vite"],
  cwd: "/project",
  stage: "scaffold",
  ...patch,
});

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.restoreAllMocks();
});

describe("node-зависимости create-project", () => {
  it("запускает внешнюю команду, пишет stdout/stderr и ограничивает stderr tail", async () => {
    const context = {
      ...createCliTestContext({ "/project/.keep": "" }),
      env: {
        LITE_FSM_FROM_CONTEXT: "context",
        LITE_FSM_OVERRIDE: "context",
      },
    };
    const child = createFakeChildProcess();
    const spawn = createSpawnMock(child);
    const signalListeners = captureProcessSignals();
    const { createNodeCreateProjectDependencies } = await importDependenciesWithSpawn(spawn);
    const longStderr = "x".repeat(4_100);

    const result = createNodeCreateProjectDependencies(context).runCommand(createCommand({
      cwd: "/project/demo",
      env: {
        LITE_FSM_FROM_COMMAND: "command",
        LITE_FSM_OVERRIDE: "command",
      },
      stage: "install",
    }));

    expect(spawn).toHaveBeenCalledWith("create-demo", ["--template", "vite"], expect.objectContaining({
      cwd: "/project/demo",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    }));
    expect(spawn.mock.calls[0]?.[2]?.env).toEqual(expect.objectContaining({
      LITE_FSM_FROM_CONTEXT: "context",
      LITE_FSM_FROM_COMMAND: "command",
      LITE_FSM_OVERRIDE: "command",
    }));

    child.stdout?.emit("data", Buffer.from("created\n"));
    child.stderr?.emit("data", Buffer.from("warn\n"));
    child.stderr?.emit("data", Buffer.from(longStderr));
    signalListeners.get("SIGTERM")?.("SIGTERM");
    child.emit("close", 7);

    await expect(result).resolves.toEqual({
      exitCode: 7,
      stdout: "created\n",
      stderr: "x".repeat(4_000),
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(context.stdout.text()).toBe("created\n");
    expect(context.stderr.text()).toBe(`warn\n${longStderr}`);
    expect(signalListeners.size).toBe(0);
  });

  it("возвращает exitCode 1 для null close и поддерживает child без stdio streams", async () => {
    const context = createCliTestContext({ "/project/.keep": "" });
    const child = createFakeChildProcess(false);
    const spawn = createSpawnMock(child);
    captureProcessSignals();
    const { runExternalCommand } = await importDependenciesWithSpawn(spawn);

    const result = runExternalCommand(context, createCommand({
      env: undefined,
    }));
    child.emit("close", null);

    await expect(result).resolves.toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
  });

  it("скрывает преждевременный блок next steps от create-vite", async () => {
    const context = createCliTestContext({ "/project/.keep": "" });
    const child = createFakeChildProcess();
    const spawn = createSpawnMock(child);
    captureProcessSignals();
    const { runExternalCommand } = await importDependenciesWithSpawn(spawn);

    const result = runExternalCommand(context, createCommand({
      outputFilter: "create-vite-next-steps",
    }));
    child.stdout?.emit("data", Buffer.from("│\n◇  Scaffolding project in /project/demo...\n│\n└  Do"));
    child.stdout?.emit("data", Buffer.from("ne. Now run:\n\n  cd demo\n  npm install\n  npm run dev\n"));
    child.emit("close", 0);

    await expect(result).resolves.toEqual({
      exitCode: 0,
      stdout: "│\n◇  Scaffolding project in /project/demo...\n│\n└  Done. Now run:\n\n  cd demo\n  npm install\n  npm run dev\n",
      stderr: "",
    });
    expect(context.stdout.text()).toBe("│\n◇  Scaffolding project in /project/demo...\n│\n");
  });

  it("сбрасывает отложенный stdout create-vite фильтра без next steps маркера", async () => {
    const context = createCliTestContext({ "/project/.keep": "" });
    const child = createFakeChildProcess();
    const spawn = createSpawnMock(child);
    captureProcessSignals();
    const { runExternalCommand } = await importDependenciesWithSpawn(spawn);

    const result = runExternalCommand(context, createCommand({
      outputFilter: "create-vite-next-steps",
    }));
    child.stdout?.emit("data", Buffer.from("short scaffold output\n"));
    child.emit("close", 0);

    await expect(result).resolves.toEqual({
      exitCode: 0,
      stdout: "short scaffold output\n",
      stderr: "",
    });
    expect(context.stdout.text()).toBe("short scaffold output\n");
  });

  it("подавляет create-vite next steps, если маркер пришел в начале буфера", async () => {
    const context = createCliTestContext({ "/project/.keep": "" });
    const child = createFakeChildProcess();
    const spawn = createSpawnMock(child);
    captureProcessSignals();
    const { runExternalCommand } = await importDependenciesWithSpawn(spawn);

    const result = runExternalCommand(context, createCommand({
      outputFilter: "create-vite-next-steps",
    }));
    child.stdout?.emit("data", Buffer.from("Done. Now run:\n\n  cd demo\n"));
    child.stdout?.emit("data", Buffer.from("  npm install\n  npm run dev\n"));
    child.emit("close", 0);

    await expect(result).resolves.toEqual({
      exitCode: 0,
      stdout: "Done. Now run:\n\n  cd demo\n  npm install\n  npm run dev\n",
      stderr: "",
    });
    expect(context.stdout.text()).toBe("");
  });

  it("отклоняет promise при spawn error и чистит signal listeners", async () => {
    const context = createCliTestContext({ "/project/.keep": "" });
    const child = createFakeChildProcess();
    const spawn = createSpawnMock(child);
    const signalListeners = captureProcessSignals();
    const { runExternalCommand } = await importDependenciesWithSpawn(spawn);

    const result = runExternalCommand(context, createCommand());
    child.emit("error", new Error("binary missing"));

    await expect(result).rejects.toThrow("binary missing");
    expect(signalListeners.size).toBe(0);
  });
});
