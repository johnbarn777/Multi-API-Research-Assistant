import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import type { Analytics } from "firebase/analytics";
import { getPublicEnv } from "@/config/env";

let clientApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;

export function getFirebaseClient(): FirebaseApp {
  if (clientApp) {
    return clientApp;
  }

  const env = getPublicEnv();

  const config = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    ...(env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
      ? { measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID }
      : {})
  };

  clientApp =
    getApps().find((app) => app.name === "client") ??
    initializeApp(config, "client");

  return clientApp;
}

export function getClientAuth(): Auth {
  if (authInstance) {
    return authInstance;
  }

  const app = getFirebaseClient();
  authInstance = getAuth(app);
  return authInstance;
}

export function getClientFirestore(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getFirebaseClient();
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}

export async function getClientAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (analyticsInstance) {
    return analyticsInstance;
  }

  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) {
    return null;
  }

  if (!analyticsInitPromise) {
    analyticsInitPromise = (async () => {
      try {
        const analyticsModule = await import("firebase/analytics");
        const supported = await analyticsModule
          .isSupported()
          .catch(() => false);
        if (!supported) {
          return null;
        }

        const app = getFirebaseClient();
        analyticsInstance = analyticsModule.getAnalytics(app);
        return analyticsInstance;
      } catch {
        return null;
      }
    })();
  }

  const analytics = await analyticsInitPromise;
  if (!analytics) {
    analyticsInitPromise = null;
  }

  return analytics ?? null;
}
