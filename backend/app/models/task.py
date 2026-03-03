from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class StepStatus(str, Enum):
    WAIT = "wait"
    ACTIVE = "active"
    DONE = "done"
    FAILED = "failed"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StepDefinition(BaseModel):
    id: str
    label: str
    status: StepStatus = StepStatus.WAIT
    detail: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None

class Task(BaseModel):
    id: str
    prompt: str
    repo: str
    branch: str = ""
    status: TaskStatus = TaskStatus.PENDING
    steps: list[StepDefinition] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)


class CreateTaskRequest(BaseModel):
    prompt: str
    repo: str = "dispatch/core-agent"


class CreateTaskResponse(BaseModel):
    id: str
    status: TaskStatus


class SSEEvent(BaseModel):
    """Shape of each event pushed over SSE."""
    type: str  # step_update, task_complete, task_failed, step_output
    step_id: str | None = None
    status: StepStatus | None = None
    detail: str = ""
    data: dict | None = None