import assert from "node:assert/strict";

import * as core from "lite-fsm";
import * as devTools from "lite-fsm/middleware/devTools";
import * as immer from "lite-fsm/middleware/immer";
import * as react from "lite-fsm/react";
import * as middleware from "lite-fsm/middleware";

assert.equal(typeof core.Machine, "function");
assert.equal(typeof core.MachineManager, "function");
assert.equal(typeof core.createConfig, "function");
assert.equal(typeof core.createActorMeta, "function");
assert.equal(typeof core.createEffect, "function");
assert.equal(typeof core.createMachine, "function");
assert.equal(typeof core.createReducer, "function");
assert.equal(typeof core.defineMachine, "function");
assert.equal(typeof core.LiteFsmError, "function");

assert.equal(typeof react.FSMContext, "object");
assert.equal(typeof react.FSMContextProvider, "function");
assert.equal(typeof react.FSMHydrationBoundary, "function");
assert.equal(typeof react.defineMachine, "function");
assert.equal(typeof react.useHydrateSnapshot, "function");
assert.equal(typeof react.useManager, "function");
assert.equal(typeof react.useSelector, "function");
assert.equal(typeof react.useTransition, "function");

assert.equal(typeof middleware.devToolsMiddleware, "function");
assert.equal(typeof middleware.immerMiddleware, "function");
assert.equal(typeof devTools.devToolsMiddleware, "function");
assert.equal(typeof immer.immerMiddleware, "function");
assert.equal("ACTOR_RESTORE" in core, false);
assert.equal("DEVTOOLS_API" in core, false);

let devToolsListener = () => {};
const fakeDevTools = {
  init() {},
  send(_action, state) {
    fakeDevTools.lastState = state;
  },
  subscribe(cb) {
    devToolsListener = cb;
  },
  lastState: undefined,
};

globalThis.window = {
  __REDUX_DEVTOOLS_EXTENSION__: {
    connect: () => fakeDevTools,
  },
};

const actor = {
  config: { __INIT: { START: "PENDING" }, PENDING: { BUMP: null } },
  initialState: "__INIT",
  initialContext: { id: "", count: 0 },
  reducer: (state, action, meta) => {
    if (action.type === "START") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
    if (action.type === "BUMP") return { state: state.state, context: { ...state.context, count: state.context.count + 1 } };
    return state;
  },
};

const manager = core.MachineManager({ sync: actor }, { middleware: [devTools.devToolsMiddleware()] });
manager.transition({ type: "START", payload: { id: "a" } });

assert.deepEqual(fakeDevTools.lastState.sync["sync/0"].meta, {
  actorId: "sync/0",
  groupId: "sync/0",
  groupTag: "sync",
});

devToolsListener({
  type: "DISPATCH",
  payload: { type: "JUMP_TO_ACTION" },
  state: JSON.stringify({ sync: {} }),
});
assert.deepEqual(manager.getState().sync, {});

devToolsListener({
  type: "DISPATCH",
  payload: { type: "JUMP_TO_ACTION" },
  state: JSON.stringify(fakeDevTools.lastState),
});
manager.transition({ type: "BUMP", meta: { groupId: "sync/0" } });
assert.equal(manager.getState().sync["sync/0"].context.count, 2);

delete globalThis.window;
