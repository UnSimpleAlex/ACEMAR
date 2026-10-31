import Decimal from "decimal.js";
export const money = (n: unknown) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(n) || 0,
  );
export const quantity = (n: unknown) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(
    Number(n) || 0,
  );
export const date = (n: unknown) =>
  typeof n === "string"
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Lima",
      }).format(new Date(n))
    : "—";
export const lineTotal = (q: number, p: number) =>
  new Decimal(q).mul(p).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
export const total = (lines: { quantity: number; price: number }[]) =>
  lines.reduce(
    (sum, l) =>
      new Decimal(sum).plus(lineTotal(l.quantity, l.price)).toNumber(),
    0,
  );
