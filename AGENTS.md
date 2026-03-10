# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Dispatch is an async cloud coding agent powered by Mistral AI. It has two services:

- **Backend** (Python/FastAPI) in `backend/` — API server on port 8000
- **Frontend** (React/Vite/TypeScript) in `frontend/` — dev server on port 5173 (proxies `/api` to backend)

### Running services

**Backend:**
```
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```
cd frontend && bun run dev
```

### Important caveats

- **`mistralai` must be pinned to v1.x** (`<2.0.0`). The v2.0.0 release has a broken package layout (`from mistralai import Mistral` fails). The update script pins this automatically.
- **Frontend ESLint is broken** due to `eslint-plugin-react-hooks@7.0.1` requiring `zod-validation-error/v4`, but bun resolves v3.x. This is a pre-existing issue in the lockfile. TypeScript compilation (`tsc -b`) also has pre-existing framer-motion type errors.
- **Frontend uses bun** (lockfile: `bun.lockb`). Bun must be on `$PATH` (`~/.bun/bin`).
- The backend runs without external API keys (Supabase, Mistral, E2B) but all auth/agent features will return errors. For full functionality, populate `backend/.env` with `MISTRAL_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`. `E2B_API_KEY` is optional (falls back to local compute).
- Frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env` for auth to work.
- Backend pyright config expects a `.venv` in the `backend/` directory.
- Vite dev server proxies `/api` to `http://localhost:8000` — start the backend first.
- **GitHub OAuth flow** requires a Supabase project with GitHub OAuth provider configured. The "Continue with GitHub" button redirects to `github.com/login` via Supabase. A GitHub test account is needed for end-to-end authenticated testing (task creation, dashboard, etc.).
- The backend `.env` values are read at import time via `python-dotenv`; after editing `.env`, you must restart uvicorn (the `--reload` flag only watches `.py` file changes).
- The update script writes `.env` files from environment variables using `cp -n` (no-clobber), so existing `.env` files are preserved across restarts.
