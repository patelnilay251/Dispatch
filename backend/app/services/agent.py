"""
Dispatch Agent — the core agentic loop.

Architecture:
  1. Send conversation + tools to model
  2. If model returns tool_calls → execute tools, append results, goto 1
  3. If model returns text → emit as message, check if done or continue
  4. Between iterations, check for steer messages from the user
  5. Repeat until model declares task complete or limits hit
"""

import json
import asyncio
from dataclasses import dataclass

from app.services.mistral import chat_complete, extract_text
from app.services.tools import Tool, ToolResult, Workspace, make_tools
from app.core.config import settings


@dataclass
class AgentEvent:
    type: str
    data: dict

    def to_sse(self) -> dict:
        return {"type": self.type, **self.data}

SYSTEM_PROMPT = """You are Dispatch, an autonomous coding agent. You have access to tools to explore, understand, and modify codebases.

When given a task:
1. Start by understanding the project — list files, read key files like README, config files, entry points
2. Analyze the architecture and identify what needs to change
3. Plan your approach, then execute it using edit_file
4. After making changes, verify them — run linting, tests, or read the file back
5. When you are fully done, respond with your final summary starting with "TASK_COMPLETE:" followed by a summary of what you did

Guidelines:
- Always read a file before editing it
- Make targeted edits — replace only what needs to change
- Create new files when needed (set old_str to empty)
- Run tests after making changes when possible
- If something fails, read the error, adjust, and retry
- Be thorough but efficient — don't read files you don't need

If the user sends a follow-up instruction mid-task, prioritize it and adjust your approach accordingly.
"""

MAX_ITERATIONS = 30
MAX_TOOL_CALLS_PER_TURN = 10


class Agent:
    """The core agent loop. Runs against a workspace, streams events."""

    def __init__(
        self,
        workspace: Workspace | None,
        emit: asyncio.Queue,
        tools_override: list | None = None,
        steer_queue: asyncio.Queue | None = None,
    ):
        self.workspace = workspace
        self.emit = emit
        self.steer_queue = steer_queue
        if tools_override:
            self.tools = tools_override
        elif workspace:
            self.tools = make_tools(workspace)
        else:
            self.tools = []
        self.tool_map = {t.name: t for t in self.tools}
        self.messages: list[dict] = []
        self.iteration = 0
        self.total_tokens = 0
        self.summary = ""
        self._completed = False

    @property
    def completed(self) -> bool:
        return self._completed

    def _push(self, event: AgentEvent):
        self.emit.put_nowait({"type": event.type, **event.data})

    async def _check_steer(self) -> str | None:
        """Non-blocking check for steer messages from the user."""
        if not self.steer_queue:
            return None
        try:
            return self.steer_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

    async def run(self, prompt: str, repo: str = ""):
        """Main agent loop. Runs until task complete or limits hit."""

        system_content = SYSTEM_PROMPT
        if repo:
            system_content += f"\n\nYou are working on the repository: {repo}"

        self.messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt},
        ]

        self._push(AgentEvent(
            type="agent_message",
            data={"content": f"Starting task: {prompt}", "role": "system"},
        ))
        tool_schemas = [t.to_schema() for t in self.tools]

        while self.iteration < MAX_ITERATIONS:
            self.iteration += 1

            # ── Check for steer messages between iterations ──
            steer_msg = await self._check_steer()
            if steer_msg:
                self.messages.append({"role": "user", "content": steer_msg})
                self._push(AgentEvent(
                    type="agent_message",
                    data={"content": f"Received: {steer_msg}", "role": "system"},
                ))

            try:
                response = await chat_complete(
                    messages=self.messages,
                    tools=tool_schemas,
                    tool_choice="auto",
                    temperature=0.2,
                    max_tokens=8000,
                )
            except Exception as e:
                self._push(AgentEvent(
                    type="agent_error",
                    data={"content": f"Model error: {str(e)}"},
                ))
                break

            choice = response.choices[0]
            self.total_tokens += getattr(response.usage, "total_tokens", 0)

            # ── Model returned tool calls ──
            if choice.message.tool_calls:
                self.messages.append({
                    "role": "assistant",
                    "content": choice.message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in choice.message.tool_calls
                    ],
                })
                for tc in choice.message.tool_calls[:MAX_TOOL_CALLS_PER_TURN]:
                    fn_name = tc.function.name
                    fn_args_raw = tc.function.arguments
                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                    except json.JSONDecodeError:
                        fn_args = {}

                    self._push(AgentEvent(
                        type="tool_call",
                        data={"tool": fn_name, "args": fn_args, "call_id": tc.id},
                    ))

                    tool = self.tool_map.get(fn_name)
                    if tool:
                        result = await tool.execute(**fn_args)
                    else:
                        result = ToolResult(output=f"Unknown tool: {fn_name}", error=True)

                    self._push(AgentEvent(
                        type="tool_result",
                        data={
                            "tool": fn_name,
                            "call_id": tc.id,
                            "args": fn_args,
                            "output": result.output[:5000],
                            "error": result.error,
                        },
                    ))

                    self.messages.append({
                        "role": "tool",
                        "name": fn_name,
                        "content": result.output,
                        "tool_call_id": tc.id,
                    })
                continue

            # ── Model returned text ──
            text = extract_text(response)
            self.messages.append({"role": "assistant", "content": text})

            if "TASK_COMPLETE:" in text:
                summary = text.split("TASK_COMPLETE:", 1)[1].strip()
                self.summary = summary
                self._completed = True
                self._push(AgentEvent(
                    type="agent_message",
                    data={"content": summary, "role": "assistant"},
                ))
                self._push(AgentEvent(
                    type="task_complete",
                    data={
                        "summary": summary,
                        "iterations": self.iteration,
                        "total_tokens": self.total_tokens,
                    },
                ))
                return

            self._push(AgentEvent(
                type="agent_message",
                data={"content": text, "role": "assistant"},
            ))

            self.messages.append({
                "role": "user",
                "content": "Continue with the task. Use tools to make progress, or say TASK_COMPLETE: followed by a summary when done.",
            })

        # Exhausted iterations
        self._completed = True
        self._push(AgentEvent(
            type="task_complete",
            data={
                "summary": f"Reached iteration limit ({MAX_ITERATIONS}). Task may be incomplete.",
                "iterations": self.iteration,
                "total_tokens": self.total_tokens,
            },
        ))

    async def continue_with(self, message: str):
        """Continue the agent with a follow-up message (post-completion steer)."""
        self._completed = False
        self.messages.append({"role": "user", "content": message})

        self._push(AgentEvent(
            type="agent_message",
            data={"content": f"Continuing: {message}", "role": "system"},
        ))

        tool_schemas = [t.to_schema() for t in self.tools]

        # Run a shorter loop for follow-ups
        remaining = MAX_ITERATIONS - self.iteration
        if remaining <= 0:
            remaining = 10
        start_iter = self.iteration

        while self.iteration - start_iter < remaining:
            self.iteration += 1

            try:
                response = await chat_complete(
                    messages=self.messages,
                    tools=tool_schemas,
                    tool_choice="auto",
                    temperature=0.2,
                    max_tokens=8000,
                )
            except Exception as e:
                self._push(AgentEvent(type="agent_error", data={"content": f"Model error: {str(e)}"}))
                break

            choice = response.choices[0]
            self.total_tokens += getattr(response.usage, "total_tokens", 0)

            if choice.message.tool_calls:
                self.messages.append({
                    "role": "assistant",
                    "content": choice.message.content or "",
                    "tool_calls": [
                        {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in choice.message.tool_calls
                    ],
                })
                for tc in choice.message.tool_calls[:MAX_TOOL_CALLS_PER_TURN]:
                    fn_name = tc.function.name
                    fn_args_raw = tc.function.arguments
                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                    except json.JSONDecodeError:
                        fn_args = {}

                    self._push(AgentEvent(type="tool_call", data={"tool": fn_name, "args": fn_args, "call_id": tc.id}))

                    tool = self.tool_map.get(fn_name)
                    result = await tool.execute(**fn_args) if tool else ToolResult(output=f"Unknown tool: {fn_name}", error=True)

                    self._push(AgentEvent(type="tool_result", data={"tool": fn_name, "call_id": tc.id, "args": fn_args, "output": result.output[:5000], "error": result.error}))
                    self.messages.append({"role": "tool", "name": fn_name, "content": result.output, "tool_call_id": tc.id})
                continue

            text = extract_text(response)
            self.messages.append({"role": "assistant", "content": text})

            if "TASK_COMPLETE:" in text:
                summary = text.split("TASK_COMPLETE:", 1)[1].strip()
                self.summary = summary
                self._completed = True
                self._push(AgentEvent(type="agent_message", data={"content": summary, "role": "assistant"}))
                self._push(AgentEvent(type="task_complete", data={"summary": summary, "iterations": self.iteration, "total_tokens": self.total_tokens}))
                return

            self._push(AgentEvent(type="agent_message", data={"content": text, "role": "assistant"}))
            self.messages.append({"role": "user", "content": "Continue with the task. Use tools to make progress, or say TASK_COMPLETE: followed by a summary when done."})

        self._completed = True
        self._push(AgentEvent(type="task_complete", data={"summary": "Follow-up complete.", "iterations": self.iteration, "total_tokens": self.total_tokens}))
