import { ProductImage } from "../../shared/components/product-image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "../../shared/backend";
import type { Row, SaleLine } from "../../shared/types";
import { money, date, quantity } from "../../shared/money";
import { Modal } from "../../shared/components/modal";
import { Button } from "../../shared/components/ui/button";
import { Loading, ErrorState } from "../../shared/components/feedback";
const names: Record<string, string> = {
  name: "Nombre",
  code: "Código",
  base_unit: "Unidad base",
  minimum: "Mínimo",
  stock: "Existencia",
  price: "Precio base",
  document: "Documento",
  phone: "Teléfono",
  address: "Dirección",
  balance: "Saldo",
  credit_limit: "Límite",
  authorized: "Autorizado",
  created_at: "Fecha",
  state: "Estado",
  number: "Número",
  reason: "Motivo",
  action: "Acción",
  actor_name: "Responsable",
  product_name: "Producto",
  supplier_name: "Proveedor",
  initial_quantity: "Cantidad ingresada",
  available: "Disponible",
  cost: "Costo base",
  closed: "Lote cerrado",
  customer_name: "Cliente",
  counter: "Mostrador",
  role: "Rol",
};
const labels: Record<string, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  cash: "Contado",
  credit: "Crédito",
  confirmed: "Confirmada",
  cancelled: "Anulada",
  open: "Abierta",
  converted: "Convertida",
};
function format(key: string, value: unknown) {
  if (value == null || value === "") return "—";
  if (key === "created_at") return date(value);
  if (
    ["price", "cost", "balance", "credit_limit", "total", "amount"].includes(
      key,
    )
  )
    return money(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return labels[String(value)] ?? String(value);
}
interface Detail {
  payments?: Row[];
  sales?: Row[];
  lines?: SaleLine[];
}
function Snapshot({ value }: { value: unknown }) {
  if (!value || typeof value !== "object")
    return <p className="muted">Sin información registrada.</p>;
  const v = value as {
    sale?: { total: number; state: string };
    lines?: SaleLine[];
    total?: number;
  };
  return (
    <>
      {v.sale && (
        <p>
          Total: {money(v.sale.total)} · {labels[v.sale.state] ?? v.sale.state}
        </p>
      )}
      {v.total !== undefined && <p>Total: {money(v.total)}</p>}
      {v.lines?.map((l) => (
        <div className="unit-row" key={l.id}>
          <span>
            {l.product_name} · {quantity(l.quantity)} {l.unit_name}
          </span>
          <strong>{money(l.subtotal)}</strong>
        </div>
      ))}
    </>
  );
}
export function RecordDetail({
  entity,
  row,
  onClose,
}: {
  entity: string;
  row: Row;
  onClose: () => void;
}) {
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["detail", entity, row.id],
    queryFn: () =>
      rpc<Detail>("acemar_detail", { p_entity: entity, p_id: row.id }),
    enabled: ["customers", "quotations"].includes(entity),
  });
  async function exportQuote() {
    if (!detail.data?.lines) return;
    setExportBusy(true);
    setExportError("");
    try {
      const { documentPDF, download } = await import("../../shared/documents");
      const lines = detail.data.lines;
      const bytes = await documentPDF(
        `Proforma N. ${row.number}`,
        `${String(row.customer_name || "Cliente sin especificar")} | ${date(row.created_at)}`,
        [
          ...lines.map((l) => ({
            label: `${l.quantity} ${l.unit_name} - ${l.product_name}`,
            amount: money(Number(l.quantity) * Number(l.price)),
          })),
          { label: "TOTAL COTIZADO", amount: money(row.total) },
        ],
        "No reserva existencias. Precios y disponibilidad sujetos a revision al vender.",
      );
      download(
        new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
        `ACEMAR-proforma-${row.number}.pdf`,
      );
    } catch {
      setExportError("No se pudo generar el PDF. Reintenta.");
    } finally {
      setExportBusy(false);
    }
  }
  const units = Array.isArray(row.units)
    ? (row.units as { id: string; name: string; factor: number }[])
    : [];
  return (
    <Modal
      title={
        entity === "quotations"
          ? `Proforma N.º ${row.number}`
          : "Detalle del registro"
      }
      onClose={onClose}
    >
      {entity === "products" && (
        <div className="mb-6">
          <ProductImage
            src={typeof row.image_url === "string" ? row.image_url : null}
            name={String(row.name)}
          />
          {row.image_generated === true && (
            <small>Ilustración del producto</small>
          )}
        </div>
      )}
      <dl className="detail-list">
        {Object.entries(row)
          .filter(([key]) => names[key])
          .map(([key, v]) => (
            <div key={key}>
              <dt>{names[key]}</dt>
              <dd>{format(key, v)}</dd>
            </div>
          ))}
      </dl>
      {units.length > 0 && (
        <>
          <h3 className="mt-6">Unidades de venta</h3>
          {units.map((u) => (
            <div className="unit-row" key={u.id}>
              <span>{u.name}</span>
              <strong>
                {quantity(u.factor)} {String(row.base_unit)}
              </strong>
            </div>
          ))}
        </>
      )}
      {detail.isFetching && <Loading />}
      {detail.error && <ErrorState error={detail.error} />}
      {detail.data?.lines && (
        <>
          <h3 className="mt-6">Productos cotizados</h3>
          {detail.data.lines.map((l, i) => (
            <div className="unit-row" key={l.id ?? i}>
              <span>
                {l.product_name}
                <small className="block">
                  {quantity(l.quantity)} {l.unit_name} × {money(l.price)}
                </small>
              </span>
              <strong>{money(Number(l.quantity) * Number(l.price))}</strong>
            </div>
          ))}
          <p className="muted small mt-4">
            La proforma no reserva existencias. Revisa disponibilidad y precios
            al cargarla en venta.
          </p>
        </>
      )}
      {detail.data?.payments && (
        <>
          <h3 className="mt-6">Últimos abonos</h3>
          {detail.data.payments.length ? (
            detail.data.payments.map((p) => (
              <div className="unit-row" key={p.id}>
                <span>{date(p.created_at)}</span>
                <strong>{money(p.amount)}</strong>
              </div>
            ))
          ) : (
            <p className="muted">Sin abonos registrados.</p>
          )}
        </>
      )}
      {detail.data?.sales && (
        <>
          <h3 className="mt-6">Últimas ventas del cliente</h3>
          {detail.data.sales.map((s) => (
            <div className="unit-row" key={s.id}>
              <span>
                Venta N.º {String(s.number)}
                <small className="block">{date(s.created_at)}</small>
              </span>
              <strong>{money(s.total)}</strong>
            </div>
          ))}
        </>
      )}
      {entity === "audit" && (
        <>
          <h3 className="mt-6">Antes</h3>
          <Snapshot value={row.before_data} />
          <h3 className="mt-6">Después</h3>
          <Snapshot value={row.after_data} />
        </>
      )}
      {exportError && <ErrorState error={new Error(exportError)} />}
      <div className="form-actions">
        <Button
          variant="secondary"
          disabled={exportBusy}
          onClick={() =>
            entity === "quotations" ? void exportQuote() : window.print()
          }
        >
          {entity === "quotations"
            ? exportBusy
              ? "Generando…"
              : "Descargar PDF"
            : "Imprimir / Guardar PDF"}
        </Button>
        <Button onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
