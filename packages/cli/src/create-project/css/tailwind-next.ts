import { okStep } from "../write-files.js";
import type { CreateProjectCssAdapter } from "./types.js";

export const nextTailwindCssAdapter: CreateProjectCssAdapter = {
  key: "tailwind",
  template: "next",
  apply: okStep,
};
