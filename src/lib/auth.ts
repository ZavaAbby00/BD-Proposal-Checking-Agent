import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { resolveAccess } from "@/lib/tenancy";

/**
 * Full Node-runtime auth instance: Edge-safe base config + Prisma adapter +
 * the database-touching sign-in / JWT callbacks.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,

    /** The multi-tenant gate — runs before a user/account is persisted. */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const email = (profile?.email ?? "").toLowerCase();
      if (!email) return false;
      // Google asserts email_verified; reject unverified accounts.
      if (profile && profile.email_verified === false) return false;

      const access = await resolveAccess(email);
      if (!access) return false; // not on any whitelist → denied

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing?.status === "DISABLED") return false;

      return true;
    },

    /** On sign-in, resolve + persist role and organization onto the JWT. */
    async jwt({ token, user }) {
      if (user?.id && user.email) {
        const access = await resolveAccess(user.email.toLowerCase());
        const role = access?.role ?? "REVIEWER";
        const organizationId = access?.organizationId ?? null;
        await prisma.user
          .update({
            where: { id: user.id },
            data: { role, organizationId, lastLoginAt: new Date(), status: "ACTIVE" },
          })
          .catch((e) => console.error("[auth] failed to persist role/org:", e));
        token.uid = user.id;
        token.role = role;
        token.organizationId = organizationId;
      }
      return token;
    },
  },
});
