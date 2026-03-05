import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    MISTRAL_API_KEY: str = os.getenv("MISTRAL_API_KEY", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Models
    AGENT_MODEL: str = "devstral-latest"
    EMBED_MODEL: str = "mistral-embed"
    REASONING_MODEL: str = "magistral-medium-latest"


settings = Settings()