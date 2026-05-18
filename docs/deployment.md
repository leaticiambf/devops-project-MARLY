# Deployment Notes

This branch is prepared for a split deployment:

- Frontend: Vercel, with project root set to `maview`.
- Backend: a Docker-capable host such as Render, Railway, Fly.io, or Koyeb, with project root/build context set to `Mavigo`.
- Database: Aiven PostgreSQL.

## Frontend Environment

Set these variables in Vercel:

```text
BACKEND_ORIGIN=https://your-backend-host
NEXT_PUBLIC_APP_URL=https://your-frontend.vercel.app
VITE_MAPBOX_TOKEN=replace-with-mapbox-token
```

The Next.js app rewrites `/api/*`, `/oauth2/*`, `/login/oauth2/*`, and `/logout` to `BACKEND_ORIGIN`.

## Backend Environment

Set these variables in the backend host:

```text
APP_FRONTEND_BASE_URL=https://your-frontend.vercel.app
APP_FRONTEND_ALLOWED_ORIGINS=https://your-frontend.vercel.app
APP_OAUTH_REDIRECT_BASE_URL=https://your-frontend.vercel.app

DB_URL=jdbc:postgresql://HOST:PORT/defaultdb?sslmode=require
DB_USERNAME=avnadmin
DB_PASSWORD=replace-with-aiven-password
DB_DRIVER_CLASS_NAME=org.postgresql.Driver
JPA_HIBERNATE_DIALECT=org.hibernate.dialect.PostgreSQLDialect
JPA_DDL_AUTO=update

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRATION=86400000
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
PRIM_API_KEY=replace-with-prim-api-key
TOURISM_YELP_API_KEY=replace-with-yelp-key-if-used
```

Most hosts inject `PORT` automatically. The backend reads `PORT` and falls back to `8080`.

## Google OAuth

In Google Cloud Console, register this redirect URI:

```text
https://your-frontend.vercel.app/login/oauth2/code/google
```

That URI is routed by the frontend rewrite to the backend OAuth callback.
