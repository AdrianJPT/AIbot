import { expect, test } from "@playwright/test";

test.describe("responsive foundation", () => {
  test("@public keeps the login card usable at the narrowest viewport", async ({
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

  test("@public keeps the login card reachable with a short visible viewport", async ({
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
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("@mobile opens a viewport-safe menu with touch controls", async ({
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
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => (await dialog.boundingBox())?.x ?? -1)
      .toBeGreaterThanOrEqual(0);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    const logout = page.getByRole("button", { name: "Cerrar sesión" });
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeVisible();
  });

  test("@mobile navigates from the drawer and closes it", async ({ page }) => {
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

  test("@mobile moves from the conversation list to a usable compact thread and back", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: page.viewportSize()!.width,
      height: 480,
    });
    await page.goto("/conversations");
    expect(await hasNoDocumentOverflow(page)).toBe(true);
    await page.getByRole("link", { name: /Responsive Customer/ }).click();

    await expect(page).toHaveURL(/\/conversations\/responsive-conversation$/);
    const back = page.getByRole("link", { name: "Volver a conversaciones" });
    await expect(back).toBeVisible();
    const composer = page.getByPlaceholder(/Escribí un mensaje/);
    await composer.focus();
    await expect(composer).toBeFocused();
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(480);
    for (const control of [
      back,
      page.getByRole("link", { name: "Descargar conversación (.txt)" }),
      page.getByRole("button", { name: "Archivar conversación" }),
      page.getByRole("button", { name: "Eliminar conversación" }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const handoff = page.getByRole("switch", { name: "Bot activo" });
    await handoff.click();
    await expect(
      page.getByRole("dialog", { name: /atención humana/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(await hasNoDocumentOverflow(page)).toBe(true);

    await back.click();
    await expect(page).toHaveURL(/\/conversations$/);
    await expect(
      page.getByRole("link", { name: /Responsive Customer/ }),
    ).toBeVisible();
  });
});

test("@client hides privileged navigation from a mobile client", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menú" }).click();

  await expect(page.getByRole("link", { name: "Negocios" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Eventos" })).toHaveCount(0);
});

test("@desktop keeps desktop navigation visible without overflow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Negocios" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("@desktop preserves the two-pane conversation view", async ({ page }) => {
  await page.goto("/conversations/responsive-conversation");

  await expect(
    page.getByRole("heading", { name: "Conversaciones" }),
  ).toBeVisible();
  await expect(
    page.getByText("Responsive Customer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Volver a conversaciones" }),
  ).toBeHidden();
  expect(await hasNoDocumentOverflow(page)).toBe(true);
});

test("@desktop keeps a tall dialog inside the viewport", async ({ page }) => {
  await page.goto("/admin/clients");
  await page
    .getByRole("link", { name: "responsive-client@aibot.invalid" })
    .click();
  await page.setViewportSize({ width: 320, height: 240 });
  await page.getByRole("button", { name: "Asociar negocio" }).click();

  const dialog = page.getByRole("dialog", { name: "Asociar negocio" });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.height).toBeLessThanOrEqual(240);
  const close = page.getByRole("button", { name: "Close" });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeVisible();
});

async function hasNoDocumentOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );
}
