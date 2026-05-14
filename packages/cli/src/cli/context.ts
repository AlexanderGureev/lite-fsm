import type { Writable } from "node:stream";

export type CliFileSystem = {
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
  mkdir(path: string, options: { recursive: true }): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
  fileExists(path: string): boolean;
  directoryExists(path: string): boolean;
  realpath?(path: string): string;
};

export type CliContext = {
  cwd: string;
  stdout: Writable;
  stderr: Writable;
  env: Readonly<Record<string, string | undefined>>;
  fs: CliFileSystem;
};
