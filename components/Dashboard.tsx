"use client";

import { useState } from "react";
import { useEncounterEvents } from "@/hooks/useEncounterEvents";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { TimelinePanel } from "@/components/TimelinePanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { SoapPanel } from "@/components/SoapPanel";
import { HandoffModal } from "@/components/HandoffModal";
import { LiveMic } from "@/components/LiveMic";

export function Dashboard() {
  const { state, missingInfo, startEncounter, requestHandoff, pushTranscript } =
    useEncounterEvents();
  const [handoffOpen, setHandoffOpen] = useState(false);

  const handleHandoff = async () => {
    setHandoffOpen(true);
    await requestHandoff();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <DisclaimerBanner />

      <header className="bg-clinical-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ER Copilot</h1>
          <p className="text-clinical-100 text-sm">AI Clinical Operations Assistant</p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`text-xs px-2 py-1 rounded-full ${state.connected ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}
          >
            {state.connected ? "Connected" : "Reconnecting…"}
          </span>
          <div className="flex rounded-lg overflow-hidden border border-clinical-700">
            <button
              onClick={() => startEncounter("demo")}
              disabled={state.mode === "demo" && state.loading}
              className={`px-4 py-2 text-sm font-medium transition-colors ${state.mode === "demo" ? "bg-clinical-500 text-white" : "bg-clinical-800 text-clinical-100 hover:bg-clinical-700"}`}
            >
              Demo
            </button>
            <button
              onClick={() => startEncounter("live")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${state.mode === "live" ? "bg-clinical-500 text-white" : "bg-clinical-800 text-clinical-100 hover:bg-clinical-700"}`}
            >
              Live
            </button>
          </div>
          <LiveMic active={state.mode === "live"} onTranscript={pushTranscript} />
        </div>
      </header>

      <main className="flex-1 p-4 grid grid-rows-[1fr_auto] gap-4 max-h-[calc(100vh-120px)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-h-[280px] lg:min-h-0 flex flex-col">
            <TranscriptPanel lines={state.transcript} />
          </div>
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-h-[280px] lg:min-h-0 flex flex-col">
            <TimelinePanel events={state.timeline} />
          </div>
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-h-[280px] lg:min-h-0 flex flex-col">
            <InsightsPanel
              safetyFlags={state.safetyFlags}
              missingInfo={missingInfo}
              research={state.research}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <SoapPanel soap={state.soap} />
        </div>
      </main>

      <footer className="px-6 py-4 border-t bg-white flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {state.mode === "idle"
            ? "Select Demo or Live to begin an encounter"
            : `${state.mode === "demo" ? "Demo" : "Live"} encounter in progress`}
        </p>
        <button
          onClick={handleHandoff}
          disabled={state.transcript.length === 0}
          className="px-6 py-2.5 rounded-lg bg-clinical-600 text-white font-semibold text-sm hover:bg-clinical-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
        >
          Generate Handoff Report
        </button>
      </footer>

      <HandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        transcript={state.transcript}
        report={state.handoff}
        loading={state.loading && !state.handoff}
      />
    </div>
  );
}
