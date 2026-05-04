const LOCAL_FRONTEND_URL = "http://localhost:3000";
const LOCAL_BACKEND_URL = "http://localhost:8080";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

function resolveEnv(name: string, fallback: string) {
  const value = readEnv(name);
  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production.`);
  }

  return fallback;
}

export function getAppUrl() {
  return resolveEnv("NEXT_PUBLIC_APP_URL", LOCAL_FRONTEND_URL);
}

export function getBackendOrigin() {
  return resolveEnv("BACKEND_ORIGIN", LOCAL_BACKEND_URL);
}

export function getMapboxToken() {
  const value = process.env.VITE_MAPBOX_TOKEN?.trim();
  return value || null;
}
