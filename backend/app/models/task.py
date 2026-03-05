from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Task(BaseModel):
    id: str
    user_id: str = ""
    prompt: str
    repo: str
    branch: str = ""
    status: TaskStatus = TaskStatus.PENDING
    workspace_path: str = ""
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: datetime | None = None
    summary: str = ""
    iterations: int = 0
    total_tokens: int = 0


class CreateTaskRequest(BaseModel):
    prompt: str
    repo: str = "dispatch/core-agent"


class CreateTaskResponse(BaseModel):
    id: str
    status: TaskStatus
