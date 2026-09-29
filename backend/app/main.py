from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import (
    ContentBrief,
    ContentConfig,
    GenerateRequest,
    GenerateResponse,
    HealthResponse,
    RegenerateRequest,
    SourceExtraction,
    ValidationResult,
)
from app.services.brief import build_content_brief, generate_output_variants
from app.services.ingestion import extract_pdf_text, validate_source_text
from app.services.validation import validate_output

app = FastAPI(title="ContentForge AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.current_source: dict[str, Any] | None = None
app.state.current_brief: ContentBrief | None = None
app.state.outputs: dict[str, Any] = {}


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="contentforge-ai")


@app.post("/api/source", response_model=SourceExtraction)
async def source_upload(text: str | None = Form(default=None), file: UploadFile | None = File(default=None)) -> SourceExtraction:
    if text is not None and text.strip():
        cleaned_text = validate_source_text(text)
        app.state.current_source = {
            "text": cleaned_text,
            "metadata": {"source_type": "pasted_text", "file_name": None, "page_count": 1},
        }
        return SourceExtraction(text=cleaned_text, metadata=app.state.current_source["metadata"])

    if file is not None:
        if file.filename is None or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Please upload a valid PDF file.")
        try:
            text_content, metadata = await extract_pdf_text(file)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        app.state.current_source = {"text": text_content, "metadata": metadata}
        return SourceExtraction(text=text_content, metadata=metadata)

    raise HTTPException(status_code=400, detail="Provide pasted text or upload a PDF file.")


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_content(request: GenerateRequest) -> GenerateResponse:
    source_text = request.source_text.strip() if request.source_text else ""
    if not source_text and app.state.current_source:
        source_text = str(app.state.current_source.get("text", "")).strip()

    if not source_text:
        raise HTTPException(status_code=400, detail="Source text is empty. Paste content or upload a PDF first.")

    config_data = request.config.model_dump()
    selected_outputs = config_data.get("output_types") or ["executive_summary", "advisory", "linkedin"]
    brief, generation_mode = build_content_brief(source_text, config_data, return_mode=True)
    generated_outputs = generate_output_variants(brief, config_data)
    outputs = {key: generated_outputs[key] for key in selected_outputs if key in generated_outputs}

    validation: dict[str, ValidationResult] = {}
    for key, payload in outputs.items():
        validation[key] = validate_output(key, payload, brief)

    app.state.current_brief = brief
    app.state.outputs = outputs
    app.state.generation_mode = generation_mode

    metadata = app.state.current_source.get("metadata", {}) if app.state.current_source else {}
    return GenerateResponse(
        brief=brief,
        outputs=outputs,
        validation=validation,
        source_metadata=metadata,
        generation_mode=generation_mode,
    )


@app.post("/api/output/regenerate")
async def regenerate_output(request: RegenerateRequest) -> dict[str, Any]:
    if app.state.current_brief is None:
        raise HTTPException(status_code=400, detail="No generated brief is available for regeneration.")

    output_type = request.output_type.lower()
    if output_type not in {"executive_summary", "advisory", "linkedin"}:
        raise HTTPException(status_code=400, detail="Unsupported output type for regeneration.")

    outputs = generate_output_variants(app.state.current_brief, request.config.model_dump())
    regenerated = outputs.get(output_type)
    if regenerated is None:
        raise HTTPException(status_code=400, detail="Unable to regenerate output for the selected type.")

    validation = validate_output(output_type, regenerated, app.state.current_brief)
    app.state.outputs[output_type] = regenerated
    return {"output_type": output_type, "output": regenerated, "validation": validation}


@app.get("/api/status")
def get_status() -> dict[str, Any]:
    return {
        "has_source": bool(app.state.current_source),
        "has_brief": bool(app.state.current_brief),
        "available_outputs": list(app.state.outputs.keys()),
        "api_key_configured": bool(settings.OPENAI_API_KEY),
    }
