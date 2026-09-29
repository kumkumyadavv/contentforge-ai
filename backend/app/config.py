import os
from pathlib import Path

from dotenv import load_dotenv

base_dir = Path(__file__).resolve().parents
for candidate in [base_dir[2], base_dir[1]]:
    if candidate.exists():
        load_dotenv(candidate / ".env", override=False)


class Settings:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


settings = Settings()
