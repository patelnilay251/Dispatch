from fastapi import APIRouter

router = APIRouter(tags=["tasks"])


@router.post("/tasks")
async def create_task():
    """Create a new coding task."""
    return {"message": "not implemented"}


@router.get("/tasks")
async def list_tasks():
    """List all tasks."""
    return {"tasks": []}