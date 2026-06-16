export type UnitMovementBatchPayload = {
  readonly touched: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
};

export type UnitCombatBatchPayload = {
  readonly touched: Uint8Array;
  readonly attackTimerMs: Int32Array;
};

export type UnitHealthDamageBatchPayload = {
  readonly touched: Uint8Array;
  readonly damage: Int32Array;
};

export type UnitCommandStateBatchPayload = {
  readonly touched: Uint8Array;
  readonly command: Uint8Array;
};

export type UnitCommandAssignmentBatchPayload = UnitCommandStateBatchPayload & {
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly formationOffsetX: Float32Array;
  readonly formationOffsetY: Float32Array;
};

export type UnitSelectionBatchPayload = {
  readonly touched: Uint8Array;
  readonly selected: Uint8Array;
};

export type RtsSimulationBatch = {
  readonly movement: UnitMovementBatchPayload;
  readonly combat: UnitCombatBatchPayload;
  readonly health: UnitHealthDamageBatchPayload;
  readonly command: UnitCommandStateBatchPayload;
  readonly projectedHp: Int32Array;
};

const createMovementBatch = (capacity: number): UnitMovementBatchPayload => ({
  touched: new Uint8Array(capacity),
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  vx: new Float32Array(capacity),
  vy: new Float32Array(capacity),
});

const createCombatBatch = (capacity: number): UnitCombatBatchPayload => ({
  touched: new Uint8Array(capacity),
  attackTimerMs: new Int32Array(capacity),
});

const createHealthBatch = (capacity: number): UnitHealthDamageBatchPayload => ({
  touched: new Uint8Array(capacity),
  damage: new Int32Array(capacity),
});

const createCommandStateBatch = (capacity: number): UnitCommandStateBatchPayload => ({
  touched: new Uint8Array(capacity),
  command: new Uint8Array(capacity),
});

export const createRtsSimulationBatch = (capacity: number): RtsSimulationBatch => ({
  movement: createMovementBatch(capacity),
  combat: createCombatBatch(capacity),
  health: createHealthBatch(capacity),
  command: createCommandStateBatch(capacity),
  projectedHp: new Int32Array(capacity),
});

export const createUnitSelectionBatch = (capacity: number): UnitSelectionBatchPayload => ({
  touched: new Uint8Array(capacity),
  selected: new Uint8Array(capacity),
});

export const createUnitCommandAssignmentBatch = (capacity: number): UnitCommandAssignmentBatchPayload => ({
  touched: new Uint8Array(capacity),
  command: new Uint8Array(capacity),
  targetX: new Float32Array(capacity),
  targetY: new Float32Array(capacity),
  formationOffsetX: new Float32Array(capacity),
  formationOffsetY: new Float32Array(capacity),
});

export const resetRtsSimulationBatch = (batch: RtsSimulationBatch, capacity: number) => {
  batch.movement.touched.fill(0, 0, capacity);
  batch.combat.touched.fill(0, 0, capacity);
  batch.health.touched.fill(0, 0, capacity);
  batch.health.damage.fill(0, 0, capacity);
  batch.command.touched.fill(0, 0, capacity);
};
