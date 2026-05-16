import { useEffect } from "react";
import { useWorkbenchContext } from "../app/workbench-context";
import { MUSIC_APP_SAMPLE_SOURCE, createSourceSession } from "../source";
import { resolveStartupInput } from "./resolve-startup-input";
import { localSessionEntry } from "./local-session-entry";
import { projectExportEntry } from "./project-export-entry";
import type { StartupEntry, StartupLoadIssue, StartupLoadResult, StartupResolvedInput } from "./types";

const startedStartupKeys = new Set<string>();

const entries: Record<StartupResolvedInput["kind"], StartupEntry> = {
  "pasted-source": {
    kind: "pasted-source",
    async load(): Promise<StartupLoadResult> {
      return {
        kind: "source-input",
        inputMode: {
          kind: "pasted-source",
          source: createSourceSession({ source: MUSIC_APP_SAMPLE_SOURCE, filename: "sample.ts" }),
        },
      };
    },
  },
  "project-export": projectExportEntry,
  "local-session": localSessionEntry,
};

const startupIssueFromError = (error: unknown): StartupLoadIssue => {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const issue = error as { code: string; message: string; path?: string };
    return {
      code: issue.code as StartupLoadIssue["code"],
      message: issue.message,
      ...(issue.path ? { path: issue.path } : {}),
    };
  }

  return {
    code: "network-error",
    message: error instanceof Error ? error.message : "Could not start visualizer input.",
  };
};

export const resetStartupLoaderForTests = (): void => {
  startedStartupKeys.clear();
};

export function StartupLoader() {
  const { dispatch } = useWorkbenchContext();

  useEffect(() => {
    const startup = resolveStartupInput(window.location.search, window.location.origin);
    if (startedStartupKeys.has(startup.key)) return undefined;
    startedStartupKeys.add(startup.key);

    const entry = entries[startup.kind];
    void entry
      .load({
        startup,
        fetch: window.fetch.bind(window),
        origin: window.location.origin,
      })
      .then((result) => {
        dispatch({ type: "startup.loaded", result });
      })
      .catch((error: unknown) => {
        dispatch({
          type: "startup.load.failed",
          entryKind: startup.kind,
          issue: startupIssueFromError(error),
        });
      });

    return undefined;
  }, [dispatch]);

  return null;
}
