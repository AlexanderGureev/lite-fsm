import {
  AnyEvent,
  AnyRecord,
  DefaultDeps,
  MachineConfig,
  MachineStore,
  MachinesState,
  Reducer,
  StateName,
  StateType,
  TransitionSubscriber,
  WILDCARD,
} from "./types";

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

type EffectDependencies<E> = "effects" extends keyof E
  ? keyof NonNullable<E["effects"]> extends never
    ? {}
    : UnionToIntersection<
        {
          [key in keyof NonNullable<E["effects"]>]: NonNullable<E["effects"]>[key] extends (deps: infer D) => unknown
            ? Omit<D, keyof DefaultDeps>
            : {};
        }[keyof NonNullable<E["effects"]>]
      >
  : {};

export type MachineDependencies<S extends MachineStore> = keyof S extends never
  ? {}
  : UnionToIntersection<
      {
        [key in keyof S]: EffectDependencies<S[key]>;
      }[keyof S]
    >;

type EventFromReducer<M> = M extends { reducer: MachineConfig<infer C, infer T, infer P, infer D>["reducer"] }
  ? [C, T, D] extends [object, AnyRecord, AnyRecord]
    ? P
    : never
  : never;

type EventFromMachineConfig<M> = M extends MachineConfig<infer C, infer T, infer P, infer D>
  ? [C, T, D] extends [object, AnyRecord, AnyRecord]
    ? P
    : never
  : never;

export type MachineEvents<S extends MachineStore> = {
  [key in keyof S]: EventFromReducer<S[key]> extends never
    ? EventFromMachineConfig<S[key]> extends never
      ? AnyEvent
      : EventFromMachineConfig<S[key]>
    : EventFromReducer<S[key]>;
}[keyof S];

export type IMachine<
  C extends object,
  T extends AnyRecord = {},
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
> = {
  transition: (state: StateType<C, T>, action: P) => StateType<C, T>;
  invokeEffect: (
    prevState: StateName<C>,
    currentState: StateName<C>,
    deps: D & DefaultDeps<StateName<C> | WILDCARD, C, P>,
  ) => Promise<void>;
  config: C;
};

export type IMachineManager<S extends MachineStore, P extends AnyEvent = MachineEvents<S>> = {
  transition: (payload: P) => P;
  getState: () => MachinesState<S>;
  onTransition: (cb: TransitionSubscriber<S, P>) => () => void;
  replaceReducer: (cb: (reducer: Reducer<MachinesState<S>, P>) => Reducer<MachinesState<S>, P>) => void;
  setDependencies: (d: MachineDependencies<S> | ((deps: MachineDependencies<S>) => MachineDependencies<S>)) => void;
};
