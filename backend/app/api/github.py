"""
GitHub API — repo listing and validation endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthUser, require_auth
from app.core.auth_helpers import get_github_token
from app.services.github import validate_repo, list_user_repos

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/repos")
async def get_repos(user: AuthUser = Depends(require_auth), page: int = 1):
    """List repos accessible to the authenticated user."""
    token = await get_github_token(user.id)
    if not token:
        raise HTTPException(status_code=400, detail="No GitHub token stored. Re-authenticate with GitHub.")

    repos = await list_user_repos(token, page=page)
    return {"repos": repos}


@router.get("/repos/{owner}/{repo}")
async def get_repo(owner: str, repo: str, user: AuthUser = Depends(require_auth)):
    """Validate and get metadata for a specific repo."""
    token = await get_github_token(user.id)
    full_name = f"{owner}/{repo}"

    meta = await validate_repo(full_name, token)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Repository '{full_name}' not found or not accessible.")

    return meta
