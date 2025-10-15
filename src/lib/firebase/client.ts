import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getPublicEnv } from "@/config/env";

let clientApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirebaseClient(): FirebaseApp {
  if (clientApp) {
    return clientApp;
  }

  const env = getPublicEnv();

  clientApp =
    getApps().find((app) => app.name === "client") ??
    initializeApp(
      {
        apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: env.NEXT_PUBLIC_FIREBASE_APP_ID
      },
      "client"
    );

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
