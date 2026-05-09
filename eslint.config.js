import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";
import globals from "globals";

const tsconfigRootDir = import.meta.dirname;

export default defineConfig([
  globalIgnores([
    "node_modules/",
    "dist/",
    "apps/*/dist/",
    "apps/*/coverage/",
    "apps/*/test-results/",
    "apps/*/playwright-report/",
    "packages/*/dist/",
    "coverage/",
    "apps/docs/",
    "apps/playground/",
    "examples/",
    "tests/",
    "**/*.d.ts",
    "eslint.config.js",
    ".preview",
    ".agents",
    ".cursor",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactPlugin.configs.flat.recommended,
      reactHooks.configs.flat["recommended-latest"],
      jsxA11y.flatConfigs.recommended,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
      prettier,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { tsconfigRootDir },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        typescript: { project: ["./tsconfig.json", "./packages/*/tsconfig.json"], noWarnOnMultipleProjects: true },
        node: { extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"] },
      },
    },
    rules: {
      "import/no-unresolved": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
]);
