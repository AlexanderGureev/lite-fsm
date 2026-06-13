import type { StorageDependentField, StorageDependentTypeLambda } from "@lite-fsm/core";

import type { EntityContextSchema, EntitySpawnPayload, EntitySpawnSchema } from "./schema";
import type { EntityIndex } from "./plugin";
import type { LiteFsmEntityLifecycleEvents } from "./runtime/lifecycle";

export declare const entityStateMetadata: unique symbol;

export type EntityMachineInput<
  ContextSchema extends EntityContextSchema = EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema = EntitySpawnSchema,
  Config extends object = object,
> = {
  readonly storage: "entity";
  readonly config: Config;
  readonly initialState: "__INIT";
  readonly initialContext: ContextSchema;
  readonly spawnSchema: SpawnSchema;
};

export type EntityMachineExtension<
  ContextSchema extends EntityContextSchema = EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema = EntitySpawnSchema,
  Config extends object = object,
> = {
  readonly storage: "entity";
  readonly internalEvents: LiteFsmEntityLifecycleEvents;
  readonly input: EntityMachineInput<ContextSchema, SpawnSchema, Config>;
  readonly reducerContext: StorageDependentField<EntityReducerContextLambda>;
  readonly resultMetadata: <Input extends EntityMachineInput<ContextSchema, SpawnSchema, Config>>(input: Input) => {
    readonly entityContextSchema: Input["initialContext"];
    readonly entitySpawnSchema: Input["spawnSchema"];
  };
  readonly publicState: <Input extends EntityMachineInput<ContextSchema, SpawnSchema, Config>>(
    input: Input,
  ) => EntityMachinePublicState<{
    readonly entityContextSchema: Input["initialContext"];
    readonly entitySpawnSchema: Input["spawnSchema"];
  }>;
};

export type EntityMachineStateMetadata<
  ContextSchema extends EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema,
> = {
  readonly entityContextSchema: ContextSchema;
  readonly entitySpawnSchema: SpawnSchema;
};

export type EntityMachinePublicState<Metadata> = {
  readonly storage: "entity";
  readonly version: number;
  readonly count: number;
  readonly capacity: number;
  readonly [entityStateMetadata]?: Metadata;
};

export type EntityReducerColumn<T> = {
  [entity: EntityIndex]: T;
};

type DescriptorMutableColumn<Descriptor> = Descriptor extends { readonly kind: "f32" }
  ? Float32Array
  : Descriptor extends { readonly kind: "i16" }
    ? Int16Array
    : Descriptor extends { readonly kind: "i32" }
      ? Int32Array
      : Descriptor extends { readonly kind: "u8" }
        ? Uint8Array
        : Descriptor extends { readonly kind: "string" }
          ? string[]
          : never;

type EntityReducerColumns<ContextSchema extends EntityContextSchema> = {
  readonly [Field in keyof ContextSchema]: DescriptorMutableColumn<ContextSchema[Field]>;
};

export type EntityReducerSelf<ContextSchema extends EntityContextSchema> = {
  readonly indices: readonly EntityIndex[];
  readonly stateCode: EntityReducerColumn<number>;
  readonly prevStateCode: EntityReducerColumn<number>;
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
} & EntityReducerColumns<ContextSchema>;

export type EntityReducerContext<
  ContextSchema extends EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema,
> = {
  readonly self: EntityReducerSelf<ContextSchema>;
  payloadFor(entity: EntityIndex): EntitySpawnPayload<SpawnSchema>;
};

type EntityReducerContextForInput<Input> = Input extends {
  readonly initialContext: infer ContextSchema extends EntityContextSchema;
  readonly spawnSchema: infer SpawnSchema extends EntitySpawnSchema;
}
  ? EntityReducerContext<ContextSchema, SpawnSchema>
  : never;

interface EntityReducerContextLambda extends StorageDependentTypeLambda {
  readonly type: this extends { readonly input: infer Input } ? EntityReducerContextForInput<Input> : never;
}
