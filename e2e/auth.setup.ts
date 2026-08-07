import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test as setup } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

const fixtures = [
  {
    email: "responsive-admin@aibot.invalid",
    role: "admin",
    state: "playwright/.auth/admin.json",
  },
  {
    email: "responsive-client@aibot.invalid",
    role: "client",
    state: "playwright/.auth/client.json",
  },
] as const;

setup("provision and authenticate responsive roles", async ({ browser }) => {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.DATABASE_URL) {
    throw new Error(
      "Responsive E2E setup requires Supabase URL/service key and DATABASE_URL",
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient();
  const password = randomBytes(24).toString("base64url");

  try {
    const { data: listed, error: listError } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;

    await mkdir("playwright/.auth", { recursive: true });
    for (const fixture of fixtures) {
      const existing = listed.users.find(
        (user) => user.email === fixture.email,
      );
      const result = existing
        ? await supabase.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          })
        : await supabase.auth.admin.createUser({
            email: fixture.email,
            password,
            email_confirm: true,
          });
      if (result.error || !result.data.user) {
        throw result.error ?? new Error(`Could not provision ${fixture.email}`);
      }

      const userId = result.data.user.id;
      await prisma.user.deleteMany({
        where: { email: fixture.email, NOT: { id: userId } },
      });
      await prisma.user.upsert({
        where: { id: userId },
        create: { id: userId, email: fixture.email, role: fixture.role },
        update: { email: fixture.email, role: fixture.role },
      });

      const page = await browser.newPage();
      await page.goto("/login");
      await page.locator("#pw-email").fill(fixture.email);
      await page.locator("#pw-password").fill(password);
      await page
        .getByRole("button", { name: "Iniciar sesión", exact: true })
        .last()
        .click();
      await expect(page).toHaveURL(/\/$/);
      await page.context().storageState({ path: fixture.state });
      await page.close();
    }
  } finally {
    await prisma.$disconnect();
  }
});
