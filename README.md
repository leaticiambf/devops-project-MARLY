# Mavigo

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/Aminmiri82/devops-project-MARLY/actions/workflows/ci.yml/badge.svg)](https://github.com/Aminmiri82/devops-project-MARLY/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Aminmiri82_devops-project-MARLY&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Aminmiri82_devops-project-MARLY)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Aminmiri82_devops-project-MARLY&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Aminmiri82_devops-project-MARLY)

Mavigo is a split web application for planning Paris public transport journeys, managing Google Tasks along the route, and tracking eco-score progress.

## Repository Layout

- `Mavigo/`: Spring Boot backend, API, OAuth, and persistence
- `maview/`: Next.js frontend, App Router UI, frontend-side rewrites, and frontend tests
- `docs/`: technical documentation and project diagrams

## Runtime Topology

- Browser traffic should target the frontend origin only
- `maview` rewrites `/api/*`, `/oauth2/*`, `/login/oauth2/*`, and `/logout` to the backend
- The backend stays deployable independently on Railway or a similar host
- The frontend and backend are expected to run on separate origins in hosted environments

Default local ports:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`

## Auth Model

- Main app authentication uses a JWT stored in browser `localStorage`
- Google OAuth and Google Tasks access use the Spring session
- Logging out from the frontend clears the local JWT and calls the backend logout endpoint

## Environment Variables

Frontend (`maview/.env` or `maview/.env.local`):

- `BACKEND_ORIGIN`: backend base URL used by Next rewrites
- `NEXT_PUBLIC_APP_URL`: public frontend URL used for metadata and frontend-origin assumptions

Backend (`Mavigo/local.env`, see `Mavigo/local.env.example`):

- `APP_FRONTEND_BASE_URL`
- `APP_FRONTEND_ALLOWED_ORIGINS`
- `APP_OAUTH_REDIRECT_BASE_URL`
- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRATION`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PRIM_API_KEY`

Google OAuth setup note:

- Register `${APP_OAUTH_REDIRECT_BASE_URL}/login/oauth2/code/google` as an authorized redirect URI in Google Cloud
- Local development is configured for `http://localhost:3000/login/oauth2/code/google`
- Hosted environments should point `APP_OAUTH_REDIRECT_BASE_URL` at the deployed frontend origin

Optional backend development helpers:

- `APP_H2_CONSOLE_ENABLED=true`
- `LOG_LEVEL_SPRING_SECURITY=DEBUG`
- `LOG_LEVEL_WEBCLIENT=DEBUG`
- `LOG_LEVEL_REACTOR_NETTY=DEBUG`

## Run Locally

1. Create `Mavigo/local.env` from `Mavigo/local.env.example`.
2. Create `maview/.env.local` from `maview/.env.example`.
3. Start the backend:

```bash
cd Mavigo
./gradlew bootRun
```

4. In another terminal, start the frontend:

```bash
cd maview
pnpm install
pnpm dev
```

## Verification Commands

Frontend:

```bash
cd maview
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Backend:

```bash
cd Mavigo
./gradlew test
```

## Deployment Notes

- Set `NEXT_PUBLIC_APP_URL` to the real frontend URL in production
- Set `BACKEND_ORIGIN` to the deployed backend URL in production
- Set `APP_FRONTEND_BASE_URL`, `APP_FRONTEND_ALLOWED_ORIGINS`, and `APP_OAUTH_REDIRECT_BASE_URL` to the deployed frontend URL(s)
- The backend enables forwarded-header handling so OAuth redirects and absolute URLs work correctly behind a reverse proxy
