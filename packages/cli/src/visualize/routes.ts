import { errorResponse, jsonResponse } from "./http.js";
import type { VisualizerRoute } from "./types.js";

export const createVisualizerRoutes = (): VisualizerRoute[] => [
  {
    method: "GET",
    path: "/api/session",
    auth: "session",
    handle({ session }) {
      return jsonResponse(200, session.createSessionResponse());
    },
  },
  {
    method: "GET",
    path: "/api/source",
    auth: "session",
    handle({ cliContext, session, url }) {
      const result = session.readSource(cliContext, url.searchParams.get("fileName"));
      if (!result.ok) return errorResponse(result.status, result.code, result.message);

      return jsonResponse(200, result.response);
    },
  },
];
