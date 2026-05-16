import type { SourceAccessClient, SourceAccessFetchRequest, SourceAccessFetchResult } from "./types";

type SourceApiResponse =
  | { ok: true; fileName: string; language: "ts"; hash: string; text: string }
  | { ok: false; code: string; message: string };

export type SourceAccessClientDependencies = {
  fetch?: typeof fetch;
  origin?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSourceApiResponse = (value: unknown): value is SourceApiResponse => {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;

  if (value.ok) {
    return (
      typeof value.fileName === "string" &&
      value.language === "ts" &&
      typeof value.hash === "string" &&
      typeof value.text === "string"
    );
  }

  return typeof value.code === "string" && typeof value.message === "string";
};

const sourceApiUrl = (input: SourceAccessFetchRequest, origin: string): string => {
  const url = new URL("/api/source", origin);
  url.searchParams.set("token", input.token);
  url.searchParams.set("fileName", input.fileName);

  return url.href;
};

const failure = (
  input: SourceAccessFetchRequest,
  code: string,
  message: string,
): SourceAccessFetchResult => ({
  ok: false,
  sessionId: input.sessionId,
  fileName: input.fileName,
  hash: input.hash,
  code,
  message,
});

export const createLocalSessionSourceClient = (
  dependencies: SourceAccessClientDependencies = {},
): SourceAccessClient => ({
  async fetch(input) {
    const fetchImpl = dependencies.fetch ?? globalThis.fetch;
    const origin = dependencies.origin ?? globalThis.location?.origin ?? "http://127.0.0.1";

    try {
      const response = await fetchImpl(sourceApiUrl(input, origin), { credentials: "same-origin" });
      const body = await response.json() as unknown;
      if (!isSourceApiResponse(body)) return failure(input, "invalid-response", "Source API returned an invalid response.");

      if (!body.ok) return failure(input, body.code, body.message);
      if (body.fileName !== input.fileName || body.hash !== input.hash) {
        return failure(input, "source-mismatch", "Source API returned a different source file.");
      }

      return {
        ok: true,
        sessionId: input.sessionId,
        fileName: body.fileName,
        hash: body.hash,
        text: body.text,
      };
    } catch (error) {
      return failure(
        input,
        "network-error",
        error instanceof Error ? error.message : "Could not fetch source text.",
      );
    }
  },
});
