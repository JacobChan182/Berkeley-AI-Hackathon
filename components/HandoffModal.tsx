"use client";

import type { HandoffReport } from "@/lib/events";
import type { TranscriptLine } from "@/hooks/useEncounterEvents";

export function HandoffModal({
  open,
  onClose,
  transcript,
  report,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  transcript: TranscriptLine[];
  report: HandoffReport | null;
  loading: boolean;
}) {
  if (!open) return null;

  const rawTranscript = transcript.map((l) => `[${l.speaker}] ${l.text}`).join("\n");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-clinical-900 text-white">
          <h2 className="text-lg font-semibold">Shift Handoff Report</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading && (
          <div className="p-8 text-center text-slate-500">Generating handoff report…</div>
        )}

        {!loading && report && (
          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-hidden">
            <div className="p-6 border-r overflow-y-auto bg-slate-50">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Before — Raw Transcript</h3>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                {rawTranscript || "No transcript captured."}
              </pre>
            </div>
            <div className="p-6 overflow-y-auto">
              <h3 className="text-xs font-bold text-clinical-700 uppercase mb-3">After — Structured Handoff</h3>
              <section className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Patient Summary</h4>
                <p className="text-sm text-slate-600 mt-1">{report.patientSummary}</p>
              </section>
              <section className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Current Medications</h4>
                <ul className="text-sm text-slate-600 mt-1 list-disc list-inside">
                  {report.currentMedications.map((m, i) => (
                    <li key={i}>{m.name}{m.dose ? ` — ${m.dose}` : ""}</li>
                  ))}
                </ul>
              </section>
              <section className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Outstanding Questions</h4>
                <ul className="text-sm text-slate-600 mt-1 list-disc list-inside">
                  {report.outstandingQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h4 className="text-sm font-semibold text-slate-800">Recommended Actions</h4>
                <ul className="text-sm text-slate-600 mt-1 list-disc list-inside">
                  {report.recommendedActions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
