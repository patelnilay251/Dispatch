"""
Supabase client — used for auth verification and database operations.

Uses service_role key for backend operations (bypasses RLS).
Verifies frontend JWTs via auth.get_user(jwt).
"""

from supabase import create_client, Client
from app.core.config import settings

# Service role client — full access, used server-side only
_client: Client | None = None


def get_supabase() -> Client:
    """Get or create the Supabase client."""
    global _client
    if _client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client
