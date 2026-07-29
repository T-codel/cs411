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

Start the backend:

```bash
cd server
pipenv install
pipenv run uvicorn app.main:app --reload --port 8000
```

Start the frontend:

```bash
cd client
npm install
npm run dev
```

The frontend expects the API at `http://localhost:8000` by default. To point it elsewhere, set `VITE_API_URL` before running Vite.

## Branch Naming Conventions

Use short, descriptive branch names that include the type of work, a brief name, and your initials.

Examples:

- `feature/feature-name-initials` for new features
- `bugfix/fix-name-initials` for bug fixes
- `docs/update-readme-initials` for documentation changes
- `refactor/refactor-name-initials` for code cleanup or restructuring

For example, if Jane Doe is adding login support, the branch could be named `feature/login-jd`.

## LLM functionality
after launching the server, you can restart the server with the associated API Key for testing using the following commands.
- `export GEMINI_API_KEY="" `
- `uvicorn app.main:app --reload`

An API key can be retrieved from https://aistudio.google.com

TODO: 
As a feature, I added a menu with a button that appears when you click on a node. This button will be used to have an LLM analyze a specific file. Work in progress.




