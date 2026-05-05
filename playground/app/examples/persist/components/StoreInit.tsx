"use client";

import React from "react";
import { FSMConfigType } from "../store";
import { FSMHydrationBoundary } from "lite-fsm/react";

export function StoreInit({ data, children }: React.PropsWithChildren<{ data: { id: string } }>) {
  return (
    <FSMHydrationBoundary<FSMConfigType>
      snapshot={{
        machines: {
          profile: {
            state: "READY",
            context: data,
          },
        },
      }}
    >
      {children}
    </FSMHydrationBoundary>
  );
}
