import { accountsRedirect } from "@/lib/auth/accounts";
import { localSignIn, localSignInAllowed } from "@/lib/auth/devSignIn";

export async function GET(request: Request): Promise<Response> {
  // (on your own computer, `npm run dev`: a local account; see lib/auth/devSignIn.ts)
  if (localSignInAllowed(request)) return localSignIn(request);
  return accountsRedirect("signup", request);
}
