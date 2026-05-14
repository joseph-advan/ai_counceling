# Render Deployment Notes

## Services

Deploy this project as three Render resources:

- PostgreSQL database
- Backend Web Service from `apps/api`
- Frontend Static Site from `apps/web`

## Backend Web Service

Create a Render Web Service connected to the GitHub repository.

- Root Directory: `apps/api`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`

The backend includes `apps/api/.python-version` to pin Render's Python runtime
to Python 3.11.

Environment variables:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
OPENAI_API_KEY=sk-...
OPENAI_MODEL_CASE=gpt-4.1
OPENAI_MODEL_SUPERVISOR=gpt-4.1
MAX_TURNS=20
ADMIN_API_KEY=replace-with-a-strong-admin-key
CORS_ORIGINS=https://your-frontend.onrender.com
```

Use the Render PostgreSQL internal database URL when the backend and database
are in the same Render account. If Render provides a URL beginning with
`postgres://`, convert the scheme to `postgresql+psycopg://` for this app.

## Frontend Static Site

Create a Render Static Site connected to the same GitHub repository.

- Root Directory: `apps/web`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Environment variables:

```env
VITE_API_BASE_URL=https://your-api.onrender.com
```

`VITE_API_BASE_URL` is injected at build time, so redeploy the frontend after
changing it.

## Database

Do not deploy the local SQLite file `apps/api/pcc.db`. Production should use
Render PostgreSQL. The backend start command runs Alembic automatically and
creates the required tables on first deploy.

If you want to preserve local SQLite data in production, export and import it
separately before launch. For a clean launch, start with an empty Render
PostgreSQL database.
