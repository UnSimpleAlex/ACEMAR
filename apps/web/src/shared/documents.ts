import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { money } from "./money";
import type { SaleDetail } from "./types";
/** WinAnsi-safe text for standard PDF fonts. Preserve Spanish; replace unsupported glyphs. */
const text = (value: unknown) =>
  String(value ?? "")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
export { download } from "./download";
export interface DocumentLine {
  label: string;
  amount?: string;
}
export async function documentPDF(
  title: string,
  subtitle: string,
  lines: DocumentLine[],
  footer: string,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(text(title));
  pdf.setAuthor("ACEMAR");
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 0;
  let number = 0;
  const begin = () => {
    number++;
    y = 785;
    page.drawText("ACEMAR", {
      x: 48,
      y,
      size: 24,
      font: bold,
      color: rgb(0.078, 0.141, 0.231),
    });
    y -= 36;
    page.drawText(text(title), { x: 48, y, size: 17, font: bold });
    y -= 24;
    page.drawText(text(subtitle).slice(0, 100), {
      x: 48,
      y,
      size: 10,
      font: regular,
      color: rgb(0.32, 0.39, 0.48),
    });
    y -= 32;
    page.drawText(`Documento interno - Pagina ${number}`, {
      x: 48,
      y: 32,
      size: 9,
      font: regular,
    });
  };
  begin();
  for (const line of lines) {
    const words = text(line.label).split(/\s+/);
    let row = "";
    const chunks: string[] = [];
    for (const word of words) {
      if (
        regular.widthOfTextAtSize((row + " " + word).trim(), 10) > 365 &&
        row
      ) {
        chunks.push(row);
        row = word;
      } else row = (row + " " + word).trim();
    }
    if (row) chunks.push(row);
    if (!chunks.length) chunks.push("");
    for (let i = 0; i < chunks.length; i++) {
      if (y < 88) {
        page = pdf.addPage([595.28, 841.89]);
        begin();
      }
      page.drawText(chunks[i].slice(0, 150), {
        x: 48,
        y,
        size: 10,
        font: regular,
      });
      if (i === 0 && line.amount) {
        const amount = text(line.amount);
        page.drawText(amount, {
          x: 547 - regular.widthOfTextAtSize(amount, 10),
          y,
          size: 10,
          font: regular,
        });
      }
      y -= 17;
    }
    y -= 9;
  }
  if (y < 110) {
    page = pdf.addPage([595.28, 841.89]);
    begin();
  }
  page.drawText(text(footer).slice(0, 120), {
    x: 48,
    y: y - 12,
    size: 9,
    font: regular,
    color: rgb(0.32, 0.39, 0.48),
  });
  return pdf.save();
}
export async function salePDF(detail: SaleDetail) {
  return documentPDF(
    `Venta N. ${detail.sale.number}`,
    `${new Date(detail.sale.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })} | ${detail.sale.state === "cancelled" ? "ANULADA" : "CONFIRMADA"}`,
    [
      ...detail.lines.map((l) => ({
        label: `${l.quantity} ${l.unit_name} - ${l.product_name} (${money(l.price)} c/u)`,
        amount: money(l.subtotal),
      })),
      { label: "TOTAL REGISTRADO", amount: money(detail.sale.total) },
    ],
    "No es un comprobante electronico SUNAT. Conservar para control interno.",
  );
}
