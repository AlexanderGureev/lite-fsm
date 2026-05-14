import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import type { CliContext, CliFileSystem } from "../../../packages/cli/src/cli/context";
import { normalizeAbsolutePath } from "../../../packages/cli/src/project/source-cache";

type MemoryFileSystemOptions = {
  writeError?: unknown;
};

export type MemoryFileSystem = CliFileSystem & {
  readCounts: Map<string, number>;
  fileExistsCounts: Map<string, number>;
  directoryExistsCounts: Map<string, number>;
  getFile(path: string): string | undefined;
  listFiles(): string[];
};

const addParentDirectories = (directories: Set<string>, path: string): void => {
  let current = normalizeAbsolutePath(dirname(path));

  while (!directories.has(current)) {
    directories.add(current);
    const parent = normalizeAbsolutePath(dirname(current));
    if (parent === current) break;
    current = parent;
  }
};

export const createMemoryFileSystem = (
  files: Record<string, string> = {},
  options: MemoryFileSystemOptions = {},
): MemoryFileSystem => {
  const fileMap = new Map<string, string>();
  const directories = new Set<string>([normalizeAbsolutePath("/")]);
  const readCounts = new Map<string, number>();
  const fileExistsCounts = new Map<string, number>();
  const directoryExistsCounts = new Map<string, number>();

  for (const [path, contents] of Object.entries(files)) {
    const normalized = normalizeAbsolutePath(path);
    fileMap.set(normalized, contents);
    addParentDirectories(directories, normalized);
  }

  return {
    readCounts,
    fileExistsCounts,
    directoryExistsCounts,
    readFile(path) {
      const normalized = normalizeAbsolutePath(path);
      readCounts.set(normalized, (readCounts.get(normalized) ?? 0) + 1);
      const contents = fileMap.get(normalized);
      if (contents === undefined) throw new Error(`Missing file: ${normalized}`);

      return contents;
    },
    writeFile(path, contents) {
      if (options.writeError) throw options.writeError;

      const normalized = normalizeAbsolutePath(path);
      fileMap.set(normalized, contents);
      addParentDirectories(directories, normalized);
    },
    mkdir(path) {
      const normalized = normalizeAbsolutePath(path);
      directories.add(normalized);
      addParentDirectories(directories, normalized);
    },
    rename(from, to) {
      const normalizedFrom = normalizeAbsolutePath(from);
      const normalizedTo = normalizeAbsolutePath(to);
      const contents = fileMap.get(normalizedFrom);
      if (contents === undefined) throw new Error(`Missing file: ${normalizedFrom}`);
      fileMap.delete(normalizedFrom);
      fileMap.set(normalizedTo, contents);
      addParentDirectories(directories, normalizedTo);
    },
    unlink(path) {
      fileMap.delete(normalizeAbsolutePath(path));
    },
    fileExists(path) {
      const normalized = normalizeAbsolutePath(path);
      fileExistsCounts.set(normalized, (fileExistsCounts.get(normalized) ?? 0) + 1);

      return fileMap.has(normalized);
    },
    directoryExists(path) {
      const normalized = normalizeAbsolutePath(path);
      directoryExistsCounts.set(normalized, (directoryExistsCounts.get(normalized) ?? 0) + 1);

      return directories.has(normalized);
    },
    realpath(path) {
      return normalizeAbsolutePath(path);
    },
    getFile(path) {
      return fileMap.get(normalizeAbsolutePath(path));
    },
    listFiles() {
      return [...fileMap.keys()].sort();
    },
  };
};

export type WritableBuffer = Writable & {
  text(): string;
};

export const createWritableBuffer = (): WritableBuffer => {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  }) as WritableBuffer & { text(): string };
};

export const attachTextReader = (buffer: WritableBuffer): WritableBuffer => {
  let contents = "";
  const originalWrite = buffer.write.bind(buffer);
  buffer.write = (chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
    contents += String(chunk);

    return originalWrite(chunk, encodingOrCallback as BufferEncoding, callback);
  };
  buffer.text = () => contents;

  return buffer;
};

export const createCliTestContext = (
  files: Record<string, string>,
  cwd = "/project",
  options: MemoryFileSystemOptions = {},
): CliContext & { fs: MemoryFileSystem; stdout: WritableBuffer; stderr: WritableBuffer } => {
  const stdout = attachTextReader(createWritableBuffer());
  const stderr = attachTextReader(createWritableBuffer());

  return {
    cwd: normalizeAbsolutePath(resolve(cwd)),
    stdout,
    stderr,
    env: {},
    fs: createMemoryFileSystem(files, options),
  };
};
