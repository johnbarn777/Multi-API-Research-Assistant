import { getServerEnv } from "@/config/env";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirebaseAdmin(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = getApp();
    return adminApp;
  }

  const env = getServerEnv();

  adminApp = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY
    })
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseAdmin());
  }

  return authInstance;
}

export function getAdminFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getFirebaseAdmin());
  }

  return firestoreInstance;
}

export const adminAuth = () => getAdminAuth();
export const adminDb = () => getAdminFirestore();
