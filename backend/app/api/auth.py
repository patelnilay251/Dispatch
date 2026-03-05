"""
Auth API — user profile and provider token management.

The frontend handles GitHub OAuth via Supabase JS SDK.
These endpoints let the backend access user info and store
the GitHub provider token needed for repo operations.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import AuthUser, require_auth
from app.services.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])


class UserProfile(BaseModel):
    id: str
    email: str | None = None
    github_username: str | None = None
    avatar_url: str | None = None
    has_github_token: bool = False


class ProviderTokenRequest(BaseModel):
    provider_token: str


@router.get("/me", response_model=UserProfile)
async def get_me(user: AuthUser = Depends(require_auth)):
    """Return the current authenticated user's profile."""
    supabase = get_supabase()

    # Fetch profile from DB to check if provider_token exists
    result = supabase.table("profiles").select("github_username, avatar_url, provider_token").eq("id", user.id).single().execute()

    profile = result.data if result.data else {}

    return UserProfile(
        id=user.id,
        email=user.email,
        github_username=profile.get("github_username") or user.github_username,
        avatar_url=profile.get("avatar_url") or user.avatar_url,
        has_github_token=bool(profile.get("provider_token")),
    )


@router.post("/provider-token")
async def store_provider_token(
    body: ProviderTokenRequest,
    user: AuthUser = Depends(require_auth),
):
    """Store the GitHub provider token for repo operations.

    Called by the frontend after successful GitHub OAuth login.
    The provider_token is the GitHub access token that lets us
    clone private repos and create PRs on behalf of the user.
    """
    supabase = get_supabase()

    supabase.table("profiles").upsert({
        "id": user.id,
        "provider_token": body.provider_token,
        "github_username": user.github_username,
        "avatar_url": user.avatar_url,
    }).execute()

    return {"status": "ok"}


# get_github_token lives in app.core.auth_helpers (shared with services)
