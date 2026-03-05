"""
GitHub service — repo validation, metadata, and clone URL generation.

Does NOT clone repos itself. The clone happens inside the workspace
(local temp dir now, cloud sandbox later). This service just validates
and provides the information needed for cloning.
"""

import httpx

# GitHub API base
GITHUB_API = "https://api.github.com"


async def validate_repo(repo_full_name: str, token: str | None = None) -> dict | None:
    """Validate a GitHub repo exists and return metadata.

    Args:
        repo_full_name: e.g. "owner/repo"
        token: GitHub access token (for private repos)

    Returns:
        dict with repo metadata, or None if not found.
    """
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{GITHUB_API}/repos/{repo_full_name}", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "full_name": data["full_name"],
                    "default_branch": data["default_branch"],
                    "private": data["private"],
                    "description": data.get("description", ""),
                    "language": data.get("language"),
                    "clone_url": data["clone_url"],
                    "ssh_url": data["ssh_url"],
                    "size_kb": data.get("size", 0),
                }
            return None
        except Exception:
            return None


def get_clone_url(repo_full_name: str, token: str | None = None) -> str:
    """Get the clone URL for a repo.

    Uses HTTPS with token embedded for private repos (works in sandboxes).
    Falls back to plain HTTPS for public repos.
    """
    if token:
        return f"https://x-access-token:{token}@github.com/{repo_full_name}.git"
    return f"https://github.com/{repo_full_name}.git"


def get_clone_command(repo_full_name: str, branch: str = "", token: str | None = None) -> str:
    """Build the git clone command to run inside a workspace/sandbox.

    This command is meant to be executed via:
      - subprocess (local dev)
      - sandbox.exec() (cloud compute)
    """
    url = get_clone_url(repo_full_name, token)
    cmd = f"git clone --depth 1 {url} ."
    if branch:
        cmd = f"git clone --depth 1 --branch {branch} {url} ."
    return cmd


async def list_user_repos(token: str, page: int = 1, per_page: int = 30) -> list[dict]:
    """List repos accessible to the authenticated user.

    Returns simplified repo metadata for the frontend repo selector.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{GITHUB_API}/user/repos",
                headers=headers,
                params={
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": per_page,
                    "page": page,
                    "type": "all",
                },
            )
            if resp.status_code == 200:
                return [
                    {
                        "full_name": r["full_name"],
                        "private": r["private"],
                        "description": r.get("description", ""),
                        "language": r.get("language"),
                        "default_branch": r["default_branch"],
                        "updated_at": r["updated_at"],
                    }
                    for r in resp.json()
                ]
            return []
        except Exception:
            return []
