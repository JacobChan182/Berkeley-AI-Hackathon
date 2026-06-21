"""
Known drug aliases and interaction rules for real-time safety cross-checks.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple

from prompts.safety import SafetyResult

# alias → canonical name (longer aliases first when scanning)
DRUG_ALIASES: Dict[str, str] = {
    "coumadin": "warfarin",
    "warfarin": "warfarin",
    "heparin": "heparin",
    "enoxaparin": "enoxaparin",
    "lovenox": "enoxaparin",
    "ibuprofen": "ibuprofen",
    "advil": "ibuprofen",
    "motrin": "ibuprofen",
    "naproxen": "naproxen",
    "aleve": "naproxen",
    "ketorolac": "ketorolac",
    "toradol": "ketorolac",
    "aspirin": "aspirin",
    "clopidogrel": "clopidogrel",
    "plavix": "clopidogrel",
    "lisinopril": "lisinopril",
    "metoprolol": "metoprolol",
    "acetaminophen": "acetaminophen",
    "tylenol": "acetaminophen",
    "nitroglycerin": "nitroglycerin",
    "nitro": "nitroglycerin",
}

NSAIDS: Set[str] = {"ibuprofen", "naproxen", "ketorolac", "diclofenac", "meloxicam"}
ANTICOAGULANTS: Set[str] = {"warfarin", "heparin", "enoxaparin", "rivaroxaban", "apixaban", "eliquis", "xarelto"}
ANTIPLATELETS: Set[str] = {"aspirin", "clopidogrel", "ticagrelor", "prasugrel"}
OPIOIDS: Set[str] = {"morphine", "fentanyl", "oxycodone", "hydromorphone", "dilaudid", "codeine", "tramadol", "hydrocodone"}
BETA_BLOCKERS: Set[str] = {"metoprolol", "atenolol", "propranolol", "carvedilol", "bisoprolol", "labetalol"}
ANTIHYPERTENSIVES: Set[str] = {"lisinopril", "amlodipine", "losartan", "valsartan", "ramipril", "enalapril"} | BETA_BLOCKERS
DIURETICS: Set[str] = {"furosemide", "lasix", "hydrochlorothiazide", "hctz", "torsemide", "spironolactone"}
DIABETES_MEDS: Set[str] = {"insulin", "metformin", "glipizide", "glyburide", "glargine", "lantus", "humalog", "novolog"}

# Symptom/scene keyword sets for situational checks
_ACTIVE_BLEEDING = {"laceration", "gunshot", "gsw", "stab", "wound", "bleeding", "hemorrhage",
                    "blood loss", "trauma", "cut", "puncture", "impaled", "crush"}
_HEAD_TRAUMA = {"head trauma", "head injury", "concussion", "loss of consciousness", "loc",
                "unconscious", "unresponsive", "head wound", "skull fracture", "hit his head",
                "hit her head", "fell and hit"}
_RESP_DISTRESS = {"shortness of breath", "difficulty breathing", "respiratory distress",
                  "can't breathe", "cannot breathe", "low sats", "hypoxia", "spo2"}
_AMS = {"altered mental status", "confusion", "confused", "disoriented", "unresponsive",
        "altered", "not making sense", "combative"}
_HEAT_EXPOSURE = {"heat", "sweating", "diaphoresis", "hot", "dehydrated", "dehydration", "syncope"}
_HYPOTENSION = {"low blood pressure", "hypotension", "hypotensive", "bp 80", "bp 70", "bp 60",
                "systolic below 90", "pressure is low", "pressure dropped"}
_DIABETES = {"diabetes", "diabetic", "type 1", "type 2", "insulin dependent", "blood sugar", "glucose"}

ADMIN_ACTION_KEYWORDS: Tuple[str, ...] = (
    "giving", "give you", "give him", "give her", "administer",
    "administered", "inject", "injected", "start you on", "put you on",
    "going to give", "i'll give", "thinking about giving",
)

PATIENT_MED_KEYWORDS: Tuple[str, ...] = (
    "taking", "take ", "took ", "on ", "uses ", "used ",
    "earlier today", "this morning", "daily", "medication",
)


def normalize_drug(name: str) -> Optional[str]:
    lower = name.lower().strip()
    if lower in DRUG_ALIASES.values():
        return lower
    return DRUG_ALIASES.get(lower)


def drug_class(name: str) -> Set[str]:
    """Return interaction classes for a canonical drug name."""
    classes: Set[str] = {name}
    if name in NSAIDS:
        classes.add("nsaid")
    if name in ANTICOAGULANTS:
        classes.add("anticoagulant")
    if name in ANTIPLATELETS:
        classes.add("antiplatelet")
    return classes


def extract_drugs_from_text(text: str) -> List[str]:
    lower = text.lower()
    found: Set[str] = set()
    for alias, canonical in sorted(DRUG_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        if alias in lower:
            found.add(canonical)
    return sorted(found)


def is_administration_context(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in ADMIN_ACTION_KEYWORDS)


def is_patient_med_context(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in PATIENT_MED_KEYWORDS) or bool(extract_drugs_from_text(text))


def _pair_key(a: str, b: str) -> Tuple[str, str]:
    return tuple(sorted([a, b]))


def _classes_for(name: str) -> Set[str]:
    return drug_class(name) | {name}


def check_interactions(active_drugs: List[str]) -> List[SafetyResult]:
    """Check all active drugs for known dangerous combinations."""
    flags: List[SafetyResult] = []
    unique = sorted({normalize_drug(d) or d.lower() for d in active_drugs})
    seen_pairs: Set[Tuple[str, str]] = set()

    for i, drug_a in enumerate(unique):
        classes_a = _classes_for(drug_a)
        for drug_b in unique[i + 1:]:
            classes_b = _classes_for(drug_b)
            pair = _pair_key(drug_a, drug_b)
            if pair in seen_pairs:
                continue

            # Anticoagulant + NSAID or antiplatelet
            if classes_a & ANTICOAGULANTS and (classes_b & NSAIDS or classes_b & ANTIPLATELETS):
                seen_pairs.add(pair)
                flags.append(_bleeding_risk_flag(drug_a, drug_b, "anticoagulant"))
            elif classes_b & ANTICOAGULANTS and (classes_a & NSAIDS or classes_a & ANTIPLATELETS):
                seen_pairs.add(pair)
                flags.append(_bleeding_risk_flag(drug_b, drug_a, "anticoagulant"))

    return flags


def check_new_drug_interactions(active_drugs: List[str], new_drug: str) -> List[SafetyResult]:
    """Check a newly added drug against everything already active."""
    canonical = normalize_drug(new_drug) or new_drug.lower()
    combined = list({*(normalize_drug(d) or d.lower() for d in active_drugs), canonical})
    return check_interactions(combined)


def _scene_matches(keywords: Set[str], symptoms: List[str], conditions: List[str], transcript: str) -> bool:
    """Return True if any keyword appears in symptoms, conditions, or the transcript."""
    combined = " ".join(symptoms + conditions).lower() + " " + transcript.lower()
    return any(kw in combined for kw in keywords)


def check_situational_risks(
    active_drugs: List[str],
    symptoms: List[str],
    conditions: List[str],
    transcript: str = "",
) -> List[SafetyResult]:
    """
    Flag dangerous combinations between the patient's situation (injuries, scene,
    vitals context, conditions) and their active medications.
    """
    flags: List[SafetyResult] = []
    canonical = {normalize_drug(d) or d.lower() for d in active_drugs}

    has_anticoag = bool(canonical & ANTICOAGULANTS)
    has_nsaid = bool(canonical & NSAIDS)
    has_opioid = bool(canonical & OPIOIDS)
    has_antihypertensive = bool(canonical & ANTIHYPERTENSIVES)
    has_diuretic = bool(canonical & DIURETICS)
    has_diabetes_med = bool(canonical & DIABETES_MEDS)
    anticoag_names = ", ".join(canonical & ANTICOAGULANTS) or "anticoagulant"
    nsaid_names = ", ".join(canonical & NSAIDS) or "NSAID"
    opioid_names = ", ".join(canonical & OPIOIDS) or "opioid"

    sc = lambda kws: _scene_matches(kws, symptoms, conditions, transcript)

    # ── Active bleeding / trauma ──────────────────────────────────────────────
    if sc(_ACTIVE_BLEEDING):
        if has_anticoag:
            flags.append(SafetyResult(
                concern=f"Active bleeding/trauma + {anticoag_names} — uncontrolled hemorrhage risk",
                severity="high",
                rationale=(
                    f"Scene indicates active bleeding or traumatic injury while patient has {anticoag_names} on board. "
                    "Anticoagulation significantly impairs clot formation. Consider reversal agent (e.g. Vitamin K / "
                    "4F-PCC for warfarin, protamine for heparin). Prioritise haemorrhage control."
                ),
            ))
        if has_nsaid:
            flags.append(SafetyResult(
                concern=f"Active bleeding/trauma + {nsaid_names} — platelet impairment worsens bleeding",
                severity="high",
                rationale=(
                    f"Scene indicates active bleeding or traumatic wound while patient has {nsaid_names} active. "
                    "NSAIDs inhibit COX-1 platelet aggregation and can cause GI mucosal injury. "
                    "Avoid further NSAID administration; consider acetaminophen for analgesia."
                ),
            ))

    # ── Head trauma ───────────────────────────────────────────────────────────
    if sc(_HEAD_TRAUMA) and has_anticoag:
        flags.append(SafetyResult(
            concern=f"Head trauma + {anticoag_names} — intracranial hemorrhage risk",
            severity="high",
            rationale=(
                f"Patient has sustained head trauma and is on {anticoag_names}. "
                "Anticoagulation dramatically increases intracranial hemorrhage risk even with seemingly minor head injury. "
                "Urgent CT head and haematology input required on arrival. Consider reversal."
            ),
        ))

    # ── Respiratory distress + opioid ─────────────────────────────────────────
    if sc(_RESP_DISTRESS) and has_opioid:
        flags.append(SafetyResult(
            concern=f"Respiratory distress + {opioid_names} — respiratory depression risk",
            severity="high",
            rationale=(
                f"Patient shows signs of respiratory distress and has {opioid_names} on board. "
                "Opioids suppress respiratory drive. Monitor SpO2 closely; have naloxone ready. "
                "Avoid additional opioid administration unless airway is secured."
            ),
        ))

    # ── Altered mental status + diabetes ─────────────────────────────────────
    if sc(_AMS) and (sc(_DIABETES) or has_diabetes_med):
        flags.append(SafetyResult(
            concern="Altered mental status + diabetes — consider hypoglycaemia before other causes",
            severity="high",
            rationale=(
                "Patient has altered mental status and a diabetic history or diabetes medication on board. "
                "Hypoglycaemia must be ruled out immediately — check blood glucose before attributing AMS to "
                "other causes. Administer dextrose if glucose < 70 mg/dL and patient cannot self-treat."
            ),
        ))

    # ── Hypotension + antihypertensive ────────────────────────────────────────
    if sc(_HYPOTENSION) and has_antihypertensive:
        med_names = ", ".join(canonical & ANTIHYPERTENSIVES) or "antihypertensive"
        flags.append(SafetyResult(
            concern=f"Low blood pressure + {med_names} — compounding hypotension",
            severity="medium",
            rationale=(
                f"Scene vitals indicate hypotension while patient takes {med_names}. "
                "Antihypertensive medication may be compounding the low BP. Establish IV access, "
                "consider fluid bolus, and notify receiving hospital of medication context."
            ),
        ))

    # ── Heat exposure + diuretic ──────────────────────────────────────────────
    if sc(_HEAT_EXPOSURE) and has_diuretic:
        diuretic_names = ", ".join(canonical & DIURETICS) or "diuretic"
        flags.append(SafetyResult(
            concern=f"Heat exposure / diaphoresis + {diuretic_names} — dehydration and electrolyte risk",
            severity="medium",
            rationale=(
                f"Patient shows signs of heat exposure or significant diaphoresis and takes {diuretic_names}. "
                "Diuretics accelerate fluid and electrolyte loss. Risk of hypovolaemia, hypokalaemia, and "
                "pre-renal failure. Monitor electrolytes and consider IV fluid replacement."
            ),
        ))

    return flags


def _bleeding_risk_flag(anticoag: str, other: str, _kind: str) -> SafetyResult:
    other_label = other.upper() if other in NSAIDS else other
    is_nsaid = other in NSAIDS or other == "nsaid"
    mechanism = (
        "NSAIDs inhibit platelet function and can cause GI mucosal injury"
        if is_nsaid
        else "Antiplatelet agents further increase bleeding risk"
    )
    return SafetyResult(
        concern=f"CRITICAL: {anticoag.title()} + {other} — severe bleeding risk",
        severity="high",
        rationale=(
            f"Patient has {anticoag} active in system and {other} was stated or administered on scene. "
            f"{mechanism}. Combined with anticoagulation this significantly increases GI and "
            "intracranial hemorrhage risk. STOP — verify INR and consider acetaminophen for analgesia."
        ),
    )
