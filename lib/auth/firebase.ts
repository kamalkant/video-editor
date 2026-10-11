import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (getApps().length > 0) return getApp();

  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  });
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

/**
 * Verifies a Firebase ID token on the server using Google Identity Toolkit REST API.
 * Does not require firebase-admin private service account keys.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  expectedPhone?: string
): Promise<{ success: boolean; phone?: string; error?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Firebase API key is not configured." };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!res.ok) {
      return { success: false, error: "Invalid or expired verification session." };
    }

    const data = await res.json();
    const user = data.users?.[0];
    if (!user) {
      return { success: false, error: "No user found for this verification." };
    }

    if (expectedPhone && user.phoneNumber && user.phoneNumber !== expectedPhone) {
      return { success: false, error: "Phone number mismatch." };
    }

    return { success: true, phone: user.phoneNumber };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to verify token with Firebase." };
  }
}
