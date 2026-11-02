import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "https://beft7ipm.us-east.insforge.app";
test("POS carga imágenes redirigidas al CDN y alinea las tarjetas", async ({
  page,
}, info) => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const policy = config.headers[0].headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy",
  ).value;
  const imagePolicy = policy
    .split(";")
    .find((p: string) => p.trim().startsWith("img-src"));
  await page.route("**/tests/fixtures/pos.html", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "Content-Security-Policy": imagePolicy,
      },
    });
  });
  // Deterministic redirect, without using any identity or production data.
  await page.route(origin + "/api/storage/**", (route) =>
    route.fulfill({
      status: 302,
      headers: { location: "https://cdn.insforge.dev/pos-test.svg" },
    }),
  );
  await page.route("https://cdn.insforge.dev/pos-test.svg", (route) =>
    route.fulfill({ contentType: "image/svg+xml", path: "public/brand.svg" }),
  );
  await page.route("https://acemar-test.invalid/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"error":"Unauthenticated"}',
    }),
  );
  await page.goto("/tests/fixtures/pos.html");
  await expect(
    page.getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible();
  const cards = page.locator(".product-card");
  await expect(cards).toHaveCount(4);
  const images = cards.locator("img");
  await expect(images).toHaveCount(4);
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            (node as HTMLImageElement).complete &&
            (node as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const controls = await cards.locator("select").evaluateAll((nodes) =>
    nodes.map((node) => ({
      y: node.getBoundingClientRect().y,
      height: node.getBoundingClientRect().height,
    })),
  );
  // The first two products share a row on all three supported viewport sizes.
  expect(Math.abs(controls[0].y - controls[1].y)).toBeLessThan(1);
  expect(controls.every((c) => c.height >= 48)).toBe(true);
  const heading = await page.locator("#page-title").boundingBox();
  const topbar = await page.locator(".topbar").boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(topbar!.height);
  await page
    .getByRole("button", {
      name: "Agregar Alicate universal aislado 8 pulgadas",
    })
    .click();
  if (info.project.name === "Celular")
    await page.getByRole("button", { name: /Ver ticket/ }).click();
  await expect(
    page.getByRole("button", { name: /Cobrar S/ }).filter({ visible: true }),
  ).toBeVisible();
  if (info.project.name === "PC") {
    await page.setViewportSize({ width: 1365, height: 575 });
    await page
      .getByRole("heading", { name: "Punto de venta", exact: true })
      .press("PageDown");
    const pay = await page
      .getByRole("button", { name: /Cobrar S/ })
      .filter({ visible: true })
      .boundingBox();
    expect(pay!.y + pay!.height).toBeLessThanOrEqual(575);
  }
  await page.screenshot({ path: info.outputPath("pos.png"), fullPage: true });
});
