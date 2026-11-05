# Task Manager

A full-stack task management app for personal work and team projects. It includes task tracking, project collaboration, role-based access, comments and activity history, notifications, deadline reminders, and a due-date calendar.

## Features

- **Authentication:** Account registration and login with password hashing, JWT-based sessions, protected routes, and rate-limited authentication endpoints.
- **Personal tasks:** Create, view, update, and delete private tasks; set priorities, statuses, and deadlines; search, filter, and track progress.
- **Projects and teams:** Create projects, add registered users or invite by email, and manage project membership.
- **Role-based access:** Project owners and admins manage project tasks and members; members collaborate on assigned tasks; viewers have read-only access.
- **Task assignment:** Assign project tasks to eligible active teammates. Members may update the status of tasks assigned to them.
- **Comments and activity:** Discuss tasks and review a project timeline of task creation, changes, assignment updates, comments, transfers, and deletions.
- **Notifications and reminders:** View and manage personal notifications; receive scheduled notifications for project task deadlines and overdue tasks.
- **Calendar and live refresh:** View tasks by due date and keep task and notification views refreshed while the app is open.
- **Security and verification:** Security headers, request-size limits, authentication throttling, backend tests, browser tests, and dependency audits.

## Technology

- Frontend: React, TypeScript, Vite, React Router
- Backend: Node.js, Express
- Database: MongoDB with Mongoose (MongoDB Atlas or another replica-set deployment is recommended)
- Authentication: JWT and bcrypt
- Browser tests: Playwright with installed Google Chrome

## Requirements

- Node.js 20 or newer
- npm
- MongoDB connection string (Atlas or another MongoDB replica set for transaction-backed workflows)
- Google Chrome to run the browser test suite

## Getting started

Open two PowerShell terminals from the repository root.

### 1. Configure and run the backend

```powershell
Set-Location D:\task-manager\backend
npm install
Copy-Item .env.example .env
```

Edit `backend\.env` and set at least:

```dotenv
PORT=5000
MONGODB_URI=<your MongoDB connection string>
JWT_SECRET=<a long, random secret>
FRONTEND_URL=http://localhost:5173
```

For project invitations by email, also configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`. Keep real credentials out of Git.

Start the API:

```powershell
npm run dev
```

The API listens on port 5000 by default. Its health endpoint is `http://localhost:5000/api/health`.

### 2. Run the frontend

In another terminal:

```powershell
Set-Location D:\task-manager\frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The frontend uses `http://localhost:5000/api` by default. To use a different backend URL, set `VITE_API_URL` in the frontend environment, for example `VITE_API_URL=http://localhost:5000/api`.

## Database migrations

Back up the database before running migrations. Run these from `backend` after configuring the database connection:

```powershell
npm run migrate:member-roles
npm run migrate:project-task-activity
```

The role migration converts legacy `Editor` memberships to `Member`. The activity migration backfills creation history for existing project tasks. Both are safe to rerun.

## Tests and audits

Run backend tests and audits:

```powershell
Set-Location D:\task-manager\backend
npm test
npm audit
npm audit --omit=dev
```

Build the frontend, run browser tests, and audit frontend dependencies:

```powershell
Set-Location D:\task-manager\frontend
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
```

The browser suite uses installed Google Chrome. Backend HTTP tests exercise the real Express routes and middleware with in-memory Mongoose model stubs; they do not replace a smoke test against a live database. See [Week 7 Test Report](./Week7_Test_Report.md) for the recorded test results, security checks, and validation limitations.

## Operational notes

- MongoDB transactions used by project task workflows require a replica set; MongoDB Atlas provides this.
- Deadline reminder scheduling starts with the backend after a successful database connection.
- Authentication rate limiting uses an in-memory store by default. Configure a shared store when deploying multiple backend instances.
- Configure the deployed frontend origin in `FRONTEND_URL` and `VITE_API_URL` as appropriate.
- Never commit `.env` files, API keys, database credentials, or JWT secrets.

## Additional documentation

- [Backend setup and workflow details](./backend/README.md)
- [Week 7 test and security report](./Week7_Test_Report.md)
