import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath } from "../project/source-cache.js";
import type { VisualizerHttpResponse } from "./types.js";

export type ServeStaticAssetOptions = {
  staticRoot: string;
  pathname: string;
  method?: string;
};

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const textResponse = (status: number, body: string): VisualizerHttpResponse => ({
  status,
  headers: { "content-type": "text/plain; charset=utf-8" },
  body,
});

export const defaultVisualizerStaticRoot = (): string => {
  return normalizeAbsolutePath(fileURLToPath(new URL("../visualizer", import.meta.url)));
};

export const verifyVisualizerStaticArtifact = (
  context: CliContext,
  staticRoot = defaultVisualizerStaticRoot(),
): { ok: true; staticRoot: string } | { ok: false; diagnostics: CliDiagnostic[] } => {
  const root = normalizeAbsolutePath(staticRoot);
  const indexPath = normalizeAbsolutePath(resolve(root, "index.html"));

  if (context.fs.fileExists(indexPath)) return { ok: true, staticRoot: root };

  return {
    ok: false,
    diagnostics: [
      cliDiagnostic("LFC_VISUALIZER_STATIC_MISSING", "error", "Visualizer static artifact is missing.", {
        file: indexPath,
        hint: "Run the @lite-fsm/cli build pipeline so apps/visualizer/dist is copied to packages/cli/dist/visualizer.",
      }),
    ],
  };
};

const decodePathname = (pathname: string): string | undefined => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
};

const bodyForFile = (context: CliContext, fileName: string): Uint8Array => {
  return context.fs.readFileBuffer?.(fileName) ?? Buffer.from(context.fs.readFile(fileName), "utf8");
};

const fileResponse = (context: CliContext, fileName: string): VisualizerHttpResponse => {
  const extension = extname(fileName);
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) return textResponse(404, "Not found\n");

  return {
    status: 200,
    headers: {
      "content-type": contentType,
    },
    body: bodyForFile(context, fileName),
  };
};

export const serveStaticAsset = (
  context: CliContext,
  { staticRoot, pathname, method = "GET" }: ServeStaticAssetOptions,
): VisualizerHttpResponse => {
  if (method !== "GET") {
    return {
      status: 405,
      headers: {
        "allow": "GET",
        "content-type": "text/plain; charset=utf-8",
      },
      body: `Method ${method} is not allowed.\n`,
    };
  }

  const root = normalizeAbsolutePath(staticRoot);
  const decodedPathname = decodePathname(pathname);
  if (decodedPathname === undefined || decodedPathname.includes("\\")) return textResponse(404, "Not found\n");
  if (decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) {
    return textResponse(404, "Not found\n");
  }

  const isAssetRequest = decodedPathname === "/assets" || decodedPathname.startsWith("/assets/");
  const relativePath = decodedPathname === "/" || !isAssetRequest ? "index.html" : decodedPathname.slice(1);
  const fileName = normalizeAbsolutePath(resolve(root, relativePath));

  if (!context.fs.fileExists(fileName)) return textResponse(404, "Not found\n");

  return fileResponse(context, fileName);
};
