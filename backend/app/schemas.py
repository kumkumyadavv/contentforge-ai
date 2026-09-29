from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ContentConfig(BaseModel):
    audience: str = "general business audience"
    tone: str = "professional"
    language: str = "English"
    detail_level: str = "moderate"
    communication_objective: str = "inform and guide action"
    output_types: list[str] = Field(default_factory=lambda: ["executive_summary", "advisory", "linkedin"])


class SourceRequest(BaseModel):
    text: str = ""


class GenerateRequest(BaseModel):
    source_text: str = ""
    config: ContentConfig = Field(default_factory=ContentConfig)


class RegenerateRequest(BaseModel):
    output_type: str = "executive_summary"
    config: ContentConfig = Field(default_factory=ContentConfig)


class ContentBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main_topic: str = ""
    summary: str = ""
    key_facts: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    impact: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    evidence_references: list[str] = Field(default_factory=list)


class ValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = "passed"
    deterministic_checks: list[str] = Field(default_factory=list)
    ai_assisted_checks: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class SourceExtraction(BaseModel):
    text: str
    metadata: dict[str, Any]


class GenerateResponse(BaseModel):
    brief: ContentBrief
    outputs: dict[str, Any]
    validation: dict[str, ValidationResult]
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    generation_mode: str = "fallback"


class HealthResponse(BaseModel):
    status: str
    service: str
