# CS411 Project

## Tentative Project Idea

A simple LeetCode-style app for learning API design and full-stack development.

The app will provide small backend and frontend challenges focused on practical full-stack concepts. Instead of only solving algorithm problems, users can practice designing API endpoints, connecting frontend pages to backend services, handling request and response formats, and understanding how a complete web application fits together.

Possible features include:

- A catalog of API and full-stack practice problems
- Problem statements with expected request and response behavior
- A frontend interface for browsing and attempting problems
- A backend service for storing problems, submissions, and progress
- Example solutions or walkthroughs for learning common design patterns

## Project Structure

- `client/` contains the frontend code. This is a Next.js app, so pages, layouts, styles, and UI work should start here.
- `server/` contains the backend code. This is a Django project, so API routes, backend settings, models, and server-side logic should start here.
- `README.md` contains project overview information for anyone new to the codebase.

## Tech Stack

- Frontend: Next.js with TypeScript
- Backend: Django
- Package management: npm for the client, Pipenv for the server

## Branch Naming Conventions

Use short, descriptive branch names that include the type of work, a brief name, and your initials.

Examples:

- `feature/feature-name-initials` for new features
- `bugfix/fix-name-initials` for bug fixes
- `docs/update-readme-initials` for documentation changes
- `refactor/refactor-name-initials` for code cleanup or restructuring

For example, if Jane Doe is adding login support, the branch could be named `feature/login-jd`.
