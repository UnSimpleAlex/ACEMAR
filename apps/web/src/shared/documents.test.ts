// @vitest-environment node
import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { documentPDF, salePDF } from "./documents";
import { workbookBlob } from "./spreadsheets";
it("PDF real legible y paginado para listados largos", async () => {
  const bytes = await documentPDF(
    "Proforma de prueba",
    "ACEMAR",
    Array.from({ length: 100 }, (_, i) => ({
      label: `Material ${i} - descripción para construcción`,
      amount: "S/ 10.00",
    })),
    "Documento interno",
  );
  const parsed = await PDFDocument.load(bytes);
  expect(parsed.getPageCount()).toBeGreaterThan(1);
  expect(parsed.getTitle()).toBe("Proforma de prueba");
});
it("venta genera PDF desde totales y líneas confirmadas", async () => {
  const bytes = await salePDF({
    sale: {
      id: "sale",
      number: 1,
      total: 73,
      received: 100,
      payment: "cash",
      state: "confirmed",
      created_at: "2026-10-31T15:00:00Z",
      customer_id: null,
      actor_id: "admin",
      revision: 0,
    },
    lines: [
      {
        id: "line",
        product_name: "Cemento",
        unit_name: "saco",
        quantity: 2,
        price: 32.5,
        subtotal: 65,
        factor: 1,
        unit_id: "unit",
      },
    ],
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
it("Excel es un XLSX válido y trata texto con = como texto, no fórmula", async () => {
  const blob = await workbookBlob(
    [
      { key: "name", label: "Producto" },
      { key: "total", label: "Total", numeric: true, currency: true },
    ],
    [{ name: '=HYPERLINK("https://invalid.example")', total: 73 }],
  );
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  expect(zip["xl/workbook.xml"]).toBeDefined();
  const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  expect(sheet).not.toMatch(/<f[ >]/);
  expect(sheet).toContain("73");
});
