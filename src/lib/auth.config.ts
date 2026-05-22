import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import Google from "next-auth/providers/google";

/**
 * Edge-safe base auth config — no database adapter, no Prisma. Imported by both
 * the Node-runtime `auth.ts` (which adds the adapter + DB callbacks) and the
 * Edge-runtime middleware (which only needs to decode the JWT).
 */

const PUBLIC_PREFIXES = ["/signin", "/api/auth", "/api/mcp"];

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    Google({
      authorization: {
        params: {
          // Drive read-only is requested so the agent can ingest Google Docs.
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    /** Used by the middleware to gate every route. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return true;
      }
      return Boolean(auth?.user);
    },
    /** Shuttle token fields onto the session — no DB access (Edge-safe). */
    session({ session, token }) {
      if (session.user) {
        const uid = token.uid as string | undefined;
        const role = token.role as Role | undefined;
        const organizationId = token.organizationId as string | null | undefined;
        if (uid) session.user.id = uid;
        session.user.role = role ?? "REVIEWER";
        session.user.organizationId = organizationId ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
