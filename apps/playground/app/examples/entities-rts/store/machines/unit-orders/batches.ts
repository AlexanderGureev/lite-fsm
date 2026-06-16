export type UnitCommandAssignmentBatchPayload = {
  readonly touched: Uint8Array;
  readonly command: Uint8Array;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly formationOffsetX: Float32Array;
  readonly formationOffsetY: Float32Array;
};

export type UnitSelectionBatchPayload = {
  readonly touched: Uint8Array;
  readonly selected: Uint8Array;
};

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
