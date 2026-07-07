# CS411 FastAPI Backend

This backend accepts a public GitHub repository URL and returns a folder-only graph for the React Flow frontend.

## Run

```bash
pipenv install
pipenv run uvicorn app.main:app --reload --port 8000
```

## API

- `GET /` confirms the service is running.
- `GET /api/health` returns a simple health check.
- `POST /api/repo-tree` accepts `{ "repo_url": "https://github.com/owner/repo" }` and returns folder nodes for React Flow.
