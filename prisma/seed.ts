/**
 * Seed a demo organization so the app is usable on first run.
 *
 *   npm run db:seed
 *
 * Creates a "Demo Organization" with default review settings and the
 * `example.com` domain whitelisted. Sign in as a super-admin (an address listed
 * in SUPERADMIN_EMAILS), then change the domain in Admin -> Access control.
 */
import { DEFAULT_RUBRIC } from "@/engine/rubric";

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* .env optional — environment may already be populated */
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const org = await prisma.organization.upsert({
      where: { slug: "demo" },
      update: {},
      create: {
        name: "Demo Organization",
        slug: "demo",
        whitelistedDomains: { create: { domain: "example.com" } },
        settings: {
          create: {
            geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash",
            temperature: 0.2,
            maxOutputTokens: 16384,
            mandatorySections: DEFAULT_RUBRIC.mandatorySections,
            recommendedSections: DEFAULT_RUBRIC.recommendedSections,
            requirementCategories: DEFAULT_RUBRIC.requirementCategories,
            riskCategories: DEFAULT_RUBRIC.riskCategories,
            scoreWeights: DEFAULT_RUBRIC.scoreWeights,
            verdictThresholds: DEFAULT_RUBRIC.verdictThresholds,
            langfuseEnabled: true,
          },
        },
      },
    });

    console.log(`Seeded organization "${org.name}" (${org.id}).`);
    console.log(
      "Whitelisted domain: example.com — change it in Admin -> Access control.",
    );
    console.log(
      "Sign in with an address listed in SUPERADMIN_EMAILS for platform access.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
