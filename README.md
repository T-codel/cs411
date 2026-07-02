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

```text
project/
+-- client/
|   +-- app/
|   |   +-- globals.css
|   |   +-- layout.tsx
|   |   +-- page.tsx
|   +-- public/
|   +-- package.json
|   +-- package-lock.json
|   +-- next.config.ts
|   +-- tsconfig.json
|   +-- README.md
+-- server/
|   +-- cs411/
|   |   +-- cs411/
|   |   |   +-- __init__.py
|   |   |   +-- asgi.py
|   |   |   +-- settings.py
|   |   |   +-- urls.py
|   |   |   +-- wsgi.py
|   |   +-- manage.py
|   +-- Pipfile
|   +-- Pipfile.lock
+-- README.md
```

## Tech Stack

- Frontend: Next.js with TypeScript
- Backend: Django
- Package management: npm for the client, Pipenv for the server
