import {
  CFG,
  DefaultDeps,
  FSMEvent,
  MachineConfig,
  MachinesState,
  Reducer,
  State,
  TransitionSubscriber,
  WILDCARD,
} from "./types";

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

type EffectDependencies<E> = "effects" extends keyof E
  ? keyof NonNullable<E["effects"]> extends never
    ? {}
    : UnionToIntersection<
        {
          [key in keyof NonNullable<E["effects"]>]: NonNullable<E["effects"]>[key] extends (deps: infer D) => any
            ? Omit<D, keyof DefaultDeps<any, any, any>>
            : {};
        }[keyof NonNullable<E["effects"]>]
      >
  : {};

export type MachineDependencies<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
> = UnionToIntersection<
  {
    [key in keyof S]: EffectDependencies<S[key]>;
  }[keyof S]
>;

export type MachineEvents<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
> = {
  [key in keyof S]: S[key] extends MachineConfig<any, any, infer P, any> ? P : never;
}[keyof S];

export interface IMachine<
  C extends CFG<C, P, keyof C | WILDCARD>,
  T extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> {
  transition: (state: { state: State<keyof C>; context: T }, action: P) => { state: State<keyof C>; context: T };
  invokeEffect: (
    prevState: State<keyof C>,
    currentState: State<keyof C>,
    deps: D & DefaultDeps<any, C, P>,
  ) => Promise<void>;
  config: C;
}

export interface IMachineManager<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  P extends FSMEvent<any, any> = MachineEvents<S>,
> {
  transition: (payload: P) => P;
  getState: () => MachinesState<S>;
  onTransition: (cb: TransitionSubscriber<S, P>) => () => void;
  replaceReducer: (cb: (reducer: Reducer<MachinesState<S>, P>) => Reducer<MachinesState<S>, P>) => void;
  setDependencies: (d: MachineDependencies<S> | ((deps: MachineDependencies<S>) => MachineDependencies<S>)) => void;
}
