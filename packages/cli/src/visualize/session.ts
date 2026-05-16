import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import type { LiteFsmGraphProjectFile, LiteFsmGraphProjectResult } from "@lite-fsm/graph";
import type { CliContext } from "../cli/context.js";
import type { LiteFsmProjectGraphExportDocument } from "../export-graph/export-document.js";
import { normalizeAbsolutePath, normalizePath } from "../project/source-cache.js";
import type {
  VisualizerHostCapabilities,
  VisualizerSessionResponse,
  VisualizerSourceResponse,
} from "./types.js";

export type VisualizerSourceReadResult =
  | { ok: true; response: VisualizerSourceResponse }
  | { ok: false; status: 400 | 404 | 409 | 500; code: string; message: string };

export type VisualizerSession = {
  sessionId: string;
  token: string;
  projectRoot: string;
  exportDocument: LiteFsmProjectGraphExportDocument;
  capabilities: VisualizerHostCapabilities;
  authenticate(token: string | null): boolean;
  createSessionResponse(): VisualizerSessionResponse;
  readSource(context: CliContext, fileName: string | null): VisualizerSourceReadResult;
};

export type CreateVisualizerSessionOptions = {
  projectRoot: string;
  exportDocument: LiteFsmProjectGraphExportDocument;
  graphResult: LiteFsmGraphProjectResult;
  sessionId?: string;
  token?: string;
};

export const createGraphCompatibleSourceHash = (source: string): string => {
  let hash = 2_166_136_261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createSessionToken = (): string => {
  return randomBytes(32).toString("base64url");
};

const isAbsoluteFileName = (fileName: string): boolean => {
  return fileName.startsWith("/") || /^[A-Za-z]:/.test(fileName);
};

export const isValidProjectFileName = (fileName: string): boolean => {
  if (fileName === "" || isAbsoluteFileName(fileName) || fileName.includes("\\")) return false;

  const segments = fileName.split("/");

  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

const sourcePath = (projectRoot: string, fileName: string): string => {
  return normalizeAbsolutePath(resolve(projectRoot, fileName));
};

const tokenEquals = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
};

const sourceFileByName = (files: readonly LiteFsmGraphProjectFile[]): ReadonlyMap<string, LiteFsmGraphProjectFile> => {
  return new Map(files.map((file) => [file.fileName, file]));
};

const invalidFileName = (): VisualizerSourceReadResult => ({
  ok: false,
  status: 400,
  code: "invalid-file-name",
  message: "Source fileName must be a project-relative graph file.",
});

const readSessionSource = (input: {
  context: CliContext;
  files: ReadonlyMap<string, LiteFsmGraphProjectFile>;
  projectRoot: string;
  fileName: string | null;
}): VisualizerSourceReadResult => {
  const { context, files, projectRoot, fileName } = input;
  if (fileName === null || !isValidProjectFileName(fileName)) return invalidFileName();

  const file = files.get(fileName);
  if (!file) {
    return {
      ok: false,
      status: 404,
      code: "source-not-found",
      message: `Source file '${fileName}' is not part of the graph session.`,
    };
  }

  const absolutePath = sourcePath(projectRoot, fileName);

  try {
    if (!context.fs.fileExists(absolutePath)) {
      return {
        ok: false,
        status: 404,
        code: "source-not-found",
        message: `Source file '${fileName}' could not be read.`,
      };
    }

    const text = context.fs.readFile(absolutePath);
    const hash = createGraphCompatibleSourceHash(text);
    if (hash !== file.hash) {
      return {
        ok: false,
        status: 409,
        code: "source-stale",
        message: `Source file '${fileName}' changed after graph build.`,
      };
    }

    return {
      ok: true,
      response: {
        ok: true,
        fileName,
        language: file.language,
        hash,
        text,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      status: 500,
      code: "source-read-failed",
      message: `Source file '${normalizePath(fileName)}' could not be read: ${message}`,
    };
  }
};

export const createVisualizerSession = ({
  projectRoot,
  exportDocument,
  graphResult,
  sessionId = randomUUID(),
  token = createSessionToken(),
}: CreateVisualizerSessionOptions): VisualizerSession => {
  const normalizedProjectRoot = normalizeAbsolutePath(projectRoot);
  const files = sourceFileByName(graphResult.files);
  const capabilities: VisualizerHostCapabilities = {
    mode: "local",
    canReadFiles: true,
    canWriteFiles: false,
    canApplyPatch: false,
    projectRoot: normalizedProjectRoot,
  };

  return {
    sessionId,
    token,
    projectRoot: normalizedProjectRoot,
    exportDocument,
    capabilities,
    authenticate(candidateToken) {
      return typeof candidateToken === "string" && tokenEquals(candidateToken, token);
    },
    createSessionResponse() {
      return {
        ok: true,
        sessionId,
        capabilities,
        entry: exportDocument.entry,
        projectRoot: normalizedProjectRoot,
        exportDocument,
      };
    },
    readSource(context, fileName) {
      return readSessionSource({ context, files, projectRoot: normalizedProjectRoot, fileName });
    },
  };
};
