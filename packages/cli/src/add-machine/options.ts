import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";

export type AddMachineOptions = {
  name: string;
};

export type RawAddMachineOptions = {
  name?: unknown;
};

export type NormalizeAddMachineOptionsResult =
  | { ok: true; options: AddMachineOptions }
  | { ok: false; diagnostics: CliDiagnostic[] };

const stringOption = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

export const normalizeAddMachineOptions = (rawOptions: RawAddMachineOptions): NormalizeAddMachineOptionsResult => {
  const name = stringOption(rawOptions.name);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Machine name is required.", {
          hint: "Pass a name like user-session, user_session, or userSession.",
        }),
      ],
    };
  }

  return { ok: true, options: { name } };
};
