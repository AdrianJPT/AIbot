import { expect, test } from "@playwright/test";

test.describe("responsive foundation", () => {
  test("keeps the login card usable at the narrowest viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/login");

    const card = page.getByRole("heading", { name: "AIbot" }).locator("..");
    const cardBox = await card.boundingBox();

    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(16);
    expect(cardBox!.width).toBeGreaterThanOrEqual(288);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("keeps the login card reachable with a short visible viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto("/login");

    const headingBox = await page
      .getByRole("heading", { name: "AIbot" })
      .boundingBox();
    expect(headingBox).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThanOrEqual(16);
    await expect(
      page.getByRole("button", { name: "Continuar con Google" }),
    ).toBeVisible();
  });
});

test.describe("authenticated responsive foundation", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !["responsive-320", "responsive-390"].includes(testInfo.project.name),
      "Mobile authenticated projects own drawer coverage",
    );
    await page.goto("/");
  });

  test("opens a viewport-safe mobile menu with touch-sized controls", async ({
    page,
  }) => {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width, height: 480 });

    const menuButton = page.getByRole("button", { name: "Abrir menú" });
    const buttonBox = await menuButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

    await menuButton.click();
    const dialog = page.getByRole("dialog", { name: "Menú de navegación" });
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    const logout = page.getByRole("button", { name: "Cerrar sesión" });
    await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeVisible();
  });

  test("navigates from the drawer and closes the overlay", async ({ page }) => {
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("link", { name: "Negocios" }).click();

    await expect(page).toHaveURL(/\/businesses$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});

test("keeps desktop navigation visible without document overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "responsive-desktop",
    "Desktop authenticated project owns sidebar coverage",
  );
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Negocios" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
