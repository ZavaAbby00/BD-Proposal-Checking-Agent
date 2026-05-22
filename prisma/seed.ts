/**
 * Seed a demo organization so the app is usable on first run.
 *
 *   npm run db:seed
 *
 * Creates the "Elitery" organization with default review settings and the
 * `elitery.com` domain whitelisted. Super-admins (from SUPERADMIN_EMAILS) then
 * sign in with both platform access and membership of this organization.
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
      where: { slug: "elitery" },
      update: {},
      create: {
        name: "Elitery",
        slug: "elitery",
        whitelistedDomains: { create: { domain: "elitery.com" } },
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
    console.log("Whitelisted domain: elitery.com");
    console.log(
      "Anyone on SUPERADMIN_EMAILS signs in as a platform super-admin; " +
        "anyone with an @elitery.com Google account joins this organization.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
