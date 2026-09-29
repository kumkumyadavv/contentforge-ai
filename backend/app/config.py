import os
from pathlib import Path

from dotenv import load_dotenv

backend_env = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(backend_env, override=False)


class Settings:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


settings = Settings()