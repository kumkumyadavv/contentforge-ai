from __future__ import annotations

import re
from typing import Any

import fitz
from fastapi import UploadFile


def validate_source_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if not cleaned:
        raise ValueError("Source text cannot be empty.")
    return cleaned


async def extract_pdf_text(file: UploadFile) -> tuple[str, dict[str, Any]]:
    if file is None:
        raise ValueError("No PDF file was supplied.")

    file_bytes = await file.read()
    if not file_bytes:
        raise ValueError("The uploaded PDF is empty.")

    try:
        pdf = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # pragma: no cover - defensive branch
        raise ValueError("The uploaded file could not be opened as a valid PDF.") from exc

    try:
        pages = [page.get_text("text", sort=True) for page in pdf]
    except Exception as exc:  # pragma: no cover - defensive branch
        raise ValueError("PDF text extraction failed. Check whether the file is readable and not encrypted.") from exc

    text = "\n\n".join(page.strip() for page in pages if page and page.strip())
    if not text.strip():
        raise ValueError("PDF extraction produced no readable text.")

    metadata = {
        "source_type": "pdf",
        "file_name": file.filename,
        "page_count": len(pdf),
        "content_type": file.content_type or "application/pdf",
    }
    pdf.close()
    return validate_source_text(text), metadata
