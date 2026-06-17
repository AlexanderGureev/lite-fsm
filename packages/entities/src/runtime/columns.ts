import type { EntityIndex } from "../plugin";
import type { EntityDescriptor } from "../schema";
import type { ColumnarActorStore, EntityColumn } from "./store-types";

type EntityColumnDescriptor = EntityDescriptor;

const emptyColumnFactories = {
  f32: () => new Float32Array(0),
  i16: () => new Int16Array(0),
  i32: () => new Int32Array(0),
  u8: () => new Uint8Array(0),
  string: () => [] as string[],
} as const satisfies Record<EntityColumnDescriptor["kind"], () => EntityColumn>;

export const createEmptyColumn = (descriptor: EntityColumnDescriptor): EntityColumn =>
  emptyColumnFactories[descriptor.kind]();

export const growColumn = (column: EntityColumn, descriptor: EntityColumnDescriptor, capacity: number): EntityColumn => {
  if (column.length >= capacity) return column;

  if (descriptor.kind === "string") {
    const next = (column as string[]).slice();
    next.length = capacity;
    for (let index = column.length; index < capacity; index += 1) next[index] = "";
    return next;
  }

  const next = emptyColumnFactories[descriptor.kind]() as Float32Array | Int16Array | Int32Array | Uint8Array;
  const grown = new (next.constructor as { new (length: number): typeof next })(capacity);
  grown.set(column as typeof next);
  return grown;
};

export const growInt16 = (value: Int16Array, capacity: number, fillValue = 0): Int16Array => {
  if (value.length >= capacity) return value;

  const next = new Int16Array(capacity);
  next.fill(fillValue);
  next.set(value);
  return next;
};

export const growInt32 = (value: Int32Array, capacity: number, fillValue = 0): Int32Array => {
  if (value.length >= capacity) return value;

  const next = new Int32Array(capacity);
  next.fill(fillValue);
  next.set(value);
  return next;
};

export const growUint8 = (value: Uint8Array, capacity: number): Uint8Array => {
  if (value.length >= capacity) return value;

  const next = new Uint8Array(capacity);
  next.set(value);
  return next;
};

export const growUint32 = (value: Uint32Array, capacity: number): Uint32Array => {
  if (value.length >= capacity) return value;

  const next = new Uint32Array(capacity);
  next.set(value);
  return next;
};

export const getInitialColumnValue = (descriptor: EntityColumnDescriptor): number | string => {
  if (descriptor.default !== undefined) return descriptor.default;
  return descriptor.kind === "string" ? "" : 0;
};

export const writeInitialColumnValues = (store: ColumnarActorStore, entity: EntityIndex): void => {
  for (const [name, descriptor] of Object.entries(store.metadata.initialContext)) {
    const column = store.columns[name];
    (column as Record<number, number | string>)[entity] = getInitialColumnValue(descriptor);
  }
};
