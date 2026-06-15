import type { EntityIndex } from "@lite-fsm/entities";

import type { Point } from "../types";
import { createFlowField, flowCellIndexForPoint, readFlowDirectionAt, type FlowField } from "./flow-field";
import { buildSpatialGridForEntities, collectSpatialNeighborsAt, createSpatialGrid, type SpatialGrid } from "./spatial-grid";
import { RTS_MAP } from "./spawn-placement";

const FLOW_CELL_SIZE = 96;
const UNIT_GRID_CELL_SIZE = 48;
const ENEMY_LOOKUP_CELL_SIZE = 128;

export const SEPARATION_SAMPLE_LIMIT = 12;

export type RtsSimulationMetrics = {
  flowFieldRebuildMs: number;
  spatialGridBuildMs: number;
};

type RuntimeScratch = {
  flowField: FlowField | null;
  unitGrid: SpatialGrid | null;
  enemyGrid: SpatialGrid | null;
  flowDirection: Point;
  neighborBuffer: Int32Array;
  aliveEntities: EntityIndex[];
  enemyEntities: EntityIndex[];
};

export type RtsSpatialGrids = {
  unitGrid: SpatialGrid;
  enemyGrid: SpatialGrid;
};

const scratch: RuntimeScratch = {
  flowField: null,
  unitGrid: null,
  enemyGrid: null,
  flowDirection: { x: 0, y: 0 },
  neighborBuffer: new Int32Array(64),
  aliveEntities: [],
  enemyEntities: [],
};

const metrics: RtsSimulationMetrics = {
  flowFieldRebuildMs: 0,
  spatialGridBuildMs: 0,
};

const now = () => globalThis.performance?.now() ?? Date.now();

const ensureGrid = (grid: SpatialGrid | null, cellSize: number, capacity: number) => {
  const maxEntities = Math.max(1, capacity);
  if (grid && grid.next.length >= maxEntities) return grid;

  return createSpatialGrid({
    width: RTS_MAP.width,
    height: RTS_MAP.height,
    cellSize,
    maxEntities,
  });
};

export const resetRtsSimulationRuntime = () => {
  scratch.flowField = null;
  scratch.unitGrid = null;
  scratch.enemyGrid = null;
  scratch.flowDirection.x = 0;
  scratch.flowDirection.y = 0;
  scratch.neighborBuffer.fill(-1);
  scratch.aliveEntities.length = 0;
  scratch.enemyEntities.length = 0;
  metrics.flowFieldRebuildMs = 0;
  metrics.spatialGridBuildMs = 0;
};

export const beginRtsTickScratch = () => {
  scratch.aliveEntities.length = 0;
  scratch.enemyEntities.length = 0;
  metrics.flowFieldRebuildMs = 0;
  metrics.spatialGridBuildMs = 0;

  return {
    aliveEntities: scratch.aliveEntities,
    enemyEntities: scratch.enemyEntities,
  };
};

export const ensureRtsFlowField = (hero: Point) => {
  if (scratch.flowField) {
    const nextTargetCell = flowCellIndexForPoint(scratch.flowField, hero);
    if (nextTargetCell === scratch.flowField.targetCell) return scratch.flowField;
  }

  const startedAt = now();
  scratch.flowField = createFlowField(
    {
      width: RTS_MAP.width,
      height: RTS_MAP.height,
      cellSize: FLOW_CELL_SIZE,
    },
    hero,
  );
  metrics.flowFieldRebuildMs = now() - startedAt;

  return scratch.flowField;
};

export const readRtsFlowDirectionAt = (field: FlowField, x: number, y: number) =>
  readFlowDirectionAt(field, x, y, scratch.flowDirection);

export const buildRtsSpatialGrids = (
  positions: { x: ArrayLike<number>; y: ArrayLike<number> },
  aliveEntities: readonly number[],
  enemyEntities: readonly number[],
  capacity: number,
): RtsSpatialGrids => {
  const startedAt = now();
  scratch.unitGrid = ensureGrid(scratch.unitGrid, UNIT_GRID_CELL_SIZE, capacity);
  scratch.enemyGrid = ensureGrid(scratch.enemyGrid, ENEMY_LOOKUP_CELL_SIZE, capacity);

  buildSpatialGridForEntities(scratch.unitGrid, positions, aliveEntities);
  buildSpatialGridForEntities(scratch.enemyGrid, positions, enemyEntities);
  metrics.spatialGridBuildMs = now() - startedAt;

  return {
    unitGrid: scratch.unitGrid,
    enemyGrid: scratch.enemyGrid,
  };
};

export const getRtsNeighborBuffer = () => scratch.neighborBuffer;

export const collectRtsNeighborsAt = (grid: SpatialGrid, x: number, y: number) =>
  collectSpatialNeighborsAt(grid, x, y, scratch.neighborBuffer);

export const readRtsSimulationMetrics = (): Readonly<RtsSimulationMetrics> => metrics;
