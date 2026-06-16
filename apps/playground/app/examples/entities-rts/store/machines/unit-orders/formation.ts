import type { Point } from "../../types";

export type FormationTargets = {
  count: number;
  x: Float32Array;
  y: Float32Array;
};

export type FormationOptions = {
  spacing?: number;
};

export const createFormationTargets = (
  target: Point,
  count: number,
  options: FormationOptions = {},
): FormationTargets => {
  const unitCount = Math.max(0, Math.trunc(count));
  const x = new Float32Array(unitCount);
  const y = new Float32Array(unitCount);

  if (unitCount === 0) return { count: 0, x, y };

  const spacing = options.spacing ?? 28;
  const columns = Math.ceil(Math.sqrt(unitCount));
  const rows = Math.ceil(unitCount / columns);
  const left = ((columns - 1) * spacing) / 2;
  const top = ((rows - 1) * spacing) / 2;

  for (let index = 0; index < unitCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    x[index] = target.x + column * spacing - left;
    y[index] = target.y + row * spacing - top;
  }

  return { count: unitCount, x, y };
};
