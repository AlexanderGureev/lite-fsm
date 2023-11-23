/* eslint-disable @typescript-eslint/ban-types -- ok */
export type SType = string | number | symbol;

export type FSMConfig<S extends SType, E extends string> = {
  [state in S]?: {
    [event in E]?: S | null;
  };
};

export type Subscriber<S extends SType, C extends Record<string, any>> = (
  prevState: { state: S; context: C },
  currentState: { state: S; context: C },
) => void;

export type MachinesState<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
> = {
  [key in keyof S]: {
    state: keyof S[key]["config"];
    context: S[key]["initialContext"];
  };
};

export type TransitionSubscriber<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
> = (prevState: MachinesState<S>, currentState: MachinesState<S>) => void;

export type DefaultDeps<
  // S extends SType = any,
  // C extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
> = {
  transition: (data: P) => void;
  // getState: () => { state: S; context: C };
  action: P;
};

export type Reducer<S, P extends FSMEvent<any, any> = any> = (state: S, action: P) => S;

export type MiddlewareApi<S, P extends FSMEvent<any, any> = any> = {
  getState: () => S;
  transition: (action: P) => P;
  replaceReducer: (cb: (reducer: Reducer<S, P>) => Reducer<S, P>) => void;
};

export type Middleware<S = any, P extends FSMEvent<any, any> = any> = (
  api: MiddlewareApi<S, P>,
) => (next: <T>(action: P) => T) => (action: P) => void;

export type MachineReducer<S extends SType, P extends FSMEvent<any, any>, C extends Record<string, any>> = (
  state: { state: S; context: C },
  payload: P,
  config: FSMConfig<S, P["type"]>,
) => { state: S; context: C } | void;

export type MachineEffect<P extends FSMEvent<any, any> = any, D extends Record<string, any> = {}> = (
  deps: D & DefaultDeps<P>,
) => Promise<void> | void;

export type MachineConfig<
  S extends SType,
  E extends SType,
  C extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> = {
  config: FSMConfig<S, P["type"]>;
  initialState: S;
  initialContext: C;
  reducer?: MachineReducer<S, P, C>;
  effects?: {
    [key in S & E]?: MachineEffect<P, D>;
  };
};

export type TypedCreateMachineFn<P extends FSMEvent<any, any> = any, D extends Record<string, any> = any> = <
  Z extends Record<string, any>,
  E extends Record<string, any>,
  C extends Record<string, any>,
>(
  cfg: MachineConfig<keyof Z, keyof E, C, P, D>,
) => MachineConfig<keyof Z, keyof E, C, P, D>;

export type FSMEvent<Name extends string, Payload = undefined> = Payload extends undefined
  ? { type: Name; payload?: undefined }
  : {
      type: Name;
      payload: Payload;
    };

export type TypedCreateReducerFn<P extends FSMEvent<any, any> = any> = <S extends SType, C extends Record<string, any>>(
  reducer: MachineReducer<S, P, C>,
) => MachineReducer<S, P, C>;

export type TypedCreateConfigFn<P extends FSMEvent<any, any> = any> = <
  Z extends Record<string, any>,
  E extends Record<string, any>,
  C extends Record<string, any>,
>(
  cfg: MachineConfig<keyof Z, keyof E, C, P, any>["config"],
) => MachineConfig<keyof Z, keyof E, C, P, any>["config"];

export type TypedCreateEffectFn<P extends FSMEvent<any, any> = any, D extends Record<string, any> = any> = (
  effect: MachineEffect<P, D>,
) => MachineEffect<P, D>;
