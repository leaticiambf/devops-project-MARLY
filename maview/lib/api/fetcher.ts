import { readStoredSession } from "@/lib/auth/storage";

export class ApiError extends Error {
  status: number;
  body: unknown;
  authError: boolean;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.authError = status === 401 || status === 403;
  }
}

type UnauthorizedContext = {
  path: string;
  status: number;
  token: string | null;
};

let unauthorizedHandler: ((context: UnauthorizedContext) => void) | null = null;

export function setUnauthorizedHandler(
  handler: ((context: UnauthorizedContext) => void) | null,
) {
  unauthorizedHandler = handler;
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | object | null;
  token?: string | null;
};

async function parseBody(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

function errorMessageFromBody(body: unknown, fallback: string) {
  if (typeof body === "string" && body.trim()) {
    return body;
  }
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string" &&
    body.message.trim()
  ) {
    return body.message;
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  { body, headers, token, ...init }: ApiRequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);
  const resolvedToken = token ?? readStoredSession()?.token;

  if (resolvedToken) {
    requestHeaders.set("Authorization", `Bearer ${resolvedToken}`);
  }

  let requestBody: BodyInit | undefined;
  if (
    body &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob)
  ) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  } else if (body != null) {
    requestBody = body as BodyInit;
  }

  const response = await fetch(path, {
    ...init,
    body: requestBody ?? undefined,
    credentials: "same-origin",
    cache: "no-store",
    headers: requestHeaders,
  });

  const responseBody = await parseBody(response);

  if (!response.ok) {
    const error = new ApiError(
      errorMessageFromBody(responseBody, `Request failed with ${response.status}`),
      response.status,
      responseBody,
    );

    if (error.authError) {
      unauthorizedHandler?.({
        path,
        status: error.status,
        token: resolvedToken ?? null,
      });
    }

    throw error;
  }

  return responseBody as T;
}
