"use client";

import type { ReactNode } from "react";

import { useManager } from "@/src/store";
import { applyStoreInitialSeeds, type StoreInitialSeeds } from "@/src/store/initial-seeds";

export default function StoreSeedInitialize({
  seeds,
  children,
}: {
  seeds?: StoreInitialSeeds;
  children: ReactNode;
}) {
  const manager = useManager();

  applyStoreInitialSeeds(manager, seeds);

  return children;
}
