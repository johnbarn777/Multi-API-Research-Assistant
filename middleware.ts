import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebase/tokenVerifier";
import {
  AUTH_HEADER_EMAIL,
  AUTH_HEADER_TOKEN,
  AUTH_HEADER_UID
} from "@/server/auth/session";

const PUBLIC_PATHS = ["/", "/sign-in", "/api/auth/session"];
const SESSION_COOKIES = ["__session", "session", "firebaseToken"];

function parseBooleanFlag(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    default:
      return false;
  }
}

function getDevBypassConfig() {
  const flag =
    parseBooleanFlag(process.env.DEV_AUTH_BYPASS) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS);

  if (process.env.NODE_ENV === "production" || !flag) {
    return { enabled: false as const };
  }

  const uid = process.env.DEV_AUTH_BYPASS_UID ?? "dev-bypass-user";
  const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? "dev-bypass@example.com";
  const token = process.env.DEV_AUTH_BYPASS_TOKEN ?? "dev-bypass-token";

  return {
    enabled: true as const,
    uid,
    email,
    token
  };
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function getTokenFromRequest(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const explicitHeader = request.headers.get(AUTH_HEADER_TOKEN);
  if (explicitHeader) {
    return explicitHeader.trim();
  }

  for (const cookieName of SESSION_COOKIES) {
    const cookie = request.cookies.get(cookieName);
    if (cookie?.value) {
      return cookie.value;
    }
  }

  return null;
}

function unauthorizedResponse(request: NextRequest) {
  if (isApiRoute(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redirectUrl = new URL("/sign-in", request.url);
  redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl, 302);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS" || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const devBypass = getDevBypassConfig();
  if (devBypass.enabled) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_HEADER_UID, devBypass.uid);
    if (devBypass.email) {
      requestHeaders.set(AUTH_HEADER_EMAIL, devBypass.email);
    } else {
      requestHeaders.delete(AUTH_HEADER_EMAIL);
    }
    requestHeaders.set(AUTH_HEADER_TOKEN, devBypass.token);

    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  const token = getTokenFromRequest(request);
  if (!token) {
    return unauthorizedResponse(request);
  }

  try {
    const decoded = await verifyFirebaseIdToken(token);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_HEADER_UID, decoded.uid);
    if (decoded.email) {
      requestHeaders.set(AUTH_HEADER_EMAIL, decoded.email);
    } else {
      requestHeaders.delete(AUTH_HEADER_EMAIL);
    }
    requestHeaders.set(AUTH_HEADER_TOKEN, token);

    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  } catch (error) {
    console.error("Failed to verify Firebase ID token", error);
    return unauthorizedResponse(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
