// @vitest-environment node
import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import {
  productColumns,
  productReportRows,
  reportMetrics,
} from "./report-data";
import { workbookBlob } from "./spreadsheets";
import { reportPDF } from "./documents";
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const rows = productReportRows([
  {
    id: "p1",
    name: "Cemento",
    code: "CEM-001",
    base_unit: "Bolsa",
    stock: 3,
    minimum: 4,
    price: 32.5,
    image_url: "image",
  },
  {
    id: "p2",
    name: "Cable",
    code: "CAB-011",
    base_unit: "Metros",
    stock: 0,
    minimum: 5,
    price: 3.5,
  },
]);
it("el inventario conserva tres hojas, tipografías, ubicación y fotos incrustadas", async () => {
  const blob = await workbookBlob(productColumns, rows, "Productos", {
    products: true,
    generatedAt: new Date("2026-10-31T17:00:00Z"),
    assets: { logo: png, images: { p1: png }, missing: 0 },
  });
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const book = strFromU8(zip["xl/workbook.xml"]),
    styles = strFromU8(zip["xl/styles.xml"]),
    sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  for (const name of ["Productos", "Resumen", "Datos"])
    expect(book).toContain(name);
  for (const font of ["Consolas", "Bahnschrift", "Copperplate Gothic Bold"])
    expect(styles).toContain(font);
  expect(styles).toContain("2855D9");
  expect(styles).not.toContain("C81025");
  expect(sheet).toContain('ref="C2:H3"');
  expect(sheet).toContain('r="A12"');
  expect(
    Object.keys(zip).filter((key) => key.startsWith("xl/media/")).length,
  ).toBe(2);
  expect(strFromU8(zip["xl/sharedStrings.xml"])).toContain("Sin imagen");
});
it("calcula valor monetario sin sumar unidades distintas y mantiene los estados de stock", () => {
  expect(rows[0].stock_value).toBe(97.5);
  expect(rows[0].stock_state).toBe("Stock bajo");
  expect(rows[1].stock_state).toBe("Agotado");
  expect(reportMetrics(rows, true)[3].value).toBe(97.5);
  expect(productReportRows([{ stock: 0.1, price: 0.15 }])[0].stock_value).toBe(
    0.02,
  );
});
it("PDF de inventario incluye imágenes, orientación y paginación en listados extensos", async () => {
  const bytes = await reportPDF({
    title: "Inventario de productos",
    subtitle: "ACEMAR",
    columns: productColumns,
    rows: Array.from({ length: 35 }, (_, i) => ({ ...rows[0], id: "p" + i })),
    landscape: true,
    assets: { images: { p0: png }, missing: 0 },
    totals: [{ label: "Valor a precio de venta", value: "S/ 97.50" }],
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
  expect(pdf.getTitle()).toBe("Inventario de productos");
});
it("PDF informa un registro imposible de paginar en vez de cortarlo silenciosamente", async () => {
  await expect(
    reportPDF({
      title: "Registro",
      subtitle: "ACEMAR",
      columns: [{ key: "name", label: "Producto" }],
      rows: [{ name: "Descripción extensa ".repeat(4000) }],
    }),
  ).rejects.toThrow(/demasiado extenso/);
});
