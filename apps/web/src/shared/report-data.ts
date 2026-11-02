import Decimal from "decimal.js";
export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
  currency?: boolean;
  image?: boolean;
}
export const productColumns: ReportColumn[] = [
  { key: "image_url", label: "IMAGEN", image: true },
  { key: "name", label: "PRODUCTO" },
  { key: "code", label: "CÓDIGO" },
  { key: "base_unit", label: "UNIDAD BASE" },
  { key: "price", label: "PRECIO BASE", numeric: true, currency: true },
  { key: "stock", label: "DISPONIBLE", numeric: true },
  { key: "stock_state", label: "ESTADO" },
  {
    key: "stock_value",
    label: "VALOR DE VENTA (S/)",
    numeric: true,
    currency: true,
  },
];
export function productReportRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    ...row,
    stock_state:
      Number(row.stock) <= 0
        ? "Agotado"
        : Number(row.stock) <= Number(row.minimum)
          ? "Stock bajo"
          : "Disponible",
    stock_value: new Decimal(String(row.stock ?? 0))
      .times(String(row.price ?? 0))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber(),
  }));
}
export function reportMetrics(
  rows: Record<string, unknown>[],
  products: boolean,
): { label: string; value: string | number; currency?: boolean }[] {
  if (!products)
    return [
      { label: "REGISTROS EXPORTADOS", value: rows.length },
      { label: "ALCANCE", value: "Página visible" },
      { label: "MONEDA", value: "PEN (S/)" },
      { label: "DOCUMENTO", value: "Control interno" },
    ];
  return [
    { label: "PRODUCTOS EXPORTADOS", value: rows.length },
    {
      label: "CON EXISTENCIAS",
      value: rows.filter((r) => Number(r.stock) > 0).length,
    },
    {
      label: "STOCK BAJO / AGOTADO",
      value: rows.filter((r) => Number(r.stock) <= Number(r.minimum)).length,
    },
    {
      label: "VALOR A PRECIO DE VENTA",
      value: rows
        .reduce((s, r) => s.plus(String(r.stock_value ?? 0)), new Decimal(0))
        .toNumber(),
      currency: true,
    },
  ];
}
