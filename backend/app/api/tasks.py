import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse

from app.models.task import CreateTaskRequest, CreateTaskResponse, Task, TaskStatus
from app.services.store import store
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["tasks"])


@router.post("/tasks", response_model=CreateTaskResponse)
async def create_task(req: CreateTaskRequest, background: BackgroundTasks):
    task_id = f"DSP-{uuid.uuid4().hex[:4].upper()}"
    task = Task(
        id=task_id,
        prompt=req.prompt,
        repo=req.repo,
        branch="feat/dispatch-task",
    )
    store.create(task)
    background.add_task(run_pipeline, task)
    return CreateTaskResponse(id=task.id, status=task.status)

@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    """SSE stream — emits agent events as they happen."""
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    queue = store.get_queue(task_id)
    if not queue:
        raise HTTPException(status_code=404, detail="No stream for task")

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
async def list_tasks():
    tasks = store.list_all()
    return {
        "tasks": [
            {
                "id": t.id,
                "prompt": t.prompt,
                "repo": t.repo,
                "status": t.status.value,
                "iterations": t.iterations,
                "total_tokens": t.total_tokens,
                "created_at": t.created_at.isoformat(),
                "summary": t.summary,
            }
            for t in tasks
        ]
    }


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task