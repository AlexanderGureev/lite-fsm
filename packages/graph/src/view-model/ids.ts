import type { GraphDiagnostic } from "../types";
import type { GraphDiagnosticAnchor } from "./types";

export const configRowId = (transitionId: string): string => `config:${transitionId}`;

export const reducerRowId = (transitionId: string): string => `reducer:${transitionId}`;

export const effectRowId = (emissionId: string): string => `effect:${emissionId}`;

export const diagnosticRowId = (diagnosticId: string): string => `diagnostic:${diagnosticId}`;

export const diagnosticBucketKey = (
  origin: GraphDiagnosticAnchor["origin"],
  diagnostic: GraphDiagnostic,
): string => {
  const loc = diagnostic.loc
    ? `${diagnostic.loc.start.line}:${diagnostic.loc.start.column}:${diagnostic.loc.start.offset}-${diagnostic.loc.end.line}:${diagnostic.loc.end.column}:${diagnostic.loc.end.offset}`
    : "no-loc";

  return [origin, diagnostic.machineId ?? "document", diagnostic.code, loc].join(":");
};

export const diagnosticId = (
  origin: GraphDiagnosticAnchor["origin"],
  diagnostic: GraphDiagnostic,
  ordinal: number,
): string => `${diagnosticBucketKey(origin, diagnostic)}:${ordinal}`;

export const machineTransitionKey = (machineId: string, transitionId: string): string =>
  `${machineId}:${transitionId}`;

export const machineEmissionKey = (machineId: string, emissionId: string): string => `${machineId}:${emissionId}`;
