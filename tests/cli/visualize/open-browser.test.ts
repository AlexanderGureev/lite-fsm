import { describe, expect, it, vi } from "vitest";
import {
  createBrowserOpenCommand,
  openBrowser,
  type BrowserProcess,
} from "../../../packages/cli/src/visualize/open-browser";

type BrowserListeners = {
  spawn?: () => void;
  error?: (error: Error) => void;
};

describe("открытие browser visualize", () => {
  it("выбирает platform command без shell и передает URL отдельным аргументом", async () => {
    expect(createBrowserOpenCommand("darwin", "http://local")).toEqual({ command: "open", args: ["http://local"] });
    expect(createBrowserOpenCommand("win32", "http://local")).toEqual({
      command: "cmd.exe",
      args: ["/c", "start", "", "http://local"],
    });
    expect(createBrowserOpenCommand("linux", "http://local")).toEqual({ command: "xdg-open", args: ["http://local"] });

    const listeners: BrowserListeners = {};
    const processMock: BrowserProcess = {
      once(...[event, listener]) {
        if (event === "spawn") listeners.spawn = listener;
        else listeners.error = listener;

        return processMock;
      },
      unref: vi.fn(),
    };
    const spawnProcess = vi.fn(() => processMock);
    const opened = openBrowser("http://local", { platform: "linux", spawnProcess });

    listeners.spawn?.();
    listeners.error?.(new Error("late error"));
    await opened;

    expect(spawnProcess).toHaveBeenCalledWith("xdg-open", ["http://local"], {
      shell: false,
      stdio: "ignore",
      detached: true,
    });
    expect(processMock.unref).toHaveBeenCalledTimes(1);
  });

  it("пробрасывает spawn error", async () => {
    const listeners: BrowserListeners = {};
    const processMock: BrowserProcess = {
      once(...[event, listener]) {
        if (event === "spawn") listeners.spawn = listener;
        else listeners.error = listener;

        return processMock;
      },
    };
    const opened = openBrowser("http://local", {
      spawnProcess: vi.fn(() => processMock),
    });

    listeners.error?.(new Error("missing xdg-open"));

    await expect(opened).rejects.toThrow("missing xdg-open");
  });

  it("успешно завершается без optional unref", async () => {
    const listeners: BrowserListeners = {};
    const processMock: BrowserProcess = {
      once(...[event, listener]) {
        if (event === "spawn") listeners.spawn = listener;
        else listeners.error = listener;

        return processMock;
      },
    };
    const opened = openBrowser("http://local", {
      spawnProcess: vi.fn(() => processMock),
    });

    listeners.spawn?.();

    await expect(opened).resolves.toBeUndefined();
  });
});
