import { projectExportFileNameFromUrl, resolveProjectExportConfigUrl } from "./project-export-entry";
import type { StartupResolvedInput } from "./types";

export const resolveStartupInput = (
  search: string,
  origin: string,
): StartupResolvedInput => {
  const params = new URLSearchParams(search);
  const session = params.get("session");
  if (session !== null) {
    const token = session.trim();
    return { kind: "local-session", token, key: `local-session:${token}` };
  }

  const config = params.get("config");
  if (config !== null) {
    const resolved = resolveProjectExportConfigUrl(config, origin);
    if (!resolved.ok) {
      return {
        kind: "project-export",
        key: `project-export:invalid:${config}`,
        configValue: config,
        fileName: config.trim() || "project-export.json",
        issue: resolved.issue,
      };
    }

    return {
      kind: "project-export",
      key: `project-export:${resolved.url.href}`,
      configValue: config,
      fileName: projectExportFileNameFromUrl(resolved.url),
      url: resolved.url,
    };
  }

  return { kind: "pasted-source", key: "pasted-source" };
};
