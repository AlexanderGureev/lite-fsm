import { STATIC_HOST_CAPABILITIES } from "../services";
import { parseProjectGraphExportDocumentText } from "../project-export";
import type { ProjectGraphExportParseIssue } from "../project-export";
import type { StartupEntry, StartupLoadInput, StartupLoadResult } from "./types";

const CONFIG_PARAM = "config";
const DEFAULT_FILE_NAME = "project-export.json";
const supportedProtocols = new Set(["http:", "https:"]);

export type ProjectExportConfigUrlResult =
  | { ok: true; url: URL }
  | { ok: false; issue: ProjectGraphExportParseIssue };

export const resolveProjectExportConfigUrl = (
  value: string | null,
  origin: string,
): ProjectExportConfigUrlResult => {
  const raw = value?.trim();
  if (!raw) {
    return {
      ok: false,
      issue: { code: "invalid-document", message: `Query parameter "${CONFIG_PARAM}" is empty.` },
    };
  }

  try {
    const url = raw.startsWith("/") ? new URL(raw, origin) : new URL(raw);
    if (!supportedProtocols.has(url.protocol)) {
      return {
        ok: false,
        issue: {
          code: "invalid-document",
          message: "Project graph export URL must use http(s) or a root-relative path.",
        },
      };
    }

    return { ok: true, url };
  } catch {
    return {
      ok: false,
      issue: {
        code: "invalid-document",
        message: "Project graph export URL must be absolute or root-relative.",
      },
    };
  }
};

export const projectExportFileNameFromUrl = (url: URL): string => {
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return lastSegment || DEFAULT_FILE_NAME;
};

export const loadProjectExportEntry = async ({
  startup,
  fetch,
}: StartupLoadInput): Promise<StartupLoadResult> => {
  if (startup.kind !== "project-export") {
    throw { code: "invalid-document", message: "Project export startup entry received a different input kind." } satisfies ProjectGraphExportParseIssue;
  }
  if (startup.issue) throw startup.issue;
  if (!startup.url) {
    throw { code: "invalid-document", message: "Project graph export URL is missing." } satisfies ProjectGraphExportParseIssue;
  }

  const response = await fetch(startup.url.href, { credentials: "same-origin" });
  if (!response.ok) throw { code: "invalid-json", message: `HTTP ${response.status}` } satisfies ProjectGraphExportParseIssue;

  const result = parseProjectGraphExportDocumentText(await response.text());
  if (!result.ok) throw result.issue;

  return {
    kind: "graph-document-input",
    inputMode: {
      kind: "project-export",
      fileName: startup.fileName,
      document: result.document.graph,
      files: result.document.files,
      entryPath: result.document.entry.path,
      ...(result.document.sources ? { sources: result.document.sources } : {}),
    },
    document: result.document.graph,
    hostCapabilities: STATIC_HOST_CAPABILITIES,
    consoleTitle: "Project export pipeline started",
    consoleMessage: `Loaded ${startup.fileName} (entry ${result.document.entry.path}) from CLI JSON export.`,
  };
};

export const projectExportEntry: StartupEntry = {
  kind: "project-export",
  load: loadProjectExportEntry,
};
