"use client";

import { useSelector, useTransition } from "@/src/store";

export default function LampPanel() {
  const transition = useTransition();
  const { state, context } = useSelector((rootState) => rootState.lamp);
  const isOn = state === "ON";

  return (
    <section className="w-[min(560px,100%)] rounded-[20px] border border-slate-400/15 bg-slate-900/70 p-7">
      <header className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-blue-400">Lamp · sync FSM</p>
        <h2 className="text-[22px] font-semibold leading-tight">Простой переключатель</h2>
      </header>

      <div className="flex flex-col items-center gap-4 pb-6 pt-8">
        <div
          className={`h-[88px] w-[88px] rounded-full transition-[background,box-shadow,transform] duration-300 ${isOn ? "lamp-on" : "lamp-off"}`}
          aria-hidden
        />
        <span className="font-mono text-[13px] tracking-[0.1em] text-slate-400">{state}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => transition({ type: "TURN_ON" })}
          disabled={isOn}
          className="rounded-[10px] bg-blue-600 px-4 py-2.5 text-sm font-medium text-blue-50 transition-[background,opacity] duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          TURN_ON
        </button>
        <button
          type="button"
          onClick={() => transition({ type: "TURN_OFF" })}
          disabled={!isOn}
          className="rounded-[10px] bg-blue-600 px-4 py-2.5 text-sm font-medium text-blue-50 transition-[background,opacity] duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          TURN_OFF
        </button>
        <button
          type="button"
          onClick={() => transition({ type: "RESET" })}
          className="rounded-[10px] border border-slate-400/20 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-400 transition-[background,color] duration-150 hover:bg-slate-400/10 hover:text-slate-200"
        >
          RESET
        </button>
      </div>

      <p className="mt-4 text-[13px] text-slate-500">Переключений: {context.toggleCount}</p>
    </section>
  );
}
