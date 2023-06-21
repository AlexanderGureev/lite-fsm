import {
  Subscriber,
  MachineConfig,
  FSMConfig,
  DefaultDeps,
  TransitionSubscriber,
  MachinesState,
  Reducer,
  FSMEvent,
} from "./types";

export interface IMachine<
  S extends string = any,
  C extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> {
  transition: (state: { state: S; context: C }, payload: P) => { state: S; context: C };
  getState: () => { state: S; context: C };
  onTransition: (cb: Subscriber<S, C>) => () => void;
  invokeSubscribers: (prevState: { state: S; context: C }) => void;
  invokeEffect: (state: S, deps: D & DefaultDeps<S, C, P>) => Promise<void>;
  config: FSMConfig<S, P["type"]>;
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
  setDependencies: <D extends Record<string, any> = {}>(d: D) => void;
}
