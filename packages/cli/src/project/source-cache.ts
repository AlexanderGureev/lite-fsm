import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import type { CliFileSystem } from "../cli/context.js";

const toPosixPath = (path: string): string => path.replace(/\\/g, "/");

export const normalizeAbsolutePath = (path: string): string => toPosixPath(resolve(path));

export const normalizePath = (path: string): string => toPosixPath(path);

export type SourceCache = {
  readSource(path: string): string | undefined;
  fileExists(path: string): boolean;
  directoryExists(path: string): boolean;
  realpath(path: string): string;
  sourceHash(path: string): string | undefined;
};

export const createSourceCache = (fs: CliFileSystem): SourceCache => {
  const sourceByPath = new Map<string, string | undefined>();
  const fileExistsByPath = new Map<string, boolean>();
  const directoryExistsByPath = new Map<string, boolean>();

  const normalizeKey = (path: string): string => normalizeAbsolutePath(path);

  const fileExists = (path: string): boolean => {
    const key = normalizeKey(path);
    const cached = fileExistsByPath.get(key);
    if (cached !== undefined) return cached;

    const exists = fs.fileExists(key);
    fileExistsByPath.set(key, exists);

    return exists;
  };

  const directoryExists = (path: string): boolean => {
    const key = normalizeKey(path);
    const cached = directoryExistsByPath.get(key);
    if (cached !== undefined) return cached;

    const exists = fs.directoryExists(key);
    directoryExistsByPath.set(key, exists);

    return exists;
  };

  const readSource = (path: string): string | undefined => {
    const key = normalizeKey(path);
    if (extname(key) !== ".ts") return undefined;
    if (sourceByPath.has(key)) return sourceByPath.get(key);

    const source = fileExists(key) ? fs.readFile(key) : undefined;
    sourceByPath.set(key, source);

    return source;
  };

  const sourceHash = (path: string): string | undefined => {
    const source = readSource(path);
    if (source === undefined) return undefined;

    return createHash("sha256").update(source).digest("hex");
  };

  return {
    readSource,
    fileExists,
    directoryExists,
    realpath(path) {
      const key = normalizeKey(path);
      return fs.realpath ? normalizeAbsolutePath(fs.realpath(key)) : key;
    },
    sourceHash,
  };
};
