from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.config import settings


def safe_json_load(raw: str | None) -> Any:
    if raw is None:
        return None
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json\n", "", 1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def generate_structured_json(system_prompt: str, user_prompt: str, fallback: Any) -> Any:
    if not settings.OPENAI_API_KEY:
        return fallback

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=2000,
        )
        message = response.choices[0].message.content
        parsed = safe_json_load(message)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    return fallback
