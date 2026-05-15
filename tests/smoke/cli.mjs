import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync("node_modules/.bin/lite-fsm", ["--help"], {
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /lite-fsm command line tools/);
assert.match(result.stdout, /export-graph/);
