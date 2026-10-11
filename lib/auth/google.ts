import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export const OAUTH_STATE_COOKIE_NAME = "VDO_oauth_state";

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
};

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });
  return state;
}

const OAUTH_CONTEXT_COOKIE_NAME = "VDO_oauth_ctx";

/** Remembers where to land and who referred the user across the trip to Google (10 minutes). */
export async function saveOAuthContext(ctx: { next: string; ref: string | null }): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_CONTEXT_COOKIE_NAME, JSON.stringify(ctx), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
}

/** Reads and clears the context saved by saveOAuthContext (values are re-validated by the caller). */
export async function takeOAuthContext(): Promise<{ next: string | null; ref: string | null }> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(OAUTH_CONTEXT_COOKIE_NAME)?.value;
    cookieStore.delete(OAUTH_CONTEXT_COOKIE_NAME);
    if (!raw) return { next: null, ref: null };
    const parsed = JSON.parse(raw) as { next?: unknown; ref?: unknown };
    return {
      next: typeof parsed.next === "string" ? parsed.next : null,
      ref: typeof parsed.ref === "string" ? parsed.ref : null,
    };
  } catch {
    return { next: null, ref: null };
  }
}

export async function verifyAndClearOAuthState(candidateState: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const storedState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
    cookieStore.delete(OAUTH_STATE_COOKIE_NAME);

    if (!storedState || !candidateState) return false;

    const storedBuf = Buffer.from(storedState);
    const candidateBuf = Buffer.from(candidateState);

    if (storedBuf.length !== candidateBuf.length) return false;
    return timingSafeEqual(storedBuf, candidateBuf);
  } catch {
    return false;
  }
}

export function getGoogleAuthUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is missing.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured in environment variables.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google token exchange error:", tokenRes.status, errText);
    throw new Error("Failed to exchange authorization code with Google.");
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("Google did not return an access token.");
  }

  const userinfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userinfoRes.ok) {
    throw new Error("Failed to fetch user profile from Google.");
  }

  const profile = await userinfoRes.json();

  if (!profile.sub || !profile.email) {
    throw new Error("Google profile is missing essential identity fields (sub, email).");
  }

  return {
    sub: profile.sub,
    email: profile.email,
    email_verified: Boolean(profile.email_verified),
    name: profile.name || profile.email.split("@")[0],
    picture: profile.picture,
  };
}
