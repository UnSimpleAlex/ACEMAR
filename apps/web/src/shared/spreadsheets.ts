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
  options.assets?.icons
    ?.slice(0, 4)
    .forEach((icon, i) =>
      images.push({
        content: new Blob([new Uint8Array(icon).buffer]),
        contentType: "image/png",
        width: 30,
        height: 30,
        dpi: 96,
        anchor: { row: 8, column: i * 2 + 1 },
        offsetX: 10,
        offsetY: 4,
        title: `Indicador ${metrics[i].label}`,
      }),
    );
  if (options.assets?.icons?.[4])
    images.push({
      content: new Blob([new Uint8Array(options.assets.icons[4]).buffer]),
      contentType: "image/png",
      width: 24,
      height: 24,
      dpi: 96,
      anchor: { row: 11, column: 1 },
      offsetX: 12,
      offsetY: 7,
      title: "Búsqueda aplicada",
    });
  data[10][0] = text("", { height: 30 });
  data[10][1] = text(
    options.scope ?? "Página visible con los filtros aplicados",
    {
      columnSpan: count - 1,
      fontSize: 10,
      textColor: muted,
      height: 30,
      wrap: true,
    },
  );
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
    const summary: SheetData = Array.from({ length: 46 }, () =>
      Array.from({ length: 17 }, () => text("", { height: 24 })),
    );
    summary[0] = summary[0].map((c) => ({
      ...(c as CellObject),
      backgroundColor: navy,
      height: 9,
    }));
    summary[1][1] = text("RESUMEN DEL INVENTARIO", {
      columnSpan: 15,
      rowSpan: 2,
      fontFamily: "Copperplate Gothic Bold",
      fontSize: 21,
      fontWeight: "bold",
      align: "center",
      height: 35,
    });
    summary[3][1] = text(`ACEMAR    /    ${stamp}`, {
      columnSpan: 15,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
      height: 26,
    });
    summary[4][1] = text("", {
      columnSpan: 15,
      backgroundColor: blue,
      height: 4,
    });
    const positions = [1, 5, 9, 13];
    metrics.forEach((m, i) => {
      const col = positions[i];
      summary[6][col] = text(m.label, {
        columnSpan: 3,
        fontFamily: "Bahnschrift",
        fontSize: 10,
        fontWeight: "bold",
        textColor: "#FFFFFF",
        backgroundColor: blue,
        align: "center",
        wrap: true,
        height: 25,
      });
      summary[7][col] =
        typeof m.value === "number"
          ? {
              ...text(""),
              value: m.value,
              type: Number,
              columnSpan: 3,
              rowSpan: 2,
              fontSize: 19,
              fontWeight: "bold",
              textColor: blue,
              align: "center",
              format: m.currency ? '"S/ "#,##0.00' : "0",
              height: 21,
            }
          : text(m.value, {
              columnSpan: 3,
              rowSpan: 2,
              fontSize: 13,
              fontWeight: "bold",
              textColor: blue,
              align: "center",
              height: 21,
            });
    });
    summary[10][1] = text("DISPONIBILIDAD", {
      columnSpan: 7,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: blue,
    });
    summary[10][9] = text("VALOR A PRECIO DE VENTA", {
      columnSpan: 7,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: blue,
    });
    summary[12][1] = text("ESTADO", {
      columnSpan: 3,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
    });
    summary[12][4] = text("PRODUCTOS", {
      columnSpan: 4,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
      align: "center",
    });
    ["Disponible", "Stock bajo", "Agotado"].forEach((state, i) => {
      summary[13 + i][1] = text(state, { columnSpan: 3 });
      summary[13 + i][4] = {
        ...text(""),
        value: rows.filter((r) => r.stock_state === state).length,
        type: Number,
        columnSpan: 4,
        fontSize: 12,
        align: "center",
      };
    });
    summary[24][1] = text("PRODUCTOS CON MAYOR VALOR DE VENTA", {
      columnSpan: 7,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      backgroundColor: blue,
      textColor: "#FFFFFF",
    });
    summary[26][1] = text("PRODUCTO", {
      columnSpan: 5,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
    });
    summary[26][6] = text("VALOR (S/)", {
      columnSpan: 2,
      fontFamily: "Bahnschrift",
      fontWeight: "bold",
      textColor: muted,
      align: "right",
    });
    [...rows]
      .sort((a, b) => Number(b.stock_value) - Number(a.stock_value))
      .slice(0, 5)
      .forEach((r, i) => {
        summary[27 + i][1] = text(r.name, {
          columnSpan: 5,
          wrap: true,
          height: 32,
        });
        summary[27 + i][6] = {
          ...text(""),
          value: Number(r.stock_value),
          type: Number,
          columnSpan: 2,
          format: '"S/ "#,##0.00',
          align: "right",
        };
      });
    summary[35][1] = text(
      options.scope ?? "Página visible con los filtros aplicados",
      { columnSpan: 7, rowSpan: 2, fontSize: 9, textColor: muted, wrap: true },
    );
    summary[38][1] = text(
      "Valor a precio de venta, no costo contable. No se suman unidades distintas.",
      { columnSpan: 7, rowSpan: 2, fontSize: 9, textColor: muted, wrap: true },
    );
    summary[45][1] = text(
      "ACEMAR · Gestión comercial · Importes en soles (PEN).",
      { columnSpan: 15, fontSize: 9, textColor: muted },
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
    const summaryImages = [];
    if (options.assets?.logo)
      summaryImages.push({
        content: new Blob([new Uint8Array(options.assets.logo).buffer]),
        contentType: "image/png",
        width: 194,
        height: 46,
        dpi: 96,
        anchor: { row: 2, column: 2 },
        offsetX: 4,
        offsetY: 5,
        title: "ACEMAR",
      });
    options.assets?.icons
      ?.slice(0, 4)
      .forEach((icon, i) =>
        summaryImages.push({
          content: new Blob([new Uint8Array(icon).buffer]),
          contentType: "image/png",
          width: 30,
          height: 30,
          dpi: 96,
          anchor: { row: 8, column: positions[i] + 1 },
          offsetX: 10,
          offsetY: 4,
          title: `Indicador ${metrics[i].label}`,
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
        columns: [
          3, 19, 12, 12, 13, 13, 14, 14, 3, 13, 13, 13, 13, 13, 13, 13, 3,
        ].map((width) => ({ width })),
        images: summaryImages,
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
  const blob = await writeXlsxFile(sheets, {
    fontFamily: "Consolas",
    fontSize: 10,
  }).toBlob();
  return options.products
    ? (await import("./inventory-charts")).inventoryCharts(blob, rows)
    : blob;
}
