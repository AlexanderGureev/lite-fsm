type SType = string | number | symbol;

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
  S extends SType = any,
  C extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
> = {
  transition: (data: P) => void;
  getState: () => { state: S; context: C };
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

export type MachineConfig<
  S extends SType,
  C extends Record<string, any> = {},
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> = {
  config: FSMConfig<S, P["type"]>;
  initialState: S;
  initialContext: C;
  reducer?: (
    state: { state: S; context: C },
    payload: P,
    config: FSMConfig<S, P["type"]>,
  ) => { state: S; context: C } | void;
  effects?: {
    [key in S]?: (deps: D & DefaultDeps<S, C, P>) => Promise<void>;
  };
};

export type TypedCreateMachineFn<P extends FSMEvent<any, any> = any, D extends Record<string, any> = any> = <
  Z extends Record<string, any>,
  C extends Record<string, any>,
>(
  cfg: MachineConfig<keyof Z, C, P, D>,
) => MachineConfig<keyof Z, C, P, D>;

export type FSMEvent<Name extends string, Payload = undefined> = Payload extends undefined
  ? { type: Name; payload?: undefined }
  : {
      type: Name;
      payload: Payload;
    };
