import type { Point } from "../../types";

export type FlowFieldConfig = {
  width: number;
  height: number;
  cellSize: number;
};

export type FlowField = {
  width: number;
  height: number;
  cellSize: number;
  columns: number;
  rows: number;
  targetCell: number;
  dx: Float32Array;
  dy: Float32Array;
};

const assertPositiveGridConfig = (config: FlowFieldConfig) => {
  if (config.width <= 0 || config.height <= 0 || config.cellSize <= 0) {
    throw new Error("flow field config expects positive width, height and cellSize");
  }
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

export const flowCellIndexForCoordinates = (
  field: Pick<FlowField, "columns" | "rows" | "cellSize">,
  x: number,
  y: number,
) => {
  const column = clamp(Math.floor(x / field.cellSize), field.columns - 1);
  const row = clamp(Math.floor(y / field.cellSize), field.rows - 1);
  return row * field.columns + column;
};

export const flowCellIndexForPoint = (field: Pick<FlowField, "columns" | "rows" | "cellSize">, point: Point) =>
  flowCellIndexForCoordinates(field, point.x, point.y);

export const createFlowField = (config: FlowFieldConfig, target: Point): FlowField => {
  assertPositiveGridConfig(config);

  const columns = Math.max(1, Math.ceil(config.width / config.cellSize));
  const rows = Math.max(1, Math.ceil(config.height / config.cellSize));
  const dx = new Float32Array(columns * rows);
  const dy = new Float32Array(columns * rows);
  const targetCell = flowCellIndexForPoint({ columns, rows, cellSize: config.cellSize }, target);
  const targetColumn = targetCell % columns;
  const targetRow = Math.floor(targetCell / columns);
  const targetX = (targetColumn + 0.5) * config.cellSize;
  const targetY = (targetRow + 0.5) * config.cellSize;

  for (let row = 0; row < rows; row += 1) {
    const cellY = (row + 0.5) * config.cellSize;

    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const offsetX = targetX - (column + 0.5) * config.cellSize;
      const offsetY = targetY - cellY;
      const length = Math.hypot(offsetX, offsetY);

      if (length === 0) {
        dx[index] = 0;
        dy[index] = 0;
        continue;
      }

      dx[index] = offsetX / length;
      dy[index] = offsetY / length;
    }
  }

  return {
    width: config.width,
    height: config.height,
    cellSize: config.cellSize,
    columns,
    rows,
    targetCell,
    dx,
    dy,
  };
};

export const readFlowDirectionAt = (field: FlowField, x: number, y: number, out: Point) => {
  const index = flowCellIndexForCoordinates(field, x, y);
  out.x = field.dx[index];
  out.y = field.dy[index];
  return out;
};

export const readFlowDirection = (field: FlowField, point: Point, out: Point) =>
  readFlowDirectionAt(field, point.x, point.y, out);
