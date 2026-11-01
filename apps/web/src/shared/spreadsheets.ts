import type { CellObject, SheetData, Sheet } from "write-excel-file/browser";
import { reportMetrics, type ReportColumn } from "./report-data";
import type { ReportAssets } from "./report-assets";
export type ExportColumn = ReportColumn;
export interface ReportOptions {
  products?: boolean;
  scope?: string;
  generatedAt?: Date;
  assets?: ReportAssets;
}
const navy = "#18212F",
  blue = "#2855D9",
  muted = "#4A5568";
const text = (value: unknown, extra: Partial<CellObject> = {}): CellObject => ({
  value: String(value ?? ""),
  type: String,
  fontFamily: "Consolas",
  fontSize: 10,
  textColor: navy,
  alignVertical: "center",
  ...extra,
});
export async function workbookBlob(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  sheet = "ACEMAR",
  options: ReportOptions = {},
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const count = Math.max(8, columns.length);
  const blank = (height = 18): CellObject[] =>
    Array.from({ length: count }, () => text("", { height }));
  const merged = (
    value: unknown,
    start: number,
    span: number,
    extra: Partial<CellObject> = {},
  ) => {
    const row = blank();
    row[start] = text(value, { columnSpan: span, ...extra });
    return row;
  };
  const data: SheetData = [];
  data.push(blank(9).map((c) => ({ ...c, backgroundColor: navy })));
  const title = blank(32);
  title[2] = text(
    options.products ? "INVENTARIO DE PRODUCTOS" : sheet.toUpperCase(),
    {
      columnSpan: count - 2,
      rowSpan: 2,
      fontFamily: "Copperplate Gothic Bold",
      fontSize: 21,
      fontWeight: "bold",
    },
  );
  data.push(title, blank(32));
  const stamp = (options.generatedAt ?? new Date()).toLocaleString("es-PE", {
    timeZone: "America/Lima",
  });
  data.push(
    merged(`ACEMAR    /    ${sheet.toUpperCase()}    /    ${stamp}`, 0, count, {
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
      height: 25,
    }),
  );
  data.push(
    blank(4).map((c) => ({ ...c, backgroundColor: blue })),
    blank(9),
  );
  const metrics = reportMetrics(rows, !!options.products);
  const labels = blank(25),
    values = blank(25);
  metrics.forEach((m, i) => {
    labels[i * 2] = text(m.label, {
      columnSpan: 2,
      fontFamily: "Bahnschrift",
      fontSize: 10,
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: blue,
      align: "center",
      wrap: true,
    });
    values[i * 2] =
      typeof m.value === "number"
        ? {
            ...text(""),
            value: m.value,
            type: Number,
            columnSpan: 2,
            rowSpan: 2,
            fontSize: 19,
            fontWeight: "bold",
            textColor: blue,
            align: "center",
            format: m.currency ? '"S/ "#,##0.00' : "0",
          }
        : text(m.value, {
            columnSpan: 2,
            rowSpan: 2,
            fontSize: 13,
            fontWeight: "bold",
            textColor: blue,
            align: "center",
          });
  });
  data.push(labels, values, blank(21));
  data.push(
    merged("REPORTE DE CONTROL INTERNO", 0, count, {
      fontFamily: "Bahnschrift",
      fontSize: 9,
      textColor: muted,
      height: 14,
    }),
  );
  data.push(
    merged(
      options.scope ?? "Página visible con los filtros aplicados",
      0,
      count,
      { fontSize: 10, textColor: muted, height: 30, wrap: true },
    ),
  );
  data.push(
    Array.from({ length: count }, (_, i) =>
      text(columns[i]?.label ?? "", {
        fontFamily: "Bahnschrift",
        fontSize: 11,
        fontWeight: "bold",
        textColor: "#FFFFFF",
        backgroundColor: blue,
        align: "center",
        wrap: true,
        height: 30,
      }),
    ),
  );
  rows.forEach((row, index) =>
    data.push(
      Array.from({ length: count }, (_, i) => {
        const c = columns[i],
          value = c ? row[c.key] : "";
        const style: Partial<CellObject> = {
          backgroundColor: index % 2 ? "#F5F7FA" : "#FFFFFF",
          height: options.products ? 58 : 32,
          wrap: true,
          bottomBorderColor: "#E5E9EF",
          bottomBorderStyle: "hair",
          align: c?.numeric ? "right" : i === 1 ? "left" : "center",
        };
        if (c?.image)
          return text(
            options.assets?.images[String(row.id)] ? "" : "Sin imagen",
            style,
          );
        if (
          c?.numeric &&
          value !== null &&
          value !== "" &&
          Number.isFinite(Number(value))
        )
          return {
            ...text("", style),
            value: Number(value),
            type: Number,
            format: c.currency
              ? '"S/ "#,##0.00'
              : Number.isInteger(Number(value))
                ? "#,##0"
                : "#,##0.######",
          };
        return text(
          typeof value === "boolean" ? (value ? "Sí" : "No") : value,
          style,
        );
      }),
    ),
  );
  data.push(
    blank(12),
    merged("ACEMAR · Gestión comercial · Importes en soles (PEN).", 0, count, {
      fontSize: 9,
      textColor: muted,
      height: 24,
    }),
  );
  const images = [];
  if (options.assets?.logo)
    images.push({
      content: new Blob([new Uint8Array(options.assets.logo).buffer]),
      contentType: "image/png",
      width: 220,
      height: 52,
      dpi: 96,
      anchor: { row: 2, column: 1 },
      offsetX: 4,
      offsetY: 8,
      title: "ACEMAR",
    });
  if (options.products)
    rows.forEach((r, i) => {
      const image = options.assets?.images[String(r.id)];
      if (image)
        images.push({
          content: new Blob([new Uint8Array(image).buffer]),
          contentType: "image/png",
          width: 64,
          height: 64,
          dpi: 96,
          anchor: { row: 13 + i, column: 1 },
          offsetX: 4,
          offsetY: 6,
          title: String(r.name),
        });
    });
  // The XLSX writer requires all cells covered by a merge to be empty.
  data.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (
        !cell ||
        typeof cell !== "object" ||
        !("columnSpan" in cell || "rowSpan" in cell)
      )
        return;
      const styled = cell as CellObject;
      for (let dy = 0; dy < (styled.rowSpan ?? 1); dy++)
        for (let dx = 0; dx < (styled.columnSpan ?? 1); dx++) {
          if (dx || dy) data[r + dy][c + dx] = null;
        }
    }),
  );
  const main: Sheet<Blob> = {
    data,
    sheet: sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
    columns: Array.from({ length: count }, (_, i) => ({
      width: options.products
        ? ([10, 38, 21, 25, 18, 26, 25, 22][i] ?? 24)
        : i === 1
          ? 38
          : 24,
    })),
    showGridLines: false,
    orientation: "landscape",
    stickyRowsCount: 12,
    images,
  };
  const sheets: Sheet<Blob>[] = [main];
  if (options.products) {
    const summary: SheetData = Array.from({ length: 28 }, () =>
      Array.from({ length: 8 }, () => text("", { height: 24 })),
    );
    summary[1][0] = text("RESUMEN DEL INVENTARIO", {
      columnSpan: 8,
      fontFamily: "Copperplate Gothic Bold",
      fontSize: 21,
      fontWeight: "bold",
      height: 36,
    });
    summary[3][0] = text(`ACEMAR    /    ${stamp}`, {
      columnSpan: 8,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
    });
    summary[4] = blank(4).map((c) => ({ ...c, backgroundColor: blue }));
    summary[6] = labels.map((c) => (c && typeof c === "object" ? { ...c } : c));
    summary[7] = values.map((c) => (c && typeof c === "object" ? { ...c } : c));
    summary[10][0] = text("DISPONIBILIDAD", {
      columnSpan: 4,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: blue,
    });
    summary[10][4] = text("MAYOR VALOR A PRECIO DE VENTA", {
      columnSpan: 4,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: blue,
    });
    ["Disponible", "Stock bajo", "Agotado"].forEach((state, i) => {
      summary[12 + i][0] = text(state, { columnSpan: 2 });
      summary[12 + i][2] = {
        value: rows.filter((r) => r.stock_state === state).length,
        type: Number,
        fontFamily: "Consolas",
        fontSize: 12,
      };
    });
    [...rows]
      .sort((a, b) => Number(b.stock_value) - Number(a.stock_value))
      .slice(0, 5)
      .forEach((r, i) => {
        summary[12 + i][4] = text(r.name, {
          columnSpan: 3,
          wrap: true,
          height: 36,
        });
        summary[12 + i][7] = {
          value: Number(r.stock_value),
          type: Number,
          format: '"S/ "#,##0.00',
          fontFamily: "Consolas",
          fontSize: 10,
        };
      });
    summary[20][0] = text(
      options.scope ?? "Página visible con los filtros aplicados",
      { columnSpan: 8, fontSize: 9, textColor: muted, wrap: true },
    );
    summary[22][0] = text(
      "Valor a precio de venta; no representa costo contable. No se suman unidades distintas.",
      { columnSpan: 8, fontSize: 9, textColor: muted, wrap: true, height: 32 },
    );
    summary.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (
          !cell ||
          typeof cell !== "object" ||
          !("columnSpan" in cell || "rowSpan" in cell)
        )
          return;
        const item = cell as CellObject;
        for (let dy = 0; dy < (item.rowSpan ?? 1); dy++)
          for (let dx = 0; dx < (item.columnSpan ?? 1); dx++)
            if (dx || dy) summary[r + dy][c + dx] = null;
      }),
    );
    const rawColumns: ExportColumn[] = [
      { key: "code", label: "Código" },
      { key: "name", label: "Producto" },
      { key: "base_unit", label: "Unidad base" },
      { key: "price", label: "Precio base", numeric: true, currency: true },
      { key: "stock", label: "Disponible", numeric: true },
      { key: "minimum", label: "Mínimo", numeric: true },
      { key: "stock_state", label: "Estado" },
      {
        key: "stock_value",
        label: "Valor a precio de venta",
        numeric: true,
        currency: true,
      },
    ];
    const raw: SheetData = [
      rawColumns.map((c) =>
        text(c.label, {
          fontFamily: "Bahnschrift",
          fontWeight: "bold",
          textColor: "#FFFFFF",
          backgroundColor: blue,
          height: 30,
        }),
      ),
      ...rows.map((r) =>
        rawColumns.map((c) =>
          c.numeric
            ? {
                value: Number(r[c.key]),
                type: Number,
                fontFamily: "Consolas",
                format: c.currency
                  ? '"S/ "#,##0.00'
                  : Number.isInteger(Number(r[c.key]))
                    ? "#,##0"
                    : "#,##0.######",
              }
            : text(r[c.key]),
        ),
      ),
    ];
    sheets.push(
      {
        sheet: "Resumen",
        data: summary,
        showGridLines: false,
        orientation: "landscape",
        columns: Array.from({ length: 8 }, () => ({ width: 22 })),
      },
      {
        sheet: "Datos",
        data: raw,
        showGridLines: false,
        stickyRowsCount: 1,
        columns: rawColumns.map((c) => ({ width: c.key === "name" ? 45 : 24 })),
      },
    );
  }
  return writeXlsxFile(sheets, {
    fontFamily: "Consolas",
    fontSize: 10,
  }).toBlob();
}
