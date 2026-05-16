import { URL } from "node:url";
import type {
  VisualizerErrorResponse,
  VisualizerHttpRequest,
  VisualizerHttpResponse,
  VisualizerHttpResponseWriter,
  VisualizerRoute,
  VisualizerRouteContext,
} from "./types.js";
import type { VisualizerSession } from "./session.js";

export const jsonResponse = (status: number, body: object): VisualizerHttpResponse => ({
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
  },
  body: `${JSON.stringify(body)}\n`,
});

export const errorResponse = (status: number, code: string, message: string): VisualizerHttpResponse => {
  const body: VisualizerErrorResponse = { ok: false, code, message };

  return jsonResponse(status, body);
};

export const writeHttpResponse = (response: VisualizerHttpResponseWriter, output: VisualizerHttpResponse): void => {
  const headers = output.headers ?? {};
  const body = output.body;

  if (body === undefined) {
    response.writeHead(output.status, headers);
    response.end();
    return;
  }

  const bodyBuffer = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  response.writeHead(output.status, {
    ...headers,
    "content-length": String(bodyBuffer.byteLength),
  });
  response.end(bodyBuffer);
};

export const dispatchApiRoute = async (
  routes: readonly VisualizerRoute[],
  context: Omit<VisualizerRouteContext, "session"> & { session: VisualizerSession },
): Promise<VisualizerHttpResponse> => {
  const pathRoutes = routes.filter((route) => route.path === context.url.pathname);
  if (pathRoutes.length === 0) return errorResponse(404, "route-not-found", "API route was not found.");

  const route = pathRoutes.find((candidate) => candidate.method === context.request.method);
  if (!route) {
    const method = context.request.method ?? "UNKNOWN";
    const response = errorResponse(405, "method-not-allowed", `Method ${method} is not allowed.`);

    return {
      ...response,
      headers: {
        ...response.headers,
        "allow": pathRoutes.map((candidate) => candidate.method).join(", "),
      },
    };
  }

  if (route.auth === "session" && !context.session.authenticate(context.url.searchParams.get("token"))) {
    return errorResponse(401, "invalid-token", "Missing or invalid session token.");
  }

  return route.handle(context);
};

export const createRequestUrl = (request: VisualizerHttpRequest): URL => {
  return new URL(request.url ?? "/", "http://127.0.0.1");
};

export const createRequestPathname = (request: VisualizerHttpRequest): string => {
  const rawUrl = request.url ?? "/";
  if (!rawUrl.startsWith("/")) return createRequestUrl(request).pathname;

  const queryStart = rawUrl.search(/[?#]/);
  return queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
};
