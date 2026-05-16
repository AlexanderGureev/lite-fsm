import { spawn } from "node:child_process";

export type BrowserPlatform = NodeJS.Platform;

export type BrowserOpenCommand = {
  command: string;
  args: string[];
};

type BrowserProcessListenerArgs =
  | [event: "spawn", listener: () => void]
  | [event: "error", listener: (error: Error) => void];

export type BrowserProcess = {
  once(...args: BrowserProcessListenerArgs): BrowserProcess;
  unref?(): void;
};

export type BrowserSpawner = (
  command: string,
  args: readonly string[],
  options: { shell: false; stdio: "ignore"; detached: true },
) => BrowserProcess;

export type OpenBrowserOptions = {
  platform?: BrowserPlatform;
  spawnProcess?: BrowserSpawner;
};

/* v8 ignore start -- unit tests inject BrowserSpawner; this adapter is exercised by CLI smoke/manual runs. */
const nodeBrowserSpawner: BrowserSpawner = (command, args, options) => {
  const child = spawn(command, [...args], options);

  return {
    once(...[event, listener]) {
      if (event === "spawn") child.once(event, listener);
      else child.once(event, listener);

      return this;
    },
    unref() {
      child.unref();
    },
  };
};
/* v8 ignore stop */

export const createBrowserOpenCommand = (platform: BrowserPlatform, url: string): BrowserOpenCommand => {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd.exe", args: ["/c", "start", "", url] };

  return { command: "xdg-open", args: [url] };
};

export const openBrowser = (url: string, options: OpenBrowserOptions = {}): Promise<void> =>
  new Promise((resolve, reject) => {
    const { command, args } = createBrowserOpenCommand(options.platform ?? process.platform, url);
    /* v8 ignore next -- real process spawning is covered through the injected spawn contract in unit tests. */
    const spawnProcess = options.spawnProcess ?? nodeBrowserSpawner;
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      callback();
    };

    const child = spawnProcess(command, args, {
      shell: false,
      stdio: "ignore",
      detached: true,
    });

    child.once("spawn", () => {
      child.unref?.();
      settle(resolve);
    });
    child.once("error", (error) => {
      settle(() => reject(error));
    });
  });
