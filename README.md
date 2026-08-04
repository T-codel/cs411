# CS411 Project

## Tentative Project Idea

A simple repository visualizer for learning how full-stack apps fit together.

Enter a public GitHub repository URL and the app renders a left-to-right React Flow tree of the repo folders. Random files at the same level are ignored so the map stays high level and readable.

## Project Structure

- `client/` contains a Vite React frontend written in TypeScript.
- `client/src/` contains the React app, API client, React Flow canvas, and styles.
- `server/` contains a FastAPI backend.
- `server/app/` contains API routes, Pydantic schemas, and in-memory sample data.
- `README.md` contains project overview information for anyone new to the codebase.

## Tech Stack

- Frontend: React, TypeScript, Vite, React Flow, Tailwind CSS, shadcn/ui-style components
- Backend: FastAPI, Pydantic, Uvicorn
- Package management: npm for the client, Pipenv for the server

## Running Locally

Open two terminals from the project root. Install dependencies once, then start the backend and frontend separately.

### Git Bash

Backend:

```bash
cd server
pipenv install
export GEMINI_API_KEY="your-api-key"
pipenv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd client
npm install
npm run dev
```

### PowerShell

Backend:

```powershell
cd server
pipenv install
$env:GEMINI_API_KEY="your-api-key"
pipenv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

The frontend expects the API at `http://localhost:8000` by default. To point it elsewhere, set `VITE_API_URL` before running Vite.
The Vite development server normally runs at `http://localhost:5173`.

## Repository Analysis

Generating a repository map performs one structured Gemini analysis over the candidate folder tree. The backend:

- prunes low-signal folders such as generated output, dependencies, caches, assets, and redundant implementation details;
- retains a connected architecture tree containing useful source roots, entry points, interfaces, domain logic, data, configuration, tests, and documentation;
- generates a repository summary and a description for every retained folder;
- assigns each node one validated software category;
- labels parent-child edges with short explanatory relationships; and
- validates and normalizes model output before returning it to the frontend.

The frontend color-codes node categories and provides an interactive legend for filtering the graph. Clicking a node shows its description, category, and classification reason. The exploration guide recommends an ordered path through important folders.

Gemini requests are serialized and paced at 15 requests per minute by default. Identical repository analyses are cached for 15 minutes. These settings can be adjusted before starting the backend:

```bash
export GEMINI_MIN_INTERVAL_SECONDS="4"
export ANALYSIS_CACHE_SECONDS="900"
```

The API key is read by the backend only and must not be placed in frontend environment variables or committed to Git.

## API

- `GET /` confirms that the FastAPI service is running.
- `GET /api/health` returns a health check.
- `POST /api/repo-tree` retrieves, prunes, labels, and describes a public GitHub repository tree.
- `POST /api/explain` regenerates a repository-level description.
- `POST /api/guide` generates an ordered exploration guide.

## Branch Naming Conventions

Use short, descriptive branch names that include the type of work, a brief name, and your initials.

Examples:

- `feature/feature-name-initials` for new features
- `bugfix/fix-name-initials` for bug fixes
- `docs/update-readme-initials` for documentation changes
- `refactor/refactor-name-initials` for code cleanup or restructuring

For example, if Jane Doe is adding login support, the branch could be named `feature/login-jd`.

An API key can be retrieved from [Google AI Studio](https://aistudio.google.com/).




