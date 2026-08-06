import { mkdir } from "node:fs/promises";
import { expect, test as setup } from "@playwright/test";

const AUTH_STATE = "playwright/.auth/admin.json";

setup("authenticate admin", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for authenticated responsive projects",
    );
  }

  await page.goto("/login");
  await page.locator("#pw-email").fill(email);
  await page.locator("#pw-password").fill(password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/$/);

  await mkdir("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_STATE });
});
