import { UNIT_KIND } from "../../store/unit-model";

import { TEXTURES } from "./constants";

export const spriteDisplaySize = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return { width: 66, height: 104 };
  if (kind === UNIT_KIND.ALLY) return { width: 34, height: 54 };
  return { width: 38, height: 42 };
};

export const displaySizeForKind = (kind: number) => spriteDisplaySize(kind).height;

export const spriteAnimForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return { frameCount: 4, frameDurationMs: 120 };
  if (kind === UNIT_KIND.ALLY) return { frameCount: 4, frameDurationMs: 120 };
  return { frameCount: 2, frameDurationMs: 320 };
};

export const animationFrameIndex = (timeMs: number, frameDurationMs: number, frameCount: number, phase: number) =>
  (Math.floor(timeMs / frameDurationMs) + phase) % frameCount;

export const textureForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return TEXTURES.hero;
  if (kind === UNIT_KIND.ALLY) return TEXTURES.ally;
  return TEXTURES.enemy;
};

export const depthForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return 5;
  if (kind === UNIT_KIND.ALLY) return 4;
  return 3;
};
