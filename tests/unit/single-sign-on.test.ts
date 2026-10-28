import { afterEach, describe, expect, it, vi } from "vitest";

// a cookie jar standing in for next/headers: what the route reads, and every Set-Cookie it would send
const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  sets: [] as Array<{ name: string; value: string; domain?: string; maxAge?: number }>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined),
    set: (name: string, value: string, opts: { domain?: string; maxAge?: number } = {}) => {
      jar.sets.push({ name, value, domain: opts.domain, maxAge: opts.maxAge });
    },
    delete: (name: string) => {
      jar.sets.push({ name, value: "", maxAge: 0 });
    },
  }),
}));

import { GET as me, OPTIONS as mePreflight } from "@/app/api/auth/me/route";
import { isAppUrl, safeNextTarget } from "@/lib/auth/redirect";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, sessionTokenFrom } from "@/lib/auth/sessionCookie";
import { isSsoHost, sessionCookieDomain, ssoUrl } from "@/lib/auth/sso";
import { createSession } from "@/lib/db/sessions";
import { makeUser } from "../admin-helpers";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  jar.values.clear();
  jar.sets.length = 0;
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
});

describe("the ViPlay domain", () => {
  it("covers viplay.in and every subdomain, nothing else", () => {
    for (const host of ["viplay.in", "video.viplay.in", "photo.viplay.in", "a.b.viplay.in", "VIDEO.VIPLAY.IN"]) expect(isSsoHost(host)).toBe(true);
    for (const host of ["evilviplay.in", "viplay.in.evil.com", "viplay.com", "localhost"]) expect(isSsoHost(host)).toBe(false);
  });
  it("app addresses: https only, no user info or other port", () => {
    expect(ssoUrl("https://photo.viplay.in/x?y=1")?.href).toBe("https://photo.viplay.in/x?y=1");
    for (const bad of ["http://photo.viplay.in/", "https://user@photo.viplay.in/", "https://photo.viplay.in:8443/", "https://evil.com/?photo.viplay.in", "javascript:alert(1)", "/editor"]) {
      expect(ssoUrl(bad)).toBeNull();
    }
  });
  it("the cookie is shared only when the app runs on the domain", () => {
    expect(sessionCookieDomain("https://video.viplay.in")).toBe("viplay.in");
    expect(sessionCookieDomain("https://viplay.in")).toBe("viplay.in");
    expect(sessionCookieDomain("http://localhost:3000")).toBeUndefined();
    expect(sessionCookieDomain(undefined)).toBeUndefined();
  });
});

describe("sign-in sends people back to the app they came from", () => {
  it("keeps paths on this site and https addresses on other ViPlay apps", () => {
    expect(safeNextTarget("/editor?x=1")).toBe("/editor?x=1");
    expect(safeNextTarget("https://photo.viplay.in/")).toBe("https://photo.viplay.in/");
    expect(isAppUrl(safeNextTarget("https://photo.viplay.in/"))).toBe(true);
    expect(isAppUrl(safeNextTarget("/editor"))).toBe(false);
  });
  it.each(["https://evil.example", "https://viplay.in.evil.example/", "http://photo.viplay.in/", "//evil.example", "https://photo.viplay.in/\nx"])(
    "refuses %j",
    (next) => {
      expect(safeNextTarget(next, "/fallback")).toBe("/fallback");
    },
  );
});

describe("the session cookie", () => {
  it("reads the shared cookie first, then the host-only one from before", () => {
    const store = (m: Record<string, string>) => ({ get: (n: string) => (n in m ? { value: m[n]! } : undefined) });
    expect(sessionTokenFrom(store({ [SESSION_COOKIE_NAME]: "new", [LEGACY_SESSION_COOKIE_NAME]: "old" }))).toBe("new");
    expect(sessionTokenFrom(store({ [LEGACY_SESSION_COOKIE_NAME]: "old" }))).toBe("old");
    expect(sessionTokenFrom(store({}))).toBeUndefined();
  });
  it("on a ViPlay app it is set for the whole domain; signing out clears both cookies", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://video.viplay.in";
    await setSessionCookie("tok");
    expect(jar.sets).toContainEqual(expect.objectContaining({ name: SESSION_COOKIE_NAME, value: "tok", domain: "viplay.in" }));

    jar.sets.length = 0;
    await clearSessionCookie();
    expect(jar.sets).toContainEqual(expect.objectContaining({ name: SESSION_COOKIE_NAME, domain: "viplay.in", maxAge: 0 }));
    expect(jar.sets).toContainEqual(expect.objectContaining({ name: LEGACY_SESSION_COOKIE_NAME, maxAge: 0 }));
  });
});

describe("/api/auth/me for the other apps", () => {
  it("someone signed in before single sign-on stays signed in and moves to the shared cookie", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://video.viplay.in";
    const user = makeUser();
    const { token } = createSession(user.id);
    jar.values.set(LEGACY_SESSION_COOKIE_NAME, token);

    const body = await (await me(new Request("https://video.viplay.in/api/auth/me"))).json();
    expect(body.user?.id).toBe(user.id);
    expect(jar.sets).toContainEqual(expect.objectContaining({ name: SESSION_COOKIE_NAME, value: token, domain: "viplay.in" }));
    expect(jar.sets).toContainEqual(expect.objectContaining({ name: LEGACY_SESSION_COOKIE_NAME, maxAge: 0 }));
  });

  it("only ViPlay apps may read it from the browser, with the cookie", async () => {
    const fromPhoto = await me(new Request("https://viplay.in/api/auth/me", { headers: { origin: "https://photo.viplay.in" } }));
    expect(fromPhoto.headers.get("access-control-allow-origin")).toBe("https://photo.viplay.in");
    expect(fromPhoto.headers.get("access-control-allow-credentials")).toBe("true");

    const preflight = mePreflight(new Request("https://viplay.in/api/auth/me", { method: "OPTIONS", headers: { origin: "https://photo.viplay.in" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://photo.viplay.in");

    for (const origin of ["https://evil.example", "http://photo.viplay.in"]) {
      const res = await me(new Request("https://viplay.in/api/auth/me", { headers: { origin } }));
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});

describe("test copies keep their own sign-in", () => {
  it("SESSION_COOKIE_NAME renames the cookie (dev.viplay.in must not replace the real sign-in)", async () => {
    vi.resetModules();
    process.env.SESSION_COOKIE_NAME = "viplay_dev_session";
    try {
      const mod = await import("@/lib/auth/sessionCookie");
      expect(mod.SESSION_COOKIE_NAME).toBe("viplay_dev_session");
      expect(mod.sessionTokenFrom({ get: (n: string) => (n === "viplay_dev_session" ? { value: "dev" } : n === "viplay_session" ? { value: "real" } : undefined) })).toBe("dev");
    } finally {
      delete process.env.SESSION_COOKIE_NAME;
      vi.resetModules();
    }
  });
});
