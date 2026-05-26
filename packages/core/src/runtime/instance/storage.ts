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
  reduceScope: "bucket",
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
  beforeReduce(ctx) {
    return asInstanceRuntimeState(ctx.state).beforeReduce(ctx);
  },
  reduceBucket(ctx) {
    return asInstanceRuntimeState(ctx.state).reduceBucket(ctx);
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
