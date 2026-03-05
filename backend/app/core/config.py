import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Mistral
    MISTRAL_API_KEY: str = os.getenv("MISTRAL_API_KEY", "")

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # GitHub (for OAuth — configured in Supabase dashboard)
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")

    # E2B
    E2B_API_KEY: str = os.getenv("E2B_API_KEY", "")

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Compute mode: "e2b" (cloud) or "local" (dev fallback)
    @property
    def COMPUTE_MODE(self) -> str:
        return "e2b" if self.E2B_API_KEY else "local"

    # Models
    AGENT_MODEL: str = "devstral-latest"
    EMBED_MODEL: str = "mistral-embed"
    REASONING_MODEL: str = "magistral-medium-latest"


settings = Settings()
