"""
GitHub PR creation service.

Creates a pull request from a stored diff using the GitHub API.
Uses the Git Data API (trees/blobs) for multi-file commits.
"""

import httpx
from app.services.supabase_client import get_supabase

GITHUB_API = "https://api.github.com"


async def create_pull_request(
    repo_full_name: str,
    token: str,
    title: str,
    description: str,
    branch_name: str,
    changed_files: list[dict],  # [{path, content}]
) -> dict | None:
    """Create a PR with the given file changes.

    Uses Git Data API: get base tree → create blobs → create tree → create commit → create ref → create PR.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            # 1. Get default branch and its latest commit
            repo_resp = await client.get(f"{GITHUB_API}/repos/{repo_full_name}", headers=headers)
            if repo_resp.status_code != 200:
                return {"error": f"Cannot access repo: {repo_resp.status_code}"}

            default_branch = repo_resp.json()["default_branch"]

            ref_resp = await client.get(
                f"{GITHUB_API}/repos/{repo_full_name}/git/ref/heads/{default_branch}",
                headers=headers,
            )
            if ref_resp.status_code != 200:
                return {"error": f"Cannot get ref: {ref_resp.status_code}"}

            base_sha = ref_resp.json()["object"]["sha"]

            # 2. Get the base tree
            commit_resp = await client.get(
                f"{GITHUB_API}/repos/{repo_full_name}/git/commits/{base_sha}",
                headers=headers,
            )
            base_tree_sha = commit_resp.json()["tree"]["sha"]

            # 3. Create blobs for each changed file
            tree_items = []
            for f in changed_files:
                blob_resp = await client.post(
                    f"{GITHUB_API}/repos/{repo_full_name}/git/blobs",
                    headers=headers,
                    json={"content": f["content"], "encoding": "utf-8"},
                )
                if blob_resp.status_code != 201:
                    continue
                tree_items.append({
                    "path": f["path"],
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_resp.json()["sha"],
                })

            if not tree_items:
                return {"error": "No files to commit"}

            # 4. Create new tree
            tree_resp = await client.post(
                f"{GITHUB_API}/repos/{repo_full_name}/git/trees",
                headers=headers,
                json={"base_tree": base_tree_sha, "tree": tree_items},
            )
            if tree_resp.status_code != 201:
                return {"error": f"Cannot create tree: {tree_resp.status_code}"}

            new_tree_sha = tree_resp.json()["sha"]

            # 5. Create commit
            commit_create_resp = await client.post(
                f"{GITHUB_API}/repos/{repo_full_name}/git/commits",
                headers=headers,
                json={
                    "message": title,
                    "tree": new_tree_sha,
                    "parents": [base_sha],
                },
            )
            if commit_create_resp.status_code != 201:
                return {"error": f"Cannot create commit: {commit_create_resp.status_code}"}

            new_commit_sha = commit_create_resp.json()["sha"]

            # 6. Create branch
            ref_create_resp = await client.post(
                f"{GITHUB_API}/repos/{repo_full_name}/git/refs",
                headers=headers,
                json={"ref": f"refs/heads/{branch_name}", "sha": new_commit_sha},
            )
            if ref_create_resp.status_code != 201:
                return {"error": f"Cannot create branch: {ref_create_resp.status_code}"}

            # 7. Create PR
            pr_resp = await client.post(
                f"{GITHUB_API}/repos/{repo_full_name}/pulls",
                headers=headers,
                json={
                    "title": title,
                    "body": description,
                    "head": branch_name,
                    "base": default_branch,
                },
            )
            if pr_resp.status_code != 201:
                return {"error": f"Cannot create PR: {pr_resp.status_code}"}

            pr_data = pr_resp.json()
            return {
                "pr_url": pr_data["html_url"],
                "pr_number": pr_data["number"],
                "branch": branch_name,
            }

        except Exception as e:
            return {"error": str(e)}
