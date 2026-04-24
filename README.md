<p align="center">
  <img src="docs/logo.svg" alt="Project Logo" width="100%" />
</p>

<h1 align="center">PM2 Log Viewer</h1>
<p align="center">
  Operator-focused PM2 monitoring, remote process inspection, and live log streaming over SSH.
</p>

## Overview

PM2 Log Viewer is a full-stack operations console for teams running Node.js services under PM2 on remote hosts.

Instead of asking every operator to open separate SSH sessions, remember host details, and run PM2 commands by hand, the project provides a shared web workspace for:

- managing SSH hosts
- validating connectivity and host fingerprints
- discovering PM2 processes
- opening a compact runtime dashboard
- streaming merged logs in real time
- managing users, themes, and operator shortcuts

The project is aimed at developers, operators, and small teams who want a focused PM2 control surface rather than a general observability stack or an additional agent running on every server.

This repository is a deployable application, not a published npm package. It is designed to be run from source or via Docker Compose.

## Key Features

- Multi-user workspace with bootstrap owner flow and three roles: `OWNER`, `ADMIN`, and `MEMBER`
- Shared SSH host inventory with support for password or private-key authentication
- Encrypted SSH secrets at rest using AES-256-GCM
- SSH host fingerprint pinning with a repin workflow for expected host key changes
- Remote PM2 process discovery using `pm2 jlist`
- Live multi-process log streaming over Socket.IO from server-side SSH sessions
- Operator dashboard with CPU, memory, restart counts, runtime metadata, and PM2 `restart` / `reload` actions
- Host tagging, host search, and process filtering
- Regex include/exclude log filters, configurable tail length, scroll lock, and log download
- Per-user settings for theme, panel layout, and keyboard shortcuts
- Docker Compose setup for PostgreSQL and the application runtime

## Why This Project Matters

PM2 is widely used to run Node.js services, but day-to-day operations often still depend on direct shell access. That works for individuals, but it does not scale well for teams that need shared visibility, consistent workflows, and basic access control.

This project matters because it brings those workflows into a single, typed, auditable application without introducing an extra host-side agent. It uses standard SSH access plus PM2 itself, which keeps rollout straightforward and reduces operational overhead on managed hosts.

It is also meaningfully different from generic log viewers:

- it understands PM2 process identity and process metadata
- it exposes PM2-specific actions such as `restart` and `reload`
- it treats host fingerprint verification as part of the workflow
- it combines operator UX with workspace-level user and host management

From an engineering perspective, the repository demonstrates end-to-end ownership across backend security, cryptography, realtime transport, SSH automation, data modelling, and frontend operator tooling. The codebase uses typed boundaries, explicit validation, and automated tests for the server-side core.

## Installation

### Requirements

For the default Docker-based setup:

- Docker Engine or Docker Desktop
- Docker Compose

For local development without Docker:

- Node.js 22+
- PostgreSQL 16+

### Clone and prepare the repository

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Install dependencies:

```bash
npm install
npm run prisma:generate
```

### Run with Docker Compose

```bash
docker compose up -d --build
```

The application will be available at [http://localhost:3000](http://localhost:3000).

The container startup command runs Prisma migrations automatically before starting the server.

### Run locally without Docker

If you are running the app directly on your machine, update `DATABASE_URL` in `.env` to use `localhost` instead of the Docker service hostname:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pm2_log_viewer?schema=public
```

Then run:

```bash
npm run prisma:migrate
npm run dev
```

Development URLs:

- frontend: [http://localhost:5173](http://localhost:5173)
- backend: [http://localhost:3000](http://localhost:3000)

## Quick Start

The smallest working setup is the Docker flow:

```bash
npm install
cp .env.example .env
npm run prisma:generate
docker compose up -d --build
```

After the app starts:

1. Open [http://localhost:3000](http://localhost:3000).
2. If this is the first run, create the owner account.
3. Add an SSH host from the workspace.
4. Test the host connection and confirm the SSH fingerprint.
5. Load PM2 processes for that host.
6. Open either the dashboard or live logs for one or more processes.

## Usage

### Typical UI workflow

1. Create or edit a host with either password-based or private-key authentication.
2. Optionally apply tags to organise hosts by environment, service, or team.
3. Test the host to verify SSH connectivity and pin the current fingerprint.
4. Open the Processes view to fetch the remote PM2 inventory.
5. Select one or more PM2 processes.
6. Open:
   - `Dashboard` for runtime summary and PM2 actions
   - `Logs` for live merged streaming output
7. In the log view, use include/exclude regex filters, tail size, pause, scroll lock, clear, and download.

### REST API examples

Bootstrap the first owner:

```bash
curl -X POST http://localhost:3000/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "ChangeMe123!"
  }'
```

Create a host after signing in and obtaining an access token:

```bash
curl -X POST http://localhost:3000/hosts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-prod-1",
    "host": "203.0.113.10",
    "port": 22,
    "username": "deploy",
    "authType": "PRIVATE_KEY",
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
    "passphrase": "",
    "tagIds": []
  }'
```

Test a host and discover its PM2 processes:

```bash
curl -X POST http://localhost:3000/hosts/HOST_ID/test \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repinFingerprint": false}'

curl http://localhost:3000/hosts/HOST_ID/processes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Realtime event model

The browser uses Socket.IO for operational views. The current event model includes:

- `logs:start` -> `logs:line`, `logs:status`, `logs:error`
- `dashboard:start` -> `dashboard:snapshot`, `dashboard:status`, `dashboard:error`
- `dashboard:action` -> `dashboard:action-result`

This makes the UI responsive without polling for individual log lines, while keeping PM2 runtime polling and PM2 actions explicit and session-scoped.

## Architecture / Design

### Backend

The backend is an Express application with a clear split between routes, services, utilities, and persistence:

- `apps/server/src/routes`
  - HTTP surface for `auth`, `hosts`, `tags`, and `users`
  - request validation with `zod`
  - authentication and role checks at the route boundary
- `apps/server/src/services`
  - authentication and token rotation
  - audit logging
  - SSH host secret management
  - SSH and PM2 execution
  - user preferences and workspace serialization
  - dashboard snapshot construction
- `apps/server/prisma/schema.prisma`
  - users
  - SSH hosts
  - tags
  - audit logs
  - refresh tokens
  - user preferences

### Realtime and SSH execution

The realtime layer is implemented in `apps/server/src/socket.ts`.

Each connected client can start:

- a live log stream for one or more PM2 targets
- a runtime dashboard session for selected PM2 process IDs

Important implementation details:

- SSH sessions are opened server-side using `ssh2`
- commands are wrapped in a login shell so PM2 can be found in user shell profiles
- host keys are fingerprinted and verified before commands run
- PM2 JSON is parsed from `pm2 jlist`
- log streams are buffered with a simple ring buffer so the UI can reason about visible versus buffered lines

### Frontend

The frontend is a React + Vite application in `apps/web`.

Its main responsibilities are:

- session restoration and bootstrap flow
- host inventory and tag filtering
- PM2 process selection
- switching between Processes, Dashboard, Logs, and Settings
- rendering operator-focused panels for runtime state and live logs
- persisting per-user dashboard view state and settings

The primary composition lives in:

- `apps/web/src/App.tsx`
- `apps/web/src/components/Dashboard.tsx`
- `apps/web/src/components/MonitorDashboard.tsx`
- `apps/web/src/components/LogPanel.tsx`
- `apps/web/src/components/SettingsPanel.tsx`

### Design tradeoffs

- The project uses SSH rather than a custom agent on each host. That keeps host rollout simple, but it means remote shell access and PM2 availability are prerequisites.
- Dashboard sessions are on-demand and tied to active users rather than being stored as a long-running telemetry pipeline.
- The application is intentionally PM2-specific. That focus keeps the UX practical for PM2 operators, but it is not a general-purpose observability platform.

### Extensibility points

- Add new HTTP capabilities by extending the route and service layers in `apps/server/src/routes` and `apps/server/src/services`.
- Add new PM2 or SSH operations in `apps/server/src/services/ssh.service.ts`.
- Extend runtime data in `apps/server/src/services/monitor.service.ts` and the matching frontend types.
- Add new user-level preferences through `user_preferences` and the settings UI.

## Configuration

The project reads its runtime configuration from `.env`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `MASTER_KEY` | Base64-encoded 32-byte key used for AES-256-GCM encryption of SSH secrets |
| `JWT_ACCESS_SECRET` | Secret used to sign access tokens |
| `JWT_REFRESH_SECRET` | Secret used to sign and rotate refresh sessions |
| `ACCESS_TOKEN_TTL_MINUTES` | Access token lifetime in minutes |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days |
| `COOKIE_SECURE` | Enables secure cookies when running behind HTTPS |
| `APP_PORT` | Express and Socket.IO port |
| `LOG_BUFFER_MAX_LINES` | Maximum buffered log lines kept per active log session |
| `CORS_ORIGIN` | Allowed frontend origin for HTTP and Socket.IO |

Notes:

- `MASTER_KEY` must decode to exactly 32 bytes.
- The Docker setup uses `postgres` as the database hostname.
- Local development usually needs `localhost` in `DATABASE_URL`.
- In production, replace the development secrets from `.env.example` before starting the app.

## Examples

### Example: shared production workspace

- Create one `OWNER` account during bootstrap.
- Add `ADMIN` users for operators who manage hosts and tags.
- Add `MEMBER` users for read-only process and log access.

This model allows teams to share infrastructure visibility without sharing SSH credentials between people.

### Example: host key rotation

When a server is rebuilt and its SSH host key changes:

1. Test the host again from the UI.
2. Review the fingerprint mismatch prompt.
3. Repin the new fingerprint only if the change is expected.

This keeps host trust explicit rather than silently accepting new keys.

### Example: log triage during an incident

- Select one or more PM2 processes
- open the Logs view
- increase or reduce tail size
- filter with include/exclude regex patterns
- lock scroll while reading older lines
- download the current filtered output when needed

### Example: process-level operations

From the dashboard, select the PM2 services you want to inspect and use the built-in `reload` or `restart` action. The UI refreshes the dashboard session after the action completes so the operator sees updated runtime state without opening a separate shell.

## Testing

Current validation is centered on build verification and the server test suite.

Run the full build:

```bash
npm run build
```

Run the server tests:

```bash
npm run test --workspace @pm2-log-viewer/server
```

The server tests cover:

- authentication routes
- encrypted secret handling
- host secret update logic
- SSH helper behavior
- log stream parsing
- PM2 JSON parsing
- dashboard snapshot aggregation

There is no dedicated lint script in the repository yet. At the moment, `npm run build` is the main type-check and production-build validation command for both workspaces.

## Roadmap

- Expand automated coverage beyond the server suite, especially for frontend and Socket.IO flows
- Continue refining the dense operator UI for dashboards and long-running log reading sessions
- Broaden deployment and production-hardening documentation
- Formalise project metadata for public collaboration, including a license and contributor-facing project policy

## Contributing

Contributions should stay practical, well-scoped, and consistent with the existing codebase.

### Reporting issues

Open an issue in this repository with:

- the problem you observed
- environment details
- steps to reproduce
- expected behaviour
- actual behaviour

### Proposing features

Feature requests are most useful when they describe:

- the operator or developer workflow
- why the current behaviour is limiting
- the expected UI, API, or runtime outcome

### Submitting pull requests

Before opening a pull request:

```bash
npm run build
npm run test --workspace @pm2-log-viewer/server
```

Please keep pull requests focused and aligned with the existing conventions:

- use TypeScript throughout
- validate request payloads with `zod`
- keep persistence changes explicit in Prisma schema and migrations
- keep backend behavior in services, not embedded in routes
- keep frontend changes consistent with the current React + Tailwind component patterns

> TODO: add a dedicated `CONTRIBUTING.md` and contribution policy once the project's public licensing is finalised.

## License

License not specified yet.

If this repository is intended for wider public use or external contribution, add a `LICENSE` file before treating it as a formally open-source project.

## Author / Maintainer

Maintained through this repository by the project author.

The codebase reflects hands-on ownership across product design, backend services, authentication, SSH automation, realtime delivery, and operator-facing UI.

> TODO: add maintainer name, organisation, and preferred contact details.
