import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { assertEntitiesBenchRecord, formatCompareMarkdown } from "./reporting.mjs";

const usage = `Usage:
  pnpm run bench:entities:compare -- <before.json> <after.json>
`;

const parseArgs = (argv) => {
  const args = argv.filter((arg) => arg !== "--");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exitCode = 0;
    return undefined;
  }

  if (args.length !== 2) throw new Error("bench:entities:compare expects <before.json> and <after.json>.");
  return {
    beforePath: resolve(process.cwd(), args[0]),
    afterPath: resolve(process.cwd(), args[1]),
  };
};

const readRecord = async (path, label) => {
  const record = JSON.parse(await readFile(path, "utf8"));
  assertEntitiesBenchRecord(record, label);
  return record;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;

  const before = await readRecord(args.beforePath, args.beforePath);
  const after = await readRecord(args.afterPath, args.afterPath);
  console.log(formatCompareMarkdown(before, after));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
