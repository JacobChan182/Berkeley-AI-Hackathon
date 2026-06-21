"""
Research prompts — Claude-generated clinical briefs for any entity type.
"""
from __future__ import annotations

import json
from typing import Optional

from events import MedicalEntities


RESEARCH_SYSTEM = """You are a clinical research agent for Nos, a pre-hospital EMS AI assistant. For demo purposes only — not for clinical use.

Given an entity (drug, allergy, condition, injury, or physical characteristic) and the patient's current context, generate a concise clinical brief that a downstream safety agent will use to evaluate risk.

Return ONLY a raw JSON object (no markdown):
{
  "summary": string,
  "keyRisks": string[],
  "drugInteractions": string[],
  "contraindications": string[],
  "preHospitalActions": string[]
}

Rules:
- Focus on pre-hospital EMS context — what matters NOW, in the ambulance, before hospital arrival
- keyRisks: specific dangers this entity poses in the field (2-5 items)
- drugInteractions: named drugs that interact dangerously with this entity (include mechanism in 1 sentence each)
- contraindications: clinical situations where this entity creates danger or must be avoided
- preHospitalActions: concrete steps the paramedic should take or verify right now
- Be specific and clinically accurate — this feeds a safety agent, not a patient-facing chatbot
- Never fabricate citations or studies"""


def build_research_prompt(
    entity: str,
    entity_type: str,
    entities: Optional[MedicalEntities] = None,
    transcript: str = "",
) -> str:
    parts = [
        f"Entity to research: {entity}",
        f"Entity type: {entity_type}",
    ]
    if entities:
        from events import to_dict
        parts += [
            "",
            "Current patient context (use this to make the brief relevant to THIS patient):",
            json.dumps(to_dict(entities), indent=2),
        ]
    if transcript.strip():
        parts += [
            "",
            "Scene transcript excerpt:",
            transcript[-1500:],
        ]
    parts += [
        "",
        "Generate the clinical brief JSON for this entity in the context of this patient.",
    ]
    return "\n".join(parts)
