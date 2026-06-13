// Public entry point of storage runtime DSL. Builder defineStorageRuntime создаёт
// LiteFsmStorageRuntimeDefinition, который plugin DSL принимает в section 'storage'.
// Validation/normalization вынесены в pluginStorageNormalize.ts; типы — в pluginStorageTypes.ts.

import { invalidPluginDefinition, isPlainObject } from "./pluginNormalize";
import { assertStorageRuntimeDefinition, normalizePublicStorageRuntime } from "./pluginStorageNormalize";
import type {
  PluginStorageRuntime,
  RejectUnknownMachineExtensionKeys,
  StorageMachineExtension,
  StorageRequiredRouteMetaForKeys,
  StorageRouteMetaKeys,
  StorageRuntimeExtension,
  StorageRuntimeBuilder,
  StorageMachineTypingExtension,
} from "./pluginStorageTypes";

// === Storage runtime value marker ============================================

const liteFsmStorageRuntimeMarker: unique symbol = Symbol.for("lite-fsm.storage-runtime.value") as never;
const liteFsmStorageRuntimePayload: unique symbol = Symbol.for("lite-fsm.storage-runtime.payload") as never;
declare const liteFsmStorageRuntimeOpaquePayload: unique symbol;
declare const liteFsmStorageRuntimeExtension: unique symbol;
declare const liteFsmStorageRouteMetaRequirements: unique symbol;

type LiteFsmStorageRuntimePayload = {
  readonly [liteFsmStorageRuntimeOpaquePayload]: never;
};

export type LiteFsmStorageRuntimeDefinition<
  Kind extends string = string,
  MachineExtension extends StorageMachineTypingExtension = StorageMachineTypingExtension,
  RouteMetaRequirements extends object = object,
> = {
  readonly kind: Kind;
  readonly [liteFsmStorageRuntimeMarker]: true;
  readonly [liteFsmStorageRuntimePayload]: LiteFsmStorageRuntimePayload;
  readonly [liteFsmStorageRuntimeExtension]: MachineExtension;
  readonly [liteFsmStorageRouteMetaRequirements]: RouteMetaRequirements;
};

// === Factory / accessors =====================================================

const createStorageRuntimeValue = <
  const Kind extends string,
  Extension extends StorageRuntimeExtension,
  RouteMetaRequirements extends object,
>(
  definition: PluginStorageRuntime<Kind, Extension>,
): LiteFsmStorageRuntimeDefinition<Kind, StorageMachineExtension<Kind, Extension>, RouteMetaRequirements> => {
  const runtime = assertStorageRuntimeDefinition(definition);
  const kind = runtime.kind as Kind;
  const normalized = normalizePublicStorageRuntime(kind, runtime);
  const value = { kind } as LiteFsmStorageRuntimeDefinition<
    Kind,
    StorageMachineExtension<Kind, Extension>,
    RouteMetaRequirements
  >;

  Object.defineProperties(value, {
    [liteFsmStorageRuntimeMarker]: { value: true },
    [liteFsmStorageRuntimePayload]: { value: normalized },
  });

  return Object.freeze(value);
};

export const isLiteFsmStorageRuntimeDefinition = (value: unknown): value is LiteFsmStorageRuntimeDefinition =>
  isPlainObject(value) && Reflect.get(value, liteFsmStorageRuntimeMarker) === true;

export const getStorageRuntimePayload = (definition: LiteFsmStorageRuntimeDefinition): unknown =>
  Reflect.get(definition, liteFsmStorageRuntimePayload);

export function defineStorageRuntime<
  Extension extends StorageRuntimeExtension = {},
>(): StorageRuntimeBuilder<Extension> {
  if (arguments.length > 0) {
    invalidPluginDefinition(
      "defineStorageRuntime must be called without arguments; use defineStorageRuntime().create(...).",
    );
  }

  return {
    create<const Kind extends string, const RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined>(
      definition: PluginStorageRuntime<Kind, Extension, RouteMetaKeys> & RejectUnknownMachineExtensionKeys<Extension>,
    ) {
      return createStorageRuntimeValue<Kind, Extension, StorageRequiredRouteMetaForKeys<Extension, RouteMetaKeys>>(
        definition as unknown as PluginStorageRuntime<Kind, Extension>,
      );
    },
  };
}
