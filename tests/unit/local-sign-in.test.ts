import { describe, expect, it } from "vitest";
import { localSignInAllowed } from "@/lib/auth/devSignIn";
import { GET } from "@/app/login/route";

/** `npm run dev` on your own computer signs in locally; the live site (a production build) never does. */
describe("local sign-in", () => {
  const req = (url: string) => new Request(url);

  it("only under next dev, on this computer (any port)", () => {
    expect(localSignInAllowed(req("http://localhost:3000/login"), "development")).toBe(true);
    expect(localSignInAllowed(req("http://127.0.0.1:4100/login?next=/editor"), "development")).toBe(true);
    expect(localSignInAllowed(req("http://[::1]:3000/login"), "development")).toBe(true);
    expect(localSignInAllowed(req("http://localhost:3000/login"), "production")).toBe(false);
    expect(localSignInAllowed(req("http://localhost:3000/login"), "test")).toBe(false);
    expect(localSignInAllowed(req("https://video.viplay.in/login"), "development")).toBe(false);
    expect(localSignInAllowed(req("http://192.168.1.5:3000/login"), "development")).toBe(false);
  });

  it("elsewhere /login still goes to the website", async () => {
    const res = await GET(req("https://video.viplay.in/login?next=/editor"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/^https:\/\/viplay\.in\/login\?/);
  });
});
