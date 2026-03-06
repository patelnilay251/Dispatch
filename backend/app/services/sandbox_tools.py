"""
Sandbox-aware tool implementations.

These tools delegate to an E2B sandbox (or any SandboxProvider)
instead of running locally. Drop-in replacement for tools.py
when cloud compute is active.
"""

from app.services.e2b_sandbox import E2BSandboxProvider
from app.services.tools import Tool, ToolResult


def make_sandbox_tools(sandbox: E2BSandboxProvider, sandbox_id: str, project_dir: str = "/home/user/project") -> list[Tool]:
    """Create all tools bound to an E2B sandbox."""

    async def read_file(path: str, **kwargs) -> ToolResult:
        """Read contents of a file."""
        try:
            full_path = f"{project_dir}/{path}" if not path.startswith("/") else path
            content = await sandbox.read_file(sandbox_id, full_path)
            if len(content) > 50000:
                content = content[:50000] + f"\n\n... [truncated, file is {len(content)} chars]"
            return ToolResult(output=content)
        except Exception as e:
            return ToolResult(output=str(e), error=True)

    async def list_files(path: str = ".") -> ToolResult:
        """List files and directories at a path."""
        try:
            full_path = f"{project_dir}/{path}" if not path.startswith("/") else path
            entries = await sandbox.list_files(sandbox_id, full_path)
            return ToolResult(output="\n".join(entries) if entries else "(empty directory)")
        except Exception as e:
            return ToolResult(output=str(e), error=True)

    async def edit_file(path: str, old_str: str = "", new_str: str = "") -> ToolResult:
        """Edit a file by replacing old_str with new_str, or create if doesn't exist."""
        try:
            full_path = f"{project_dir}/{path}" if not path.startswith("/") else path

            if old_str == "":
                # Create new file
                await sandbox.write_file(sandbox_id, full_path, new_str)
                return ToolResult(output=f"Created {path}")

            # Read existing content
            content = await sandbox.read_file(sandbox_id, full_path)

            if old_str == new_str:
                return ToolResult(output="old_str and new_str are identical", error=True)

            if old_str not in content:
                return ToolResult(output=f"old_str not found in {path}", error=True)

            new_content = content.replace(old_str, new_str, 1)
            await sandbox.write_file(sandbox_id, full_path, new_content)
            return ToolResult(output=f"Edited {path}")
        except Exception as e:
            return ToolResult(output=str(e), error=True)

    async def run_command(command: str, timeout: int = 30) -> ToolResult:
        """Run a shell command in the project directory."""
        try:
            result = await sandbox.exec(
                sandbox_id, command,
                cwd=project_dir,
                timeout=min(timeout, 60),
            )
            output = result.stdout
            if result.stderr:
                output += f"\nSTDERR:\n{result.stderr}"
            if result.exit_code != 0:
                output += f"\n(exit code: {result.exit_code})"
            if len(output) > 20000:
                output = output[:20000] + "\n... [truncated]"
            return ToolResult(output=output or "(no output)")
        except Exception as e:
            return ToolResult(output=str(e), error=True)

    async def search_files(pattern: str, path: str = ".") -> ToolResult:
        """Search for a text pattern across files in the project."""
        try:
            full_path = f"{project_dir}/{path}" if not path.startswith("/") else path
            result = await sandbox.exec(
                sandbox_id,
                f'grep -rn --include="*.*" -l "{pattern}" {full_path}',
                cwd=project_dir,
                timeout=15,
            )
            if result.stdout.strip():
                matches = []
                for line in result.stdout.strip().split("\n"):
                    # Make paths relative to project dir
                    rel = line.replace(f"{project_dir}/", "")
                    matches.append(rel)
                return ToolResult(output="\n".join(matches[:50]))
            return ToolResult(output=f"No files matching '{pattern}'")
        except Exception as e:
            return ToolResult(output=str(e), error=True)

    # Return same tool schemas as local tools — agent doesn't know the difference
    return [
        Tool(
            name="read_file",
            description="Read the contents of a file. Use this to understand existing code before making changes.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path within the project."},
                },
                "required": ["path"],
            },
            _execute=read_file,
        ),
        Tool(
            name="list_files",
            description="List files and directories at a given path. Use this to explore project structure.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative directory path. Defaults to project root.", "default": "."},
                },
            },
            _execute=list_files,
        ),
        Tool(
            name="edit_file",
            description="Edit a file by replacing exact text, or create a new file. To create a new file, set old_str to empty and new_str to the file content.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path."},
                    "old_str": {"type": "string", "description": "Exact text to find and replace. Empty string to create new file."},
                    "new_str": {"type": "string", "description": "Replacement text, or full content for new files."},
                },
                "required": ["path", "new_str"],
            },
            _execute=edit_file,
        ),
        Tool(
            name="run_command",
            description="Run a shell command in the project directory. Use for installing deps, running tests, linting, git operations, etc.",
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute."},
                    "timeout": {"type": "integer", "description": "Timeout in seconds (max 60).", "default": 30},
                },
                "required": ["command"],
            },
            _execute=run_command,
        ),
        Tool(
            name="search_files",
            description="Search for a text pattern across files in the project. Returns list of matching file paths.",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Text pattern to search for."},
                    "path": {"type": "string", "description": "Directory to search in. Defaults to project root.", "default": "."},
                },
                "required": ["pattern"],
            },
            _execute=search_files,
        ),
    ]
