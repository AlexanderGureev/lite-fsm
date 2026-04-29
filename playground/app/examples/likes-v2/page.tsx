"use client";

import { useRef } from "react";
import { FSMContextProvider } from "lite-fsm/react";

import { Demo } from "./components/Demo";
import { makeStore, type AppStore } from "./store";

export default function LikesV2Page() {
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null) storeRef.current = makeStore();

  return (
    <FSMContextProvider machineManager={storeRef.current}>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <Demo />
      </main>
    </FSMContextProvider>
  );
}
