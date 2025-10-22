import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SignInView from "./SignInView";

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function shouldBypassAuth(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const bypass = parseBoolean(process.env.DEV_AUTH_BYPASS);
  const publicBypass = parseBoolean(process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS);

  return bypass || publicBypass;
}

function resolveTargetRoute(redirectedFrom: string | undefined): Route {
  if (!redirectedFrom || redirectedFrom === "/sign-in") {
    return "/dashboard";
  }
  if (redirectedFrom === "/") {
    return "/dashboard";
  }
  if (!redirectedFrom.startsWith("/")) {
    return "/dashboard";
  }
  return redirectedFrom as Route;
}

interface SignInPageProps {
  searchParams?: {
    redirectedFrom?: string;
  };
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  const redirectedFrom = searchParams?.redirectedFrom;
  const targetRoute = resolveTargetRoute(redirectedFrom);

  const cookieStore = cookies();
  const hasFirebaseToken = Boolean(cookieStore.get("firebaseToken")?.value);

  if (hasFirebaseToken || shouldBypassAuth()) {
    redirect(targetRoute);
  }

  return <SignInView targetRoute={targetRoute} />;
}
