# Mavigo Frontend

`maview/` is the active Next.js frontend for Mavigo. The folder name stays `maview`, but the product name shown to users is Mavigo.

## Stack

- Next.js 16 App Router
- React 19
- TanStack Query
- Vitest for a few targeted unit tests
- Playwright for a lightweight smoke suite

## Required Environment

Copy `maview/.env.example` to `maview/.env.local` and set:

- `BACKEND_ORIGIN`: backend origin, usually `http://localhost:8080` in local development
- `NEXT_PUBLIC_APP_URL`: public frontend origin, usually `http://localhost:3000`

Production builds require both values explicitly. The app no longer silently defaults to localhost values in production mode.

## Local Development

```bash
pnpm install
pnpm dev
```

The frontend expects the backend to already be running on the configured `BACKEND_ORIGIN`.

## Scripts

- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Frontend Routing Model

- UI pages are rendered by Next.js
- Browser requests stay on the frontend origin
- Next rewrites API, OAuth callback, and logout paths to the Spring backend

Rewritten paths:

- `/api/:path*`
- `/oauth2/:path*`
- `/login/oauth2/:path*`
- `/logout`

## Authentication Behavior

- App login and registration store the JWT locally
- Protected pages restore the session client-side from `localStorage`
- Google Tasks linking still relies on the backend-managed Spring session

## Testing

- Vitest covers utility and API client behavior
- Playwright covers a small browser-level smoke path for auth, the main journey flow, and protected page rendering
