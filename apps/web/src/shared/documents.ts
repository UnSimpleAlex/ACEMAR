import type { Font } from "@pdf-lib/fontkit";
import type { ReportFontBytes } from "./report-font";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { money, quantity } from "./money";
import type { SaleDetail } from "./types";
import type { ReportColumn } from "./report-data";
import type { ReportAssets } from "./report-assets";
export { download } from "./download";
const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
const navy = rgb(0.094, 0.129, 0.184),
  blue = rgb(0.157, 0.333, 0.851),
  gray = rgb(0.31, 0.37, 0.45),
  light = rgb(0.96, 0.97, 0.985),
  orange = rgb(0.918, 0.42, 0.196);
function wrap(value: unknown, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safe(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let end = 1;
        while (
          end < rest.length &&
          font.widthOfTextAtSize(rest.slice(0, end + 1), size) <= width
        )
          end++;
        lines.push(rest.slice(0, end));
        rest = rest.slice(end);
      }
      const candidate = (line + " " + rest).trim();
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = rest;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}
export function centeredBaseline(
  top: number,
  height: number,
  font: PDFFont,
  size: number,
  lines = 1,
  leading = size * 1.33,
) {
  const ascent = font.heightAtSize(size, { descender: false });
  const descent = font.heightAtSize(size, { descender: true }) - ascent;
  const block = ascent + descent + (lines - 1) * leading;
  return top - (height - block) / 2 - ascent;
}
export interface ReportPDFOptions {
  title: string;
  subtitle: string;
  fontBytes?: ReportFontBytes;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  footer?: string;
  scope?: string;
  landscape?: boolean;
  assets?: ReportAssets;
  totals?: { label: string; value: string }[];
  verification?: {
    code: string;
    url: string;
    contentHash: string;
    qr: { size: number; data: ArrayLike<number> };
  };
}
export async function reportPDF(options: ReportPDFOptions) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(options.title));
  pdf.setAuthor("ACEMAR");
  pdf.setSubject("Gestión comercial - documento interno");
  let font: PDFFont, bold: PDFFont;
  const inkFonts = new Map<PDFFont, Font>();
  const fontBytes =
    options.fontBytes ??
    (typeof document !== "undefined"
      ? await (await import("./report-font")).reportFont()
      : undefined);
  if (fontBytes) {
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(fontBytes.regular, { subset: true });
    bold = await pdf.embedFont(fontBytes.bold, { subset: true });
    inkFonts.set(font, fontkit.create(fontBytes.regular));
    inkFonts.set(bold, fontkit.create(fontBytes.bold));
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  const inkBaseline = (
    top: number,
    cellHeight: number,
    face: PDFFont,
    size: number,
    lines: string[],
    leading: number,
  ) => {
    const parsed = inkFonts.get(face);
    if (!parsed)
      return centeredBaseline(
        top,
        cellHeight,
        face,
        size,
        lines.length,
        leading,
      );
    const scale = size / parsed.unitsPerEm;
    const boxes = lines.map((line) => parsed.layout(line || " ").bbox);
    const upper = Math.max(
      ...boxes.map(
        (b, i) => (Number.isFinite(b.maxY) ? b.maxY * scale : 0) - i * leading,
      ),
    );
    const lower = Math.min(
      ...boxes.map(
        (b, i) => (Number.isFinite(b.minY) ? b.minY * scale : 0) - i * leading,
      ),
    );
    return top - cellHeight / 2 - (upper + lower) / 2;
  };
  const width = options.landscape ? 841.89 : 595.28,
    height = options.landscape ? 595.28 : 841.89,
    margin = 40,
    usable = width - margin * 2;
  const weights = options.columns.map((c) =>
    c.image
      ? 0.8
      : c.key === "name" || c.key === "product_name" || c.key === "label"
        ? 3.6
        : c.key === "stock_value"
          ? 1.8
          : 1.35,
  );
  const sum = weights.reduce((a, b) => a + b, 0),
    widths = weights.map((w) => (usable * w) / sum);
  let page = pdf.addPage([width, height]),
    y = 0;
  const heading = () => {
    page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: blue });
    for (const [x, t, w, h] of [
      [24, 4, 20, 10],
      [14, 18, 14, 10],
      [32, 18, 12, 10],
      [4, 32, 18, 10],
      [26, 32, 18, 10],
    ])
      page.drawRectangle({
        x: margin + x * 0.6,
        y: height - 30 - (t + h) * 0.6,
        width: w * 0.6,
        height: h * 0.6,
        color: orange,
      });
    page.drawText("ACEMAR", {
      x: margin + 36,
      y: height - 54,
      size: 23,
      font: bold,
      color: navy,
    });
    page.drawText("GESTIÓN COMERCIAL", {
      x: margin + 37,
      y: height - 68,
      size: 7,
      font,
      color: gray,
    });
    y = height - 104;
    for (const line of wrap(options.title, bold, 18, usable)) {
      page.drawText(line, { x: margin, y, size: 18, font: bold, color: navy });
      y -= 23;
    }
    for (const line of wrap(options.subtitle, font, 9, usable)) {
      page.drawText(line, { x: margin, y, size: 9, font, color: gray });
      y -= 13;
    }
    if (options.scope) {
      for (const line of wrap(options.scope, font, 8, usable)) {
        page.drawText(line, { x: margin, y, size: 8, font, color: gray });
        y -= 12;
      }
    }
    y -= 14;
  };
  const tableHeader = () => {
    const headerLines = options.columns.map((c, i) =>
      wrap(c.image ? "FOTO" : c.label, bold, 8, widths[i] - 16),
    );
    const h = Math.max(30, ...headerLines.map((l) => l.length * 11 + 14));
    page.drawRectangle({
      x: margin,
      y: y - h,
      width: usable,
      height: h,
      color: blue,
    });
    let x = margin;
    headerLines.forEach((lines, i) => {
      lines.forEach((line, k) =>
        page.drawText(line, {
          x: x + 8,
          y: inkBaseline(y, h, bold, 8, lines, 11) - k * 11,
          size: 8,
          font: bold,
          color: rgb(1, 1, 1),
        }),
      );
      x += widths[i];
    });
    y -= h;
  };
  const nextPage = () => {
    page = pdf.addPage([width, height]);
    heading();
    tableHeader();
  };
  heading();
  tableHeader();
  for (let rowIndex = 0; rowIndex < options.rows.length; rowIndex++) {
    const row = options.rows[rowIndex];
    const contents = options.columns.map((c, i) =>
      c.image
        ? []
        : wrap(
            c.currency
              ? money(row[c.key])
              : c.numeric
                ? quantity(row[c.key])
                : row[c.key],
            font,
            9,
            widths[i] - 16,
          ),
    );
    const heightNeeded = Math.max(
      options.columns.some((c) => c.image) ? 44 : 32,
      ...contents.map((l) => l.length * 12 + 18),
    );
    const capacity = height - 260;
    if (heightNeeded > capacity)
      throw new Error(
        "Un registro es demasiado extenso para el formato PDF. Reduce su descripción antes de exportar.",
      );
    if (y - heightNeeded < 82) nextPage();
    if (rowIndex % 2 === 0)
      page.drawRectangle({
        x: margin,
        y: y - heightNeeded,
        width: usable,
        height: heightNeeded,
        color: light,
      });
    let x = margin;
    for (let i = 0; i < options.columns.length; i++) {
      const col = options.columns[i];
      if (col.image) {
        const bytes = options.assets?.images[String(row.id)];
        if (bytes) {
          const image = await pdf.embedPng(bytes);
          const side = Math.min(32, widths[i] - 12);
          const fit = image.scaleToFit(side, side);
          page.drawImage(image, {
            x: x + (widths[i] - fit.width) / 2,
            y: y - heightNeeded + (heightNeeded - fit.height) / 2,
            width: fit.width,
            height: fit.height,
          });
        } else
          page.drawText("Sin imagen", {
            x: x + 4,
            y: inkBaseline(y, heightNeeded, font, 6, ["Sin imagen"], 8),
            size: 6,
            font,
            color: gray,
          });
      } else
        contents[i].forEach((line, k) =>
          page.drawText(line, {
            x: col.numeric
              ? x + widths[i] - 8 - font.widthOfTextAtSize(line, 9)
              : x + 8,
            y: inkBaseline(y, heightNeeded, font, 9, contents[i], 12) - k * 12,
            size: 9,
            font,
            color: navy,
          }),
        );
      x += widths[i];
    }
    y -= heightNeeded;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });
  }
  if (options.totals?.length) {
    const boxHeight = options.totals.length * 25 + 20;
    if (y - boxHeight - 20 < 90) {
      page = pdf.addPage([width, height]);
      heading();
    }
    y -= 20;
    const boxWidth = Math.min(300, usable);
    page.drawRectangle({
      x: width - margin - boxWidth,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: light,
    });
    options.totals.forEach((t, i) => {
      const top = y - 22 - i * 25;
      page.drawText(safe(t.label), {
        x: width - margin - boxWidth + 14,
        y: top,
        size: 9,
        font,
        color: gray,
      });
      const label = safe(t.value);
      page.drawText(label, {
        x: width - margin - 14 - bold.widthOfTextAtSize(label, 12),
        y: top,
        size: 12,
        font: bold,
        color: blue,
      });
    });
    y -= boxHeight;
  }
  if (options.verification) {
    const v = options.verification,
      blockHeight = 140;
    if (y - blockHeight - 24 < 85) {
      page = pdf.addPage([width, height]);
      heading();
    }
    y -= 24;
    page.drawRectangle({
      x: margin,
      y: y - blockHeight,
      width: usable,
      height: blockHeight,
      color: light,
    });
    const qrSide = 90,
      quiet = 4,
      cell = qrSide / (v.qr.size + quiet * 2),
      qx = width - margin - qrSide - 12,
      qy = y - qrSide - 12;
    page.drawRectangle({
      x: qx,
      y: qy,
      width: qrSide,
      height: qrSide,
      color: rgb(1, 1, 1),
    });
    for (let row = 0; row < v.qr.size; row++)
      for (let col = 0; col < v.qr.size; col++)
        if (v.qr.data[row * v.qr.size + col])
          page.drawRectangle({
            x: qx + (col + quiet) * cell,
            y: qy + qrSide - (row + quiet + 1) * cell,
            width: cell + 0.02,
            height: cell + 0.02,
            color: navy,
          });
    let ty = y - 20;
    for (const [label, size, b] of [
      ["VERIFICACIÓN DE AUTENTICIDAD", 9, true],
      ["Código: " + v.code, 7, false],
      ["SHA-256 del contenido: " + v.contentHash, 6, false],
      ["Escanea el QR y compara el PDF con el original.", 7, false],
    ] as const) {
      for (const line of wrap(label, b ? bold : font, size, usable - 128)) {
        page.drawText(line, {
          x: margin + 12,
          y: ty,
          size,
          font: b ? bold : font,
          color: navy,
        });
        ty -= 11;
      }
      ty -= 5;
    }
    y -= blockHeight;
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: margin, y: 65 },
      end: { x: width - margin, y: 65 },
      thickness: 0.7,
      color: rgb(0.84, 0.87, 0.91),
    });
    wrap(options.footer ?? "Documento interno de ACEMAR.", font, 7, usable - 85)
      .slice(0, 3)
      .forEach((line, k) =>
        p.drawText(line, {
          x: margin,
          y: 50 - k * 10,
          size: 7,
          font,
          color: gray,
        }),
      );
    p.drawText(`${index + 1} / ${pages.length}`, {
      x: width - margin - 30,
      y: 50,
      size: 8,
      font,
      color: gray,
    });
  });
  return pdf.save();
}
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
  return reportPDF({
    title,
    subtitle,
    columns: [
      { key: "label", label: "DESCRIPCIÓN" },
      { key: "amount", label: "IMPORTE" },
    ],
    rows: lines.map((l) => ({ ...l })),
    footer,
  });
}
export async function salePDF(
  detail: SaleDetail,
  fontBytes?: ReportFontBytes,
  assets?: ReportAssets,
) {
  return reportPDF({
    fontBytes,
    assets,
    title: `Venta N. ${detail.sale.number}`,
    subtitle: `${new Date(detail.sale.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })} | ${detail.sale.state === "cancelled" ? "ANULADA" : "CONFIRMADA"} | ${detail.sale.payment === "cash" ? "Contado" : "Crédito"}`,
    columns: [
      { key: "image_url", label: "FOTO", image: true },
      { key: "product_name", label: "PRODUCTO" },
      { key: "unit_name", label: "UNIDAD" },
      { key: "quantity", label: "CANTIDAD", numeric: true },
      { key: "price", label: "PRECIO UNIT.", numeric: true, currency: true },
      { key: "subtotal", label: "IMPORTE", numeric: true, currency: true },
    ],
    rows: detail.lines.map((l) => ({ ...l })),
    totals: [
      { label: "TOTAL REGISTRADO", value: money(detail.sale.total) },
      ...(detail.sale.received !== null
        ? [{ label: "Recibido", value: money(detail.sale.received) }]
        : []),
    ],
    footer: "Documento interno. No es un comprobante electrónico SUNAT.",
  });
}
