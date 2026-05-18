import { okStep } from "../write-files.js";
import type { CreateProjectCssAdapter } from "./types.js";

export const nextNoneCssAdapter: CreateProjectCssAdapter = {
  key: "none",
  template: "next",
  apply: okStep,
};

export const viteNoneCssAdapter: CreateProjectCssAdapter = {
  key: "none",
  template: "vite",
  apply: okStep,
};
