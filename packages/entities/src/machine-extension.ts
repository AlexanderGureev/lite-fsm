import type { EntityContextSchema, EntitySpawnSchema } from "./schema";

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
  readonly input: EntityMachineInput<ContextSchema, SpawnSchema, Config>;
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
