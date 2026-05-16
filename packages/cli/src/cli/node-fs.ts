import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { CliFileSystem } from "./context.js";

export const createNodeFileSystem = (): CliFileSystem => ({
  readFile(path) {
    return readFileSync(path, "utf8");
  },
  readFileBuffer(path) {
    return readFileSync(path);
  },
  writeFile(path, contents) {
    writeFileSync(path, contents, "utf8");
  },
  mkdir(path, options) {
    mkdirSync(path, options);
  },
  rename(from, to) {
    renameSync(from, to);
  },
  unlink(path) {
    unlinkSync(path);
  },
  fileExists(path) {
    return existsSync(path) && statSync(path).isFile();
  },
  directoryExists(path) {
    return existsSync(path) && statSync(path).isDirectory();
  },
  realpath(path) {
    return realpathSync(path);
  },
});
