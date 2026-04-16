# PM2 Log Viewer

Production-ready PM2 log viewer with encrypted SSH host storage, remote PM2 discovery over SSH, and live log streaming.

## Stack

- Backend: Node.js + TypeScript + Express + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + TailwindCSS
- Realtime: Socket.IO
- SSH: `ssh2`
- Auth: email/password, bearer access JWT, rotating refresh cookie
- Runtime: Docker Compose

## Quick Start

1. Copy `.env.example` to `.env` and update the secrets.
2. Install dependencies:

```powershell
& 'C:\nvm4w\nodejs\npm.cmd' install
```

3. Generate Prisma client:

```powershell
& 'C:\nvm4w\nodejs\npm.cmd' run prisma:generate
```

4. Start the stack:

```powershell
docker compose up --build
```

The app will be available at `http://localhost:3000`.

