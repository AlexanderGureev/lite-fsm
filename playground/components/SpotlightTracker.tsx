"use client";

import { useEffect } from "react";

export function SpotlightTracker() {
  useEffect(() => {
    const root = document.documentElement;
    let frameId = 0;
    let nextX = -9999;
    let nextY = -9999;

    const apply = () => {
      frameId = 0;
      root.style.setProperty("--spot-x", nextX.toFixed(1));
      root.style.setProperty("--spot-y", nextY.toFixed(1));
    };

    const onPointer = (event: PointerEvent) => {
      nextX = event.clientX;
      nextY = event.clientY;
      if (frameId === 0) frameId = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (frameId !== 0) cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}
