import { afterEach, describe, expect, it } from "vitest";

import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/auth/storage";

describe("session storage", () => {
  afterEach(() => {
    clearStoredSession();
  });

  it("writes and restores the JWT session payload", () => {
    writeStoredSession({
      token: "jwt-token",
      userId: "user-42",
    });

    expect(readStoredSession()).toEqual({
      token: "jwt-token",
      userId: "user-42",
    });
  });

  it("clears the stored session", () => {
    writeStoredSession({
      token: "jwt-token",
      userId: "user-42",
    });

    clearStoredSession();

    expect(readStoredSession()).toBeNull();
  });
});
