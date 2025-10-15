import { getServerEnv } from "@/config/env";
import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (adminApp) {
    return adminApp;
  }

  const env = getServerEnv();

  const apps = getApps();
  if (apps.length > 0) {
    adminApp = getApp();
    return adminApp;
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY
    })
  });

  return adminApp;
}

export const adminAuth = () => getAuth(getFirebaseAdmin());
export const adminDb = () => getFirestore(getFirebaseAdmin());
