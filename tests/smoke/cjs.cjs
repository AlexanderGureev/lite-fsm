const assert = require("node:assert/strict");

const core = require("lite-fsm");
const devTools = require("lite-fsm/middleware/devTools");
const immer = require("lite-fsm/middleware/immer");
const react = require("lite-fsm/react");
const middleware = require("lite-fsm/middleware");

assert.equal(typeof core.Machine, "function");
assert.equal(typeof core.MachineManager, "function");
assert.equal(typeof core.createConfig, "function");
assert.equal(typeof core.createEffect, "function");
assert.equal(typeof core.createMachine, "function");
assert.equal(typeof core.createReducer, "function");
assert.equal(typeof core.defineMachine, "function");

assert.equal(typeof react.FSMContext, "object");
assert.equal(typeof react.FSMContextProvider, "function");
assert.equal(typeof react.defineMachine, "function");
assert.equal(typeof react.useManager, "function");
assert.equal(typeof react.useSelector, "function");
assert.equal(typeof react.useTransition, "function");

assert.equal(typeof middleware.devToolsMiddleware, "function");
assert.equal(typeof middleware.immerMiddleware, "function");
assert.equal(typeof devTools.devToolsMiddleware, "function");
assert.equal(typeof immer.immerMiddleware, "function");
