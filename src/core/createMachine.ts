import type {
  AnyEvent,
  AnyRecord,
  ActorDehydrateHook,
  ActorHydrateHook,
  ActorPersistence,
  CFG,
  DefaultActorSnapshot,
  MachineConfig,
  StateName,
  StateType,
  WILDCARD,
} from "./types";

// === Дефолтный снимок =======================================================
//
// Если cfg.dehydrate не задан, Snapshot = дефолтный снимок, зависящий от
// типа машины (actor / domain). Snapshot не выводится через посредника `M` —
// иначе TS вынужденно выводит `M` со всеми полями cfg, что даёт дублирование
// `config: C & C` в hover. Сейчас Snapshot инферится напрямую из cfg.dehydrate
// через contextual `MachineConfig.dehydrate: (...args) => Snapshot`.

type HasLiteralInit<C extends object> = string extends keyof C ? false : "__INIT" extends keyof C ? true : false;

type DefaultSnapshotForConfig<C extends object, T extends AnyRecord> =
  HasLiteralInit<C> extends true ? DefaultActorSnapshot<C, T> : StateType<C, T>;

// === Захват literal persistence ==============================================

type CapturedPersistence = ActorPersistence | undefined;
type WithCapturedPersistence<Persistence> = [Persistence] extends [undefined] ? {} : { persistence: Persistence };

type Prettify<T> = { [K in keyof T]: T[K] } & {};

type CreateMachineResult<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
> = HasLiteralInit<C> extends true
  ? Prettify<MachineConfig<C, T, P, D, Snapshot> & WithCapturedPersistence<Persistence>>
  : MachineConfig<C, T, P, D, Snapshot>;

// === Public API =============================================================

// Два разных union-а ключей CFG для DX-completions:
// - `ConfigKeys` параметризует `[state in K]` mapped type — литералы отсюда TS
//   предлагает в completions как имена source state. `"__INIT"` нужен здесь,
//   чтобы подсказывать spawn-edge даже когда `C` ещё не выведен.
// - `ConfigTargetStates` параметризует `TransitionMap` (target values).
//   `"__INIT"` сюда добавлять НЕЛЬЗЯ: TS перебирает строковые литералы из
//   выражения типа и предлагает их в completions, не учитывая
//   `Exclude<..., "__INIT">` внутри `ActorTransitionTarget`. Для actor template
//   `__INIT` всё равно попадёт сюда через `StateName<C>` после inference, но
//   это происходит на уровне типов, а не литералов из выражения.
type ConfigKeys<C extends object> = StateName<C> | WILDCARD | "__INIT";
type ConfigTargetStates<C extends object> = StateName<C> | WILDCARD;

type MachineBaseInput<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
> = Pick<MachineConfig<C, T, P, D, Snapshot>, "config" | "initialState" | "initialContext" | "reducer" | "effects">;

type ActorSnapshotHooks<C extends object, T extends AnyRecord, Snapshot> = {
  hydrate?: ActorHydrateHook<C, T, Snapshot>;
  dehydrate?: ActorDehydrateHook<C, T, Snapshot>;
};

type ActorPersistenceInput<C extends object, T extends AnyRecord, Snapshot> = {
  persistence?: ActorPersistence;
  groupTag?: string;
} & ActorSnapshotHooks<C, T, Snapshot> &
  (
    | {
        persistence?: "runtime";
        hydrate?: never;
        dehydrate?: never;
      }
    | { persistence: "snapshot" }
  );

type CreateMachineInput<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
> = HasLiteralInit<C> extends true
  ? MachineBaseInput<C, T, P, D, Snapshot> &
      ActorPersistenceInput<C, T, Snapshot> & { persistence?: Persistence | ActorPersistence }
  : MachineConfig<C, T, P, D, Snapshot>;

export type TypedCreateMachineFn<P extends AnyEvent = AnyEvent, D extends AnyRecord = {}> = <
  C extends CFG<C, P, ConfigKeys<C>, ConfigTargetStates<C>>,
  T extends AnyRecord,
  Snapshot = DefaultSnapshotForConfig<C, T>,
  Persistence extends CapturedPersistence = undefined,
>(
  cfg: CreateMachineInput<C, T, P, D, Snapshot, Persistence>,
) => CreateMachineResult<C, T, P, D, Snapshot, Persistence>;

export function createMachine<
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends CFG<C, P, ConfigKeys<C>, ConfigTargetStates<C>> = Record<string, never>,
  T extends AnyRecord = {},
  Snapshot = DefaultSnapshotForConfig<C, T>,
  Persistence extends CapturedPersistence = undefined,
>(
  cfg: CreateMachineInput<C, T, P, D, Snapshot, Persistence>,
): CreateMachineResult<C, T, P, D, Snapshot, Persistence> {
  return cfg as CreateMachineResult<C, T, P, D, Snapshot, Persistence>;
}
