"use client";

import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { makeStore, type AppStore } from "../store";
import type { DemoProfile } from "../store/ssr";

export function StoreProvider({
  initialProfile,
  children,
}: {
  initialProfile: DemoProfile;
  children: React.ReactNode;
}) {
  const storeRef = useRef<AppStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = makeStore();
    storeRef.current.transition({ type: "INITIAL_PROFILE_SESSION", payload: initialProfile });
  }

  return <FSMContextProvider machineManager={storeRef.current}>{children}</FSMContextProvider>;
}
