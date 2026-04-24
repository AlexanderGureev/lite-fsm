"use client";

import { useState } from "react";

import LampPanel from "./LampPanel";
import LikesPanel from "./LikesPanel";

type ExampleTab = "lamp" | "likes";

const tabs: Array<{ id: ExampleTab; label: string }> = [
  { id: "lamp", label: "Lamp" },
  { id: "likes", label: "Likes" },
];

export default function Playground() {
  const [activeTab, setActiveTab] = useState<ExampleTab>("lamp");

  return (
    <main className="grid min-h-screen content-start justify-items-center gap-5 px-6 py-8">
      <div
        className="flex w-[min(560px,100%)] gap-1 rounded-[12px] border border-slate-400/15 bg-slate-900/70 p-1"
        role="tablist"
        aria-label="Примеры playground"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-[background,color] duration-150 ${
                isActive ? "bg-blue-600 text-blue-50" : "bg-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "lamp" ? <LampPanel /> : <LikesPanel />}
    </main>
  );
}
