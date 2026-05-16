import type { URL } from "node:url";
import type { CliContext } from "../cli/context.js";
import type { LiteFsmProjectGraphExportDocument } from "../export-graph/export-document.js";
import type { VisualizerSession } from "./session.js";

export type VisualizeOptions = {
  entry: string;
  tsconfig?: string;
  port: number;
  noOpen: boolean;
};

export type VisualizerHostCapabilities = {
  mode: "local";
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canApplyPatch: boolean;
  projectRoot: string;
};

export type VisualizerSessionResponse = {
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

export type VisualizerSourceResponse = {
  ok: true;
  fileName: string;
  language: "ts";
  hash: string;
  text: string;
};

export type VisualizerErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

export type VisualizerHttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
};

export type VisualizerHttpRequest = {
  method?: string;
  url?: string;
};

export type VisualizerHttpResponseWriter = {
  writeHead(statusCode: number, headers?: Record<string, string>): unknown;
  end(data?: Uint8Array): unknown;
};

export type VisualizerRouteContext = {
  request: VisualizerHttpRequest;
  url: URL;
  cliContext: CliContext;
  session: VisualizerSession;
};

export type VisualizerRoute = {
  method: "GET" | "POST";
  path: string;
  auth: "none" | "session";
  handle(context: VisualizerRouteContext): Promise<VisualizerHttpResponse> | VisualizerHttpResponse;
};
