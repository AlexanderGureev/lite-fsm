#!/usr/bin/env node
import { createProgram } from "../cli/create-program.js";
import type { CliContext } from "../cli/context.js";
import { createNodeFileSystem } from "../cli/node-fs.js";

const context: CliContext = {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  fs: createNodeFileSystem(),
};

const result = await createProgram(context).parse(process.argv);
process.exitCode = result.exitCode;
