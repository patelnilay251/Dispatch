import asyncio
from datetime import datetime

from app.models.task import (
    Task, TaskStatus, StepStatus, StepDefinition, SSEEvent,
)
from app.services.store import store


# Step definitions — durations are placeholder simulation times.
# When Mistral SDK is wired in, each step becomes a real async call.
PIPELINE_STEPS = [
    {"id": "clone", "label": "Cloning Repository"},
    {"id": "agents", "label": "Reading AGENTS.md"},
    {"id": "analyze", "label": "Analyzing Architecture"},
    {"id": "plan", "label": "Planning Execution"},
    {"id": "index", "label": "Indexing Repository"},
    {"id": "refactor", "label": "Applying Changes"},
    {"id": "test", "label": "Running Unit Tests"},
    {"id": "pr", "label": "Generating Pull Request"},
]

# Simulated step data — will be replaced with real outputs
STEP_OUTPUT: dict[str, dict] = {
    "clone": {
        "repo": "dispatch/core-agent",
        "branch": "main → feat/tenant-auth",
        "commit": "a3f8c12",
        "files": 142,
        "directories": 18,
        "size_mb": 2.4,
        "time_s": 3.2,
    },
    "agents": {
        "found": True,
        "path": "AGENTS.md",
        "sections": ["Project Context", "Coding Standards", "Architecture", "Testing"],
    },
    "analyze": {
        "files_scanned": 142,
        "modules": 18,
        "affected_files": 4,
        "risk_level": "Medium",
        "affected": [
            {"name": "src/middleware.ts", "deps": 4, "impact": "high"},
            {"name": "src/lib/auth/session.ts", "deps": 3, "impact": "high"},
            {"name": "src/lib/auth/tenant.ts", "deps": 1, "impact": "medium"},
            {"name": "src/app/api/auth/route.ts", "deps": 2, "impact": "medium"},
            {"name": "src/lib/db/prisma.ts", "deps": 0, "impact": "low"},
            {"name": "src/types/auth.d.ts", "deps": 0, "impact": "low"},
        ],
    },    "plan": {
        "steps": [
            {"num": 1, "title": "Add tenant ID extraction to middleware", "file": "src/middleware.ts", "description": "Extract x-tenant-id header, pass to session resolver, add redirect for missing tenant on protected routes."},
            {"num": 2, "title": "Create tenant validation helper", "file": "src/lib/auth/tenant.ts", "description": "New utility to validate tenant ID against database, cache valid tenants for 5 minutes."},
            {"num": 3, "title": "Update session types for multi-tenancy", "file": "src/types/auth.d.ts", "description": "Extend Session interface with tenantId field, update NextAuth config types."},
        ],
        "approved": True,
    },
    "index": {
        "total_symbols": 613,
        "modules": [
            {"module": "auth", "files": 8, "symbols": 42},
            {"module": "api/routes", "files": 24, "symbols": 156},
            {"module": "lib/db", "files": 6, "symbols": 31},
            {"module": "middleware", "files": 2, "symbols": 12},
            {"module": "types", "files": 14, "symbols": 87},
            {"module": "components", "files": 48, "symbols": 203},
            {"module": "utils", "files": 12, "symbols": 64},
            {"module": "config", "files": 4, "symbols": 18},
        ],
    },
    "refactor": {
        "file": "src/middleware.ts",
        "added": 24,
        "removed": 12,
        "diff": [
            {"num": 12, "content": "export async function middleware(req: NextRequest) {"},
            {"num": 13, "content": "  const session = await getSession(req);", "type": "removed"},
            {"num": 14, "content": "  const tenantId = req.headers.get('x-tenant-id');", "type": "added"},
            {"num": 15, "content": "  const session = await getSession(req, { tenantId });", "type": "added"},
            {"num": 16, "content": ""},
            {"num": 17, "content": "  if (!tenantId && !isPublicRoute(req)) {", "type": "added"},
            {"num": 18, "content": "    return NextResponse.redirect('/select-tenant');", "type": "added"},
            {"num": 19, "content": "  }", "type": "added"},
            {"num": 20, "content": ""},
            {"num": 21, "content": "  return NextResponse.next();"},
        ],
    },    "test": {
        "passed": 8,
        "failed": 0,
        "tests": [
            {"name": "middleware › extracts tenant ID from headers", "time": "12ms"},
            {"name": "middleware › redirects when tenant ID missing", "time": "8ms"},
            {"name": "middleware › passes through public routes", "time": "5ms"},
            {"name": "middleware › attaches tenant to session", "time": "15ms"},
            {"name": "tenant › validates tenant against database", "time": "42ms"},
            {"name": "tenant › caches valid tenants", "time": "3ms"},
            {"name": "tenant › rejects invalid tenant IDs", "time": "6ms"},
            {"name": "types › Session includes tenantId field", "time": "2ms"},
        ],
    },
    "pr": {
        "title": "feat: add multi-tenant support to auth middleware",
        "description": "Adds multi-tenant authentication support by extracting tenant ID from request headers and passing it through the session resolver.",
        "branch": "feat/tenant-auth",
        "target": "main",
        "changed_files": [
            {"name": "src/middleware.ts", "added": 24, "removed": 12},
            {"name": "src/lib/auth/tenant.ts", "added": 48, "removed": 0},
            {"name": "src/types/auth.d.ts", "added": 8, "removed": 2},
            {"name": "src/lib/auth/session.ts", "added": 6, "removed": 3},
        ],
    },
}

# Simulated duration per step in seconds
STEP_DURATIONS = {
    "clone": 2.5, "agents": 1.5, "analyze": 3.0, "plan": 2.0,
    "index": 2.0, "refactor": 3.5, "test": 2.5, "pr": 2.0,
}

async def run_pipeline(task: Task):
    """
    Execute the task pipeline. Each step:
    1. Emits step_update(active) → frontend shows loading skeleton
    2. Simulates work (async sleep — will become real Mistral/sandbox calls)
    3. Emits step_output with result data
    4. Emits step_update(done)

    The frontend sees: skeleton → completed panel → hold → next step
    """
    task.status = TaskStatus.RUNNING
    task.steps = [
        StepDefinition(id=s["id"], label=s["label"])
        for s in PIPELINE_STEPS
    ]
    store.update(task)

    try:
        for i, step_def in enumerate(PIPELINE_STEPS):
            sid = step_def["id"]
            now = datetime.now()

            # Mark active
            task.steps[i].status = StepStatus.ACTIVE
            task.steps[i].started_at = now
            store.update(task)

            store.push_event(task.id, SSEEvent(
                type="step_update",
                step_id=sid,
                status=StepStatus.ACTIVE,
                detail="In progress...",
            ))

            # Simulate work
            duration = STEP_DURATIONS.get(sid, 2.0)
            await asyncio.sleep(duration)

            # Emit step output data
            output = STEP_OUTPUT.get(sid, {})
            store.push_event(task.id, SSEEvent(
                type="step_output",
                step_id=sid,
                data=output,
            ))

            # Mark done
            task.steps[i].status = StepStatus.DONE
            task.steps[i].completed_at = datetime.now()
            store.update(task)

            store.push_event(task.id, SSEEvent(
                type="step_update",
                step_id=sid,
                status=StepStatus.DONE,
                detail=f"Completed",
            ))

            # Brief hold so frontend shows completed content
            await asyncio.sleep(1.5)

        # All done
        task.status = TaskStatus.COMPLETED
        store.update(task)

        store.push_event(task.id, SSEEvent(
            type="task_complete",
            detail="All steps finished.",
        ))

    except Exception as e:
        task.status = TaskStatus.FAILED
        store.update(task)

        store.push_event(task.id, SSEEvent(
            type="task_failed",
            detail=str(e),
        ))

    finally:
        store.close_stream(task.id)