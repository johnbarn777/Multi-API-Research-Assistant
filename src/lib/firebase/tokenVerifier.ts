import { getPublicEnv } from "@/config/env";

const IDENTITY_TOOLKIT_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

export interface VerifiedFirebaseToken {
  uid: string;
  email: string | null;
}

export class FirebaseTokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseTokenVerificationError";
  }
}

interface IdentityToolkitErrorBody {
  error?: {
    message?: string;
  };
}

interface IdentityToolkitLookupResponse {
  users?: Array<{
    localId?: string;
    email?: string;
  }>;
}

export async function verifyFirebaseIdToken(
  token: string,
): Promise<VerifiedFirebaseToken> {
  if (!token || token.trim().length === 0) {
    throw new FirebaseTokenVerificationError("Missing Firebase ID token");
  }

  const { NEXT_PUBLIC_FIREBASE_API_KEY } = getPublicEnv();

  const response = await fetch(
    `${IDENTITY_TOOLKIT_LOOKUP_URL}?key=${encodeURIComponent(NEXT_PUBLIC_FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to verify Firebase ID token";

    try {
      const errorBody = (await response.json()) as IdentityToolkitErrorBody;
      if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      }
    } catch {
      // ignore parse errors – keep default message
    }

    throw new FirebaseTokenVerificationError(errorMessage);
  }

  const payload = (await response.json()) as IdentityToolkitLookupResponse;
  const user = payload.users?.[0];

  if (!user?.localId) {
    throw new FirebaseTokenVerificationError("Invalid Firebase ID token");
  }

  return {
    uid: user.localId,
    email: user.email ?? null
  };
}
