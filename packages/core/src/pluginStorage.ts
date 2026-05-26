// Public entry point of storage runtime DSL. Builder defineStorageRuntime создаёт
// LiteFsmStorageRuntimeDefinition, который plugin DSL принимает в section 'storage'.
// Validation/normalization вынесены в pluginStorageNormalize.ts; типы — в pluginStorageTypes.ts.

import { invalidPluginDefinition, isPlainObject } from "./pluginNormalize";
import { assertStorageRuntimeDefinition, normalizePublicStorageRuntime } from "./pluginStorageNormalize";
import type {
  PluginStorageRuntime,
  RejectUnknownMachineExtensionKeys,
  StorageMachineExtension,
  StorageRuntimeExtension,
  StorageRuntimeBuilder,
} from "./pluginStorageTypes";
import type { StorageRuntime } from "./runtime/kernel/storage";
import type { MachineRuntimeExtension } from "./types";

// === Storage runtime value marker ============================================

const liteFsmStorageRuntimeMarker: unique symbol = Symbol.for("lite-fsm.storage-runtime.value") as never;
const liteFsmStorageRuntimePayload: unique symbol = Symbol.for("lite-fsm.storage-runtime.payload") as never;
declare const liteFsmStorageRuntimeExtension: unique symbol;

export type LiteFsmStorageRuntimeDefinition<
  Kind extends string = string,
  MachineExtension extends MachineRuntimeExtension = MachineRuntimeExtension,
> = {
  readonly kind: Kind;
  readonly [liteFsmStorageRuntimeMarker]: true;
  readonly [liteFsmStorageRuntimePayload]: StorageRuntime;
  readonly [liteFsmStorageRuntimeExtension]: MachineExtension;
};

// === Factory / accessors =====================================================

const createStorageRuntimeValue = <const Kind extends string, Extension extends StorageRuntimeExtension>(
  definition: PluginStorageRuntime<Kind, Extension>,
): LiteFsmStorageRuntimeDefinition<Kind, StorageMachineExtension<Kind, Extension>> => {
  const runtime = assertStorageRuntimeDefinition(definition);
  const kind = runtime.kind as Kind;
  const normalized = normalizePublicStorageRuntime(kind, runtime);
  const value = { kind } as LiteFsmStorageRuntimeDefinition<Kind, StorageMachineExtension<Kind, Extension>>;

  Object.defineProperties(value, {
    [liteFsmStorageRuntimeMarker]: { value: true },
    [liteFsmStorageRuntimePayload]: { value: normalized },
  });

  return Object.freeze(value);
};

export const isLiteFsmStorageRuntimeDefinition = (value: unknown): value is LiteFsmStorageRuntimeDefinition =>
  isPlainObject(value) && Reflect.get(value, liteFsmStorageRuntimeMarker) === true;

export const getStorageRuntimePayload = (definition: LiteFsmStorageRuntimeDefinition): StorageRuntime =>
  Reflect.get(definition, liteFsmStorageRuntimePayload) as StorageRuntime;

export function defineStorageRuntime<
  Extension extends StorageRuntimeExtension = {},
>(): StorageRuntimeBuilder<Extension> {
  if (arguments.length > 0) {
    invalidPluginDefinition(
      "defineStorageRuntime must be called without arguments; use defineStorageRuntime().create(...).",
    );
  }

  return {
    create<const Kind extends string>(
      definition: PluginStorageRuntime<Kind, Extension> & RejectUnknownMachineExtensionKeys<Extension>,
    ) {
      return createStorageRuntimeValue<Kind, Extension>(definition as unknown as PluginStorageRuntime<Kind, Extension>);
    },
  };
}
