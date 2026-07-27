import { expect, test } from "@playwright/test";

/**
 * `src/middleware.ts` is the only thing between an anonymous visitor and the
 * whole panel. Every unit test mocks the Supabase session away, so this is
 * the one place the real redirect is exercised end to end — including the
 * matcher, which is easy to break by adding an exclusion too broadly.
 */
test.describe("auth gate", () => {
  const protectedPaths = [
    "/",
    "/businesses",
    "/conversations",
    "/appointments",
    "/admin/clients",
    "/settings/credentials",
  ];

  for (const path of protectedPaths) {
    test(`redirects an anonymous visitor from ${path} to /login`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("keeps the healthcheck public", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("does not redirect the webhook endpoint to /login", async ({
    request,
  }) => {
    // Meta calls this without a session. A 401/403/405 is fine; a redirect to
    // the login page would mean the middleware matcher swallowed it.
    const response = await request.post("/api/webhook", {
      data: {},
      failOnStatusCode: false,
    });

    expect(response.url()).not.toContain("/login");
  });
});
