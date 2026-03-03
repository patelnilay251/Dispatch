from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ExecResult:
    stdout: str
    stderr: str
    exit_code: int


class SandboxProvider(ABC):
    """Abstract interface for cloud compute sandboxes."""

    @abstractmethod
    async def create(self, repo_url: str) -> str:
        """Clone repo into a new sandbox. Returns sandbox_id."""
        ...

    @abstractmethod
    async def exec(self, sandbox_id: str, command: str) -> ExecResult:
        """Execute a command in the sandbox."""
        ...

    @abstractmethod
    async def read_file(self, sandbox_id: str, path: str) -> str:
        """Read a file from the sandbox."""
        ...

    @abstractmethod
    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        """Write a file in the sandbox."""
        ...

    @abstractmethod
    async def list_files(self, sandbox_id: str, path: str) -> list[str]:
        """List files in a directory."""
        ...

    @abstractmethod
    async def destroy(self, sandbox_id: str) -> None:
        """Tear down the sandbox."""
        ...