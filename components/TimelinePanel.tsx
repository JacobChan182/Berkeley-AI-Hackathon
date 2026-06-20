import type { TimelineEntry } from "@/lib/events";

export function TimelinePanel({ events }: { events: TimelineEntry[] }) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Patient Timeline
      </h2>
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <p className="text-slate-400 text-sm italic">Timeline builds as agents extract facts…</p>
        )}
        <ol className="relative border-l border-clinical-200 ml-2 space-y-4">
          {events.map((event) => (
            <li key={event.id} className="ml-4 animate-fade-in">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-clinical-500 ring-4 ring-white" />
              <time className="text-xs text-slate-400">
                {new Date(event.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <p
                className={`text-sm mt-0.5 ${event.source === "safety" ? "text-red-700 font-medium" : "text-slate-800"}`}
              >
                {event.summary}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
