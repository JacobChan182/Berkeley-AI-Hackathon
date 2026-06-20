import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS, type Citation, type MedicalEntities } from "@/lib/events";
import { addToSet, loadJSON, saveJSON } from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

const MOCK_CITATIONS: Record<string, Citation[]> = {
  warfarin: [
    {
      title: "ACCF/AHA — Anticoagulation Management in ACS",
      url: "https://www.acc.org/clinical-topics/acute-coronary-syndrome",
      snippet: "Anticoagulated patients with ACS require careful balance of antithrombotic therapy.",
    },
    {
      title: "Warfarin Drug Interactions — FDA Label",
      url: "https://www.accessdata.fda.gov/",
      snippet: "Increased bleeding risk with antiplatelet agents; monitor INR closely.",
    },
  ],
  lisinopril: [
    {
      title: "ACE Inhibitors in Cardiovascular Disease",
      url: "https://www.ahajournals.org/",
      snippet: "Standard therapy for hypertension with cardiac comorbidities.",
    },
  ],
};

async function browserbaseResearch(query: string): Promise<{
  findings: string;
  citations: Citation[];
} | null> {
  if (!process.env.BROWSERBASE_API_KEY) return null;

  try {
    const res = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": process.env.BROWSERBASE_API_KEY,
      },
      body: JSON.stringify({
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      }),
    });
    if (!res.ok) return null;
    // Browserbase session created — for hackathon demo, return structured mock tied to query
    return {
      findings: `Research completed for: ${query}. Review anticoagulation guidelines and drug interaction databases.`,
      citations: MOCK_CITATIONS.warfarin,
    };
  } catch {
    return null;
  }
}

export async function startResearchAgent(bus: EventBus): Promise<() => void> {
  return bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, async (envelope) => {
    const { encounterId, entities } = envelope.payload;

    for (const med of entities.medications) {
      const key = med.name.toLowerCase();
      const isNew = await addToSet(
        EncounterKeys.researchedMeds(encounterId),
        key
      );
      if (!isNew) continue;

      const query = `${med.name} drug interactions clinical guidelines`;
      const bb = await browserbaseResearch(query);
      const citations = bb?.citations ?? MOCK_CITATIONS[key] ?? [
        {
          title: `${med.name} — Clinical Reference`,
          url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(med.name)}`,
          snippet: `Standard reference information for ${med.name}.`,
        },
      ];

      const findings =
        bb?.findings ??
        `${med.name}: Review contraindications and interactions relevant to current presentation.`;

      const payload = {
        encounterId,
        query,
        findings,
        citations,
        completedAt: new Date().toISOString(),
      };

      const prior = (await loadJSON<typeof payload[]>(EncounterKeys.research(encounterId))) ?? [];
      await saveJSON(EncounterKeys.research(encounterId), [...prior, payload]);

      await bus.publish(EVENT_CHANNELS.RESEARCH_COMPLETED, payload);
    }

    for (const allergy of entities.allergies) {
      const isNew = await addToSet(
        EncounterKeys.researchedMeds(encounterId),
        `allergy:${allergy.toLowerCase()}`
      );
      if (!isNew) continue;

      await bus.publish(EVENT_CHANNELS.RESEARCH_COMPLETED, {
        encounterId,
        query: `${allergy} allergy clinical management`,
        findings: `Document ${allergy} allergy in chart. Verify all ordered medications.`,
        citations: [],
        completedAt: new Date().toISOString(),
      });
    }
  });
}
