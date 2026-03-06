"""
Tool definitions for the Dispatch agent.

Each tool has:
  - name, description, parameters (JSON schema) → sent to the model
  - execute() → runs locally when the model calls it

Tools operate against a workspace directory (cloned repo or temp dir).
"""

import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ToolResult:
    output: str
    error: bool = False


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    _execute: object = field(repr=False)

    def to_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
    async def execute(self, **kwargs) -> ToolResult:
        try:
            return await self._execute(**kwargs)
        except Exception as e:
            return ToolResult(output=str(e), error=True)


# ──────────────────────────────────────────────
# Workspace — isolated directory per task
# ──────────────────────────────────────────────
class Workspace:
    """Represents the working directory for a task.
    All tool operations are scoped to this directory."""

    def __init__(self, base_path: str):
        # Resolve symlinks upfront (fixes macOS /var -> /private/var)
        self.path = Path(base_path).resolve()
        self.path.mkdir(parents=True, exist_ok=True)

    def resolve(self, relative_path: str) -> Path:
        """Resolve and validate a path is within the workspace."""
        resolved = (self.path / relative_path).resolve()
        if not str(resolved).startswith(str(self.path)):
            raise ValueError(f"Path escapes workspace: {relative_path}")
        return resolved

# ──────────────────────────────────────────────
# Tool implementations
# ──────────────────────────────────────────────

def make_tools(workspace: Workspace) -> list[Tool]:
    """Create all tools bound to a specific workspace."""

    async def read_file(path: str, **kwargs) -> ToolResult:
        """Read contents of a file."""
        resolved = workspace.resolve(path)
        if not resolved.exists():
            return ToolResult(output=f"File not found: {path}", error=True)
        if resolved.is_dir():
            return ToolResult(output=f"Path is a directory, not a file: {path}", error=True)
        content = resolved.read_text(errors="replace")
        # Truncate very large files
        if len(content) > 50000:
            content = content[:50000] + f"\n\n... [truncated, file is {len(content)} chars]"
        return ToolResult(output=content)

    async def list_files(path: str = ".") -> ToolResult:
        """List files and directories at a path."""
        resolved = workspace.resolve(path)
        if not resolved.exists():
            return ToolResult(output=f"Path not found: {path}", error=True)
        entries = []
        for item in sorted(resolved.iterdir()):
            rel = item.relative_to(workspace.path)
            # Skip hidden dirs and common noise
            if any(p.startswith(".") for p in rel.parts):
                continue
            if "node_modules" in rel.parts or "__pycache__" in rel.parts:
                continue
            suffix = "/" if item.is_dir() else ""
            entries.append(f"{rel}{suffix}")
        return ToolResult(output="\n".join(entries) if entries else "(empty directory)")
    async def edit_file(path: str, old_str: str = "", new_str: str = "") -> ToolResult:
        """Edit a file by replacing old_str with new_str, or create if doesn't exist."""
        resolved = workspace.resolve(path)

        if not resolved.exists():
            if old_str == "":
                # Create new file
                resolved.parent.mkdir(parents=True, exist_ok=True)
                resolved.write_text(new_str)
                return ToolResult(output=f"Created {path}")
            return ToolResult(output=f"File not found: {path}", error=True)

        content = resolved.read_text()
        if old_str == new_str:
            return ToolResult(output="old_str and new_str are identical", error=True)

        if old_str and old_str not in content:
            return ToolResult(output=f"old_str not found in {path}", error=True)

        if old_str:
            new_content = content.replace(old_str, new_str, 1)
        else:
            new_content = new_str

        resolved.write_text(new_content)
        return ToolResult(output=f"Edited {path}")

    async def run_command(command: str, timeout: int = 30) -> ToolResult:
        """Run a shell command in the workspace directory."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=str(workspace.path),
                capture_output=True,
                text=True,
                timeout=min(timeout, 60),
            )
            output = result.stdout
            if result.stderr:
                output += f"\nSTDERR:\n{result.stderr}"
            if result.returncode != 0:
                output += f"\n(exit code: {result.returncode})"
            # Truncate long outputs
            if len(output) > 20000:
                output = output[:20000] + "\n... [truncated]"
            return ToolResult(output=output or "(no output)")
        except subprocess.TimeoutExpired:
            return ToolResult(output=f"Command timed out after {timeout}s", error=True)
    async def search_files(pattern: str, path: str = ".") -> ToolResult:
        """Search for a text pattern across files in the workspace."""
        resolved = workspace.resolve(path)
        matches = []
        try:
            result = subprocess.run(
                ["grep", "-rn", "--include=*.*", "-l", pattern, str(resolved)],
                capture_output=True, text=True, timeout=15,
            )
            if result.stdout.strip():
                for line in result.stdout.strip().split("\n"):
                    rel = os.path.relpath(line, str(workspace.path))
                    matches.append(rel)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            # Fallback: simple python search
            for file in resolved.rglob("*"):
                if file.is_file() and file.suffix in {".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".yaml", ".yml", ".toml", ".cfg", ".txt", ".html", ".css"}:
                    try:
                        if pattern in file.read_text(errors="replace"):
                            matches.append(str(file.relative_to(workspace.path)))
                    except Exception:
                        continue
        if not matches:
            return ToolResult(output=f"No files matching '{pattern}'")
        return ToolResult(output="\n".join(matches[:50]))

    # ──────────────────────────────────────────
    # Build and return all tools
    # ──────────────────────────────────────────
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
        ),        Tool(
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