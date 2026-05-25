import type { StorageRuntime } from "../kernel/storage";
import {
  asInstanceRuntimeState,
  compileInstanceTemplate,
  createInstanceRuntimeState,
  validateInstanceTemplate,
} from "./manager";

export const INSTANCE_STORAGE_KIND = "instance";

export const instanceStorageRuntime: StorageRuntime = {
  kind: INSTANCE_STORAGE_KIND,
  validateTemplate(ctx) {
    validateInstanceTemplate(ctx);
  },
  compileTemplate(ctx) {
    return compileInstanceTemplate(ctx);
  },
  createRuntimeState(ctx) {
    return createInstanceRuntimeState(ctx);
  },
  createPublicInitialState({ template, state }) {
    return asInstanceRuntimeState(state).initialState[template.key];
  },
  prepareAction(ctx) {
    return asInstanceRuntimeState(ctx.state).prepareAction(ctx);
  },
  beginReduce(ctx) {
    return asInstanceRuntimeState(ctx.state).beginReduce(ctx);
  },
  acceptsEvent({ state }) {
    return asInstanceRuntimeState(state).acceptsEvent();
  },
  reduce(ctx) {
    return asInstanceRuntimeState(ctx.state).reduce(ctx);
  },
  commit(ctx) {
    asInstanceRuntimeState(ctx.state).commit(ctx);
  },
  effects: {
    condition(ctx) {
      return asInstanceRuntimeState(ctx.state).condition(ctx.predicate);
    },
    resolveInvocations(ctx) {
      return asInstanceRuntimeState(ctx.state).resolveEffectInvocations(ctx);
    },
    invoke(ctx) {
      asInstanceRuntimeState(ctx.state).invokeEffect(ctx);
    },
  },
  snapshot: {
    dehydrate(ctx) {
      return { machines: asInstanceRuntimeState(ctx.state).dehydrate(ctx).machines };
    },
    hydrate(ctx) {
      return asInstanceRuntimeState(ctx.state).hydrate(ctx);
    },
  },
  identity: {
    resolve(ctx) {
      return asInstanceRuntimeState(ctx.state).resolveIdentity(ctx);
    },
  },
};
