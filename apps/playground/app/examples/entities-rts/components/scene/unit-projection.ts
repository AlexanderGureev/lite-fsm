import type { PhaserImage } from "./phaser-types";

export type ProjectedUnitView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  vx: number;
  vy: number;
};

export const projectUnitView = (view: ProjectedUnitView, dt: number) => {
  const x = view.x + view.vx * dt;
  const y = view.y + view.vy * dt;

  if (view.renderX === x && view.renderY === y) return false;

  view.renderX = x;
  view.renderY = y;
  view.sprite.setPosition(x, y);
  return true;
};

export const resetProjectedUnitView = (view: ProjectedUnitView) => {
  if (view.renderX === view.x && view.renderY === view.y) return false;

  view.renderX = view.x;
  view.renderY = view.y;
  view.sprite.setPosition(view.x, view.y);
  return true;
};
