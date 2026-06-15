import type { Point } from "../types";

export type SpatialGridConfig = {
  width: number;
  height: number;
  cellSize: number;
  maxEntities: number;
};

export type SpatialGrid = {
  width: number;
  height: number;
  cellSize: number;
  columns: number;
  rows: number;
  heads: Int32Array;
  next: Int32Array;
};

export type SpatialGridPositions = {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
};

const assertPositiveGridConfig = (config: SpatialGridConfig) => {
  if (config.width <= 0 || config.height <= 0 || config.cellSize <= 0 || config.maxEntities < 0) {
    throw new Error("spatial grid config expects positive dimensions and non-negative maxEntities");
  }
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

const cellIndexForCoordinates = (grid: Pick<SpatialGrid, "columns" | "rows" | "cellSize">, x: number, y: number) => {
  const column = clamp(Math.floor(x / grid.cellSize), grid.columns - 1);
  const row = clamp(Math.floor(y / grid.cellSize), grid.rows - 1);
  return row * grid.columns + column;
};

export const createSpatialGrid = (config: SpatialGridConfig): SpatialGrid => {
  assertPositiveGridConfig(config);

  const columns = Math.max(1, Math.ceil(config.width / config.cellSize));
  const rows = Math.max(1, Math.ceil(config.height / config.cellSize));
  const heads = new Int32Array(columns * rows);
  const next = new Int32Array(config.maxEntities);
  heads.fill(-1);
  next.fill(-1);

  return {
    width: config.width,
    height: config.height,
    cellSize: config.cellSize,
    columns,
    rows,
    heads,
    next,
  };
};

export const resetSpatialGrid = (grid: SpatialGrid) => {
  grid.heads.fill(-1);
  grid.next.fill(-1);
};

export const buildSpatialGrid = (grid: SpatialGrid, positions: SpatialGridPositions, count: number) => {
  resetSpatialGrid(grid);

  const boundedCount = Math.min(Math.max(0, Math.trunc(count)), grid.next.length);
  for (let entity = 0; entity < boundedCount; entity += 1) {
    const cell = cellIndexForCoordinates(grid, positions.x[entity], positions.y[entity]);
    grid.next[entity] = grid.heads[cell];
    grid.heads[cell] = entity;
  }
};

export const buildSpatialGridForEntities = (
  grid: SpatialGrid,
  positions: SpatialGridPositions,
  entities: readonly number[],
) => {
  resetSpatialGrid(grid);

  for (const entity of entities) {
    if (entity < 0 || entity >= grid.next.length) continue;

    const cell = cellIndexForCoordinates(grid, positions.x[entity], positions.y[entity]);
    grid.next[entity] = grid.heads[cell];
    grid.heads[cell] = entity;
  }
};

export const collectSpatialNeighborsAt = (grid: SpatialGrid, x: number, y: number, out: Int32Array) => {
  let count = 0;
  const centerColumn = clamp(Math.floor(x / grid.cellSize), grid.columns - 1);
  const centerRow = clamp(Math.floor(y / grid.cellSize), grid.rows - 1);
  const minColumn = Math.max(0, centerColumn - 1);
  const maxColumn = Math.min(grid.columns - 1, centerColumn + 1);
  const minRow = Math.max(0, centerRow - 1);
  const maxRow = Math.min(grid.rows - 1, centerRow + 1);

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const cell = row * grid.columns + column;

      for (let entity = grid.heads[cell]; entity !== -1; entity = grid.next[entity]) {
        out[count] = entity;
        count += 1;
        if (count === out.length) return count;
      }
    }
  }

  return count;
};

export const collectSpatialNeighbors = (grid: SpatialGrid, point: Point, out: Int32Array) =>
  collectSpatialNeighborsAt(grid, point.x, point.y, out);
