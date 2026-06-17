import { describe, expect, it } from "vitest";

import {
  buildSpatialGrid,
  buildSpatialGridForEntities,
  collectSpatialNeighbors,
  collectSpatialNeighborsAroundAt,
  createSpatialGrid,
  resetSpatialGrid,
} from "../../../apps/playground/app/examples/entities-rts/store/machines/rts-spatial-index/spatial-grid";

const readNeighbors = (buffer: Int32Array, count: number) =>
  Array.from(buffer.slice(0, count)).sort((left, right) => left - right);

describe("spatial grid для RTS", () => {
  it("строит grid за один проход и ищет только соседние клетки", () => {
    const grid = createSpatialGrid({ width: 100, height: 100, cellSize: 10, maxEntities: 5 });
    const out = new Int32Array(8);

    buildSpatialGrid(
      grid,
      {
        x: Float32Array.from([5, 15, 95, 5, 50]),
        y: Float32Array.from([5, 5, 95, 15, 50]),
      },
      5,
    );

    const count = collectSpatialNeighbors(grid, { x: 5, y: 5 }, out);

    expect(readNeighbors(out, count)).toEqual([0, 1, 3]);
  });

  it("ограничивает число samples размером выходного буфера", () => {
    const grid = createSpatialGrid({ width: 32, height: 32, cellSize: 16, maxEntities: 4 });
    const out = new Int32Array(2);

    buildSpatialGrid(
      grid,
      {
        x: Float32Array.from([2, 4, 6, 8]),
        y: Float32Array.from([2, 4, 6, 8]),
      },
      4,
    );

    expect(collectSpatialNeighbors(grid, { x: 1, y: 1 }, out)).toBe(2);
  });

  it("ограничивает число samples явным лимитом", () => {
    const grid = createSpatialGrid({ width: 32, height: 32, cellSize: 16, maxEntities: 4 });
    const out = new Int32Array(4);

    buildSpatialGrid(
      grid,
      {
        x: Float32Array.from([2, 4, 6, 8]),
        y: Float32Array.from([2, 4, 6, 8]),
      },
      4,
    );

    expect(collectSpatialNeighbors(grid, { x: 1, y: 1 }, out, 3)).toBe(3);
  });

  it("ищет candidates в радиусе нескольких клеток", () => {
    const grid = createSpatialGrid({ width: 100, height: 100, cellSize: 10, maxEntities: 5 });
    const out = new Int32Array(8);

    buildSpatialGrid(
      grid,
      {
        x: Float32Array.from([5, 15, 45, 75, 95]),
        y: Float32Array.from([5, 5, 5, 5, 95]),
      },
      5,
    );

    const count = collectSpatialNeighborsAroundAt(grid, 5, 5, 45, out);

    expect(readNeighbors(out, count)).toEqual([0, 1, 2]);
  });

  it("строит grid по sparse entity indices после lifecycle removal", () => {
    const grid = createSpatialGrid({ width: 64, height: 64, cellSize: 16, maxEntities: 6 });
    const out = new Int32Array(4);

    buildSpatialGridForEntities(
      grid,
      {
        x: Float32Array.from([0, 4, 60, 8, 60, 12]),
        y: Float32Array.from([0, 4, 60, 8, 60, 12]),
      },
      [1, 3, 5],
    );

    expect(readNeighbors(out, collectSpatialNeighbors(grid, { x: 8, y: 8 }, out))).toEqual([1, 3, 5]);
  });

  it("сбрасывает scratch buffers и ограничивает build capacity", () => {
    const grid = createSpatialGrid({ width: 32, height: 32, cellSize: 16, maxEntities: 1 });
    const out = new Int32Array(4);

    buildSpatialGrid(
      grid,
      {
        x: Float32Array.from([1, 30]),
        y: Float32Array.from([1, 30]),
      },
      2,
    );

    expect(collectSpatialNeighbors(grid, { x: -5, y: -5 }, out)).toBe(1);

    resetSpatialGrid(grid);
    expect(collectSpatialNeighbors(grid, { x: -5, y: -5 }, out)).toBe(0);
  });

  it("отклоняет невалидную конфигурацию", () => {
    expect(() => createSpatialGrid({ width: 10, height: 10, cellSize: 0, maxEntities: 1 })).toThrow(
      "spatial grid config expects positive dimensions and non-negative maxEntities",
    );
  });
});
