import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import AuthUser, require_auth
from app.models.task import CreateTaskRequest, CreateTaskResponse, Task, TaskStatus
from app.services.store import store
from app.services.supabase_client import get_supabase
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["tasks"])


class SteerRequest(BaseModel):
    message: str


class CreatePRRequest(BaseModel):
    title: str = ""
    description: str = ""
    branch_name: str = ""


@router.post("/tasks", response_model=CreateTaskResponse)
async def create_task(
    req: CreateTaskRequest,
    background: BackgroundTasks,
    user: AuthUser = Depends(require_auth),
):
    task_id = f"DSP-{uuid.uuid4().hex[:4].upper()}"
    task = Task(
        id=task_id,
        user_id=user.id,
        prompt=req.prompt,
        repo=req.repo,
        branch="feat/dispatch-task",
    )

    supabase = get_supabase()
    supabase.table("tasks").insert({
        "id": task.id,
        "user_id": task.user_id,
        "prompt": task.prompt,
        "repo": task.repo,
        "branch": task.branch,
        "status": task.status.value,
    }).execute()

    store.create(task)
    background.add_task(run_pipeline, task)
    return CreateTaskResponse(id=task.id, status=task.status)


@router.post("/tasks/{task_id}/steer")
async def steer_task(
    task_id: str,
    body: SteerRequest,
    background: BackgroundTasks,
    user: AuthUser = Depends(require_auth),
):
    """Send a follow-up message to an agent — works during and after execution."""
    from app.services.pipeline import run_continuation, get_active_agent

    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not active")

    if task.status == TaskStatus.RUNNING:
        # Agent is actively running — push to steer queue for mid-run pickup
        store.push_steer(task_id, body.message)
        return {"status": "sent", "message": body.message}

    if task.status == TaskStatus.COMPLETED:
        # Agent finished — run continuation as background task
        agent = get_active_agent(task_id)
        if not agent:
            raise HTTPException(status_code=410, detail="Agent session expired. Start a new task.")
        background.add_task(run_continuation, task_id, body.message)
        return {"status": "continuing", "message": body.message}

    raise HTTPException(status_code=400, detail=f"Cannot steer task in state: {task.status}")


@router.post("/tasks/{task_id}/pr")
async def create_pr(
    task_id: str,
    body: CreatePRRequest,
    user: AuthUser = Depends(require_auth),
):
    """Create a GitHub PR from the agent's changes."""
    from app.core.auth_helpers import get_github_token
    from app.services.github_pr import create_pull_request

    supabase = get_supabase()

    # Verify task belongs to user and is completed
    task_result = supabase.table("tasks") \
        .select("*") \
        .eq("id", task_id) \
        .eq("user_id", user.id) \
        .single() \
        .execute()

    if not task_result.data:
        raise HTTPException(status_code=404, detail="Task not found")

    task_data = task_result.data
    if task_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="Task must be completed before creating a PR")

    repo = task_data.get("repo", "")
    if not repo or repo == "dispatch/core-agent":
        raise HTTPException(status_code=400, detail="No real repository associated with this task")

    # Get GitHub token
    github_token = await get_github_token(user.id)
    if not github_token:
        raise HTTPException(status_code=400, detail="No GitHub token. Re-authenticate with GitHub.")

    # Get the diff events to find changed files
    events_result = supabase.table("task_events") \
        .select("event_type, data") \
        .eq("task_id", task_id) \
        .eq("event_type", "task_diff") \
        .execute()

    if not events_result.data:
        raise HTTPException(status_code=400, detail="No changes captured for this task")

    diff_event = events_result.data[0]["data"]
    changed_files_names = diff_event.get("changed_files", [])

    if not changed_files_names:
        raise HTTPException(status_code=400, detail="No files were changed")

    # Get file contents from tool_result events (edit_file creates)
    # We need to reconstruct file contents from the agent's work
    all_events = supabase.table("task_events") \
        .select("event_type, data") \
        .eq("task_id", task_id) \
        .order("created_at") \
        .execute()

    # Build final file contents from read_file results after edits
    # Strategy: for each changed file, find the last read_file result for it
    file_contents: dict[str, str] = {}
    for ev in reversed(all_events.data or []):
        if ev["event_type"] == "tool_result":
            data = ev["data"]
            tool = data.get("tool", "")
            args = data.get("args", {})
            output = data.get("output", "")
            error = data.get("error", False)

            if tool == "read_file" and not error:
                path = args.get("path", "")
                if path in changed_files_names and path not in file_contents:
                    file_contents[path] = output

    # For files that were created (no read_file after), check edit_file outputs
    # These files' content was set via new_str in edit_file
    for ev in (all_events.data or []):
        if ev["event_type"] == "tool_call":
            data = ev["data"]
            if data.get("tool") == "edit_file":
                args = data.get("args", {})
                path = args.get("path", "")
                old_str = args.get("old_str", "")
                new_str = args.get("new_str", "")
                # If creating a new file (old_str empty), store new_str as content
                if path in changed_files_names and path not in file_contents and old_str == "":
                    file_contents[path] = new_str

    if not file_contents:
        raise HTTPException(status_code=400, detail="Could not reconstruct file contents for PR")

    # Generate defaults
    title = body.title or f"dispatch: {task_data.get('prompt', 'agent changes')[:60]}"
    description = body.description or task_data.get("summary", "Changes made by Dispatch agent.")
    branch_name = body.branch_name or f"dispatch/{task_id.lower()}"

    # Create the PR
    changed_file_list = [{"path": p, "content": c} for p, c in file_contents.items()]
    result = await create_pull_request(
        repo_full_name=repo,
        token=github_token,
        title=title,
        description=description,
        branch_name=branch_name,
        changed_files=changed_file_list,
    )

    if not result or result.get("error"):
        raise HTTPException(status_code=500, detail=result.get("error", "PR creation failed"))

    return result


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    queue = store.get_queue(task_id)
    if not queue:
        raise HTTPException(status_code=404, detail="No active stream for task")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120.0)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            if event is None:
                break
            event_type = event.get("type", "unknown")
            data = json.dumps(event)
            yield f"event: {event_type}\ndata: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/tasks")
async def list_tasks(user: AuthUser = Depends(require_auth)):
    supabase = get_supabase()
    result = supabase.table("tasks").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute()
    return {"tasks": result.data or []}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, user: AuthUser = Depends(require_auth)):
    supabase = get_supabase()
    result = supabase.table("tasks").select("*").eq("id", task_id).eq("user_id", user.id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str, user: AuthUser = Depends(require_auth)):
    supabase = get_supabase()
    task_result = supabase.table("tasks").select("id").eq("id", task_id).eq("user_id", user.id).single().execute()
    if not task_result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    events_result = supabase.table("task_events").select("event_type, data, created_at").eq("task_id", task_id).order("created_at").execute()
    return {"events": events_result.data or []}
