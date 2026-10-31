import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  ReceiptText,
  Wallet,
  Package,
  ArrowUpRight,
  ShoppingCart,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { rpc } from "../../shared/backend";
import { money, date } from "../../shared/money";
import type { Row } from "../../shared/types";
import { useAuth } from "../auth/auth";
import { Button } from "../../shared/components/ui/button";
import { Loading, ErrorState } from "../../shared/components/feedback";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(),
  );
export default function Dashboard({ cash = false }: { cash?: boolean }) {
  const { profile } = useAuth();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [period, setPeriod] = useState({ from: today(), to: today() });
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const valid =
    period.from <= period.to &&
    new Date(period.to).getTime() - new Date(period.from).getTime() <=
      366 * 86400000;
  const data = useQuery({
    queryKey: ["summary", period],
    queryFn: () =>
      rpc<Record<string, number>>("acemar_summary", {
        p_from: period.from,
        p_to: period.to,
      }),
    enabled: profile?.role === "admin" && valid,
  });
  const recent = useQuery({
    queryKey: ["sales", "recent"],
    queryFn: () =>
      rpc<Row[]>("acemar_list", { p_entity: "sales", p_page: 0, p_search: "" }),
    enabled: !cash,
  });
  const count = useQuery({
    queryKey: ["cash-count", period.from],
    queryFn: () => rpc<Row | null>("acemar_counts", { p_day: period.from }),
    enabled: cash && period.from === period.to,
  });
  if (profile?.role !== "admin")
    return <ErrorState error={new Error("Operación no autorizada")} />;
  async function saveCount() {
    setBusy(true);
    setError("");
    try {
      await rpc("acemar_count", {
        p_day: period.from,
        p_counted: Number(counted),
        p_note: note,
      });
      setNotice("Arqueo registrado.");
      await cache.invalidateQueries({ queryKey: ["cash-count"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROL DEL NEGOCIO</span>
          <h1 id="page-title" tabIndex={-1}>
            {cash ? "Caja" : "Resumen general"}
          </h1>
          <p>
            {cash
              ? "Consulta el período y registra el dinero contado."
              : `Hola, ${profile.name}. Así marcha tu negocio.`}
          </p>
        </div>
        {!cash && (
          <Link to="/vender" className="btn btn-primary">
            <Plus size={18} />
            Nueva venta
          </Link>
        )}
      </div>
      <form
        className="period-filter panel"
        onSubmit={(e) => {
          e.preventDefault();
          setPeriod({ from, to });
        }}
      >
        <div>
          <label htmlFor="from">Desde</label>
          <input
            type="date"
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="to">Hasta</label>
          <input
            type="date"
            id="to"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="secondary">
          Aplicar período
        </Button>
      </form>
      {!valid && (
        <ErrorState
          error={new Error("Selecciona un período válido de hasta 366 días.")}
        />
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : (
        data.data && (
          <>
            <div className="stats">
              {[
                {
                  label: cash ? "Ventas al contado" : "Ventas del período",
                  value: money(
                    cash ? data.data.cash_sales : data.data.sales_total,
                  ),
                  icon: TrendingUp,
                },
                {
                  label: cash ? "Abonos recibidos" : "Ventas registradas",
                  value: cash
                    ? money(data.data.payments_total)
                    : String(data.data.sales_count),
                  icon: ReceiptText,
                },
                {
                  label: cash
                    ? "Valor de lotes ingresados"
                    : "Créditos pendientes actuales",
                  value: money(
                    cash ? data.data.lots_value : data.data.debt_total,
                  ),
                  icon: Wallet,
                },
                {
                  label: cash
                    ? "Ingresos registrados"
                    : "Productos bajo mínimo",
                  value: cash
                    ? money(
                        Number(data.data.cash_sales) +
                          Number(data.data.payments_total),
                      )
                    : String(data.data.low_stock),
                  icon: Package,
                },
              ].map(({ label, value, icon: Icon }) => (
                <article className="stat panel" key={label}>
                  <span className="stat-icon">
                    <Icon size={22} />
                  </span>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            {cash ? (
              <div className="dashboard-grid">
                <section className="panel">
                  <h2>Lectura de caja</h2>
                  <p>
                    Los ingresos registrados reúnen ventas al contado y abonos.
                    El valor de lotes representa compras de inventario
                    registradas; no demuestra que el proveedor haya recibido un
                    pago.
                  </p>
                  <div className="notice">
                    Este módulo es un resumen del período. No administra una
                    sesión de apertura y cierre ni una conciliación bancaria.
                  </div>
                </section>
                <section className="panel">
                  <h2>Arqueo del día</h2>
                  {period.from !== period.to ? (
                    <p>
                      Selecciona un solo día para consultar o registrar su
                      arqueo.
                    </p>
                  ) : count.isPending ? (
                    <Loading />
                  ) : count.error ? (
                    <ErrorState error={count.error} />
                  ) : count.data ? (
                    <dl className="detail-list">
                      <div>
                        <dt>Contado</dt>
                        <dd>{money(count.data.counted)}</dd>
                      </div>
                      <div>
                        <dt>Esperado al registrar</dt>
                        <dd>{money(count.data.expected)}</dd>
                      </div>
                      <div>
                        <dt>Diferencia</dt>
                        <dd>
                          {money(
                            Number(count.data.counted) -
                              Number(count.data.expected),
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Observación</dt>
                        <dd>{String(count.data.note)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <>
                      <label htmlFor="counted">Efectivo contado (S/)</label>
                      <input
                        id="counted"
                        type="number"
                        min="0"
                        step="0.01"
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                      />
                      <label htmlFor="note">Observación</label>
                      <textarea
                        id="note"
                        maxLength={500}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      {error && <ErrorState error={new Error(error)} />}
                      <Button
                        disabled={busy || counted === "" || Number(counted) < 0}
                        onClick={() => void saveCount()}
                      >
                        {busy ? "Registrando…" : "Registrar arqueo"}
                      </Button>
                    </>
                  )}
                </section>
              </div>
            ) : (
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="section-title">
                    <h2>Ventas recientes</h2>
                    <Link to="/ventas">
                      Ver todas <ArrowUpRight size={16} />
                    </Link>
                  </div>
                  {recent.error ? (
                    <ErrorState error={recent.error} />
                  ) : recent.isPending ? (
                    <Loading />
                  ) : recent.data?.length ? (
                    recent.data.slice(0, 5).map((s) => (
                      <Link
                        to={`/ventas/${s.id}`}
                        className="recent-sale"
                        key={s.id}
                      >
                        <span className="stat-icon">
                          <ReceiptText size={19} />
                        </span>
                        <div>
                          <strong>Venta N.º {String(s.number)}</strong>
                          <small>{date(s.created_at)}</small>
                        </div>
                        <strong>{money(s.total)}</strong>
                      </Link>
                    ))
                  ) : (
                    <p className="muted">
                      Tus primeras ventas aparecerán aquí.
                    </p>
                  )}
                </section>
                <section className="panel">
                  <h2>Accesos rápidos</h2>
                  <Link className="shortcut" to="/vender">
                    <ShoppingCart />
                    <div>
                      <strong>Registrar una venta</strong>
                      <small>Abre el punto de venta</small>
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link className="shortcut" to="/lotes">
                    <Package />
                    <div>
                      <strong>Ingresar mercadería</strong>
                      <small>Registra un nuevo lote</small>
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link className="shortcut" to="/auditoria">
                    <ShieldCheck />
                    <div>
                      <strong>Revisar cambios</strong>
                      <small>Consulta la auditoría</small>
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                </section>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
