import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  AUTH_HEADER_EMAIL,
  AUTH_HEADER_TOKEN,
  AUTH_HEADER_UID
} from "@/server/auth/session";

const PUBLIC_PATHS = ["/", "/sign-in", "/api/auth/session"];
const SESSION_COOKIES = ["__session", "session", "firebaseToken"];

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

  const token = getTokenFromRequest(request);
  if (!token) {
    return unauthorizedResponse(request);
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_HEADER_UID, decoded.uid);
    requestHeaders.set(AUTH_HEADER_EMAIL, decoded.email ?? "");
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
