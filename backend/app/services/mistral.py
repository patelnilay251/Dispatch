"""
Mistral AI service — wraps the SDK for Dispatch's pipeline.

Models:
  - devstral-latest         → primary agent (analyze, plan, refactor, test, PR)
  - mistral-embed           → embeddings for index step
  - magistral-medium-latest → available for reasoning-heavy steps if needed
"""

import json
from mistralai import Mistral

from app.core.config import settings

client = Mistral(api_key=settings.MISTRAL_API_KEY)


# ──────────────────────────────────────────────
# Chat Completion (non-streaming)
# ──────────────────────────────────────────────
async def chat_complete(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4000,
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
    response_format: dict | None = None,
) -> dict:
    """Standard chat completion. Returns the full response dict."""
    kwargs: dict = {
        "model": model or settings.AGENT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice
    if response_format:
        kwargs["response_format"] = response_format

    response = await client.chat.complete_async(**kwargs)
    return response


# ──────────────────────────────────────────────
# Chat Completion (streaming)
# ──────────────────────────────────────────────
async def chat_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4000,
    tools: list[dict] | None = None,
):
    """Streaming chat — yields chunks."""
    kwargs: dict = {
        "model": model or settings.AGENT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    stream = await client.chat.stream_async(**kwargs)
    async for chunk in stream:
        yield chunk

# ──────────────────────────────────────────────
# Function Calling — run a tool loop
# ──────────────────────────────────────────────
async def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_handlers: dict,
    model: str | None = None,
    max_iterations: int = 5,
) -> dict:
    """
    Agentic tool loop. Sends messages with tools, executes any
    tool calls via tool_handlers, feeds results back, repeats
    until model returns text or max_iterations hit.

    tool_handlers: { "function_name": async callable }
    Returns: final response
    """
    msgs = list(messages)

    for _ in range(max_iterations):
        response = await chat_complete(
            messages=msgs,
            tools=tools,
            tool_choice="auto",
            model=model,
        )

        choice = response.choices[0]

        # If model returned text (no tool calls), we're done
        if not choice.message.tool_calls:
            return response

        # Append assistant message with tool calls
        msgs.append({
            "role": "assistant",
            "content": choice.message.content,
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
        for tc in choice.message.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)

            handler = tool_handlers.get(fn_name)
            if handler:
                result = await handler(**fn_args)
            else:
                result = f"Error: unknown tool '{fn_name}'"

            msgs.append({
                "role": "tool",
                "name": fn_name,
                "content": json.dumps(result) if not isinstance(result, str) else result,
                "tool_call_id": tc.id,
            })

    # If we exhausted iterations, return last response
    return response

# ──────────────────────────────────────────────
# Structured Output (JSON mode)
# ──────────────────────────────────────────────
async def chat_json(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 4000,
) -> dict:
    """Chat completion with JSON output enforced."""
    response = await chat_complete(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    if isinstance(content, str):
        return json.loads(content)
    # Handle list-of-chunks content
    text = ""
    for chunk in content:
        if hasattr(chunk, "text"):
            text += chunk.text
    return json.loads(text) if text else {}


# ──────────────────────────────────────────────
# Embeddings
# ──────────────────────────────────────────────
async def embed(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    response = await client.embeddings.create_async(
        model=settings.EMBED_MODEL,
        inputs=texts,
    )
    return [item.embedding for item in response.data]

# ──────────────────────────────────────────────
# Response helpers
# ──────────────────────────────────────────────
def extract_text(response) -> str:
    """Extract plain text from a chat response, handling
    both string content and list-of-chunks content."""
    content = response.choices[0].message.content
    if isinstance(content, str):
        return content
    text_parts = []
    for chunk in content:
        if hasattr(chunk, "text"):
            text_parts.append(chunk.text)
    return "".join(text_parts)


def extract_reasoning(response) -> tuple[str, str]:
    """Extract thinking traces + final answer from a
    Magistral reasoning response. Returns (thinking, answer)."""
    content = response.choices[0].message.content
    thinking = ""
    answer = ""
    if isinstance(content, str):
        return "", content
    for chunk in content:
        if hasattr(chunk, "type"):
            if chunk.type == "thinking" and hasattr(chunk, "thinking"):
                for t in chunk.thinking:
                    if hasattr(t, "text"):
                        thinking += t.text
            elif chunk.type == "text" and hasattr(chunk, "text"):
                answer += chunk.text
    return thinking, answer