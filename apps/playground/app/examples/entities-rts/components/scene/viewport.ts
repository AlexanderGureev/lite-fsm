import { RTS_MAP } from "../../store/spawn/placement";
import type { Point } from "../../store/types";

import {
  FIXED_SIMULATION_STEP_MS,
  LOD_STRIDE_ENTER_RATIO,
  LOD_STRIDE_EXIT_RATIO,
  MAX_LOD_STRIDE,
  RENDER_CULL_MARGIN,
  UNIT_DOT_LOD_MAX_ZOOM,
} from "./constants";
import type { PhaserCamera, PhaserScene } from "./phaser-types";

export type RenderBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CameraWorldView = RenderBounds & {
  width: number;
  height: number;
};

export type RenderMode = "sprite" | "dot";

export const clampToMap = (point: Point): Point => ({
  x: Math.min(RTS_MAP.width, Math.max(0, point.x)),
  y: Math.min(RTS_MAP.height, Math.max(0, point.y)),
});

export const squaredDistance = (left: Point, right: Point) => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return dx * dx + dy * dy;
};

export const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const cameraWorldViewFor = (camera: PhaserCamera): CameraWorldView => {
  const zoom = Math.max(0.001, camera.zoom);
  const width = camera.width / zoom;
  const height = camera.height / zoom;
  const left = camera.scrollX + camera.width / 2 - width / 2;
  const top = camera.scrollY + camera.height / 2 - height / 2;

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
};

export const cameraWorldPointForScreen = (camera: PhaserCamera, x: number, y: number): Point => {
  const worldView = cameraWorldViewFor(camera);
  const zoom = Math.max(0.001, camera.zoom);

  return {
    x: worldView.left + (x - camera.x) / zoom,
    y: worldView.top + (y - camera.y) / zoom,
  };
};

export const setCameraScrollForScreenWorldPoint = (camera: PhaserCamera, x: number, y: number, worldPoint: Point) => {
  const zoom = Math.max(0.001, camera.zoom);
  const worldLeft = worldPoint.x - (x - camera.x) / zoom;
  const worldTop = worldPoint.y - (y - camera.y) / zoom;

  camera.scrollX = worldLeft - camera.width / 2 + camera.width / zoom / 2;
  camera.scrollY = worldTop - camera.height / 2 + camera.height / zoom / 2;
};

export const renderBoundsForScene = (scene: PhaserScene): RenderBounds => {
  const worldView = cameraWorldViewFor(scene.cameras.main);

  return {
    left: worldView.left - RENDER_CULL_MARGIN,
    right: worldView.right + RENDER_CULL_MARGIN,
    top: worldView.top - RENDER_CULL_MARGIN,
    bottom: worldView.bottom + RENDER_CULL_MARGIN,
  };
};

export const pointIntersectsBounds = (x: number, y: number, radius: number, bounds: RenderBounds) =>
  x + radius >= bounds.left && x - radius <= bounds.right && y + radius >= bounds.top && y - radius <= bounds.bottom;

export const renderModeFor = (scene: PhaserScene): RenderMode =>
  scene.cameras.main.zoom <= UNIT_DOT_LOD_MAX_ZOOM ? "dot" : "sprite";

export const visualStepSeconds = (extrapolationMs: number) =>
  Math.min(FIXED_SIMULATION_STEP_MS, Math.max(0, extrapolationMs)) / 1_000;

export const nextStableStride = (visibleCount: number, maxVisible: number, currentStride: number) => {
  let stride = Math.max(1, currentStride);

  while (visibleCount > maxVisible * stride * LOD_STRIDE_ENTER_RATIO && stride < MAX_LOD_STRIDE) {
    stride *= 2;
  }

  while (stride > 1 && visibleCount < maxVisible * (stride / 2) * LOD_STRIDE_EXIT_RATIO) {
    stride /= 2;
  }

  return stride;
};
