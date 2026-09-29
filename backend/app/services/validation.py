from __future__ import annotations

import json
import re

from app.schemas import ValidationResult


def _required_fields_by_output(output_name: str) -> list[str]:
    if output_name == "executive_summary":
        return ["title", "one_line_summary", "situation", "key_findings", "impact", "risks", "recommended_actions", "uncertainties", "source_references"]
    if output_name == "advisory":
        return ["title", "severity", "date", "summary", "affected_entities", "situation", "impact", "recommended_actions", "mitigation", "references", "disclaimer"]
    if output_name == "linkedin":
        return ["hook", "post", "call_to_action", "hashtags", "alternative_hooks", "character_count"]
    return []


def _extract_value_units(text: str) -> list[tuple[str, str]]:
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|months?|years?|percent|%|people|customers|employees|sites|records|transactions|locations)", text.lower())
    return [(number, unit) for number, unit in matches]


def _check_unconfirmed_claims(payload: dict, brief: dict, errors: list[str], warnings: list[str]) -> None:
    output_text = json.dumps(payload, ensure_ascii=False).lower()
    source_uncertainty = " ".join(brief.get("uncertainties", []) + brief.get("risks", [])).lower()
    if any(phrase in source_uncertainty for phrase in ["not confirmed", "not yet confirmed", "unknown", "unconfirmed", "cannot confirm"]):
        negative_claim_patterns = [
            "was stolen",
            "was compromised",
            "occurred",
            "happened",
            "caused",
            "confirmed",
            "exfiltration",
            "breach",
        ]
        if any(pattern in output_text for pattern in negative_claim_patterns):
            errors.append("The output appears to turn an unconfirmed issue into a confirmed fact.")


def _check_duration_consistency(payload: dict, brief: dict, errors: list[str], warnings: list[str]) -> None:
    source_values = []
    for item in brief.get("key_facts", []) + brief.get("summary", "").split("."):
        source_values.extend(_extract_value_units(item))

    output_values = _extract_value_units(json.dumps(payload, ensure_ascii=False))
    if not source_values or not output_values:
        return

    for source_number, source_unit in source_values:
        for output_number, output_unit in output_values:
            if source_unit != output_unit and source_number == output_number:
                errors.append(f"Detected a likely value mismatch: {source_number} {source_unit} was described in the source, but the output suggests {output_number} {output_unit}.")
                return


def validate_output(output_name: str, payload: dict, brief: dict) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    deterministic_checks: list[str] = []
    ai_assisted_checks: list[str] = []

    required = _required_fields_by_output(output_name)
    for key in required:
        if key not in payload:
            errors.append(f"Missing required field: {key}")
        elif payload.get(key) in (None, "", [], {}):
            errors.append(f"Required field cannot be empty: {key}")

    if output_name == "linkedin":
        if payload.get("character_count", 0) < 80:
            warnings.append("LinkedIn post is unusually short for a strong first draft.")
        if payload.get("character_count", 0) > 3000:
            errors.append("LinkedIn post exceeds a realistic length for a single post.")
        deterministic_checks.append("LinkedIn length check performed.")

    if brief.get("dates"):
        text_blob = json.dumps(payload, ensure_ascii=False).lower()
        date_hits = [d.lower() for d in brief.get("dates", []) if d.lower() in text_blob]
        if not date_hits:
            warnings.append("No source dates were found in the generated output.")
        deterministic_checks.append("Date coverage check performed.")

    if brief.get("entities"):
        text_blob = json.dumps(payload, ensure_ascii=False).lower()
        entity_hits = [e.lower() for e in brief.get("entities", []) if e.lower() in text_blob]
        if not entity_hits:
            warnings.append("No key entities were found in the generated output.")
        deterministic_checks.append("Entity coverage check performed.")

    if brief.get("key_facts"):
        if not any(fact.lower() in json.dumps(payload, ensure_ascii=False).lower() for fact in brief["key_facts"][:2]):
            warnings.append("The output may not be preserving the most important source facts.")
        deterministic_checks.append("Key fact preservation check performed.")

    _check_unconfirmed_claims(payload, brief, errors, warnings)
    _check_duration_consistency(payload, brief, errors, warnings)

    if not brief.get("uncertainties"):
        ai_assisted_checks.append("No explicit uncertainty language was found in the brief; no AI uncertainty validation was possible.")

    if output_name == "linkedin":
        if not payload.get("hashtags"):
            warnings.append("LinkedIn hashtags are missing.")

    if not errors and not warnings:
        status = "passed"
    elif errors:
        status = "failed"
    else:
        status = "warning"

    return ValidationResult(
        status=status,
        deterministic_checks=deterministic_checks,
        ai_assisted_checks=ai_assisted_checks,
        warnings=warnings,
        errors=errors,
    )


def validate_source_content(source_text: str) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    if not source_text or not source_text.strip():
        errors.append("The source text is empty.")
    if len(source_text.strip()) < 20:
        warnings.append("The source text is short; a stronger brief may need more context.")
    status = "failed" if errors else ("warning" if warnings else "passed")
    return {"status": status, "errors": errors, "warnings": warnings}
