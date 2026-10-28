import { afterEach, describe, expect, it } from "vitest";
import { GET as login } from "@/app/login/route";
import { GET as signup } from "@/app/signup/route";
import robots from "@/app/robots";
import nextConfig from "../../next.config";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
});

describe("accounts are on the website (one sign-in for every ViPlay app)", () => {
  it("sign-in goes to the website and comes back to the same place in the studio", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://video.viplay.in";
    const res = login(new Request("https://video.viplay.in/login?next=%2Feditor%3Ftemplate%3Dworld-news-globe"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://stage.viplay.in/login");
    expect(to.searchParams.get("next")).toBe("https://video.viplay.in/editor?template=world-news-globe");
  });

  it("sign-up keeps ?ref=; a ?next= off the studio falls back to the editor", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://video.viplay.in";
    const to = new URL(signup(new Request("https://video.viplay.in/signup?ref=VDO-AB12&next=https://evil.example")).headers.get("location")!);
    expect(to.pathname).toBe("/signup");
    expect(to.searchParams.get("ref")).toBe("VDO-AB12");
    expect(to.searchParams.get("next")).toBe("https://video.viplay.in/editor");
  });

  it("account, admin and old email links go to the website; the home page is the editor", async () => {
    const redirects = await nextConfig.redirects!();
    const to = (source: string) => redirects.find((r) => r.source === source)?.destination;
    expect(to("/")).toBe("/editor");
    expect(to("/account/:path*")).toBe("https://stage.viplay.in/account/:path*");
    expect(to("/admin")).toBe("https://stage.viplay.in/admin");
    expect(to("/reset-password")).toBe("https://stage.viplay.in/reset-password");
    expect(to("/api/auth/verify-email")).toBe("https://stage.viplay.in/api/auth/verify-email");
  });

  it("search engines skip the studio (the website is the page to find)", () => {
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
