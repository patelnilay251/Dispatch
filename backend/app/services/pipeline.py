"""
Pipeline — connects the Agent to the Task store and SSE stream.

Supports two compute modes, continuation (steer after completion),
and diff capture for PR creation.

Stream lifecycle: stays open after completion for continuation.
Closes only on failure or explicit cleanup.
"""

import tempfile
import asyncio
from datetime import datetime

from app.core.config import settings
from app.models.task import Task, TaskStatus
from app.services.store import store
from app.services.agent import Agent
from app.services.supabase_client import get_supabase
from app.services.github import get_clone_url
from app.core.auth_helpers import get_github_token


# Keep agent references alive for continuation
_active_agents: dict[str, Agent] = {}
_active_sandboxes: dict[str, object] = {}  # E2BSandboxProvider instances
_active_sandbox_ids: dict[str, str] = {}   # sandbox_id strings


def get_active_agent(task_id: str) -> Agent | None:
    return _active_agents.get(task_id)


def get_active_sandbox(task_id: str):
    return _active_sandboxes.get(task_id)


def _update_task_db(task: Task):
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


async def _capture_diff(sandbox, sandbox_id: str, task_id: str):
    """Capture git diff from sandbox. Store as event + persist for PR."""
    try:
        result = await sandbox.exec(sandbox_id, "cd /home/user/project && git add -A && git diff --cached --stat", timeout=15)
        diff_stat = result.stdout.strip() if result.stdout else ""

        result2 = await sandbox.exec(sandbox_id, "cd /home/user/project && git diff --cached", timeout=30)
        diff_full = result2.stdout.strip() if result2.stdout else ""

        result3 = await sandbox.exec(sandbox_id, "cd /home/user/project && git diff --cached --name-only", timeout=10)
        changed_files = [f for f in (result3.stdout or "").strip().split("\n") if f]

        if diff_stat or changed_files:
            store.push_event(task_id, {
                "type": "task_diff",
                "diff_stat": diff_stat,
                "diff_full": diff_full[:50000],
                "changed_files": changed_files,
            })
    except Exception:
        pass


async def _run_e2b(task: Task, queue):
    from app.services.e2b_sandbox import E2BSandboxProvider
    from app.services.sandbox_tools import make_sandbox_tools

    sandbox = E2BSandboxProvider()

    try:
        clone_url = ""
        if task.repo and task.repo != "dispatch/core-agent":
            github_token = await get_github_token(task.user_id) if task.user_id else None
            clone_url = get_clone_url(task.repo, github_token)

        store.push_event(task.id, {"type": "agent_message", "content": "Provisioning cloud sandbox...", "role": "system"})
        sandbox_id = await sandbox.create(repo_url=clone_url)
        store.push_event(task.id, {
            "type": "agent_message",
            "content": f"Sandbox ready. {('Cloned ' + task.repo + '.') if clone_url else 'Empty workspace.'}",
            "role": "system",
        })

        tools = make_sandbox_tools(sandbox, sandbox_id)
        steer_queue = store.get_steer_queue(task.id)
        agent = Agent(workspace=None, emit=queue, tools_override=tools, steer_queue=steer_queue)

        # Store references — kept alive for continuation
        _active_agents[task.id] = agent
        _active_sandboxes[task.id] = sandbox
        _active_sandbox_ids[task.id] = sandbox_id

        await agent.run(prompt=task.prompt, repo=task.repo)

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.iterations = agent.iteration
        task.total_tokens = agent.total_tokens
        task.summary = agent.summary

        # Capture diff — emitted as event AFTER task_complete from agent
        await _capture_diff(sandbox, sandbox_id, task.id)

        # NOTE: Do NOT destroy sandbox or remove agent here.
        # They stay alive for continuation. Cleanup via cleanup_task().

    except Exception as e:
        task.status = TaskStatus.FAILED
        store.push_event(task.id, {"type": "agent_error", "content": str(e)})
        _cleanup_refs(task.id, sandbox)
        raise


async def _run_local(task: Task, queue):
    import subprocess
    from app.services.tools import Workspace
    from app.services.github import get_clone_command, validate_repo

    workspace_dir = tempfile.mkdtemp(prefix=f"dispatch-{task.id}-")
    task.workspace_path = workspace_dir

    if task.repo and task.repo != "dispatch/core-agent":
        github_token = await get_github_token(task.user_id) if task.user_id else None
        repo_meta = await validate_repo(task.repo, github_token)

        if not repo_meta:
            store.push_event(task.id, {"type": "agent_error", "content": f"Repository '{task.repo}' not found."})
            task.status = TaskStatus.FAILED
            return

        clone_cmd = get_clone_command(task.repo, token=github_token)
        store.push_event(task.id, {"type": "agent_message", "content": f"Cloning {task.repo}...", "role": "system"})

        result = subprocess.run(clone_cmd, shell=True, cwd=workspace_dir, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            store.push_event(task.id, {"type": "agent_error", "content": f"Clone failed: {result.stderr.strip()}"})
            task.status = TaskStatus.FAILED
            return

        store.push_event(task.id, {"type": "agent_message", "content": f"Cloned {task.repo}.", "role": "system"})

    workspace = Workspace(workspace_dir)
    steer_queue = store.get_steer_queue(task.id)
    agent = Agent(workspace=workspace, emit=queue, steer_queue=steer_queue)
    _active_agents[task.id] = agent

    await agent.run(prompt=task.prompt, repo=task.repo)

    task.status = TaskStatus.COMPLETED
    task.completed_at = datetime.now()
    task.iterations = agent.iteration
    task.total_tokens = agent.total_tokens
    task.summary = agent.summary

    # Local mode: agent stays alive for continuation too


def _cleanup_refs(task_id: str, sandbox=None):
    """Remove agent/sandbox refs and destroy sandbox."""
    _active_agents.pop(task_id, None)
    _active_sandbox_ids.pop(task_id, None)
    sb = _active_sandboxes.pop(task_id, None) or sandbox
    if sb:
        try:
            import asyncio
            asyncio.create_task(sb.destroy(sb.sandbox_id))
        except Exception:
            pass


async def run_pipeline(task: Task):
    """Initial task execution. Stream stays open after completion."""
    task.status = TaskStatus.RUNNING
    store.update(task)
    _update_task_db(task)

    queue = store.get_queue(task.id)

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

        # Do NOT close stream — keep open for continuation

    except Exception as e:
        if task.status != TaskStatus.FAILED:
            task.status = TaskStatus.FAILED
        store.update(task)
        _update_task_db(task)
        store.push_event(task.id, {"type": "agent_error", "content": str(e)})
        store.close_stream(task.id)  # Only close on failure


async def run_continuation(task_id: str, message: str):
    """Run a follow-up on an already-completed task. Reuses agent + sandbox."""
    agent = _active_agents.get(task_id)
    if not agent:
        store.push_event(task_id, {"type": "agent_error", "content": "Agent session expired. Start a new task."})
        return

    task = store.get(task_id)
    if not task:
        return

    # Mark as running again
    task.status = TaskStatus.RUNNING
    store.update(task)
    _update_task_db(task)

    try:
        await agent.continue_with(message)

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.iterations = agent.iteration
        task.total_tokens = agent.total_tokens
        task.summary = agent.summary

        # Re-capture diff after continuation
        sandbox_id = _active_sandbox_ids.get(task_id)
        sandbox = _active_sandboxes.get(task_id)
        if sandbox and sandbox_id:
            await _capture_diff(sandbox, sandbox_id, task_id)

        store.update(task)
        _update_task_db(task)

    except Exception as e:
        task.status = TaskStatus.FAILED
        store.update(task)
        _update_task_db(task)
        store.push_event(task_id, {"type": "agent_error", "content": str(e)})
