import { publicAssetPath } from "./public-paths";

const playgroundPublicOrigin = process.env.NEXT_PUBLIC_PLAYGROUND_PUBLIC_ORIGIN ?? "";
const visualizerBasePath = process.env.NEXT_PUBLIC_VISUALIZER_BASE_PATH ?? "/visualizer";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const visualizerBaseUrl = () => trimTrailingSlash(visualizerBasePath);

export const exampleVisualizerIrPath = (exampleId: string) =>
  publicAssetPath(`/visualizer-ir/examples/${exampleId}.json`);

export const exampleVisualizerIrUrl = (exampleId: string) =>
  `${trimTrailingSlash(playgroundPublicOrigin)}${exampleVisualizerIrPath(exampleId)}`;

export const exampleVisualizerUrl = (exampleId: string) =>
  `${visualizerBaseUrl()}/?config=${encodeURIComponent(exampleVisualizerIrUrl(exampleId))}`;
