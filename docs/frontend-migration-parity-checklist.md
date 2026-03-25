# Maview Migration Parity Checklist

This checklist is the Phase 0 source-of-truth for the incremental migration from Spring static UI to `/maview`.

## Legacy Frontend Modules

- `auth.js`
  - Registration and login through `/api/users` and `/api/users/login`
  - JWT persisted in `localStorage`
  - Session restore via `/api/users/{userId}`
  - Logout clears local UI state and token
- `journey.js`
  - Journey plan form
  - Eco mode toggle
  - Wheelchair toggle
  - Optional via stop and via departure time
  - Comfort-mode selection
  - Google task optimization payload path
  - Fallback to normal journey when optimization returns no result
  - Journey result cards
  - Start, complete, and cancel journey actions
  - Current journey panel and disruption entry point
- `google-link.js`
  - Popup-based same-origin Google Tasks linking
  - `postMessage` refresh on `GOOGLE_TASKS_LINKED`
  - Linked-account badge refresh through `/api/users/{userId}`
- `tasks.js`
  - Default task list loading
  - Include-completed toggle
  - Complete task action
  - Delete task action
- `comfort-profile.js`
  - Comfort profile summary
  - Named comfort settings CRUD
  - Comfort onboarding state
- `home-address.js`
  - Home address display and update
- `smart-suggestions.js`
  - Tomorrow-task suggestions gated by Google link and home address
  - Journey prefill behavior
- `disruption.js`
  - Journey line/stop fetch
  - Station disruption report
  - Line disruption report
  - Reroute presentation
- `eco-score.js`
  - Dashboard fetch and rendering
  - Badge history and eco history rendering

## Backend Endpoints Used By The Frontend

- Public
  - `POST /api/users`
  - `POST /api/users/login`
  - `GET /api/auth/login`
  - `/oauth2/**`
  - `/login/oauth2/**`
  - `GET /actuator/health`
  - `GET /actuator/info`
- Protected by JWT and/or Spring session
  - `GET /api/users/{userId}`
  - `PUT /api/users/{userId}`
  - `PUT /api/users/{userId}/home-address`
  - `GET|PUT|DELETE /api/users/{userId}/comfort-profile`
  - `GET|POST|PUT|DELETE /api/users/{userId}/comfort-settings/**`
  - `POST /api/users/{userId}/comfort-prompt-seen`
  - `POST /api/journeys`
  - `POST /api/journeys/{journeyId}/start`
  - `POST /api/journeys/{journeyId}/complete`
  - `POST /api/journeys/{journeyId}/cancel`
  - `GET /api/journeys/{journeyId}`
  - `GET /api/journeys/{journeyId}/lines`
  - `GET /api/journeys/{journeyId}/stops`
  - `POST /api/journeys/{journeyId}/disruptions/station`
  - `POST /api/journeys/{journeyId}/disruptions/line`
  - `GET /api/google/tasks/users/{userId}/default-list`
  - `GET /api/google/tasks/users/{userId}/lists/{listId}/tasks`
  - `PATCH /api/google/tasks/users/{userId}/lists/{listId}/tasks/{taskId}/complete`
  - `DELETE /api/google/tasks/users/{userId}/lists/{listId}/tasks/{taskId}`
  - `GET /api/google/tasks/users/{userId}/suggestions`
  - `GET /api/google/tasks/users/{userId}/for-journey`
  - `GET /api/google/tasks/link?userId=...`
  - `GET /api/eco/dashboard?userId=...`

## Intentional v1 Differences

- Login and registration are dedicated routes instead of modal overlays.
- Next routes replace the single HTML-shell view toggle pattern.
- The new UI system does not reuse `style.css`.
- The browser talks to the frontend origin only; backend calls are proxied through Next rewrites.

## Acceptance Tracking

- [x] Phase 0 parity checklist written
- [x] Phase 1 app shell, routes, providers, and typed API/auth substrate
- [x] Phase 2 proxy rules and session restore foundation
- [x] Backend CORS origin model made environment-driven
- [x] Backend request ownership checks added for JWT-driven protected endpoints
- [ ] Google popup flow validated end-to-end from `/maview`
- [x] Journey planner parity on `/`
- [x] Comfort/home/suggestions/disruption parity
- [x] Eco dashboard parity polish
- [x] Frontend unit-test stack and CI split
- [ ] Playwright e2e coverage against the split frontend/backend dev setup
