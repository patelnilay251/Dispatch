import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.auth import AuthUser, require_auth
from app.models.task import CreateTaskRequest, CreateTaskResponse, Task, TaskStatus
from app.services.store import store
from app.services.supabase_client import get_supabase
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["tasks"])


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

    # Persist to Supabase
    supabase = get_supabase()
    supabase.table("tasks").insert({
        "id": task.id,
        "user_id": task.user_id,
        "prompt": task.prompt,
        "repo": task.repo,
        "branch": task.branch,
        "status": task.status.value,
    }).execute()

    # Also keep in-memory for SSE streaming
    store.create(task)
    background.add_task(run_pipeline, task)
    return CreateTaskResponse(id=task.id, status=task.status)


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    """SSE stream — emits agent events as they happen.

    Note: SSE connections don't carry auth headers in EventSource.
    The task_id acts as a capability token. Frontend only knows
    task IDs it created.
    """
    queue = store.get_queue(task_id)
    if not queue:
        # Task might exist in Supabase but not in memory (server restarted)
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
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tasks")
async def list_tasks(user: AuthUser = Depends(require_auth)):
    """List all tasks for the authenticated user."""
    supabase = get_supabase()

    result = supabase.table("tasks") \
        .select("*") \
        .eq("user_id", user.id) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()

    return {"tasks": result.data or []}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, user: AuthUser = Depends(require_auth)):
    """Get a single task by ID."""
    supabase = get_supabase()

    result = supabase.table("tasks") \
        .select("*") \
        .eq("id", task_id) \
        .eq("user_id", user.id) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str, user: AuthUser = Depends(require_auth)):
    """Get persisted events for a completed task (for replay)."""
    supabase = get_supabase()

    # Verify task belongs to user
    task_result = supabase.table("tasks") \
        .select("id") \
        .eq("id", task_id) \
        .eq("user_id", user.id) \
        .single() \
        .execute()

    if not task_result.data:
        raise HTTPException(status_code=404, detail="Task not found")

    events_result = supabase.table("task_events") \
        .select("event_type, data, created_at") \
        .eq("task_id", task_id) \
        .order("created_at") \
        .execute()

    return {"events": events_result.data or []}
