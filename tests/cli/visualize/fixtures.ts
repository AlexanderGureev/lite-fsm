import { vi } from "vitest";
import type { GraphDiagnostic, LiteFsmGraphProjectResult } from "../../../packages/graph/src";
import { createProjectGraphExportDocument } from "../../../packages/cli/src/export-graph/export-document";
import type { ProjectGraphBuildResult } from "../../../packages/cli/src/project/build-project-graph";
import {
  createGraphCompatibleSourceHash,
  createVisualizerSession,
  type VisualizerSession,
} from "../../../packages/cli/src/visualize/session";
import type {
  CreateVisualizerHttpServer,
  VisualizerHttpServer,
} from "../../../packages/cli/src/visualize/server";
import type {
  VisualizerHttpRequest,
  VisualizerHttpResponseWriter,
} from "../../../packages/cli/src/visualize/types";
import { createCliTestContext } from "../helpers/memory-fs";

export const projectRoot = "/project";
export const sourceText = "export const store = 1;";
export const sourceHash = createGraphCompatibleSourceHash(sourceText);
export const sourceFile = {
  fileName: "src/store.ts",
  language: "ts" as const,
  roles: ["entry"] as const,
  hash: sourceHash,
};

export const staticRoot = "/cli/dist/visualizer";
export const staticFiles = {
  [`${staticRoot}/index.html`]: "<div id=\"root\"></div>",
  [`${staticRoot}/assets/app.js`]: "console.log('app');",
  [`${staticRoot}/assets/app.css`]: "body{}",
  [`${staticRoot}/assets/icon.svg`]: "<svg />",
  [`${staticRoot}/assets/image.png`]: "png",
  [`${staticRoot}/assets/favicon.ico`]: "ico",
  [`${staticRoot}/assets/manifest.json`]: "{}",
  [`${staticRoot}/assets/app.js.map`]: "{}",
};

export const createGraphResult = (
  diagnostics: GraphDiagnostic[] = [],
  files = [sourceFile],
): LiteFsmGraphProjectResult => ({
  document: {
    version: "lite-fsm.graph/v1",
    source: {
      filename: "src/store.ts",
      language: "ts",
      kind: "project",
      entryFileName: "src/store.ts",
      files: files.map((file) => ({ fileName: file.fileName, language: file.language, hash: file.hash })),
    },
    machines: [],
    managers: [],
    diagnostics,
  },
  diagnostics,
  files,
});

export const createBuildResult = (overrides: Partial<ProjectGraphBuildResult> = {}): ProjectGraphBuildResult => ({
  project: {
    entryPath: "src/store.ts",
    absoluteEntryPath: "/project/src/store.ts",
    projectRoot,
    tsconfigPath: "tsconfig.json",
  },
  graphResult: createGraphResult(),
  diagnostics: [],
  blocking: false,
  ...overrides,
});

export const createSession = (graphResult = createGraphResult(), token = "token-123"): VisualizerSession =>
  createVisualizerSession({
    projectRoot,
    graphResult,
    token,
    sessionId: "session-1",
    exportDocument: createProjectGraphExportDocument({
      entryPath: "src/store.ts",
      tsconfigPath: "tsconfig.json",
      graphResult,
      diagnostics: [],
    }),
  });

export const createVisualizeContext = (files: Record<string, string> = {}) =>
  createCliTestContext({
    "/project/tsconfig.json": JSON.stringify({ compilerOptions: { moduleResolution: "bundler" } }),
    "/project/src/store.ts": sourceText,
    ...staticFiles,
    ...files,
  });

export const requestOf = (method?: string, url?: string): VisualizerHttpRequest => ({ method, url });

export const responseWriterOf = (): VisualizerHttpResponseWriter & {
  writeHead: ReturnType<typeof vi.fn<(statusCode: number, headers?: Record<string, string>) => void>>;
  end: ReturnType<typeof vi.fn<(data?: Uint8Array) => void>>;
} => ({
  writeHead: vi.fn<(statusCode: number, headers?: Record<string, string>) => void>(),
  end: vi.fn<(data?: Uint8Array) => void>(),
});

type FakeServerMode = "listening" | "busy" | "failed";
type FakeListeners = {
  error?: (error: NodeJS.ErrnoException) => void;
  listening?: () => void;
};
type FakeVisualizerHttpServer = VisualizerHttpServer & {
  listen: ReturnType<typeof vi.fn<(port: number, host: string) => void>>;
  close: ReturnType<typeof vi.fn<(callback: (error?: Error) => void) => void>>;
};

const listenError = (code: string, message: string): NodeJS.ErrnoException => Object.assign(new Error(message), { code });

export const createFakeHttpServer = (mode: FakeServerMode = "listening") => {
  const listeners: FakeListeners = {};
  let requestHandler: Parameters<CreateVisualizerHttpServer>[0] | undefined;

  const fakeServer: FakeVisualizerHttpServer = {
    once(...[event, listener]) {
      if (event === "error") listeners.error = listener;
      else listeners.listening = listener;

      return fakeServer;
    },
    removeListener(...[event, listener]) {
      if (event === "error" && listeners.error === listener) delete listeners.error;
      if (event === "listening" && listeners.listening === listener) delete listeners.listening;

      return fakeServer;
    },
    listen: vi.fn((): void => {
      queueMicrotask(() => {
        if (mode === "busy") listeners.error?.(listenError("EADDRINUSE", "busy"));
        else if (mode === "failed") listeners.error?.(listenError("EPERM", "denied"));
        else listeners.listening?.();
      });
    }),
    close: vi.fn((callback: (error?: Error) => void) => callback()),
  };
  const createHttpServer: CreateVisualizerHttpServer = (handler) => {
    requestHandler = handler;

    return fakeServer;
  };

  return {
    createHttpServer,
    fakeServer,
    requestHandler: () => requestHandler,
  };
};
