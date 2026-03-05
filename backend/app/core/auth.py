"""
Auth middleware — FastAPI dependency for JWT verification.

Usage in routes:
    @router.get("/protected")
    async def protected(user: AuthUser = Depends(require_auth)):
        return {"user_id": user.id}
"""

from dataclasses import dataclass
from fastapi import Depends, HTTPException, Request
from app.services.supabase_client import get_supabase


@dataclass
class AuthUser:
    """Authenticated user extracted from Supabase JWT."""
    id: str
    email: str | None = None
    github_username: str | None = None
    avatar_url: str | None = None


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return auth_header[7:]  # Strip "Bearer "


async def require_auth(request: Request) -> AuthUser:
    """FastAPI dependency — verifies JWT and returns the authenticated user.

    Raises 401 if token is missing, invalid, or expired.
    """
    token = _extract_token(request)
    supabase = get_supabase()

    try:
        response = supabase.auth.get_user(token)
        user = response.user

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return AuthUser(
            id=user.id,
            email=user.email,
            github_username=user.user_metadata.get("user_name") if user.user_metadata else None,
            avatar_url=user.user_metadata.get("avatar_url") if user.user_metadata else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth verification failed: {str(e)}")


async def optional_auth(request: Request) -> AuthUser | None:
    """FastAPI dependency — returns user if authenticated, None otherwise.

    Use for endpoints that work with or without auth.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    try:
        return await require_auth(request)
    except HTTPException:
        return None
