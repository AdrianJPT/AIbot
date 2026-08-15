/**
 * Manual bootstrap for a business's payment catalog (v1: no sync API, see
 * docs/payment-verification-engine.md decision 2 and Engram
 * sdd/payment-verification-engine/decisions #562). Run by hand once per
 * business that turns `paymentsEnabled` on, whenever its price list changes:
 *
 *   SEED_CATALOG_BUSINESS_ID=<id> npx tsx prisma/seed-catalog.ts
 *
 * Reads `prisma/catalog.seed.json` (gitignored, per-environment) shaped as:
 *   [{ "name": "Corte + Barba", "price": 22000, "currency": "MXN" }]
 *
 * `price` is in minor units (cents) — see CatalogItem.price in schema.prisma.
 * Upserts by (businessId, name): re-running with an updated price fixes the
 * existing row instead of creating a duplicate; items removed from the file
 * are left untouched (deactivate manually via `isActive` if needed) rather
 * than deleted, so a bad file can never wipe a business's catalog.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CatalogSeedEntry = {
  name: string;
  price: number;
  currency: string;
  isActive?: boolean;
};

function loadSeedFile(filePath: string): CatalogSeedEntry[] {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} must contain a JSON array of catalog items`);
  }
  return raw.map((entry, i) => {
    if (
      typeof entry?.name !== "string" ||
      !entry.name.trim() ||
      typeof entry?.price !== "number" ||
      !Number.isInteger(entry.price) ||
      entry.price < 0 ||
      typeof entry?.currency !== "string" ||
      !entry.currency.trim()
    ) {
      throw new Error(
        `${filePath}[${i}] is invalid — expected { name: string, price: integer minor units, currency: string }`,
      );
    }
    return {
      name: entry.name.trim(),
      price: entry.price,
      currency: entry.currency.trim().toUpperCase(),
      isActive: entry.isActive ?? true,
    };
  });
}

async function main() {
  const businessId = process.env.SEED_CATALOG_BUSINESS_ID;
  if (!businessId) {
    throw new Error("SEED_CATALOG_BUSINESS_ID env var is required");
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });
  if (!business) {
    throw new Error(`No Business found with id ${businessId}`);
  }

  const filePath = path.resolve(
    process.env.SEED_CATALOG_FILE || "prisma/catalog.seed.json",
  );
  const entries = loadSeedFile(filePath);

  for (const entry of entries) {
    const existing = await prisma.catalogItem.findFirst({
      where: { businessId, name: entry.name },
    });

    if (existing) {
      await prisma.catalogItem.update({
        where: { id: existing.id },
        data: {
          price: entry.price,
          currency: entry.currency,
          isActive: entry.isActive,
        },
      });
      continue;
    }

    await prisma.catalogItem.create({
      data: { businessId, ...entry },
    });
  }

  console.log(`Catalog seed OK: ${entries.length} item(s) for ${business.name}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
