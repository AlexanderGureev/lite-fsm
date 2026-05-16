import { parseProjectGraphExportDocument, type LiteFsmProjectGraphExportDocument } from "../project-export";
import type { VisualizerHostCapabilities } from "../services";
import type { StartupEntry, StartupLoadInput, StartupLoadIssue, StartupLoadResult } from "./types";

type LocalSessionApiResponse = {
  ok: true;
  sessionId: string;
  capabilities: VisualizerHostCapabilities;
  entry: {
    path: string;
    tsconfigPath?: string;
  };
  projectRoot: string;
  exportDocument: LiteFsmProjectGraphExportDocument;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidResponse = (message: string): StartupLoadIssue => ({ code: "invalid-response", message });

const isLocalSessionApiResponse = (value: unknown): value is LocalSessionApiResponse => {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.sessionId !== "string" || typeof value.projectRoot !== "string") return false;
  if (!isRecord(value.capabilities) || !isRecord(value.entry) || !isRecord(value.exportDocument)) return false;

  return typeof value.entry.path === "string";
};

const sessionApiUrl = (token: string, origin: string): string => {
  const url = new URL("/api/session", origin);
  url.searchParams.set("token", token);

  return url.href;
};

export const loadLocalSessionEntry = async ({
  startup,
  fetch,
  origin,
}: StartupLoadInput): Promise<StartupLoadResult> => {
  if (startup.kind !== "local-session") {
    throw invalidResponse("Local session startup entry received a different input kind.");
  }
  if (!startup.token) throw { code: "invalid-session", message: "Query parameter \"session\" is empty." } satisfies StartupLoadIssue;

  let body: unknown;
  try {
    const response = await fetch(sessionApiUrl(startup.token, origin), { credentials: "same-origin" });
    body = await response.json() as unknown;
  } catch (error) {
    throw {
      code: "network-error",
      message: error instanceof Error ? error.message : "Could not load local visualizer session.",
    } satisfies StartupLoadIssue;
  }

  if (isRecord(body) && body.ok === false && typeof body.message === "string") {
    throw {
      code: typeof body.code === "string" ? body.code : "invalid-session",
      message: body.message,
    } satisfies StartupLoadIssue;
  }

  if (!isLocalSessionApiResponse(body)) throw invalidResponse("Local session API returned an invalid response.");

  const parsed = parseProjectGraphExportDocument(body.exportDocument);
  if (!parsed.ok) throw parsed.issue;

  const capabilities = {
    ...body.capabilities,
    projectRoot: body.capabilities.projectRoot ?? body.projectRoot,
  };

  return {
    kind: "graph-document-input",
    inputMode: {
      kind: "local-session",
      sessionId: body.sessionId,
      token: startup.token,
      capabilities,
      files: parsed.document.files,
      entryPath: body.entry.path,
      ...(body.entry.tsconfigPath ? { tsconfigPath: body.entry.tsconfigPath } : {}),
    },
    document: parsed.document.graph,
    hostCapabilities: capabilities,
    consoleTitle: "Local session pipeline started",
    consoleMessage: `Loaded local session ${body.sessionId} (entry ${body.entry.path}).`,
  };
};

export const localSessionEntry: StartupEntry = {
  kind: "local-session",
  load: loadLocalSessionEntry,
};
