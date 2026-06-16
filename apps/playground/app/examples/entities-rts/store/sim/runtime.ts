import type { EntityIndex } from "@lite-fsm/entities";

import type { Point } from "../types";
import { createRtsSimulationBatch, resetRtsSimulationBatch, type RtsSimulationBatch } from "./batches";
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

export type RtsTickScratch = {
  hasCommandUpdate: boolean;
  hasCombatUpdate: boolean;
  hasDamageUpdate: boolean;
  hasMovementUpdate: boolean;
};

type RuntimeScratch = {
  flowField: FlowField | null;
  unitGrid: SpatialGrid | null;
  enemyGrid: SpatialGrid | null;
  flowDirection: Point;
  neighborBuffer: Int32Array;
  aliveEntities: EntityIndex[];
  enemyEntities: EntityIndex[];
  batch: RtsSimulationBatch;
  tick: RtsTickScratch;
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
  batch: createRtsSimulationBatch(1),
  tick: {
    hasCommandUpdate: false,
    hasCombatUpdate: false,
    hasDamageUpdate: false,
    hasMovementUpdate: false,
  },
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
  resetRtsSimulationBatch(scratch.batch, scratch.batch.projectedHp.length);
  scratch.tick.hasCommandUpdate = false;
  scratch.tick.hasCombatUpdate = false;
  scratch.tick.hasDamageUpdate = false;
  scratch.tick.hasMovementUpdate = false;
  metrics.flowFieldRebuildMs = 0;
  metrics.spatialGridBuildMs = 0;
};

const ensureSimulationBatch = (capacity: number) => {
  if (scratch.batch.projectedHp.length >= capacity) return scratch.batch;

  scratch.batch = createRtsSimulationBatch(Math.max(1, capacity));
  return scratch.batch;
};

export const beginRtsTickScratch = (capacity: number) => {
  scratch.aliveEntities.length = 0;
  scratch.enemyEntities.length = 0;
  scratch.tick.hasCommandUpdate = false;
  scratch.tick.hasCombatUpdate = false;
  scratch.tick.hasDamageUpdate = false;
  scratch.tick.hasMovementUpdate = false;
  metrics.flowFieldRebuildMs = 0;
  metrics.spatialGridBuildMs = 0;

  const batch = ensureSimulationBatch(capacity);
  resetRtsSimulationBatch(batch, capacity);

  return {
    aliveEntities: scratch.aliveEntities,
    enemyEntities: scratch.enemyEntities,
    batch,
    tick: scratch.tick,
  };
};

export const readRtsTickScratch = () => scratch;

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
