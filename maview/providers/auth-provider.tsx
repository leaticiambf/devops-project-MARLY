"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authApi } from "@/lib/api/auth";
import { setUnauthorizedHandler } from "@/lib/api/fetcher";
import { usersApi } from "@/lib/api/users";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/auth/storage";
import type {
  LoginRequest,
  RegisterRequest,
  User,
} from "@/lib/types/api";

type AuthStatus = "restoring" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function hydrateUser(token: string, userId: string) {
  return usersApi.getById(userId, token);
}

function sessionMatches(
  session: { token: string; userId: string } | null,
  token: string,
  userId: string,
) {
  return Boolean(session && session.token === token && session.userId === userId);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const refreshSeqRef = useRef(0);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setToken(null);
    setStatus("anonymous");
  }, []);

  const refreshUser = useCallback(async () => {
    const session = readStoredSession();
    if (!session) {
      clearSession();
      return null;
    }

    const refreshSeq = ++refreshSeqRef.current;

    try {
      const hydratedUser = await hydrateUser(session.token, session.userId);
      const latestSession = readStoredSession();
      if (
        refreshSeq !== refreshSeqRef.current ||
        !sessionMatches(latestSession, session.token, session.userId)
      ) {
        return null;
      }
      setUser(hydratedUser);
      setToken(session.token);
      setStatus("authenticated");
      return hydratedUser;
    } catch {
      const latestSession = readStoredSession();
      if (
        refreshSeq === refreshSeqRef.current &&
        sessionMatches(latestSession, session.token, session.userId)
      ) {
        clearSession();
      }
      return null;
    }
  }, [clearSession]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    setUnauthorizedHandler(({ path, token: failingToken }) => {
      const session = readStoredSession();
      if (!session || !failingToken || session.token !== failingToken) {
        return;
      }

      // Only the canonical user hydration endpoint should be allowed to evict
      // the local session. Other background 401/403s should surface as page
      // errors instead of bouncing the user back to login.
      if (path === `/api/users/${session.userId}`) {
        clearSession();
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      isAuthenticated: status === "authenticated" && Boolean(user && token),
      isRestoring: status === "restoring",
      async login(payload) {
        const response = await authApi.login(payload);
        refreshSeqRef.current += 1;
        writeStoredSession({
          token: response.token,
          userId: response.user.userId,
        });
        setToken(response.token);
        setUser(response.user);
        setStatus("authenticated");
      },
      async register(payload) {
        const response = await authApi.register(payload);
        refreshSeqRef.current += 1;
        writeStoredSession({
          token: response.token,
          userId: response.user.userId,
        });
        setToken(response.token);
        setUser(response.user);
        setStatus("authenticated");
      },
      async refreshUser() {
        return refreshUser();
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
          // Preserve local logout even if the Google session is already gone.
        } finally {
          clearSession();
        }
      },
    }),
    [clearSession, refreshUser, status, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
