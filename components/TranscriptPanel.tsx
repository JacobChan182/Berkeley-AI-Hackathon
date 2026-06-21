import type { TranscriptLine } from "@/hooks/useEncounterEvents";

const speakerStyles: Record<string, string> = {
  doctor: "bg-clinical-100 text-clinical-900",
  patient: "bg-slate-100 text-slate-800",
  unknown: "bg-gray-100 text-gray-700",
};

export function TranscriptPanel({ lines }: { lines: TranscriptLine[] }) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Live Transcript
      </h2>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {lines.length === 0 && (
          <p className="text-slate-400 text-sm italic">Waiting for conversation…</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="animate-fade-in text-sm">
            <span
              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mr-2 capitalize ${speakerStyles[line.speaker] ?? speakerStyles.unknown}`}
            >
              {line.speaker}
            </span>
            <span className="text-slate-800">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
