"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const redirectedFrom = searchParams.get("redirectedFrom");
    const target =
      redirectedFrom && redirectedFrom !== "/sign-in" ? redirectedFrom : "/dashboard";
    router.replace(target);
  }, [loading, user, router, searchParams]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      const auth = getClientAuth();
      await setPersistence(auth, browserLocalPersistence);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      await result.user.getIdToken(true);

      const redirectedFrom = searchParams.get("redirectedFrom");
      const target =
        redirectedFrom && redirectedFrom !== "/sign-in"
          ? redirectedFrom
          : "/dashboard";

      router.replace(target);
      router.refresh();
    } catch (signInError) {
      const message =
        signInError instanceof Error
          ? signInError.message
          : "Failed to sign in with Google. Please try again.";
      setError(message);
    } finally {
      setIsSigningIn(false);
    }
  }, [router, searchParams]);

  const disabled = isSigningIn || loading;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold text-white">Sign in</h1>
          <p className="text-sm text-slate-400">
            Continue with your Google account to access the Multi-API Research Assistant.
          </p>
        </header>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
          disabled={disabled}
          aria-busy={isSigningIn}
        >
          <span aria-hidden="true" role="presentation">
            🔒
          </span>
          {isSigningIn ? "Signing in..." : "Continue with Google"}
        </button>
        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
        <p className="text-center text-xs text-slate-500">
          By signing in you agree to receive transactional emails related to your research reports.
        </p>
        <Link href="/" className="block text-center text-xs text-brand underline">
          Back to landing page
        </Link>
      </div>
    </main>
  );
}
