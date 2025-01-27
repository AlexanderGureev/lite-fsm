/* eslint-disable @typescript-eslint/ban-types -- ok*/
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

export interface IMachine<
  C extends CFG<C, P, keyof C | WILDCARD>,
  T extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> {
  transition: (state: { state: State<keyof C>; context: T }, action: P) => { state: State<keyof C>; context: T };
  // getState: () => { state: S; context: C };
  // onTransition: (cb: Subscriber<S, C>) => () => void;
  // invokeSubscribers: (prevState: { state: S; context: C }) => void;
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
  P extends FSMEvent<any, any> = any,
> {
  transition: (payload: P) => void;
  getState: () => MachinesState<S>;
  onTransition: (cb: TransitionSubscriber<S>) => () => void;
  replaceReducer: (cb: (reducer: Reducer<MachinesState<S>, P>) => Reducer<MachinesState<S>, P>) => void;
  setDependencies: <D extends Record<string, any> = {}>(d: D | ((deps: D) => D)) => void;
}
