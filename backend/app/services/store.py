import asyncio
from app.models.task import Task


class PersistentQueue(asyncio.Queue):
    """Queue that also persists events to Supabase."""

    def __init__(self, task_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.task_id = task_id

    def put_nowait(self, item):
        super().put_nowait(item)
        if item is not None and isinstance(item, dict):
            try:
                from app.services.supabase_client import get_supabase
                supabase = get_supabase()
                supabase.table("task_events").insert({
                    "task_id": self.task_id,
                    "event_type": item.get("type", "unknown"),
                    "data": item,
                }).execute()
            except Exception:
                pass


class TaskStore:
    """In-memory task store with SSE queues and steer queues."""

    def __init__(self):
        self._tasks: dict[str, Task] = {}
        self._queues: dict[str, PersistentQueue] = {}
        self._steer_queues: dict[str, asyncio.Queue] = {}

    def create(self, task: Task) -> Task:
        self._tasks[task.id] = task
        self._queues[task.id] = PersistentQueue(task.id)
        self._steer_queues[task.id] = asyncio.Queue()
        return task

    def get(self, task_id: str) -> Task | None:
        return self._tasks.get(task_id)

    def update(self, task: Task) -> Task:
        self._tasks[task.id] = task
        return task

    def list_all(self) -> list[Task]:
        return list(self._tasks.values())

    def get_queue(self, task_id: str) -> PersistentQueue | None:
        return self._queues.get(task_id)

    def get_steer_queue(self, task_id: str) -> asyncio.Queue | None:
        return self._steer_queues.get(task_id)

    def push_event(self, task_id: str, event: dict):
        q = self._queues.get(task_id)
        if q:
            q.put_nowait(event)

    def push_steer(self, task_id: str, message: str):
        """Push a steer message for the agent to pick up."""
        q = self._steer_queues.get(task_id)
        if q:
            q.put_nowait(message)

    def close_stream(self, task_id: str):
        q = self._queues.get(task_id)
        if q:
            q.put_nowait(None)


store = TaskStore()
