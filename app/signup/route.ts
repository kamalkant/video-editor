import { accountsRedirect } from "@/lib/auth/accounts";

export function GET(request: Request) {
  return accountsRedirect("signup", request);
}
