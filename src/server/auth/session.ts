import { NextResponse } from "next/server";

const AUTH_HEADER_UID = "x-user-uid";
const AUTH_HEADER_EMAIL = "x-user-email";
const AUTH_HEADER_TOKEN = "x-firebase-id-token";

type HeaderLike = Pick<Headers, "get">;

export interface AuthSession {
  uid: string;
  email: string | null;
  token: string | null;
}

export class UnauthorizedError extends Error {
  public readonly statusCode = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function parseAuthHeaders(headers: HeaderLike): AuthSession | null {
  const uid = headers.get(AUTH_HEADER_UID);
  if (!uid) {
    return null;
  }

  const email = headers.get(AUTH_HEADER_EMAIL);
  const token = headers.get(AUTH_HEADER_TOKEN);

  return {
    uid,
    email: email && email.length > 0 ? email : null,
    token: token ?? null
  };
}

export function getAuthSession(request: Request | HeaderLike): AuthSession | null {
  if ("get" in request && typeof request.get === "function") {
    return parseAuthHeaders(request);
  }

  const headers = (request as Request).headers;
  return parseAuthHeaders(headers);
}

export function requireAuth(request: Request | HeaderLike): AuthSession {
  const session = getAuthSession(request);

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}

export function ensureAuthenticated(
  request: Request,
  message = "Authentication required"
): AuthSession | NextResponse {
  const session = getAuthSession(request);

  if (!session) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  return session;
}

export function unauthorizedResponse(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function assertOwner<T extends { ownerUid: string }>(resource: T, uid: string): T {
  if (resource.ownerUid !== uid) {
    throw new ForbiddenError();
  }

  return resource;
}

export { AUTH_HEADER_UID, AUTH_HEADER_EMAIL, AUTH_HEADER_TOKEN };
