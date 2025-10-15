"use client";

import type { PropsWithChildren } from "react";
import { useAuth } from "@/lib/firebase/auth-context";

export function AuthStateGate({ children }: PropsWithChildren): JSX.Element {
  const { loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Checking authentication status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-red-400">
        Failed to load authentication: {error.message}
      </div>
    );
  }

  return <>{children}</>;
}
