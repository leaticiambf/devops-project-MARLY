import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeStoredSession } from "@/lib/auth/storage";
import {
  ApiError,
  apiRequest,
  setUnauthorizedHandler,
} from "@/lib/api/fetcher";

describe("apiRequest", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("adds the stored JWT to authenticated requests", async () => {
    writeStoredSession({
      token: "saved-token",
      userId: "user-1",
    });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiRequest<{ ok: boolean }>("/api/example")).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer saved-token");
  });

  it("normalizes API errors and triggers the unauthorized handler on 401", async () => {
    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiRequest("/api/protected")).rejects.toMatchObject({
      name: "ApiError",
      message: "Unauthorized",
      status: 401,
      authError: true,
    } satisfies Partial<ApiError>);

    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });
});
