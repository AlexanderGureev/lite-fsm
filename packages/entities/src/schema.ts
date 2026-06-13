import { LiteFsmError } from "@lite-fsm/core";

export const descriptorMarker: unique symbol = Symbol.for("lite-fsm.entities.schema-descriptor") as never;

type NumericDescriptorKind = "f32" | "i16" | "i32" | "u8";
type DescriptorKind = NumericDescriptorKind | "string";
type DescriptorDefault = number | string;

type ColumnForKind<Kind extends DescriptorKind> = Kind extends "f32"
  ? Float32Array
  : Kind extends "i16"
    ? Int16Array
    : Kind extends "i32"
      ? Int32Array
      : Kind extends "u8"
        ? Uint8Array
        : readonly string[];

type ValueForKind<Kind extends DescriptorKind> = Kind extends NumericDescriptorKind ? number : string;

type DescriptorOptions<Value extends DescriptorDefault> = {
  readonly default?: Value;
};

type EntityDescriptorBase<Value, Column, Spawn> = {
  readonly [descriptorMarker]: true;
  readonly valueType?: Value;
  readonly columnType?: Column;
  readonly spawnType?: Spawn;
};

type EntityScalarDescriptor<Kind extends DescriptorKind> = EntityDescriptorBase<
  ValueForKind<Kind>,
  ColumnForKind<Kind>,
  ValueForKind<Kind>
> & {
  readonly kind: Kind;
  readonly default?: ValueForKind<Kind>;
};

type EntityOptionalDescriptor<Inner extends EntityScalarDescriptor<DescriptorKind>> = EntityDescriptorBase<
  never,
  never,
  DescriptorSpawnValue<Inner> | null
> & {
  readonly kind: "optional";
  readonly inner: Inner;
};

export type EntityDescriptor = EntityScalarDescriptor<DescriptorKind>;
export type EntitySpawnDescriptor = EntityDescriptor | EntityOptionalDescriptor<EntityDescriptor>;

export type EntityContextSchema = Readonly<Record<string, EntityDescriptor>>;
export type EntitySpawnSchema = Readonly<Record<string, EntitySpawnDescriptor>>;

type DescriptorValue<Descriptor> = Descriptor extends { readonly valueType?: infer Value } ? Value : never;
type DescriptorColumn<Descriptor> = Descriptor extends { readonly columnType?: infer Column } ? Column : never;
type DescriptorSpawnValue<Descriptor> = Descriptor extends { readonly spawnType?: infer Spawn } ? Spawn : never;

const reservedColumnNames = new Set([
  "count",
  "capacity",
  "ids",
  "indexById",
  "alive",
  "generation",
  "freeList",
  "stateCode",
  "version",
  "columns",
  "presence",
  "rowVersion",
  "indices",
  "states",
]);

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const createDescriptor = <Kind extends DescriptorKind>(
  kind: Kind,
  opts?: DescriptorOptions<ValueForKind<Kind>>,
): EntityScalarDescriptor<Kind> => {
  const descriptor = opts && hasOwn(opts, "default") ? { [descriptorMarker]: true, kind, default: opts.default } : {
    [descriptorMarker]: true,
    kind,
  };

  return Object.freeze(descriptor) as EntityScalarDescriptor<Kind>;
};

export const f32 = (opts?: DescriptorOptions<number>): EntityScalarDescriptor<"f32"> => createDescriptor("f32", opts);
export const i16 = (opts?: DescriptorOptions<number>): EntityScalarDescriptor<"i16"> => createDescriptor("i16", opts);
export const i32 = (opts?: DescriptorOptions<number>): EntityScalarDescriptor<"i32"> => createDescriptor("i32", opts);
export const u8 = (opts?: DescriptorOptions<number>): EntityScalarDescriptor<"u8"> => createDescriptor("u8", opts);
export const string = (opts?: DescriptorOptions<string>): EntityScalarDescriptor<"string"> =>
  createDescriptor("string", opts);

export const optional = <Inner extends EntityDescriptor>(inner: Inner): EntityOptionalDescriptor<Inner> =>
  Object.freeze({ [descriptorMarker]: true, kind: "optional", inner }) as EntityOptionalDescriptor<Inner>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const isEntityDescriptor = (value: unknown): value is EntitySpawnDescriptor =>
  isPlainObject(value) && Reflect.get(value, descriptorMarker) === true;

const isScalarDescriptor = (value: EntitySpawnDescriptor): value is EntityDescriptor =>
  value.kind === "f32" || value.kind === "i16" || value.kind === "i32" || value.kind === "u8" || value.kind === "string";

const schemaError = (machineKey: string, path: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' has invalid ${path}: ${reason}.`,
  );

const describeObjectValue = (value: object): string => {
  if (Array.isArray(value)) return "arrays are not supported in entity schemas";
  if (value instanceof Map) return "Map is not supported in entity schemas";
  if (value instanceof Set) return "Set is not supported in entity schemas";
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return "custom prototype objects are not supported in entity schemas";
  }
  return "unknown descriptor shape";
};

const assertDescriptorShape = (machineKey: string, path: string, descriptor: EntitySpawnDescriptor): void => {
  for (const key of Object.keys(descriptor)) {
    if (key !== "kind" && key !== "default" && key !== "inner") {
      throw schemaError(machineKey, path, `unknown descriptor property '${key}'`);
    }
  }
};

const validateDefault = (
  machineKey: string,
  path: string,
  descriptor: EntityDescriptor,
  defaultAllowed: boolean,
): void => {
  if (!hasOwn(descriptor, "default")) return;

  if (!defaultAllowed) {
    throw schemaError(machineKey, path, "default values are not allowed in spawnSchema");
  }

  const defaultValue = descriptor.default;
  if (descriptor.kind === "string" ? typeof defaultValue !== "string" : typeof defaultValue !== "number") {
    throw schemaError(machineKey, path, "default value does not match descriptor kind");
  }
};

const validateDescriptor = (
  machineKey: string,
  path: string,
  value: unknown,
  optionalAllowed: boolean,
  defaultAllowed: boolean,
): void => {
  if (!isEntityDescriptor(value)) {
    if (value !== null && typeof value === "object") {
      throw schemaError(machineKey, path, describeObjectValue(value));
    }
    throw schemaError(machineKey, path, "schema field must be a descriptor");
  }

  assertDescriptorShape(machineKey, path, value);

  if (value.kind === "optional") {
    if (!optionalAllowed) {
      throw schemaError(machineKey, path, "optional(...) is not allowed in initialContext");
    }
    validateDescriptor(machineKey, `${path}.inner`, value.inner, false, defaultAllowed);
    return;
  }

  if (!isScalarDescriptor(value)) {
    throw schemaError(machineKey, path, "unknown descriptor kind");
  }

  validateDefault(machineKey, path, value, defaultAllowed);
};

export const validateEntitySchema = (
  machineKey: string,
  path: "initialContext" | "spawnSchema",
  schema: unknown,
): void => {
  if (!isPlainObject(schema)) {
    if (schema !== null && typeof schema === "object") {
      throw schemaError(machineKey, path, describeObjectValue(schema));
    }
    throw schemaError(machineKey, path, "schema must be a plain object");
  }

  const optionalAllowed = path === "spawnSchema";
  const defaultAllowed = path === "initialContext";
  for (const [name, descriptor] of Object.entries(schema)) {
    if (reservedColumnNames.has(name)) {
      throw schemaError(machineKey, `${path}.${name}`, "column name is reserved");
    }
    validateDescriptor(machineKey, `${path}.${name}`, descriptor, optionalAllowed, defaultAllowed);
  }
};

export type EntitySchemaValue<Schema extends EntityContextSchema> = {
  readonly [Field in keyof Schema]: DescriptorValue<Schema[Field]>;
};

export type EntitySchemaColumns<Schema extends EntityContextSchema> = {
  readonly [Field in keyof Schema]: DescriptorColumn<Schema[Field]>;
};

export type EntitySpawnPayload<Schema extends EntitySpawnSchema> = {
  readonly [Field in keyof Schema]: DescriptorSpawnValue<Schema[Field]>;
};
