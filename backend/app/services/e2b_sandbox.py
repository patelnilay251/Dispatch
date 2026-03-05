"""
E2B Sandbox Provider — implements SandboxProvider using E2B cloud sandboxes.

Each task gets an isolated Firecracker microVM via E2B.
The agent's tools delegate to sandbox.commands.run() and sandbox.files.*
instead of local subprocess/filesystem.

Requires: pip install e2b
Requires: E2B_API_KEY in environment
"""

from e2b import AsyncSandbox

from app.services.sandbox import SandboxProvider, ExecResult


class E2BSandboxProvider(SandboxProvider):
    """E2B-backed sandbox. Each instance wraps one AsyncSandbox."""

    def __init__(self):
        self._sandbox: AsyncSandbox | None = None
        self._sandbox_id: str = ""

    @property
    def is_active(self) -> bool:
        return self._sandbox is not None

    @property
    def sandbox_id(self) -> str:
        return self._sandbox_id

    async def create(self, repo_url: str = "") -> str:
        """Create a new E2B sandbox. Optionally clone a repo into it."""
        self._sandbox = await AsyncSandbox.create(timeout=300)
        self._sandbox_id = self._sandbox.sandbox_id

        # Clone repo if URL provided
        if repo_url:
            result = await self._sandbox.commands.run(
                f"git clone --depth 1 {repo_url} /home/user/project",
                timeout=120,
            )
            if result.exit_code != 0:
                raise RuntimeError(f"Clone failed: {result.stderr}")

        return self._sandbox_id

    async def exec(self, sandbox_id: str, command: str, cwd: str = "/home/user/project", timeout: int = 60) -> ExecResult:
        """Execute a command in the sandbox."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not active")

        result = await self._sandbox.commands.run(
            command,
            cwd=cwd,
            timeout=timeout,
        )

        output = result.stdout or ""
        if result.stderr:
            output += f"\nSTDERR:\n{result.stderr}"

        return ExecResult(
            stdout=result.stdout or "",
            stderr=result.stderr or "",
            exit_code=result.exit_code,
        )

    async def read_file(self, sandbox_id: str, path: str) -> str:
        """Read a file from the sandbox."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not active")

        content = await self._sandbox.files.read(path)
        return content

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        """Write a file in the sandbox."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not active")

        await self._sandbox.files.write(path, content)

    async def list_files(self, sandbox_id: str, path: str) -> list[str]:
        """List files in a directory."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not active")

        entries = await self._sandbox.files.list(path)
        return [e.name for e in entries]

    async def destroy(self, sandbox_id: str) -> None:
        """Tear down the sandbox."""
        if self._sandbox:
            await self._sandbox.close()
            self._sandbox = None
            self._sandbox_id = ""
