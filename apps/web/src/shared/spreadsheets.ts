import type { Cell, SheetData } from "write-excel-file/browser";
export interface ExportColumn {
  key: string;
  label: string;
  numeric?: boolean;
  currency?: boolean;
}
export async function workbookBlob(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  sheet = "ACEMAR",
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data: SheetData = [
    columns.map((c) => ({
      value: c.label,
      type: String,
      fontWeight: "bold",
      backgroundColor: "#14243B",
      color: "#FFFFFF",
    })),
    ...rows.map((row) =>
      columns.map((c) => {
        const value = row[c.key];
        if (
          c.numeric &&
          value !== null &&
          value !== "" &&
          Number.isFinite(Number(value))
        )
          return {
            value: Number(value),
            type: Number,
            format: c.currency ? '"S/ "#,##0.00' : "0.######",
          } satisfies Cell;
        return { value: String(value ?? ""), type: String } satisfies Cell;
      }),
    ),
  ];
  return writeXlsxFile(data, {
    sheet: sheet.slice(0, 31),
    columns: columns.map(() => ({ width: 24 })),
    showGridLines: false,
  }).toBlob();
}
