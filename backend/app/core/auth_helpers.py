"""
Auth helpers — shared functions used by both API and services.
"""

from app.services.supabase_client import get_supabase


async def get_github_token(user_id: str) -> str | None:
    """Retrieve the stored GitHub token for a user.

    Used by the pipeline to clone repos.
    """
    try:
        supabase = get_supabase()
        result = supabase.table("profiles").select("provider_token").eq("id", user_id).single().execute()
        if result.data:
            return result.data.get("provider_token")
    except Exception:
        pass
    return None
