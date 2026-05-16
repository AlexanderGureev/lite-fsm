import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const indexHtml = fileURLToPath(new URL("../dist/visualizer/index.html", import.meta.url));

if (!existsSync(indexHtml)) {
  throw new Error(`Missing CLI visualizer artifact: ${indexHtml}`);
}

