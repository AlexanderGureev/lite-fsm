import type { Vec2 } from "./types";

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export const normalize = (vector: Vec2): Vec2 => {
  const size = Math.hypot(vector.x, vector.y);
  if (size === 0) return { x: 0, y: 0 };
  return { x: vector.x / size, y: vector.y / size };
};
