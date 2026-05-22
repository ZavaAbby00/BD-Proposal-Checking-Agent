import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge middleware: only decodes the JWT and applies the `authorized` callback.
// Fine-grained role / disabled-user checks happen server-side (see lib/session).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.).*)"],
};
