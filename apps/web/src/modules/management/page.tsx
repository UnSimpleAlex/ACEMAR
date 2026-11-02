import { ProductImage } from "../../shared/components/product-image";
import { randomUUID } from "../../shared/uuid";
import { RecordDetail } from "./record-detail";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  ArrowRight,
  Download,
  Package,
  Coins,
} from "lucide-react";
import { configs } from "./config";
import { list, catalog, action } from "./repository";
import { rpc } from "../../shared/backend";
import type { Row, Product, CartLine, Unit } from "../../shared/types";
import { money, quantity, date } from "../../shared/money";
import { useAuth } from "../auth/auth";
import { useCart } from "../pos/cart";
import { Button } from "../../shared/components/ui/button";
import { Modal } from "../../shared/components/modal";
import { Loading, ErrorState, Empty } from "../../shared/components/feedback";
import { EntityForm } from "./form";
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
function format(value: unknown, type?: string) {
  if (value == null || value === "") return "—";
  if (type === "money") return money(value);
  if (type === "date") return date(value);
  if (type === "number") return quantity(value);
  if (type === "boolean") return value ? "Sí" : "No";
  return labels[String(value)] ?? String(value);
}
export default function Management() {
  const { module = "ventas" } = useParams();
  const config = configs[module];
  const { profile } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const page = Math.min(
    10000,
    Math.max(0, Math.floor(Number(params.get("page"))) || 0),
  );
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{ row: Row; action: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [abono, setAbono] = useState<Row | null>(null);
  const [unitProduct, setUnitProduct] = useState<Product | null>(null);
  useEffect(() => {
    setSearch(params.get("q") ?? "");
    setEditing(undefined);
    setSelected(null);
    setConfirm(null);
    setNotice("");
    setError("");
  }, [module]);
  const data = useQuery({
    queryKey: [config?.entity, module, params.get("q") ?? "", page],
    queryFn: async () =>
      config.entity === "products"
        ? ((await catalog(params.get("q") ?? "", page)) as unknown as Row[])
        : list(config.entity, page, params.get("q") ?? ""),
    enabled: !!config,
  });
  if (!config) return <Empty title="Página no encontrada" />;
  if (
    !["ventas", "proformas", "existencias"].includes(module) &&
    profile?.role !== "admin"
  )
    return (
      <ErrorState
        error={new Error("No tienes permiso para acceder a este módulo.")}
      />
    );
  function filter() {
    setParams({ q: search, page: "0" });
  }
  function confirmDelete(row: Row) {
    setError("");
    setConfirm({ row, action: "delete" });
  }
  async function runAction() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await action(config.entity, confirm.row.id, confirm.action);
      setConfirm(null);
      setNotice("Operación completada.");
      await cache.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadQuote(row: Row) {
    setBusy(true);
    setError("");
    try {
      const d = await rpc<{
        lines: { unit_id: string; quantity: number; product_name: string }[];
      }>("acemar_detail", { p_entity: "quotations", p_id: row.id });
      const lines: CartLine[] = [];
      for (const line of d.lines) {
        const found = await catalog(line.product_name, 0);
        const p = found.find((p) => p.units.some((u) => u.id === line.unit_id));
        const u = p?.units.find((u) => u.id === line.unit_id);
        if (!p || !u)
          throw new Error(
            "No se encontró una presentación. Revisa la proforma.",
          );
        lines.push({ product: p, unit: u, quantity: line.quantity });
      }
      if (useCart.getState().lines.length) {
        setError(
          "Vacía o guarda el ticket actual antes de cargar la proforma.",
        );
        return;
      }
      useCart.getState().replace(lines, row.id);
      navigate("/vender");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(format: "xlsx" | "pdf") {
    setBusy(true);
    setError("");
    try {
      const { reportAssets } = await import("../../shared/report-assets");
      const { productColumns, productReportRows, reportMetrics } =
        await import("../../shared/report-data");
      const { download } = await import("../../shared/download");
      const products = config.entity === "products";
      const rows = products
        ? productReportRows(data.data ?? [])
        : (data.data ?? []).map((row) => ({
            ...row,
            ...Object.fromEntries(
              config.columns
                .filter((c) => c[2] === "date")
                .map(([key]) => [key, date(row[key])]),
            ),
          }));
      const columns = products
        ? productColumns
        : [
            ...(config.entity === "lots"
              ? [{ key: "image_url", label: "Foto", image: true }]
              : []),
            ...config.columns.map(([key, label, type]) => ({
              key,
              label,
              numeric: type === "number" || type === "money",
              currency: type === "money",
            })),
          ];
      const assets = await reportAssets(
        products || config.entity === "lots" ? rows : [],
      );
      const scope = `Página ${page + 1}. ${rows.length} registros. Búsqueda: ${params.get("q") || "sin filtro"}.`;
      let blob: Blob;
      if (format === "xlsx") {
        const { workbookBlob } = await import("../../shared/spreadsheets");
        blob = await workbookBlob(columns, rows, config.title, {
          products,
          scope,
          assets,
        });
      } else {
        const { reportPDF } = await import("../../shared/documents");
        const metric = reportMetrics(rows, products).find((m) => m.currency);
        const bytes = await reportPDF({
          title: products ? "Inventario de productos" : config.title,
          subtitle: new Date().toLocaleString("es-PE", {
            timeZone: "America/Lima",
          }),
          columns,
          rows,
          scope,
          landscape: true,
          assets,
          totals: metric
            ? [{ label: "Valor a precio de venta", value: money(metric.value) }]
            : undefined,
          footer: products
            ? "Valor calculado a precio de venta. No representa costo contable. Ilustraciones de productos."
            : "Documento interno de ACEMAR.",
        });
        blob = new Blob([new Uint8Array(bytes).buffer], {
          type: "application/pdf",
        });
      }
      download(blob, `acemar-${module}-pagina-${page + 1}.${format}`);
      setNotice(
        `Se exportó la página visible con sus filtros a ${format === "xlsx" ? "Excel" : "PDF"}.${assets.missing ? ` ${assets.missing} imágenes no pudieron incluirse.` : ""}`,
      );
    } catch {
      setError("No se pudo generar el reporte. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTIÓN COMERCIAL</span>
          <h1 id="page-title" tabIndex={-1}>
            {config.title}
          </h1>
          <p>{config.description}</p>
        </div>
        <div className="heading-actions">
          <Button
            variant="secondary"
            disabled={busy || !data.data?.length}
            onClick={() => void exportReport("xlsx")}
          >
            <Download size={17} />
            Exportar Excel
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !data.data?.length}
            onClick={() => void exportReport("pdf")}
          >
            <Download size={17} /> Exportar PDF
          </Button>
          {config.create && (
            <Button onClick={() => setEditing(null)}>
              <Plus size={18} />
              Registrar {config.singular}
            </Button>
          )}
          {module === "proformas" && (
            <Link to="/vender" className="btn btn-primary">
              <Plus size={18} />
              Preparar proforma
            </Link>
          )}
        </div>
      </div>
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {error && !confirm && <ErrorState error={new Error(error)} />}
      <section className="panel">
        <form
          className="list-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            filter();
          }}
        >
          <div className="searchbox">
            <Search size={20} />
            <input
              aria-label={`Buscar ${config.title}`}
              placeholder={
                module === "ventas" ? "Buscar por número de venta…" : "Buscar…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" type="submit">
            Buscar
          </Button>
          {params.get("q") && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setParams({ page: "0" });
              }}
            >
              Limpiar
            </Button>
          )}
        </form>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : !data.data?.length ? (
          <Empty
            title={
              params.get("q") ? "Sin resultados" : "Todavía no hay registros"
            }
            text={
              config.create
                ? `Registra tu primer ${config.singular} para comenzar.`
                : "Las operaciones aparecerán aquí cuando se registren."
            }
          />
        ) : (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  {config.columns.map((c) => (
                    <th key={c[0]}>{c[1]}</th>
                  ))}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.id}>
                    {config.columns.map((c) => (
                      <td data-label={c[1]} key={c[0]}>
                        {(c[0] === "name" && config.entity === "products") ||
                        (c[0] === "product_name" &&
                          config.entity === "lots") ? (
                          <div className="product-list-identity">
                            <ProductImage
                              src={
                                typeof row.image_url === "string"
                                  ? row.image_url
                                  : null
                              }
                              name={String(row.name ?? row.product_name)}
                            />
                            <div>
                              <strong>{String(row[c[0]])}</strong>
                              {row.image_generated === true && (
                                <small>Ilustración</small>
                              )}
                            </div>
                          </div>
                        ) : (
                          format(row[c[0]], c[2])
                        )}
                      </td>
                    ))}
                    <td data-label="Acciones">
                      <div className="row-actions">
                        {module === "ventas" ? (
                          <Link
                            className="btn btn-ghost"
                            to={`/ventas/${row.id}`}
                          >
                            <Eye size={17} />
                            Ver
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => setSelected(row)}
                          >
                            <Eye size={17} />
                            Ver
                          </Button>
                        )}
                        {config.edit && (
                          <Button
                            variant="ghost"
                            aria-label={`Editar ${String(row.name)}`}
                            onClick={() => setEditing(row)}
                          >
                            <Pencil size={17} /> Editar
                          </Button>
                        )}
                        {module === "productos" && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setUnitProduct(row as unknown as Product)
                            }
                          >
                            Unidades
                          </Button>
                        )}
                        {module === "creditos" && Number(row.balance) > 0 && (
                          <Button
                            variant="secondary"
                            onClick={() => setAbono(row)}
                          >
                            <Coins size={17} />
                            Abonar
                          </Button>
                        )}
                        {module === "lotes" &&
                          !row.closed &&
                          Number(row.available) === 0 && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setConfirm({ row, action: "close" })
                              }
                            >
                              Cerrar
                            </Button>
                          )}
                        {["productos", "proveedores", "creditos"].includes(
                          module,
                        ) && (
                          <Button
                            variant="ghost"
                            aria-label="Eliminar registro"
                            onClick={() => confirmDelete(row)}
                          >
                            <Trash2 size={17} /> Eliminar
                          </Button>
                        )}
                        {module === "proformas" &&
                          row.state !== "converted" && (
                            <Button
                              variant="ghost"
                              onClick={() => confirmDelete(row)}
                            >
                              <Trash2 size={17} /> Eliminar proforma
                            </Button>
                          )}
                        {module === "proformas" && row.state === "open" && (
                          <>
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void loadQuote(row)}
                            >
                              Cargar en venta
                              <ArrowRight size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setConfirm({ row, action: "cancel" })
                              }
                            >
                              Anular
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() =>
              setParams({ q: params.get("q") ?? "", page: String(page - 1) })
            }
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="secondary"
            disabled={
              (data.data?.length ?? 0) <
              (config.entity === "products" ? 24 : 25)
            }
            onClick={() =>
              setParams({ q: params.get("q") ?? "", page: String(page + 1) })
            }
          >
            Siguiente
          </Button>
        </div>
      </section>
      {editing !== undefined && (
        <EntityForm
          config={config}
          row={editing ?? undefined}
          onDelete={
            editing &&
            ["products", "suppliers", "customers"].includes(config.entity)
              ? () => {
                  setEditing(undefined);
                  confirmDelete(editing);
                }
              : undefined
          }
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setNotice("Registro guardado.");
            void cache.invalidateQueries();
          }}
        />
      )}
      {selected && (
        <RecordDetail
          entity={config.entity}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "delete"
              ? "¿Eliminar este registro?"
              : confirm.action === "close"
                ? "¿Cerrar el lote?"
                : "¿Anular la proforma?"
          }
          description="La operación se validará en el servidor. Los registros con dependencias no pueden eliminarse."
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            {String(
              confirm.row.name ??
                confirm.row.product_name ??
                `N.º ${confirm.row.number}`,
            )}
          </p>
          {error && <ErrorState error={new Error(error)} />}
          <div className="form-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                setError("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void runAction()}
            >
              {busy
                ? "Procesando…"
                : confirm.action === "delete"
                  ? "Eliminar registro"
                  : "Confirmar"}
            </Button>
          </div>
        </Modal>
      )}
      {abono && (
        <Abono
          customer={abono}
          onClose={() => setAbono(null)}
          onSaved={() => {
            setAbono(null);
            setNotice("Abono registrado.");
            void cache.invalidateQueries();
          }}
        />
      )}
      {unitProduct && (
        <Units
          product={unitProduct}
          onClose={() => setUnitProduct(null)}
          onSaved={() => {
            setUnitProduct(null);
            void cache.invalidateQueries();
          }}
        />
      )}
    </>
  );
}
function Abono({
  customer,
  onClose,
  onSaved,
}: {
  customer: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => randomUUID());
  async function submit() {
    setBusy(true);
    try {
      await rpc("acemar_pay", {
        p_key: key,
        p_customer: customer.id,
        p_amount: Number(amount),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Registrar abono"
      description={String(customer.name)}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="total-line">
        <span>Saldo actual</span>
        <strong>{money(customer.balance)}</strong>
      </div>
      <label htmlFor="amount">Importe del abono (S/)</label>
      <input
        id="amount"
        type="number"
        step="0.01"
        min="0.01"
        max={Number(customer.balance)}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={busy}
      />
      <div className="total-line">
        <span>Saldo resultante</span>
        <strong>{money(Number(customer.balance) - Number(amount))}</strong>
      </div>
      {error && <ErrorState error={new Error(error)} />}
      <div className="form-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={
            busy ||
            Number(amount) <= 0 ||
            Number(amount) > Number(customer.balance)
          }
          onClick={() => void submit()}
        >
          {busy ? "Registrando…" : "Confirmar abono"}
        </Button>
      </div>
    </Modal>
  );
}
function Units({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await rpc("acemar_save", {
        p_entity: "units",
        p_data: {
          ...(unit ? { id: unit.id } : {}),
          product_id: product.id,
          name,
          factor: Number(factor),
        },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Unidades · ${product.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <ProductImage src={product.image_url} name={product.name} />
      <p>
        Cada factor expresa cuántas unidades base ({product.base_unit}) contiene
        una presentación.
      </p>
      {product.units.map((u) => (
        <div className="unit-row" key={u.id}>
          <Package size={18} />
          <span>
            {u.name} = {quantity(u.factor)} {product.base_unit}
          </span>
          {u.name === product.base_unit ? (
            <small>Unidad base fija</small>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setUnit(u);
                setName(u.name);
                setFactor(String(u.factor));
              }}
            >
              Editar
            </Button>
          )}
        </div>
      ))}
      <h3>{unit ? "Editar presentación" : "Nueva presentación"}</h3>
      <label htmlFor="unit-name">Nombre</label>
      <input
        id="unit-name"
        value={name}
        maxLength={30}
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor="unit-factor">Factor de conversión</label>
      <input
        id="unit-factor"
        type="number"
        step="any"
        min="0.000001"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
      />
      <p className="muted small">
        Los cambios no modifican los factores guardados en ventas anteriores.
      </p>
      {error && <ErrorState error={new Error(error)} />}
      <div className="form-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cerrar
        </Button>
        <Button
          disabled={busy || !name.trim() || Number(factor) <= 0}
          onClick={() => void submit()}
        >
          Guardar unidad
        </Button>
      </div>
    </Modal>
  );
}
