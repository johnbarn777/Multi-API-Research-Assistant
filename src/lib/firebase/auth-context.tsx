"use client";

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { getClientAuth } from "./client";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: Error | null;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, setState] = useState<AuthContextValue>({
    user: null,
    loading: true,
    error: null,
    token: null
  });

  useEffect(() => {
    const auth = getClientAuth();

    const unsubscribe = onIdTokenChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          setState({ user: null, loading: false, error: null, token: null });
          return;
        }

        try {
          const token = await firebaseUser.getIdToken();
          setState({ user: firebaseUser, loading: false, error: null, token });
        } catch (error) {
          setState({
            user: firebaseUser,
            loading: false,
            error: error instanceof Error ? error : new Error("Failed to fetch ID token"),
            token: null
          });
        }
      },
      (error) => {
        setState({
          user: null,
          loading: false,
          error: error instanceof Error ? error : new Error("Authentication error"),
          token: null
        });
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
    if (state.token) {
      const maxAgeSeconds = 60 * 60; // 1 hour; token refresh handled by Firebase SDK.
      document.cookie = `firebaseToken=${state.token}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${secureFlag}`;
    } else {
      document.cookie = `firebaseToken=; Path=/; Max-Age=0; SameSite=Strict${secureFlag}`;
    }
  }, [state.token]);

  const value = useMemo(() => state, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
