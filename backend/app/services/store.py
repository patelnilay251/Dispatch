import asyncio
from app.models.task import Task, SSEEvent


class TaskStore:
    """In-memory task store. Replace with Supabase later."""

    def __init__(self):
        self._tasks: dict[str, Task] = {}
        self._queues: dict[str, asyncio.Queue[SSEEvent | None]] = {}

    def create(self, task: Task) -> Task:
        self._tasks[task.id] = task
        self._queues[task.id] = asyncio.Queue()
        return task

    def get(self, task_id: str) -> Task | None:
        return self._tasks.get(task_id)

    def update(self, task: Task) -> Task:
        self._tasks[task.id] = task
        return task

    def list_all(self) -> list[Task]:
        return list(self._tasks.values())

    def get_queue(self, task_id: str) -> asyncio.Queue[SSEEvent | None] | None:
        return self._queues.get(task_id)

    def push_event(self, task_id: str, event: SSEEvent):
        q = self._queues.get(task_id)
        if q:
            q.put_nowait(event)

    def close_stream(self, task_id: str):
        """Push None sentinel to signal stream end."""
        q = self._queues.get(task_id)
        if q:
            q.put_nowait(None)


store = TaskStore()