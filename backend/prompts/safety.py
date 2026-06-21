"""
Safety prompts and heuristic fallback — mirrors lib/prompts/safety.ts.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import List

from events import MedicalEntities, Severity


@dataclass
class SafetyResult:
    concern: str
    severity: Severity
    rationale: str


SAFETY_SYSTEM = """You are a clinical safety intelligence agent for Nos, a pre-hospital EMS/ambulance AI assistant. For demo purposes only — not for clinical use.

Analyse the full patient picture — every extracted entity AND the scene transcript — and flag any combination of factors that creates patient risk. Think beyond drug-drug pairs: injuries and scene circumstances interact with medications and conditions just as dangerously.

Return ONLY a raw JSON array (no markdown):
[{ "concern": string, "severity": "low"|"medium"|"high", "rationale": string }]

Return [] if no concerns are identified.

CRITICAL RULES:
- Only flag concerns grounded in STATED facts — something said on scene, extracted from dialogue, or found via vision scan
- Never infer from demographics alone (age without a stated symptom is not a flag)
- Use "consider …" / "verify …" language — never a definitive diagnosis
- Each rationale must cite the specific stated facts that triggered it

REASON ACROSS ALL COMBINATIONS — examples of what to catch:
Drug + drug:
  - Anticoagulant (warfarin/heparin/enoxaparin) + NSAID (ibuprofen/naproxen/ketorolac) → severe bleeding
  - Anticoagulant + antiplatelet (aspirin/clopidogrel) → dual antithrombotic bleeding risk
  - Beta-blocker + acute hypotension → risk of refractory bradycardia

Situation + drug (the patient's condition or injury changes the risk profile of their meds):
  - Active bleeding / trauma wound + any anticoagulant → uncontrolled hemorrhage risk
  - Active bleeding / trauma wound + NSAID → impaired platelet function worsens bleeding
  - Head trauma / loss of consciousness + anticoagulant → intracranial hemorrhage risk
  - Respiratory distress / low SpO2 + opioid (stated or administered) → respiratory depression
  - Altered mental status / confusion + diabetes → consider hypoglycemia before other causes
  - Heat exposure / diaphoresis + diuretic → dehydration / electrolyte risk
  - Hypotension / low BP stated + antihypertensive medication → compounding hypotension
  - Chest pain / ACS presentation + anticoagulant → anticoagulation management complexity

Allergy cross-checks (always HIGH severity):
  - Stated allergy + proposed or administered matching substance → STOP
  - Stated allergy + active medication that shares allergen class

Scene / vision findings + known medications:
  - Vial scan identifies substance conflicting with known meds or allergies
  - Scene drug found + patient on anticoagulation

Flag everything — the paramedic can dismiss what doesn't apply. Missing a dangerous combination is worse than a false positive."""


def build_safety_prompt(entities: MedicalEntities, transcript: str = "") -> str:
    from events import to_dict
    parts = [
        "Patient entities:",
        json.dumps(to_dict(entities), indent=2),
    ]
    if transcript.strip():
        parts.extend([
            "",
            "Recent transcript (check for proposed/administered substances vs allergies and active meds):",
            transcript[-2500:],
        ])
    parts.extend(["", "Identify safety concerns. Return JSON array."])
    return "\n".join(parts)


def _allergen_stem(name: str) -> str:
    """Normalize allergen name for fuzzy matching (peaches → peach)."""
    token = name.lower().strip()
    if token.endswith("ies"):
        return token[:-3] + "y"
    if token.endswith("es") and len(token) > 3:
        return token[:-2]
    if token.endswith("s") and len(token) > 3:
        return token[:-1]
    return token


def _allergen_in_text(allergen: str, text: str) -> bool:
    stem = _allergen_stem(allergen)
    lower = text.lower()
    return stem in lower or allergen.lower() in lower


def heuristic_allergy_flags(
    entities: MedicalEntities,
    transcript: str = "",
) -> List[SafetyResult]:
    """Flag administration conflicts and medication-allergy cross-checks."""
    flags: List[SafetyResult] = []
    allergies = entities.allergies
    if not allergies:
        return flags

    tl = transcript.lower()
    admin_keywords = (
        "giving", "give you", "give him", "give her", "administer",
        "administered", "feed", "feeding", "inject", "injected",
        "start you on", "put you on", "going to give", "i'll give",
        "thinking about giving",
    )
    has_admin_intent = any(kw in tl for kw in admin_keywords)

    for allergy in allergies:
        if has_admin_intent and _allergen_in_text(allergy, tl):
            flags.append(SafetyResult(
                concern=f"CRITICAL: Proposed/administered {allergy} despite documented allergy",
                severity="high",
                rationale=(
                    f"Transcript indicates paramedic may give or has given '{allergy}' "
                    f"while patient has documented {allergy} allergy. "
                    "STOP — risk of anaphylaxis or severe allergic reaction."
                ),
            ))

    meds = [m.name.lower() for m in entities.medications]
    for allergy in allergies:
        stem = _allergen_stem(allergy)
        for med in meds:
            if stem in med or med in stem:
                flags.append(SafetyResult(
                    concern=f"Medication conflict: {med} vs documented {allergy} allergy",
                    severity="high",
                    rationale=(
                        f"Patient is documented on {med} but has stated allergy to {allergy}. "
                        "Verify compatibility before administration."
                    ),
                ))

    return flags


def heuristic_safety(entities: MedicalEntities, transcript: str = "") -> List[SafetyResult]:
    flags: List[SafetyResult] = []
    meds = [m.name.lower() for m in entities.medications]
    symptoms = [s.lower() for s in entities.symptoms]
    conditions = [c.lower() for c in entities.conditions]
    allergies = [a.lower() for a in entities.allergies]

    has_warfarin = any("warfarin" in m for m in meds)
    has_aspirin = any("aspirin" in m for m in meds)
    has_penicillin_allergy = any("penicillin" in a for a in allergies)
    has_chest_pain = any("chest pain" in s for s in symptoms)
    has_arm_pain = any("arm" in s for s in symptoms)
    has_sob = any("breath" in s for s in symptoms)
    has_heart_valve = any("heart valve" in c for c in conditions)
    age = entities.demographics.age if entities.demographics else 0

    # High severity
    if has_warfarin and has_chest_pain:
        flags.append(SafetyResult(
            concern="Warfarin + chest pain — anticoagulation complicates ACS management",
            severity="high",
            rationale=(
                "Patient on warfarin presenting with acute chest pain. Thrombotic vs. hemorrhagic "
                "risk must be carefully balanced. Check INR before antiplatelet therapy. Mechanical "
                "valve may require uninterrupted anticoagulation."
            ),
        ))

    if has_warfarin and has_aspirin:
        flags.append(SafetyResult(
            concern="Warfarin + aspirin — dual antithrombotic bleeding risk",
            severity="high",
            rationale=(
                "Concurrent warfarin and aspirin significantly increases GI and intracranial bleeding "
                "risk. Ensure benefit clearly outweighs risk before combining."
            ),
        ))

    # Medium severity
    if (age or 0) >= 65 and has_chest_pain and (has_arm_pain or has_sob):
        flags.append(SafetyResult(
            concern="ACS presentation — age ≥65, chest pain, and associated symptoms",
            severity="medium",
            rationale=(
                "Classic ACS feature cluster: age, acute chest pain, arm radiation/dyspnea. "
                "Expedite ECG, troponin, and cardiology consult."
            ),
        ))

    if has_heart_valve and has_warfarin and has_chest_pain:
        flags.append(SafetyResult(
            concern="Mechanical valve patient — warfarin interruption risk",
            severity="medium",
            rationale=(
                "Mechanical heart valve requires continuous anticoagulation. Any interruption carries "
                "thromboembolic stroke risk. Coordinate hematology/cardiology before any warfarin reversal."
            ),
        ))

    # Allergies — administration conflicts and med cross-checks
    flags.extend(heuristic_allergy_flags(entities, transcript))

    # Drug-drug interactions among all documented/active medications
    from prompts.drug_interactions import check_interactions, check_situational_risks
    flags.extend(check_interactions(meds))

    # Situational risks: injuries, scene context, vitals + medications
    flags.extend(check_situational_risks(meds, entities.symptoms, entities.conditions, transcript))

    if has_penicillin_allergy:
        flags.append(SafetyResult(
            concern="Penicillin allergy — avoid beta-lactam antibiotics",
            severity="high",
            rationale=(
                "Patient has documented penicillin allergy. Confirm no penicillin/cephalosporin "
                "(cross-reactivity ~2%) ordered. Use alternative antibiotics if needed."
            ),
        ))

    return flags
