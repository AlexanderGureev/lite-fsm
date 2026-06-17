"use client";

import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { createRtsApp, type RtsApp } from "../app";
import type { GameConfig } from "../store";
import { GameView } from "./game";

type RtsGameProps = {
  autoStart?: boolean;
  initialConfig?: GameConfig;
};

export function RtsGame({ autoStart = false, initialConfig }: RtsGameProps = {}) {
  const appRef = useRef<RtsApp | null>(null);
  if (!appRef.current) appRef.current = createRtsApp({ autoStart, initialConfig });
  const app = appRef.current;

  return (
    <FSMContextProvider machineManager={app.store}>
      <GameView app={app} />
    </FSMContextProvider>
  );
}
