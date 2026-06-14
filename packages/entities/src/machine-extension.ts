import type {
  ActorPublicState,
  AnyEvent,
  ManagerAction,
  ReadonlyManagerAction,
  StorageDependentField,
  StorageDependentTypeLambda,
} from "@lite-fsm/core";

import type { EntityContextSchema, EntitySpawnPayload, EntitySpawnSchema } from "./schema";
import type { EntityIndex } from "./plugin";
import type { LiteFsmEntityLifecycleEvents } from "./runtime/lifecycle";
import type { ReadonlyEntityColumn } from "./runtime/access";

export declare const entityStateMetadata: unique symbol;

export type EntityMachineInput<
  ContextSchema extends EntityContextSchema = EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema = EntitySpawnSchema,
  Config extends object = object,
  AppDeps = unknown,
> = {
  readonly storage: "entity";
  readonly config: Config;
  readonly initialState: "__INIT";
  readonly initialContext: ContextSchema;
  readonly spawnSchema: SpawnSchema;
  readonly despawnOn?: ActorPublicState<Config> | readonly ActorPublicState<Config>[];
  readonly reactions?: EntityReactions<ContextSchema, AppDeps, Config>;
};

export type EntityMachineExtension<
  ContextSchema extends EntityContextSchema = EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema = EntitySpawnSchema,
  Config extends object = object,
  AppDeps = unknown,
> = AppDeps extends unknown
  ? {
      readonly storage: "entity";
      readonly internalEvents: LiteFsmEntityLifecycleEvents;
      readonly input: EntityMachineInput<ContextSchema, SpawnSchema, Config, AppDeps>;
      readonly reducerContext: StorageDependentField<EntityReducerContextLambda>;
      readonly effectDeps: StorageDependentField<EntityEffectDepsLambda>;
      readonly reactionDeps: StorageDependentField<EntityReactionDepsLambda<AppDeps>>;
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
    }
  : never;

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

type EntityEffectColumns<ContextSchema extends EntityContextSchema> = {
  readonly [Field in keyof ContextSchema]: ReadonlyEntityColumn<EntitySpawnPayload<ContextSchema>[Field]>;
};

export type EntityReducerStates<Config extends object> = {
  readonly [State in ActorPublicState<Config>]: number;
};

export type EntityReducerSelf<ContextSchema extends EntityContextSchema, Config extends object = object> = {
  readonly indices: readonly EntityIndex[];
  readonly states: EntityReducerStates<Config>;
  readonly presence: Uint8Array;
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly rowVersion: Uint32Array;
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
} & EntityReducerColumns<ContextSchema>;

export type EntityEffectSelf<ContextSchema extends EntityContextSchema, Config extends object = object> = {
  readonly indices: readonly EntityIndex[];
  readonly states: EntityReducerStates<Config>;
  readonly presence: ReadonlyEntityColumn<number>;
  readonly stateCode: ReadonlyEntityColumn<number>;
  readonly prevStateCode: ReadonlyEntityColumn<number>;
  readonly rowVersion: ReadonlyEntityColumn<number>;
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
} & EntityEffectColumns<ContextSchema>;

type EntityPlainAction<Events extends AnyEvent> = Events & { readonly meta?: never };

export type EntityEffectTransition<Events extends AnyEvent = AnyEvent> = {
  entity(entityId: string | readonly string[], action: EntityPlainAction<Events>): ManagerAction<Events>;
  actor(actorId: string | readonly string[], action: EntityPlainAction<Events>): ManagerAction<Events>;
  group(groupId: string | readonly string[], action: EntityPlainAction<Events>): ManagerAction<Events>;
  tag(groupTag: string | readonly string[], action: EntityPlainAction<Events>): ManagerAction<Events>;
  unscoped(action: EntityPlainAction<Events>): ManagerAction<Events>;
  despawn(entity: string | readonly string[] | readonly EntityIndex[]): void;
};

export type EntityEffectDeps<
  ContextSchema extends EntityContextSchema,
  Config extends object = object,
> = {
  readonly self: EntityEffectSelf<ContextSchema, Config>;
  readonly transition: EntityEffectTransition;
};

export type EntityReactionSelf<ContextSchema extends EntityContextSchema, Config extends object = object> =
  EntityEffectSelf<ContextSchema, Config>;

type EntityReactionRuntimeDeps<
  ContextSchema extends EntityContextSchema,
  Config extends object,
> = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly self: EntityReactionSelf<ContextSchema, Config>;
};

type EntityReactionUserDeps<AppDeps> = AppDeps extends object
  ? Omit<AppDeps, "action" | "condition" | "self" | "transition">
  : {};

export type EntityReactionDeps<
  ContextSchema extends EntityContextSchema,
  AppDeps = unknown,
  Config extends object = object,
> = EntityReactionUserDeps<AppDeps> &
  EntityReactionRuntimeDeps<ContextSchema, Config>;

export type EntityReaction<
  ContextSchema extends EntityContextSchema,
  AppDeps = unknown,
  Config extends object = object,
> = (deps: EntityReactionDeps<ContextSchema, AppDeps, Config>) => unknown;

export type EntityReactions<
  ContextSchema extends EntityContextSchema,
  AppDeps = unknown,
  Config extends object = object,
> = {
  readonly [eventType: string]: EntityReaction<ContextSchema, AppDeps, Config> | undefined;
};

export type EntityReducerContext<
  ContextSchema extends EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema,
  Config extends object = object,
> = {
  readonly self: EntityReducerSelf<ContextSchema, Config>;
  payloadFor(entity: EntityIndex): EntitySpawnPayload<SpawnSchema>;
};

type EntityReducerContextForInput<Input> = Input extends {
  readonly initialContext: infer ContextSchema extends EntityContextSchema;
  readonly spawnSchema: infer SpawnSchema extends EntitySpawnSchema;
  readonly config: infer Config extends object;
}
  ? EntityReducerContext<ContextSchema, SpawnSchema, Config>
  : never;

interface EntityReducerContextLambda extends StorageDependentTypeLambda {
  readonly type: this extends { readonly input: infer Input } ? EntityReducerContextForInput<Input> : never;
}

type EntityEffectDepsForInput<Input> = Input extends {
  readonly initialContext: infer ContextSchema extends EntityContextSchema;
  readonly config: infer Config extends object;
}
  ? EntityEffectDeps<ContextSchema, Config>
  : never;

interface EntityEffectDepsLambda extends StorageDependentTypeLambda {
  readonly type: this extends { readonly input: infer Input } ? EntityEffectDepsForInput<Input> : never;
}

type EntityReactionDepsForInput<Input, AppDeps> = Input extends {
  readonly initialContext: infer ContextSchema extends EntityContextSchema;
  readonly config: infer Config extends object;
}
  ? EntityReactionDeps<ContextSchema, AppDeps, Config>
  : never;

interface EntityReactionDepsLambda<AppDeps> extends StorageDependentTypeLambda {
  readonly type: this extends { readonly input: infer Input } ? EntityReactionDepsForInput<Input, AppDeps> : never;
}
