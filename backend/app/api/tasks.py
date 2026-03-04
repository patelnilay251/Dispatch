import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse

from app.models.task import (
    CreateTaskRequest, CreateTaskResponse, Task, TaskStatus, SSEEvent,
)
from app.services.store import store
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["tasks"])


@router.post("/tasks", response_model=CreateTaskResponse)
async def create_task(req: CreateTaskRequest, background: BackgroundTasks):
    """Create a task and kick off the pipeline in the background."""
    task_id = f"DSP-{uuid.uuid4().hex[:4].upper()}"
    task = Task(
        id=task_id,
        prompt=req.prompt,
        repo=req.repo,
        branch="feat/tenant-auth",
    )
    store.create(task)
    background.add_task(run_pipeline, task)
    return CreateTaskResponse(id=task.id, status=task.status)

@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    """SSE stream for real-time task progress."""
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    queue = store.get_queue(task_id)
    if not queue:
        raise HTTPException(status_code=404, detail="No stream for task")

    async def event_generator():
        # Send initial task state
        yield format_sse(SSEEvent(
            type="task_init",
            detail=task.prompt,
            data={
                "id": task.id,
                "prompt": task.prompt,
                "repo": task.repo,
                "branch": task.branch,
                "steps": [
                    {"id": s.id, "label": s.label, "status": s.status.value}
                    for s in task.steps
                ] if task.steps else [],
            },
        ))

        # Stream events from queue
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                # Send keepalive
                yield ": keepalive\n\n"
                continue

            if event is None:
                # Stream ended
                break

            yield format_sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def format_sse(event: SSEEvent) -> str:
    data = event.model_dump_json()
    return f"event: {event.type}\ndata: {data}\n\n"


@router.get("/tasks")
async def list_tasks():
    tasks = store.list_all()
    result = []
    for t in tasks:
        current_step = None
        completed_steps = 0
        for s in t.steps:
            if s.status.value == "active":
                current_step = s.label
            if s.status.value == "done":
                completed_steps += 1
        result.append({
            "id": t.id,
            "prompt": t.prompt,
            "repo": t.repo,
            "branch": t.branch,
            "status": t.status.value,
            "current_step": current_step,
            "total_steps": len(t.steps),
            "completed_steps": completed_steps,
            "created_at": t.created_at.isoformat(),
        })
    return {"tasks": result}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task