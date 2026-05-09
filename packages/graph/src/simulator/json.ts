import type { GraphDiagnostic, GraphJsonObject, GraphJsonValue } from "../types";
import type { GraphSimulationContext, GraphSimulationEvent } from "./types";
import { diagnosticForSendFailure } from "./diagnostics";

export const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const cloneJsonValue = (value: unknown): GraphJsonValue | undefined => {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items: GraphJsonValue[] = [];
    for (const item of value) {
      const jsonItem = cloneJsonValue(item);
      if (jsonItem === undefined) return undefined;

      items.push(jsonItem);
    }

    return items;
  }
  if (isPlainObject(value)) {
    const object: GraphJsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const jsonItem = cloneJsonValue(item);
      if (jsonItem === undefined) return undefined;

      object[key] = jsonItem;
    }

    return object;
  }

  return undefined;
};

export const cloneJsonObject = (value: unknown): GraphJsonObject | undefined => {
  if (!isPlainObject(value)) return undefined;

  return cloneJsonValue(value) as GraphJsonObject | undefined;
};

export const freezeDeep = <T>(value: T): T => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;

  for (const property of Object.values(value as Record<string, unknown>)) freezeDeep(property);

  return Object.freeze(value);
};

export const cloneEvent = (event: GraphSimulationEvent): GraphSimulationEvent => {
  const payload = hasOwn(event, "payload") ? cloneJsonValue(event.payload) : undefined;
  const meta = event.meta
    ? Object.fromEntries(
        Object.entries(event.meta).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
      )
    : undefined;

  return {
    type: event.type,
    ...(payload !== undefined ? { payload } : {}),
    ...(meta ? { meta } : {}),
  };
};

export const validateEvent = (event: GraphSimulationEvent): GraphDiagnostic | undefined => {
  if (!isPlainObject(event) || typeof event.type !== "string" || event.type.trim() === "") {
    return diagnosticForSendFailure("invalid-event", "Simulation event must be an object with a non-empty type.");
  }
  if (hasOwn(event, "payload") && cloneJsonValue(event.payload) === undefined) {
    return diagnosticForSendFailure("invalid-payload", "Simulation event payload must be JSON-safe.");
  }
  if (event.meta) {
    for (const value of Object.values(event.meta)) {
      if (typeof value === "string") continue;
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) continue;

      return diagnosticForSendFailure("invalid-event", "Simulation event meta values must be strings or string arrays.");
    }
  }

  return undefined;
};

export const validateContext = (context: GraphSimulationContext): GraphDiagnostic | undefined => {
  if (context.kind !== "json") return undefined;
  if (cloneJsonObject(context.value) !== undefined) return undefined;

  return diagnosticForSendFailure("invalid-context", "Simulation context must be a JSON-safe object.");
};

export const cloneContext = (context: GraphSimulationContext): GraphSimulationContext => {
  if (context.kind === "json") return { kind: "json", value: cloneJsonObject(context.value) ?? context.value };
  if (context.kind === "summary") return { kind: "summary", summary: { ...context.summary } };

  return { ...context };
};
