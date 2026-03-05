"""
Pipeline — connects the Agent to the Task store and SSE stream.

Supports two compute modes:
  - "e2b": Agent runs against an E2B cloud sandbox (production)
  - "local": Agent runs against a local temp directory (dev fallback)

The agent and its tools are identical in both modes — only the
underlying execution environment changes.
"""

import tempfile
from datetime import datetime

from app.core.config import settings
from app.models.task import Task, TaskStatus
from app.services.store import store
from app.services.agent import Agent
from app.services.supabase_client import get_supabase
from app.services.github import get_clone_url
from app.core.auth_helpers import get_github_token


def _update_task_db(task: Task):
    """Sync task status to Supabase."""
    try:
        supabase = get_supabase()
        update_data = {
            "status": task.status.value,
            "iterations": task.iterations,
            "total_tokens": task.total_tokens,
            "summary": task.summary,
        }
        if task.completed_at:
            update_data["completed_at"] = task.completed_at.isoformat()
        supabase.table("tasks").update(update_data).eq("id", task.id).execute()
    except Exception:
        pass


async def _run_e2b(task: Task, queue):
    """Run the agent in an E2B cloud sandbox."""
    from app.services.e2b_sandbox import E2BSandboxProvider
    from app.services.sandbox_tools import make_sandbox_tools

    sandbox = E2BSandboxProvider()

    try:
        # Get clone URL if we have a real repo
        clone_url = ""
        if task.repo and task.repo != "dispatch/core-agent":
            github_token = await get_github_token(task.user_id) if task.user_id else None
            clone_url = get_clone_url(task.repo, github_token)

        store.push_event(task.id, {
            "type": "agent_message",
            "content": f"Provisioning cloud sandbox...",
            "role": "system",
        })

        # Create sandbox (optionally clone repo into it)
        sandbox_id = await sandbox.create(repo_url=clone_url)

        store.push_event(task.id, {
            "type": "agent_message",
            "content": f"Sandbox ready. {('Cloned ' + task.repo + '.') if clone_url else 'Empty workspace.'}",
            "role": "system",
        })

        # Create tools bound to the sandbox
        tools = make_sandbox_tools(sandbox, sandbox_id)

        # Run the agent with sandbox tools
        agent = Agent(workspace=None, emit=queue, tools_override=tools)
        await agent.run(prompt=task.prompt, repo=task.repo)

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.iterations = agent.iteration
        task.total_tokens = agent.total_tokens
        task.summary = agent.summary

    except Exception as e:
        task.status = TaskStatus.FAILED
        store.push_event(task.id, {"type": "agent_error", "content": str(e)})
        raise

    finally:
        # Always tear down the sandbox
        try:
            await sandbox.destroy(sandbox.sandbox_id)
        except Exception:
            pass


async def _run_local(task: Task, queue):
    """Run the agent against a local temp directory (dev fallback)."""
    import subprocess
    from app.services.tools import Workspace
    from app.services.github import get_clone_command, validate_repo

    workspace_dir = tempfile.mkdtemp(prefix=f"dispatch-{task.id}-")
    task.workspace_path = workspace_dir

    # Clone repo if specified
    if task.repo and task.repo != "dispatch/core-agent":
        github_token = await get_github_token(task.user_id) if task.user_id else None
        repo_meta = await validate_repo(task.repo, github_token)

        if not repo_meta:
            store.push_event(task.id, {
                "type": "agent_error",
                "content": f"Repository '{task.repo}' not found or not accessible.",
            })
            task.status = TaskStatus.FAILED
            return

        clone_cmd = get_clone_command(task.repo, token=github_token)
        store.push_event(task.id, {
            "type": "agent_message",
            "content": f"Cloning {task.repo}...",
            "role": "system",
        })

        result = subprocess.run(
            clone_cmd, shell=True, cwd=workspace_dir,
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            store.push_event(task.id, {
                "type": "agent_error",
                "content": f"Clone failed: {result.stderr.strip()}",
            })
            task.status = TaskStatus.FAILED
            return

        store.push_event(task.id, {
            "type": "agent_message",
            "content": f"Cloned {task.repo}.",
            "role": "system",
        })

    workspace = Workspace(workspace_dir)
    agent = Agent(workspace=workspace, emit=queue)
    await agent.run(prompt=task.prompt, repo=task.repo)

    task.status = TaskStatus.COMPLETED
    task.completed_at = datetime.now()
    task.iterations = agent.iteration
    task.total_tokens = agent.total_tokens
    task.summary = agent.summary


async def run_pipeline(task: Task):
    """Spin up an agent for the task and stream events."""

    task.status = TaskStatus.RUNNING
    store.update(task)
    _update_task_db(task)

    queue = store.get_queue(task.id)

    # Emit initial event
    store.push_event(task.id, {
        "type": "task_init",
        "id": task.id,
        "prompt": task.prompt,
        "repo": task.repo,
        "branch": task.branch,
        "compute": settings.COMPUTE_MODE,
    })

    try:
        if settings.COMPUTE_MODE == "e2b":
            await _run_e2b(task, queue)
        else:
            await _run_local(task, queue)

        store.update(task)
        _update_task_db(task)

    except Exception as e:
        if task.status != TaskStatus.FAILED:
            task.status = TaskStatus.FAILED
        store.update(task)
        _update_task_db(task)
        store.push_event(task.id, {"type": "agent_error", "content": str(e)})

    finally:
        store.close_stream(task.id)
