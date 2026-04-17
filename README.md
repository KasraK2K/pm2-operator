<p align="center">
  <img src="./docs/logo.svg" alt="PM2 Log Viewer" width="560" />
</p>

<p align="center">
  Production-ready PM2 monitoring with encrypted SSH hosts, remote PM2 discovery, and live merged logs over WebSocket.
</p>

## Overview

PM2 Log Viewer is a full-stack web app for operators who need to inspect PM2 processes and stream logs from remote servers without logging into each host manually.

Core capabilities:

- Shared SSH host inventory with encrypted secrets at rest using AES-256-GCM
- Remote PM2 process discovery over SSH with `pm2 jlist`
- Live PM2 log streaming over WebSocket
- Bootstrap owner flow with workspace roles: `OWNER`, `ADMIN`, `MEMBER`
- Account theme preferences, profile settings, and workspace user management
- Docker Compose setup for the app and PostgreSQL

## Stack

- Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL
- Frontend: React, Vite, TypeScript, TailwindCSS
- Realtime: Socket.IO
- SSH: `ssh2`
- Auth: JWT access token + rotating refresh cookie
- Runtime: Docker Compose

## Requirements

### Docker-first setup

Recommended on all operating systems:

- Docker Desktop on Windows or macOS
- Docker Engine + Compose plugin on Linux

### Optional local development

If you want to run the app outside Docker:

- Node.js 22+
- npm 10+
- PostgreSQL 16+

## Environment Setup

Copy the example environment file:

### macOS / Linux / Git Bash

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### Windows Command Prompt

```cmd
copy .env.example .env
```

Then update the important values in `.env`:

- `MASTER_KEY`: base64-encoded 32-byte key used to encrypt SSH secrets
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECURE`: set to `true` behind HTTPS

For local, non-Docker app development, change `DATABASE_URL` to point at localhost instead of the Docker service name:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pm2_log_viewer?schema=public
```

## Quick Start With Docker

These commands are the same on Windows, macOS, and Linux once Docker is installed:

```bash
npm install
npm run prisma:generate
docker compose up -d --build
```

Open the app at [http://localhost:3000](http://localhost:3000).

What happens on first launch:

1. PostgreSQL starts from `docker-compose.yml`
2. The app container applies Prisma migrations automatically
3. The web app becomes available on port `3000`
4. If no owner exists yet, the auth screen shows `Create owner account`

To stop the stack:

```bash
docker compose down
```

To stop the stack and remove the database volume too:

```bash
docker compose down -v
```

## Local Development

Start PostgreSQL first, then install and run the app:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Local dev URLs:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:3000](http://localhost:3000)

Notes:

- The Vite frontend talks to the Express backend and WebSocket server
- Make sure your local `.env` uses the correct `DATABASE_URL`
- `CORS_ORIGIN` should match your frontend dev URL

## Authentication Model

The app no longer uses public self-registration.

Current flow:

1. If the database has no owner, the app shows bootstrap mode and lets you create the first `OWNER`
2. After bootstrap, the auth screen becomes login-only
3. Only `OWNER` and `ADMIN` users can create additional users

Roles:

- `OWNER`: full control, cannot be deleted or downgraded
- `ADMIN`: can manage users except the owner, and can manage hosts and tags
- `MEMBER`: read-only operator access to shared hosts, processes, and logs

## Shared Workspace Behavior

Hosts and tags are shared across the workspace.

- `OWNER` and `ADMIN` can create, edit, delete, and test hosts
- `OWNER` and `ADMIN` can create, edit, and delete tags
- `MEMBER` can browse hosts, inspect PM2 processes, and open logs
- Deleting a user does not delete shared hosts or tags

## Project Structure

```text
.
├─ apps/
│  ├─ server/    # Express API, Prisma, SSH, Socket.IO
│  └─ web/       # React + Vite + Tailwind frontend
├─ docs/         # README assets
├─ docker-compose.yml
└─ Dockerfile
```

## Useful Scripts

From the repository root:

```bash
npm install
npm run dev
npm run build
npm run test
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
```

## Production Notes

- Set strong secrets in `.env`
- Use a real `MASTER_KEY`
- Run behind HTTPS and set `COOKIE_SECURE=true`
- Use a persistent PostgreSQL volume or managed database
- Verify outbound SSH access from the app runtime to your PM2 hosts
- Make sure the remote user shell can access `pm2`

## Troubleshooting

### PM2 is missing

If connection tests say PM2 is unavailable:

- verify PM2 is installed for the remote SSH user
- confirm the remote login shell loads the same profile you use manually
- retest the host from the UI

### Web app does not load after changes

If you are using Docker and the UI looks stale:

```bash
docker compose up -d --build
```

Then hard refresh the browser.

### Database connection fails in local development

Most commonly the problem is `DATABASE_URL`.

- Docker runtime uses `postgres` as the hostname
- local app development usually needs `localhost`

## License

Private project.
