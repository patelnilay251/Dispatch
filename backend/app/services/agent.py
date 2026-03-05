"""
Dispatch Agent — the core agentic loop.

Architecture (from Thorsten Ball's post):
  1. Send conversation + tools to model
  2. If model returns tool_calls → execute tools, append results, goto 1
  3. If model returns text → emit as message, ask if done or continue
  4. Repeat until model declares task complete or limits hit

Every tool call, tool result, and text message becomes an SSE event
streamed to the frontend in real-time.
"""

import json
import asyncio
from dataclasses import dataclass

from app.services.mistral import chat_complete, extract_text
from app.services.tools import Tool, ToolResult, Workspace, make_tools
from app.core.config import settings


@dataclass
class AgentEvent:
    """Events emitted by the agent, streamed via SSE to frontend."""
    type: str  # tool_call, tool_result, agent_message, agent_error, task_complete
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
"""

MAX_ITERATIONS = 30
MAX_TOOL_CALLS_PER_TURN = 10

class Agent:
    """The core agent loop. Runs against a workspace, streams events."""

    def __init__(self, workspace: Workspace | None, emit: asyncio.Queue, tools_override: list | None = None):
        self.workspace = workspace
        self.emit = emit  # Queue for SSE events
        # Use override tools (e.g. sandbox tools) or local workspace tools
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

    def _push(self, event: AgentEvent):
        self.emit.put_nowait({"type": event.type, **event.data})

    async def run(self, prompt: str, repo: str = ""):
        """Main agent loop. Runs until task complete or limits hit."""

        # Initialize conversation
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
                # Append assistant message
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
                # Execute each tool call
                for tc in choice.message.tool_calls[:MAX_TOOL_CALLS_PER_TURN]:
                    fn_name = tc.function.name
                    fn_args_raw = tc.function.arguments

                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                    except json.JSONDecodeError:
                        fn_args = {}

                    # Emit tool_call event
                    self._push(AgentEvent(
                        type="tool_call",
                        data={
                            "tool": fn_name,
                            "args": fn_args,
                            "call_id": tc.id,
                        },
                    ))

                    # Execute
                    tool = self.tool_map.get(fn_name)
                    if tool:
                        result = await tool.execute(**fn_args)
                    else:
                        result = ToolResult(output=f"Unknown tool: {fn_name}", error=True)

                    # Emit tool_result event (include args so frontend renderers know context)
                    self._push(AgentEvent(
                        type="tool_result",
                        data={
                            "tool": fn_name,
                            "call_id": tc.id,
                            "args": fn_args,
                            "output": result.output[:5000],  # Truncate for SSE
                            "error": result.error,
                        },
                    ))

                    # Append to conversation
                    self.messages.append({
                        "role": "tool",
                        "name": fn_name,
                        "content": result.output,
                        "tool_call_id": tc.id,
                    })

                # Continue the loop — model will see tool results
                continue
            # ── Model returned text (no tool calls) ──
            text = extract_text(response)
            self.messages.append({"role": "assistant", "content": text})

            # Check if task is complete
            if "TASK_COMPLETE:" in text:
                summary = text.split("TASK_COMPLETE:", 1)[1].strip()
                self.summary = summary
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

            # Not done yet — emit the message
            self._push(AgentEvent(
                type="agent_message",
                data={"content": text, "role": "assistant"},
            ))

            # Model produced text without tool calls and didn't say TASK_COMPLETE.
            # Add a nudge so the conversation alternates user/assistant properly.
            self.messages.append({
                "role": "user",
                "content": "Continue with the task. Use tools to make progress, or say TASK_COMPLETE: followed by a summary when done.",
            })

        # Exhausted iterations
        self._push(AgentEvent(
            type="task_complete",
            data={
                "summary": f"Reached iteration limit ({MAX_ITERATIONS}). Task may be incomplete.",
                "iterations": self.iteration,
                "total_tokens": self.total_tokens,
            },
        ))