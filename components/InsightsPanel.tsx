import type { SafetyFlaggedPayload } from "@/lib/events";
import type { Citation } from "@/lib/events";

const severityStyles = {
  high: "border-red-300 bg-red-50 text-red-900",
  medium: "border-amber-300 bg-amber-50 text-amber-900",
  low: "border-blue-300 bg-blue-50 text-blue-900",
};

interface ResearchItem {
  query: string;
  findings: string;
  citations: Citation[];
}

export function InsightsPanel({
  safetyFlags,
  missingInfo,
  research,
}: {
  safetyFlags: SafetyFlaggedPayload[];
  missingInfo: string[];
  research: ResearchItem[];
}) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        AI Insights
      </h2>
      <div className="flex-1 overflow-y-auto space-y-4">
        <section>
          <h3 className="text-xs font-semibold text-slate-500 mb-2">Safety Flags</h3>
          {safetyFlags.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No concerns flagged yet</p>
          ) : (
            safetyFlags.map((flag, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 mb-2 animate-fade-in ${severityStyles[flag.severity]}`}
              >
                <p className="text-sm font-semibold">{flag.concern}</p>
                <p className="text-xs mt-1 opacity-80">{flag.rationale}</p>
              </div>
            ))
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold text-slate-500 mb-2">Missing Information</h3>
          <ul className="text-sm space-y-1">
            {missingInfo.map((item) => (
              <li key={item} className="flex items-center gap-2 text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-slate-500 mb-2">Research</h3>
          {research.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Research agent idle</p>
          ) : (
            research.map((r, i) => (
              <div key={i} className="mb-3 animate-fade-in">
                <p className="text-sm text-slate-800">{r.findings}</p>
                {r.citations.map((c, j) => (
                  <a
                    key={j}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-clinical-600 hover:underline mt-1"
                  >
                    {c.title}
                  </a>
                ))}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
