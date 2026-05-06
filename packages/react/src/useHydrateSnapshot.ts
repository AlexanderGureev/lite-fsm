"use client";

import { useRef } from "react";

import type { HydrateOptions, HydrateStrategy, MachineManagerSnapshot, MachineStore } from "@lite-fsm/core";

import { useManager } from "./useManager";
import { useIsomorphicLayoutEffect } from "./utils";

type AppliedSnapshot = { snapshot: unknown; strategy: HydrateStrategy };

export const useHydrateSnapshot = <S extends MachineStore>(
  snapshot: MachineManagerSnapshot<S>,
  opts?: HydrateOptions,
): void => {
  const manager = useManager<S>();
  const strategy = opts?.strategy ?? "merge";
  const appliedRef = useRef<AppliedSnapshot | null>(null);

  useIsomorphicLayoutEffect(() => {
    /* v8 ignore next -- защита от StrictMode replay с той же ссылкой. */
    if (appliedRef.current?.snapshot === snapshot && appliedRef.current.strategy === strategy) return;

    manager.hydrate(snapshot, { strategy });
    appliedRef.current = { snapshot, strategy };
  }, [manager, snapshot, strategy]);
};
