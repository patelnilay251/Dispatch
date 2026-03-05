"""
Pipeline — connects the Agent to the Task store and SSE stream.

No more predefined steps. The agent decides what to do.
Each AgentEvent flows through the store's queue to the SSE endpoint.
"""

import shutil
import tempfile
from pathlib import Path
from datetime import datetime

from app.models.task import Task, TaskStatus
from app.services.store import store
from app.services.agent import Agent
from app.services.tools import Workspace

# Sample project for testing without GitHub integration
SAMPLE_PROJECT = Path(__file__).parent.parent.parent / "sample_project"


async def run_pipeline(task: Task):
    """Spin up an agent for the task and stream events."""

    # Create workspace
    workspace_dir = tempfile.mkdtemp(prefix=f"dispatch-{task.id}-")

    # Seed with sample project if it exists and no real repo
    if SAMPLE_PROJECT.exists():
        for item in SAMPLE_PROJECT.iterdir():
            dest = Path(workspace_dir) / item.name
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

    task.workspace_path = workspace_dir
    task.status = TaskStatus.RUNNING
    store.update(task)

    queue = store.get_queue(task.id)
    workspace = Workspace(workspace_dir)
    agent = Agent(workspace=workspace, emit=queue)

    # Emit initial event
    store.push_event(task.id, {
        "type": "task_init",
        "id": task.id,
        "prompt": task.prompt,
        "repo": task.repo,
        "branch": task.branch,
        "workspace": workspace_dir,
    })

    try:
        await agent.run(prompt=task.prompt, repo=task.repo)

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.iterations = agent.iteration
        task.total_tokens = agent.total_tokens
        store.update(task)

    except Exception as e:
        task.status = TaskStatus.FAILED
        store.update(task)
        store.push_event(task.id, {
            "type": "agent_error",
            "content": str(e),
        })

    finally:
        store.close_stream(task.id)