import { createServer } from "node:http";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { createRequestPathname, createRequestUrl, dispatchApiRoute, errorResponse, writeHttpResponse } from "./http.js";
import { createVisualizerRoutes } from "./routes.js";
import { serveStaticAsset } from "./static-assets.js";
import type { VisualizerSession } from "./session.js";
import type {
  VisualizerHttpRequest,
  VisualizerHttpResponse,
  VisualizerHttpResponseWriter,
  VisualizerRoute,
} from "./types.js";

export type VisualizerServer = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type StartVisualizerServerOptions = {
  context: CliContext;
  port: number;
  session: VisualizerSession;
  staticRoot: string;
};

export type StartVisualizerServerDependencies = {
  routes?: readonly VisualizerRoute[];
  createHttpServer?: CreateVisualizerHttpServer;
};

export type StartVisualizerServerResult =
  | { ok: true; server: VisualizerServer }
  | { ok: false; diagnostics: CliDiagnostic[] };

type VisualizerServerListenerArgs =
  | [event: "error", listener: (error: NodeJS.ErrnoException) => void]
  | [event: "listening", listener: () => void];

const diagnosticForListenError = (error: NodeJS.ErrnoException, port: number): CliDiagnostic => {
  if (error.code === "EADDRINUSE") {
    return cliDiagnostic("LFC_VISUALIZER_PORT_UNAVAILABLE", "error", `Port ${port} is already in use.`);
  }

  return cliDiagnostic("LFC_VISUALIZER_SERVER_FAILED", "error", `Visualizer server failed to start: ${error.message}`);
};

export type VisualizerHttpServer = {
  once(...args: VisualizerServerListenerArgs): VisualizerHttpServer;
  removeListener(...args: VisualizerServerListenerArgs): VisualizerHttpServer;
  listen(port: number, host: string): void;
  close(callback: (error?: Error) => void): void;
};

export type CreateVisualizerHttpServer = (
  handler: (request: VisualizerHttpRequest, response: VisualizerHttpResponseWriter) => void,
) => VisualizerHttpServer;

/* v8 ignore next -- unit tests inject the HTTP server because the sandbox forbids local bind. */
const createNodeHttpServer: CreateVisualizerHttpServer = (handler) =>
  createServer((request, response) => handler(request, response));

const closeServer = (server: VisualizerHttpServer): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const listenServer = async (
  server: VisualizerHttpServer,
  port: number,
): Promise<{ ok: true } | { ok: false; error: NodeJS.ErrnoException }> =>
  new Promise((resolve) => {
    const cleanup = (): void => {
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
    };
    const onError = (error: NodeJS.ErrnoException): void => {
      cleanup();
      resolve({ ok: false, error });
    };
    const onListening = (): void => {
      cleanup();
      resolve({ ok: true });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

export const handleVisualizerRequest = async (
  options: StartVisualizerServerOptions & { routes: readonly VisualizerRoute[] },
  request: VisualizerHttpRequest,
): Promise<VisualizerHttpResponse> => {
  const url = createRequestUrl(request);
  const pathname = createRequestPathname(request);
  if (url.pathname.startsWith("/api/")) {
    return dispatchApiRoute(options.routes, {
      request,
      url,
      cliContext: options.context,
      session: options.session,
    });
  }

  return serveStaticAsset(options.context, {
    staticRoot: options.staticRoot,
    pathname,
    method: request.method,
  });
};

export const startVisualizerServer = async (
  options: StartVisualizerServerOptions,
  dependencies: StartVisualizerServerDependencies = {},
): Promise<StartVisualizerServerResult> => {
  const { createHttpServer = createNodeHttpServer, routes = createVisualizerRoutes() } = dependencies;
  const routeContext = { ...options, routes };
  const server = createHttpServer(async (request, response) => {
    try {
      const output = await handleVisualizerRequest(routeContext, request);
      writeHttpResponse(response, output);
    } catch {
      writeHttpResponse(response, errorResponse(500, "server-failure", "Unexpected visualizer server failure."));
    }
  });

  const listening = await listenServer(server, options.port);
  if (!listening.ok) {
    return { ok: false, diagnostics: [diagnosticForListenError(listening.error, options.port)] };
  }

  return {
    ok: true,
    server: {
      url: `http://127.0.0.1:${options.port}/?session=${options.session.token}`,
      port: options.port,
      close: () => closeServer(server),
    },
  };
};

export const waitForSignalShutdown = (server: VisualizerServer): Promise<void> =>
  new Promise((resolve) => {
    const shutdown = (): void => {
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
      server.close().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
