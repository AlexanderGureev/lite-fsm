import type { DiagnosticProviderInput, DiagnosticProviderRegistry } from "./types";

export const createNoopValidationRegistry = (): DiagnosticProviderRegistry => ({
  providerIds: [],
  async run(_input: DiagnosticProviderInput) {
    return [];
  },
});
