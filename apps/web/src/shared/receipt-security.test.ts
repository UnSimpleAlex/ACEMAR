// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  hash,
  signReceipt,
  validReceipt,
  draftEmail,
  receiptPDF,
  // @ts-expect-error Server module is JavaScript with injectable dependencies.
} from "../../../../functions/receipt-core.mjs";
// @ts-expect-error Server module is JavaScript with injectable dependencies.
import { verifyRequest } from "../../../../functions/acemar-verify-receipt.mjs";
// @ts-expect-error Server module is JavaScript with injectable dependencies.
import { handleReceipt } from "../../../../functions/acemar-receipt.mjs";
const secret = "test-only-".repeat(8);
const row = {
  code: "a".repeat(64),
  revision: 1,
  issued_at: "2026-11-02T00:00:00Z",
  content_sha: "b".repeat(64),
  pdf_sha: "c".repeat(64),
  signature: "",
  status: "valid",
  number: 42,
  issued_total: 249,
  snapshot: {
    sale: {
      number: 42,
      created_at: "2026-11-02T00:00:00Z",
      state: "confirmed",
      total: 249,
      received: 250,
    },
    customer_name: "Cliente DEMO",
    lines: [
      {
        id: "one",
        product_name: "Taladro inalámbrico 20 V",
        unit_name: "unidad",
        quantity: 1,
        price: 249,
        subtotal: 249,
      },
    ],
  },
};
describe("boletas verificables", () => {
  it("detecta cambios del archivo, contenido, código y firma", async () => {
    const r = { ...row, signature: await signReceipt(row, secret) };
    expect(await validReceipt(r, secret)).toBe(true);
    for (const field of ["code", "content_sha", "pdf_sha", "signature"])
      expect(
        await validReceipt({ ...r, [field]: "d".repeat(64) }, secret),
      ).toBe(false);
    expect(await hash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("verificador no revela clientes y diferencia un PDF manipulado", async () => {
    const r = { ...row, signature: await signReceipt(row, secret) };
    const deps = { secret, lookup: async () => r };
    const page = await verifyRequest(
      new Request("https://example.invalid/?code=" + r.code),
      deps,
    );
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain("Cliente DEMO");
    expect(page.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    const res = await verifyRequest(
      new Request("https://example.invalid/", {
        method: "POST",
        body: JSON.stringify({ code: r.code, pdfHash: "e".repeat(64) }),
      }),
      deps,
    );
    expect(await res.json()).toEqual({ matches: false, status: "valid" });
    expect(
      (
        await verifyRequest(
          new Request("https://example.invalid/?code=" + r.code),
          { secret, lookup: async () => ({ ...r, pdf_sha: "e".repeat(64) }) },
        )
      ).status,
    ).toBe(404);
  });
  it("no emite ni envía sin sesión y remitente configurado", async () => {
    let calls = 0;
    const userClient = {
      auth: {
        getCurrentUser: async () => ({ data: { user: { id: "user" } } }),
      },
      database: {
        rpc: async () => {
          calls++;
          throw Error("unexpected");
        },
      },
    };
    const deps = {
      userClient,
      admin: {},
      env: () => undefined,
      sendMail: async () => {
        throw Error("unexpected");
      },
    };
    const req = new Request("https://example.invalid/", {
      method: "POST",
      body: JSON.stringify({
        action: "send",
        saleId: crypto.randomUUID(),
        email: "cliente@example.com",
      }),
    });
    expect((await handleReceipt(req, deps)).status).toBe(503);
    expect(calls).toBe(0);
  });
  it("genera PDF con QR y correo multipart con el mismo adjunto", async () => {
    const fontBytes = {
      regular: new Uint8Array(
        await readFile("public/fonts/acemar-report-regular.ttf"),
      ),
      bold: new Uint8Array(
        await readFile("public/fonts/acemar-report-bold.ttf"),
      ),
    };
    const pdf = await receiptPDF(row, { images: {}, fontBytes });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const eml = draftEmail(row, "cliente@example.invalid", pdf);
    const text = new TextDecoder().decode(eml);
    expect(text).toContain("Content-Type: multipart/mixed");
    expect(text).toContain("Content-Type: application/pdf");
    expect(text).toContain("Content-Type: text/html; charset=UTF-8");
    await mkdir(".insforge", { recursive: true });
    await writeFile(".insforge/receipt-qa.pdf", pdf);
    await writeFile(".insforge/receipt-qa.eml", eml);
  });
});
