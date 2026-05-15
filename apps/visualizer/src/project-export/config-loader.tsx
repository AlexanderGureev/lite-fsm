import { useEffect } from "react";
import { useWorkbenchContext } from "../app/workbench-context";
import { parseProjectGraphExportDocumentText } from "./parser";
import type { ProjectGraphExportParseIssue } from "./types";

const CONFIG_PARAM = "config";
const DEFAULT_FILE_NAME = "project-export.json";
const supportedProtocols = new Set(["http:", "https:"]);

let startedConfigHref: string | undefined;

export type ProjectExportConfigUrlResult =
  | { ok: true; url: URL }
  | { ok: false; issue: ProjectGraphExportParseIssue };

export const resetProjectExportConfigLoaderForTests = () => {
  startedConfigHref = undefined;
};

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
          message: `Project graph export URL must use http(s) or a root-relative path.`,
        },
      };
    }

    return { ok: true, url };
  } catch {
    return {
      ok: false,
      issue: {
        code: "invalid-document",
        message: `Project graph export URL must be absolute or root-relative.`,
      },
    };
  }
};

export const projectExportFileNameFromUrl = (url: URL): string => {
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return lastSegment || DEFAULT_FILE_NAME;
};

export const ProjectExportConfigLoader = () => {
  const { dispatch } = useWorkbenchContext();

  useEffect(() => {
    const config = new URLSearchParams(window.location.search).get(CONFIG_PARAM);
    if (config === null) return;

    const resolved = resolveProjectExportConfigUrl(config, window.location.origin);
    if (!resolved.ok) {
      dispatch({
        type: "project-export.load.failed",
        fileName: config.trim() || DEFAULT_FILE_NAME,
        issue: resolved.issue,
      });
      return;
    }

    if (startedConfigHref === resolved.url.href) return;
    startedConfigHref = resolved.url.href;
    const fileName = projectExportFileNameFromUrl(resolved.url);

    const load = async () => {
      try {
        const response = await fetch(resolved.url.href, { credentials: "same-origin" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = parseProjectGraphExportDocumentText(await response.text());
        if (result.ok) {
          dispatch({ type: "project-export.loaded", fileName, exportDocument: result.document });
          return;
        }

        dispatch({ type: "project-export.load.failed", fileName, issue: result.issue });
      } catch (error) {
        dispatch({
          type: "project-export.load.failed",
          fileName,
          issue: {
            code: "invalid-json",
            message: error instanceof Error ? error.message : "Could not load project graph export.",
          },
        });
      }
    };

    void load();
  }, [dispatch]);

  return null;
};
