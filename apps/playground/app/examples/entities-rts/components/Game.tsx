"use client";

import type { RtsApp } from "../app";
import { useSelector } from "../store";
import { ArmedShell } from "./hud/armed-shell";
import { StartScreen } from "./hud/start-screen";

export function GameView({ app }: { app: RtsApp }) {
  const status = useSelector((state) => state.gameSession.state);
  if (status === "CONFIGURING") return <StartScreen />;
  return <ArmedShell app={app} />;
}
