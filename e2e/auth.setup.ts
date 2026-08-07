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

const RESPONSIVE_CONVERSATION_ID = "responsive-conversation";

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
      const authResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/auth/v1/token") &&
          response.request().method() === "POST",
      );
      const authenticatedNavigationPromise = page.waitForURL(
        (target) => target.pathname === "/",
        { waitUntil: "domcontentloaded" },
      );
      await page
        .getByRole("button", { name: "Iniciar sesión", exact: true })
        .last()
        .click();
      const authResponse = await authResponsePromise;
      expect(authResponse.ok()).toBe(true);
      await authenticatedNavigationPromise;
      await page.context().storageState({ path: fixture.state });
      await page.close();
    }

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: fixtures[0].email },
    });
    await prisma.business.upsert({
      where: { id: "responsive-business" },
      create: {
        id: "responsive-business",
        name: "Responsive Business",
        ownerId: admin.id,
        systemPrompt: "Be helpful.",
        welcomeMessage: "Welcome",
        businessInfo: {},
      },
      update: { ownerId: admin.id },
    });
    await prisma.phoneNumber.upsert({
      where: { id: "responsive-phone-number" },
      create: {
        id: "responsive-phone-number",
        businessId: "responsive-business",
        phoneNumberId: "responsive-phone-number-meta",
        displayPhone: "+51 999 000 111",
      },
      update: { businessId: "responsive-business" },
    });
    await prisma.conversation.upsert({
      where: { id: RESPONSIVE_CONVERSATION_ID },
      create: {
        id: RESPONSIVE_CONVERSATION_ID,
        businessId: "responsive-business",
        phoneNumberId: "responsive-phone-number",
        customerPhone: "+51999000222",
        customerName: "Responsive Customer",
      },
      update: {
        businessId: "responsive-business",
        phoneNumberId: "responsive-phone-number",
        customerName: "Responsive Customer",
        status: "active",
      },
    });
    await prisma.message.upsert({
      where: { id: "responsive-message" },
      create: {
        id: "responsive-message",
        conversationId: RESPONSIVE_CONVERSATION_ID,
        role: "user",
        content: "Responsive fixture message",
        sentBy: "customer",
      },
      update: { content: "Responsive fixture message" },
    });
  } finally {
    await prisma.$disconnect();
  }
});
