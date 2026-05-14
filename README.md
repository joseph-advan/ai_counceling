# PCC React + FastAPI (No Auth MVP)

This is a new production-oriented project folder, separate from the original Streamlit MVP.

## Architecture

- `apps/web`: React (Vite + TypeScript) frontend
- `apps/api`: FastAPI backend
- `docker-compose.yml`: Postgres + API + Web local stack

Current scope:
- No login/auth yet
- Role is selected on frontend (`Student` / `Admin`)
- Student can chat with Ruth (PCC), up to 20 turns, then request supervision feedback
- Admin can list all sessions, inspect details, recalculate supervision, and delete data
- Optional admin protection: set `ADMIN_API_KEY` to require `X-Admin-Key` on `/admin/*`

## API Endpoints

- `POST /sessions`
- `GET /sessions?student_name=...`
- `GET /sessions/{session_id}`
- `POST /sessions/{session_id}/messages`
- `POST /sessions/{session_id}/complete`
- `POST /sessions/{session_id}/resume`
- `GET /admin/sessions`
- `POST /admin/sessions/{session_id}/recalc-supervision`
- `DELETE /admin/sessions/{session_id}`
- `DELETE /admin/students/{student_name}/sessions`

## Quick Start (Local, without Docker)

### 1) Backend

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend

```powershell
cd apps/web
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend default URL: `http://localhost:5173`  
Backend default URL: `http://localhost:8000`

## Docker Start

```powershell
Copy-Item .env.example .env
docker compose up --build
```

## Notes

- Backend default DB in `apps/api/.env.example` is SQLite for fast local startup.
- In Docker mode, API uses Postgres via `DATABASE_URL`.
- Prompts are stored in `apps/api/app/prompts/`.
- API startup validates schema and will fail fast if you forgot `alembic upgrade head`.
