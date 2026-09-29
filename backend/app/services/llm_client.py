from __future__ import annotations

import json
import os
from typing import Any

from google import genai

from app.config import settings 


def safe_json_load(raw: str | None) -> Any:
    if raw is None:
        return None

    cleaned = raw.strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def generate_structured_json_with_mode(
    system_prompt: str,
    user_prompt: str,
    fallback: Any,
) -> tuple[Any, str]:

    if not settings.GEMINI_API_KEY:
        return fallback, "fallback"

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        prompt = f"""
SYSTEM INSTRUCTIONS:
{system_prompt}

USER REQUEST:
{user_prompt}

Return ONLY valid JSON.
Do not wrap the JSON in markdown code fences.
"""

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config={
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        )

        parsed = safe_json_load(response.text)

        if isinstance(parsed, (dict, list)):
            return parsed, "llm"

        print("LLM ERROR: Gemini returned invalid JSON")

    except Exception as e:
        print(f"LLM ERROR: {type(e).__name__}: {e}")

    return fallback, "fallback"


def generate_structured_json(
    system_prompt: str,
    user_prompt: str,
    fallback: Any,
) -> Any:
    parsed, _ = generate_structured_json_with_mode(
        system_prompt,
        user_prompt,
        fallback,
    )
    return parsed
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
