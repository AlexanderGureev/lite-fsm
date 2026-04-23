import { readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "dist";

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".d.ts")) copyFileSync(p, p.slice(0, -5) + ".d.cts");
  }
};

walk(root);
