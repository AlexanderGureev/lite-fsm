import type { PluginOption } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

const coverageNoisePluginNames = new Set(["rolldown:babel", "@rolldown/plugin-babel"]);

const withoutCoverageNoisePlugins = async (
  plugins: readonly PluginOption[] | undefined,
): Promise<PluginOption[]> => {
  const nextPlugins: PluginOption[] = [];

  for (const plugin of plugins ?? []) {
    const resolvedPlugin = await Promise.resolve(plugin);
    if (!resolvedPlugin) continue;

    if (Array.isArray(resolvedPlugin)) {
      nextPlugins.push(...(await withoutCoverageNoisePlugins(resolvedPlugin)));
      continue;
    }

    if (!coverageNoisePluginNames.has(resolvedPlugin.name)) nextPlugins.push(resolvedPlugin);
  }

  return nextPlugins;
};

const testViteConfig = {
  ...viteConfig,
  plugins: await withoutCoverageNoisePlugins(viteConfig.plugins),
};

export default defineConfig({
  ...testViteConfig,
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "src/app/**/*.{ts,tsx}",
        "src/canvas/**/*.{ts,tsx}",
        "src/cards/**/*.{ts,tsx}",
        "src/codegen/**/*.{ts,tsx}",
        "src/console/**/*.{ts,tsx}",
        "src/diagnostics/**/*.{ts,tsx}",
        "src/features/events/**/*.{ts,tsx}",
        "src/features/machines/**/*.{ts,tsx}",
        "src/features/shell/**/*.{ts,tsx}",
        "src/features/source/**/*.{ts,tsx}",
        "src/features/system/**/*.{ts,tsx}",
        "src/lib/**/*.{ts,tsx}",
        "src/project-export/**/*.{ts,tsx}",
        "src/services/**/*.{ts,tsx}",
        "src/source-access/**/*.{ts,tsx}",
        "src/source/**/*.{ts,tsx}",
        "src/startup/**/*.{ts,tsx}",
        "src/ui/visualizer.tsx",
        "src/validation/**/*.{ts,tsx}",
        "src/workbench/**/*.{ts,tsx}"
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
});
