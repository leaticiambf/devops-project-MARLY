const TOKEN_KEY = "mavigo_token";
const USER_ID_KEY = "mavigo_user_id";

export type StoredSession = {
  token: string;
  userId: string;
};

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(TOKEN_KEY);
  const userId = window.localStorage.getItem(USER_ID_KEY);

  if (!token || !userId) {
    return null;
  }

  return { token, userId };
}

export function writeStoredSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(USER_ID_KEY, session.userId);
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
}
