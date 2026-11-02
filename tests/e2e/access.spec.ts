import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.route("https://acemar-test.invalid/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthenticated" }),
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-CSRF-Token",
      },
    }),
  );
});
test("acceso responsive, validación y accesibilidad", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bienvenido a ACEMAR" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo de trabajo")).toBeVisible();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByText("Ingresa un correo válido.")).toBeVisible();
  await expect(page.getByText("Ingresa tu contraseña.")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("acceso.png"),
    fullPage: true,
  });
});

test("recuperación accesible sin revelar si existe el correo", async ({
  page,
}) => {
  await page.route(
    "https://acemar-test.invalid/api/auth/email/send-reset-password",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Instructions sent" }),
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-CSRF-Token",
        },
      }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Olvidé mi contraseña" }).click();
  const dialog = page.getByRole("dialog", { name: "Recuperar acceso" });
  await dialog.getByLabel("Correo de trabajo").fill("prueba@example.invalid");
  await dialog.getByRole("button", { name: "Solicitar código" }).click();
  await expect(dialog.getByText(/Si existe una cuenta/)).toBeVisible();
  await expect(dialog.getByLabel("Código de recuperación")).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
