from __future__ import annotations

import json
import re
from typing import Any

from app.services.llm_client import generate_structured_json

DATE_PATTERN = re.compile(r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2} [A-Z][a-z]+ \d{4})\b")


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _extract_dates(text: str) -> list[str]:
    dates = []
    seen = set()
    for value in DATE_PATTERN.findall(text):
        clean = value.strip()
        if clean and clean not in seen:
            seen.add(clean)
            dates.append(clean)
    return dates[:10]


def _extract_entities(text: str) -> list[str]:
    tokens = re.findall(r"\b[A-Z][A-Za-z0-9&./-]+(?:\s+[A-Z][A-Za-z0-9&./-]+)*\b", text)
    cleaned = []
    seen = set()
    for item in tokens:
        if len(item.split()) > 3:
            continue
        if item.lower() in {"the", "and", "for", "with", "from", "this", "that", "there", "could", "should"}:
            continue
        if item not in seen:
            seen.add(item)
            cleaned.append(item)
    return cleaned[:12]


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _fallback_brief(source_text: str, config: dict[str, Any]) -> dict[str, Any]:
    cleaned = _clean_text(source_text)
    sentences = _sentences(cleaned)
    summary = sentences[0][:450] if sentences else cleaned[:450]
    facts = []
    for sentence in sentences:
        if any(keyword in sentence.lower() for keyword in ["must", "requires", "impact", "risk", "warning", "deadline", "increase", "decrease", "will", "can", "due", "at least", "up to", "recommend"]):
            facts.append(sentence)
        elif len(sentence.split()) > 8 and any(ch.isdigit() for ch in sentence):
            facts.append(sentence)
    fallback = {
        "main_topic": cleaned[:120] if cleaned else "Source topic",
        "summary": summary,
        "key_facts": facts[:5],
        "dates": _extract_dates(cleaned),
        "entities": _extract_entities(cleaned),
        "impact": [sentence for sentence in sentences if "impact" in sentence.lower()][:3] or ["The source text describes the situation and its operational or strategic consequences."],
        "risks": [sentence for sentence in sentences if any(word in sentence.lower() for word in ["risk", "warning", "threat", "issue", "concern"])][:3] or ["No explicit risks were identified in the source text."],
        "recommended_actions": [sentence for sentence in sentences if any(word in sentence.lower() for word in ["recommend", "should", "must", "need to", "action", "plan"])][:3] or ["Review the source details and confirm the next practical steps with stakeholders."],
        "uncertainties": [sentence for sentence in sentences if any(word in sentence.lower() for word in ["uncertain", "unknown", "may", "might", "possibly", "estimate", "assumption"])][:3] or ["No material uncertainties were explicitly stated in the source text."],
        "evidence_references": sentences[:3] if sentences else [cleaned[:250]],
    }
    if not fallback["main_topic"]:
        fallback["main_topic"] = "Untitled source"
    return fallback


def build_content_brief(source_text: str, config: dict[str, Any]) -> dict[str, Any]:
    cleaned = _clean_text(source_text)
    system_prompt = (
        "You are a careful extraction assistant. Extract only information present in the source text. "
        "Do not invent facts. Preserve names, dates, numbers, organizations, conditions, and uncertainty. "
        "Return valid JSON that matches the schema exactly."
    )
    user_prompt = json.dumps({
        "source": cleaned,
        "config": config,
        "schema": {
            "main_topic": "",
            "summary": "",
            "key_facts": [],
            "dates": [],
            "entities": [],
            "impact": [],
            "risks": [],
            "recommended_actions": [],
            "uncertainties": [],
            "evidence_references": [],
        },
    }, ensure_ascii=False)
    generated = generate_structured_json(system_prompt, user_prompt, _fallback_brief(cleaned, config))
    if not isinstance(generated, dict):
        return _fallback_brief(cleaned, config)

    brief = {
        "main_topic": str(generated.get("main_topic") or cleaned[:120] or "Untitled source"),
        "summary": str(generated.get("summary") or cleaned[:500] or "No summary available."),
        "key_facts": [str(item) for item in generated.get("key_facts") or []],
        "dates": [str(item) for item in generated.get("dates") or _extract_dates(cleaned)],
        "entities": [str(item) for item in generated.get("entities") or _extract_entities(cleaned)],
        "impact": [str(item) for item in generated.get("impact") or []],
        "risks": [str(item) for item in generated.get("risks") or []],
        "recommended_actions": [str(item) for item in generated.get("recommended_actions") or []],
        "uncertainties": [str(item) for item in generated.get("uncertainties") or []],
        "evidence_references": [str(item) for item in generated.get("evidence_references") or []],
    }
    if not brief["key_facts"]:
        brief["key_facts"] = _fallback_brief(cleaned, config)["key_facts"]
    if not brief["impact"]:
        brief["impact"] = _fallback_brief(cleaned, config)["impact"]
    if not brief["risks"]:
        brief["risks"] = _fallback_brief(cleaned, config)["risks"]
    if not brief["recommended_actions"]:
        brief["recommended_actions"] = _fallback_brief(cleaned, config)["recommended_actions"]
    if not brief["uncertainties"]:
        brief["uncertainties"] = _fallback_brief(cleaned, config)["uncertainties"]
    if not brief["evidence_references"]:
        brief["evidence_references"] = _fallback_brief(cleaned, config)["evidence_references"]
    return brief


def _make_summary_output(brief: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    summary_text = brief.get("summary") or "No summary available."
    source_references = brief.get("evidence_references") or ["Source provided by the user."]
    return {
        "title": f"Executive Summary: {brief.get('main_topic', 'Source')}",
        "one_line_summary": summary_text[:180],
        "situation": summary_text,
        "key_findings": brief.get("key_facts", [])[:4] or [summary_text],
        "impact": brief.get("impact", [])[:3] or ["The source text describes the situation and reported consequences."],
        "risks": brief.get("risks", [])[:3] or ["No explicit risks were stated in the source text."],
        "recommended_actions": brief.get("recommended_actions", [])[:3] or ["Confirm the next steps with responsible stakeholders."],
        "uncertainties": brief.get("uncertainties", [])[:3] or ["No material uncertainties were explicitly stated in the source text."],
        "source_references": source_references[:3],
    }


def _make_advisory_output(brief: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    severity = "medium"
    if any(word in (brief.get("risks", []) or [""]) for word in ["critical", "urgent", "severe"]):
        severity = "high"
    return {
        "title": f"Advisory: {brief.get('main_topic', 'Source')}",
        "severity": severity,
        "date": (brief.get("dates") or ["N/A"])[0],
        "summary": brief.get("summary") or "No summary available.",
        "affected_entities": brief.get("entities", [])[:5] or ["Unspecified entities"],
        "situation": brief.get("summary") or "No summary available.",
        "impact": brief.get("impact", [])[:3] or ["The document describes a material situation requiring attention."],
        "recommended_actions": brief.get("recommended_actions", [])[:3] or ["Validate the recommendation against the original source and the relevant decision-makers."],
        "mitigation": brief.get("recommended_actions", [])[:3] or ["Document the recommended next steps and monitor follow-up actions."],
        "references": brief.get("evidence_references", [])[:3] or ["Source provided by the user."],
        "disclaimer": "This advisory is based only on the supplied source material and the generated content brief. Unknowns remain unknown.",
    }


def _make_linkedin_output(brief: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    summary = brief.get("summary") or "Key developments require attention."
    facts = " ".join(brief.get("key_facts", [])[:2])
    main_topic = brief.get("main_topic") or "this update"
    hook_options = [
        f"What {brief.get('main_topic', 'this update')} means for teams right now",
        f"A quick read on {main_topic}",
        f"Three things to know about {brief.get('main_topic', 'this topic')}",
    ]
    hook = hook_options[0]
    post_text = f"{summary} {facts}".strip()
    call_to_action = "What is your team doing to address this next?"
    hashtags = ["#Leadership", "#Strategy", "#Communication"]
    alternative_hooks = hook_options[1:]
    character_count = len(f"{hook}\n\n{post_text}\n\n{call_to_action}\n{' '.join(hashtags)}")
    return {
        "hook": hook,
        "post": post_text[:1200],
        "call_to_action": call_to_action,
        "hashtags": hashtags,
        "alternative_hooks": alternative_hooks,
        "character_count": character_count,
    }


def generate_output_variants(brief: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    return {
        "executive_summary": _make_summary_output(brief, config),
        "advisory": _make_advisory_output(brief, config),
        "linkedin": _make_linkedin_output(brief, config),
    }
