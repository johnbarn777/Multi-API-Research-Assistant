"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";

function getInitials(name?: string | null, email?: string | null) {
  if (name && name.trim().length > 0) {
    const segments = name
      .trim()
      .split(/\s+/)
      .slice(0, 2);
    return segments.map((segment) => segment[0]?.toUpperCase()).join("");
  }

  if (email && email.length > 0) {
    return email[0]!.toUpperCase();
  }

  return "?";
}

export function UserMenu(): JSX.Element {
  const router = useRouter();
  const { user, loading, error } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const initials = useMemo(
    () => getInitials(user?.displayName, user?.email ?? null),
    [user?.displayName, user?.email]
  );

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const auth = getClientAuth();
      await signOut(auth);
      router.replace("/sign-in");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign out. Please try again.";
      setSignOutError(message);
    } finally {
      setIsSigningOut(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400" aria-live="polite">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" aria-hidden="true" />
        Checking session…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-end gap-1 text-xs text-rose-300">
        <span>Auth error: {error.message}</span>
        <Link href="/sign-in" className="text-rose-200 underline">
          Retry sign-in
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="hidden text-slate-400 sm:inline">Not signed in</span>
        <Link
          href="/sign-in"
          className="rounded-md border border-slate-700 px-3 py-1 font-medium text-slate-100 transition hover:border-brand hover:text-brand"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? user.email ?? "Account avatar"}
            className="h-8 w-8 rounded-full border border-slate-700 object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-200">
            {initials}
          </span>
        )}
        <div className="hidden text-left text-xs sm:block">
          <p className="font-semibold text-slate-100">
            {user.displayName ?? user.email ?? "Signed in"}
          </p>
          {user.email ? (
            <p className="text-slate-400">{user.email}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
        disabled={isSigningOut}
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
      {signOutError ? (
        <p className="ml-2 max-w-xs text-xs text-rose-300" role="alert">
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
