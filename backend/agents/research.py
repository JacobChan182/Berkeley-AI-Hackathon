"""
Research agent — generates Claude clinical briefs for every new entity.
Fires on: medications, allergies, conditions, significant symptoms, vision captures.
Publishes research.completed with clinicalBrief for downstream safety reasoning.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import httpx

from bus import InMemoryBus, RedisBus
from claude import call_claude_json
from events import EVENT_CHANNELS, Citation, MedicalEntities, entities_from_dict, to_dict
from prompts.research import RESEARCH_SYSTEM, build_research_prompt
from redis_layer.keys import EncounterKeys
from redis_layer.state import add_to_set, get_transcript, load_json, save_json

logger = logging.getLogger(__name__)

SIGNIFICANT_SYMPTOMS = {
    "chest pain", "shortness of breath", "difficulty breathing",
    "altered mental status", "loss of consciousness", "unconscious",
    "head trauma", "head injury", "gunshot", "stab wound", "laceration",
    "active bleeding", "hemorrhage", "burn", "seizure", "stroke",
    "anaphylaxis", "allergic reaction", "respiratory distress",
    "cardiac arrest", "hypotension", "syncope", "diabetic emergency",
    "trauma", "wound",
}


# ─── PubMed ──────────────────────────────────────────────────────────────────

async def pubmed_search(query: str) -> Optional[List[Citation]]:
    try:
        base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
        async with httpx.AsyncClient(timeout=4.0) as client:
            search_resp = await client.get(
                f"{base}/esearch.fcgi",
                params={"db": "pubmed", "term": query, "retmax": 3, "retmode": "json", "sort": "relevance"},
            )
            if not search_resp.is_success:
                return None
            ids = search_resp.json().get("esearchresult", {}).get("idlist", [])
            if not ids:
                return None
            summary_resp = await client.get(
                f"{base}/esummary.fcgi",
                params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"},
            )
            if not summary_resp.is_success:
                return None
            result = summary_resp.json().get("result", {})
            citations = []
            for id_ in ids:
                entry = result.get(id_, {})
                if not entry.get("title"):
                    continue
                authors = entry.get("authors", [])
                year = str(entry.get("pubdate", ""))[:4]
                source = entry.get("source", "PubMed")
                citations.append(Citation(
                    title=f"{entry['title']} ({source}, {year})",
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{id_}/",
                    snippet=", ".join(a.get("name", "") for a in authors[:3]),
                ))
            return citations or None
    except Exception as e:
        logger.debug("[research] pubmed error: %s", e)
        return None


# ─── Core research function ───────────────────────────────────────────────────

async def research_entity(
    bus: InMemoryBus | RedisBus,
    encounter_id: str,
    entity: str,
    entity_type: str,
    entities: Optional[MedicalEntities] = None,
    transcript: str = "",
) -> None:
    """Generate a clinical brief for one entity and publish research.completed."""
    cache_key = f"{entity_type}:{entity.lower()}"
    is_new = await add_to_set(EncounterKeys.researched_meds(encounter_id), cache_key)
    if not is_new:
        return

    logger.info("[research] researching %s '%s' for encounter %s", entity_type, entity, encounter_id)

    # 1. Claude clinical brief
    brief_raw = await call_claude_json(
        RESEARCH_SYSTEM,
        build_research_prompt(entity, entity_type, entities, transcript),
        "research",
    )
    clinical_brief: Optional[Dict[str, Any]] = None
    if brief_raw and isinstance(brief_raw, dict):
        clinical_brief = brief_raw

    # 2. PubMed citations — best-effort, non-blocking
    pubmed_query = f"{entity} EMS pre-hospital emergency guidelines"
    pubmed_cites = await pubmed_search(pubmed_query)

    # 3. Findings text for UI
    if clinical_brief:
        findings = clinical_brief.get("summary", f"{entity}: clinical brief generated.")
        risks = clinical_brief.get("keyRisks", [])
        if risks:
            findings += " Key risks: " + "; ".join(risks[:3]) + "."
    else:
        findings = f"{entity}: review contraindications and interactions for this patient's presentation."

    # 4. Citations
    citations: List[Citation] = []
    if pubmed_cites:
        citations.extend(pubmed_cites[:3])
    if not citations:
        citations.append(Citation(
            title=f"{entity} — PubMed",
            url=f"https://pubmed.ncbi.nlm.nih.gov/?term={entity.replace(' ', '+')}+guidelines",
            snippet=f"Clinical references for {entity}.",
        ))

    payload: Dict[str, Any] = {
        "encounterId": encounter_id,
        "entity": entity,
        "entityType": entity_type,
        "query": f"{entity} — {entity_type} in pre-hospital context",
        "clinicalBrief": clinical_brief,
        "findings": findings,
        "citations": [to_dict(c) for c in citations],
        "completedAt": datetime.now(timezone.utc).isoformat(),
    }

    prior = await load_json(EncounterKeys.research(encounter_id)) or []
    await save_json(EncounterKeys.research(encounter_id), prior + [payload])
    await bus.publish(EVENT_CHANNELS.RESEARCH_COMPLETED, payload)


# ─── Agent ────────────────────────────────────────────────────────────────────

async def start_research_agent(bus: InMemoryBus | RedisBus) -> Callable[[], None]:
    async def on_facts_extracted(envelope: dict) -> None:
        payload = envelope.get("payload", {})
        encounter_id = payload.get("encounterId", "")
        entities = entities_from_dict(payload.get("entities", {}))
        transcript = await get_transcript(encounter_id)

        tasks = []

        for med in entities.medications:
            tasks.append(research_entity(
                bus, encounter_id, med.name, "medication", entities, transcript,
            ))

        for allergy in entities.allergies:
            tasks.append(research_entity(
                bus, encounter_id, allergy, "allergy", entities, transcript,
            ))

        for condition in entities.conditions:
            tasks.append(research_entity(
                bus, encounter_id, condition, "condition", entities, transcript,
            ))

        for symptom in entities.symptoms:
            if any(sig in symptom.lower() for sig in SIGNIFICANT_SYMPTOMS):
                tasks.append(research_entity(
                    bus, encounter_id, symptom, "symptom", entities, transcript,
                ))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def on_vision_captured(envelope: dict) -> None:
        payload = envelope.get("payload", {})
        encounter_id = payload.get("encounterId", "")
        identified = payload.get("identified", "")
        if not identified:
            return

        facts_raw = await load_json(EncounterKeys.facts(encounter_id))
        entities = entities_from_dict(facts_raw) if facts_raw else None
        transcript = await get_transcript(encounter_id)

        await research_entity(
            bus, encounter_id, identified, "medication", entities, transcript,
        )

    unsub_facts = await bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, on_facts_extracted)
    unsub_vision = await bus.subscribe(EVENT_CHANNELS.VISION_CAPTURED, on_vision_captured)

    def stop() -> None:
        unsub_facts()
        unsub_vision()

    return stop
