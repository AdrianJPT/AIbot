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
    const workspace = page.getByRole("region", {
      name: "Espacio de conversaciones",
    });
    const [mainBox, workspaceBox] = await Promise.all([
      page.getByRole("main").boundingBox(),
      workspace.boundingBox(),
    ]);
    expect(mainBox).not.toBeNull();
    expect(workspaceBox).not.toBeNull();
    expect(
      mainBox!.y + mainBox!.height - (workspaceBox!.y + workspaceBox!.height),
    ).toBeLessThanOrEqual(16);
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
    const summaryAction = page.getByRole("button", {
      name: "Memoria del cliente",
    });
    const appointmentsAction = page.getByRole("button", {
      name: "Citas del cliente",
    });
    for (const control of [
      back,
      summaryAction,
      appointmentsAction,
      page.getByRole("link", { name: "Descargar conversación (.txt)" }),
      page.getByRole("button", { name: "Archivar conversación" }),
      page.getByRole("button", { name: "Eliminar conversación" }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await summaryAction.click();
    await expect(
      page.getByRole("dialog", { name: "Memoria del cliente" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await appointmentsAction.click();
    await expect(page.getByRole("dialog", { name: "Citas" })).toBeVisible();
    await page.keyboard.press("Escape");

    const messageRegion = page.getByRole("log", {
      name: "Mensajes de la conversación",
    });
    const scrollMetrics = await messageRegion.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(
      scrollMetrics.clientHeight,
    );
    await messageRegion.evaluate((element) =>
      element.scrollTo({ top: element.scrollHeight }),
    );
    await expect(
      messageRegion.getByText("Responsive latest message"),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(
      0,
    );
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

test("@mobile presents business and admin collections as actionable cards", async ({
  page,
}) => {
  await page.goto("/businesses");
  const businesses = page.getByRole("list", { name: "Negocios" });
  const business = businesses
    .getByRole("listitem")
    .filter({ hasText: "Responsive Business" });
  await expect(business).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await expectTouchTarget(business.getByRole("link", { name: "Ver números" }));
  await expectTouchTarget(business.getByRole("link", { name: "Editar" }));
  await business.getByRole("link", { name: "Ver números" }).click();
  await expect(page).toHaveURL(/\/businesses\/responsive-business$/);
  expect(await hasNoDocumentOverflow(page)).toBe(true);

  await page.goto("/admin/clients");
  const clients = page.getByRole("list", { name: "Clientes" });
  await expect(clients).toBeVisible();
  await clients
    .getByRole("link", { name: "responsive-admin@aibot.invalid" })
    .click();
  const clientBusinesses = page.getByRole("list", {
    name: "Negocios del cliente",
  });
  const assignedBusiness = clientBusinesses
    .getByRole("listitem")
    .filter({ hasText: "Responsive Business" });
  await expect(assignedBusiness).toBeVisible();
  for (const action of [
    "Ver conversaciones",
    "Editar",
    "Agregar número",
    "Desactivar",
    "Quitar",
  ]) {
    await expectTouchTarget(
      assignedBusiness.getByRole(
        action === "Ver conversaciones" || action === "Editar"
          ? "link"
          : "button",
        { name: action },
      ),
    );
  }
  expect(await hasNoDocumentOverflow(page)).toBe(true);

  await page.goto("/admin/clients");
  await page
    .getByRole("link", { name: "responsive-client@aibot.invalid" })
    .click();
  await expect(
    page.getByText("Este cliente todavía no tiene negocios."),
  ).toBeVisible();
});

test("@mobile contains business and invite forms plus technical identifiers", async ({
  page,
}) => {
  await page.goto("/businesses/responsive-business");
  await expect(page.getByText("responsive-phone-number-meta")).toBeVisible();
  expect(await hasNoDocumentOverflow(page)).toBe(true);

  await page.goto("/businesses/responsive-business/edit");
  for (const input of ["model", "visionModel", "audioModel"]) {
    const box = await page.locator(`#${input}`).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(await hasNoDocumentOverflow(page)).toBe(true);

  await page.goto("/admin/clients/new");
  await expectTouchTarget(
    page.getByRole("button", { name: "Responsive Business" }),
  );
  await page.locator("#businessMode").selectOption("new");
  await expect(page.locator("#systemPrompt")).toBeVisible();
  expect(await hasNoDocumentOverflow(page)).toBe(true);
});

test("@desktop preserves business and admin tables", async ({ page }) => {
  await page.goto("/businesses");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("list", { name: "Negocios" })).toBeHidden();

  await page.goto("/admin/clients");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("list", { name: "Clientes" })).toBeHidden();
  await page
    .getByRole("link", { name: "responsive-admin@aibot.invalid" })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Negocios del cliente" }),
  ).toBeHidden();
  expect(await hasNoDocumentOverflow(page)).toBe(true);
});

test("@mobile presents appointment cards with equivalent actions and empty state", async ({
  page,
}, testInfo) => {
  await page.goto("/appointments");
  const viewport = testInfo.project.name.endsWith("320") ? "320" : "390";
  const appointments = page.getByRole("list", { name: "Citas" });
  const appointment = appointments
    .getByRole("listitem")
    .filter({ hasText: `Responsive Customer ${viewport}` });
  await expect(appointment).toContainText("pending");
  await expect(page.getByRole("table")).toBeHidden();
  for (const action of ["Confirmar", "Cancelar", "Borrar"]) {
    await expectTouchTarget(appointment.getByRole("button", { name: action }));
  }
  await appointment.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Cita actualizada")).toBeVisible();
  await expect(appointment).toContainText("confirmed");
  expect(await hasNoDocumentOverflow(page)).toBe(true);

  await page.goto("/appointments?date=1900-01-01");
  await expect(page.getByText("No hay citas.")).toBeVisible();
});

test("@mobile stacks appointment filters and new-appointment fields", async ({
  page,
}) => {
  await page.goto("/appointments");
  for (const field of [
    page.locator('select[name="businessId"]'),
    page.locator('select[name="status"]'),
    page.locator('input[name="date"]'),
    page.getByRole("button", { name: "Filtrar" }),
  ]) {
    const box = await field.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }

  await page.goto("/appointments/new");
  const [formBox, dateBox, timeBox] = await Promise.all([
    page.getByRole("form").boundingBox(),
    page.locator("#date").boundingBox(),
    page.locator("#time").boundingBox(),
  ]);
  expect(formBox).not.toBeNull();
  expect(dateBox!.width).toBeGreaterThanOrEqual(formBox!.width - 2);
  expect(timeBox!.width).toBeGreaterThanOrEqual(formBox!.width - 2);
  expect(await hasNoDocumentOverflow(page)).toBe(true);
});

test("@desktop preserves the appointment table", async ({ page }) => {
  await page.goto("/appointments");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("list", { name: "Citas" })).toBeHidden();
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

async function expectTouchTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
