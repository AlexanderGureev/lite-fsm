import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

const result = spawnSync("pnpm", ["--filter", "@lite-fsm/visualizer", "build"], {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    VITE_VISUALIZER_BASE_PATH: "/",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

