import { ProductImage } from "../../shared/components/product-image";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle2,
  ArrowRight,
  FileText,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { rpc } from "../../shared/backend";
import type { Product, Row } from "../../shared/types";
import { money, quantity, lineTotal, total } from "../../shared/money";
import { useCart } from "./cart";
import { Button } from "../../shared/components/ui/button";
import { Modal } from "../../shared/components/modal";
import { Empty, Loading, ErrorState } from "../../shared/components/feedback";
interface Result {
  id: string;
  number: number;
  total: number;
  received: number | null;
  payment: string;
}
function ProductCard({ product }: { product: Product }) {
  const [unitId, setUnitId] = useState(product.units[0]?.id ?? "");
  const unit = product.units.find((u) => u.id === unitId);
  const add = useCart((s) => s.add);
  return (
    <article className="product-card">
      <ProductImage src={product.image_url} name={product.name} />
      <div className="product-body">
        <h3>{product.name}</h3>
        <small>{product.code}</small>
        <span
          className={`badge ${product.stock <= product.minimum ? "warning" : "success"}`}
        >
          {product.stock > 0
            ? `Stock: ${quantity(product.stock)} ${product.base_unit}`
            : "Agotado"}
        </span>
        <label className="sr-only" htmlFor={`unit-${product.id}`}>
          Unidad de {product.name}
        </label>
        <select
          id={`unit-${product.id}`}
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
        >
          {product.units.map((u) => (
            <option value={u.id} key={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <div className="product-bottom">
          <strong>{money(Number(product.price) * (unit?.factor ?? 1))}</strong>
          <Button
            disabled={!unit || product.stock <= 0 || product.price <= 0}
            variant="secondary"
            aria-label={`Agregar ${product.name}`}
            onClick={() => unit && add(product, unit)}
          >
            <Plus size={21} />
          </Button>
        </div>
        {product.image_generated && <small>Ilustración del producto</small>}
      </div>
    </article>
  );
}
export default function POS() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [quote, setQuote] = useState(false);
  const [quoteName, setQuoteName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const cache = useQueryClient();
  const cart = useCart();
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cart.lines.length) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cart.lines.length]);
  const products = useQuery({
    queryKey: ["catalog", debounced, page],
    queryFn: () =>
      rpc<Product[]>("acemar_catalog", { p_search: debounced, p_page: page }),
  });
  const sum = total(
    cart.lines.map((l) => ({
      quantity: l.quantity,
      price: Number(l.product.price) * Number(l.unit.factor),
    })),
  );
  const valid =
    cart.lines.length > 0 &&
    cart.lines.every(
      (l) =>
        Number.isFinite(l.quantity) &&
        l.quantity > 0 &&
        Number(l.product.price) > 0,
    ) &&
    cart.lines.every(
      (l) =>
        cart.lines
          .filter((x) => x.product.id === l.product.id)
          .reduce((s, x) => s + x.quantity * Number(x.unit.factor), 0) <=
        Number(l.product.stock),
    );
  async function saveQuote() {
    setBusy(true);
    setError("");
    try {
      const id = await rpc<string>("acemar_quotation", {
        p_items: cart.lines.map((l) => ({
          unit_id: l.unit.id,
          quantity: l.quantity,
        })),
        p_name: quoteName,
      });
      setMessage(`Proforma guardada. Referencia ${id.slice(0, 8)}.`);
      setQuote(false);
      await cache.invalidateQueries({ queryKey: ["quotations"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ticket = (
    <>
      <div className="ticket-heading">
        <h2>Ticket de venta</h2>
        <span className="badge warning">Sin cobrar</span>
      </div>
      {!cart.lines.length ? (
        <Empty
          title="Tu ticket está vacío"
          text="Busca un producto y pulsa Agregar para comenzar."
        />
      ) : (
        <div className="cart-lines">
          {cart.lines.map((l) => (
            <article className="cart-line" key={l.unit.id}>
              <div>
                <strong>{l.product.name}</strong>
                <small>
                  {money(Number(l.product.price) * Number(l.unit.factor))} por{" "}
                  {l.unit.name}
                </small>
              </div>
              <div className="cart-line-controls">
                <div className="stepper">
                  <button
                    aria-label={`Reducir ${l.product.name}`}
                    onClick={() =>
                      cart.setQuantity(l.unit.id, Math.max(1, l.quantity - 1))
                    }
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    aria-label={`Cantidad de ${l.product.name} en ${l.unit.name}`}
                    value={l.quantity}
                    onChange={(e) =>
                      cart.setQuantity(l.unit.id, Number(e.target.value))
                    }
                  />
                  <button
                    aria-label={`Aumentar ${l.product.name}`}
                    onClick={() => cart.setQuantity(l.unit.id, l.quantity + 1)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <strong>
                  {money(
                    lineTotal(
                      l.quantity,
                      Number(l.product.price) * Number(l.unit.factor),
                    ),
                  )}
                </strong>
                <button
                  className="icon-btn danger"
                  aria-label={`Quitar ${l.product.name}`}
                  onClick={() => cart.remove(l.unit.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="ticket-footer">
        {cart.lines.length > 0 && !valid && (
          <div className="error" role="alert">
            Revisa las cantidades: deben ser positivas y no superar las
            existencias disponibles.
          </div>
        )}
        <div className="total-line">
          <span>Total</span>
          <strong>{money(sum)}</strong>
        </div>
        <p className="muted small">
          El precio y las existencias se verificarán al confirmar.
        </p>
        <Button
          className="full"
          disabled={!valid}
          onClick={() => {
            setCheckout(true);
            setError("");
          }}
        >
          Cobrar {money(sum)}
          <ArrowRight size={18} />
        </Button>
        <div className="ticket-actions">
          <Button
            variant="secondary"
            disabled={!valid}
            onClick={() => setQuote(true)}
          >
            <FileText size={17} />
            Proforma
          </Button>
          <Button
            variant="ghost"
            disabled={!cart.lines.length}
            onClick={() => setClearConfirm(true)}
          >
            <Trash2 size={17} />
            Vaciar
          </Button>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VENTAS</span>
          <h1 id="page-title" tabIndex={-1}>
            Punto de venta
          </h1>
          <p>Encuentra productos y prepara tu venta.</p>
        </div>
        <Link to="/ventas" className="text-link">
          Ver ventas <ArrowRight size={16} />
        </Link>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
          <button
            className="icon-btn"
            aria-label="Cerrar aviso"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="pos-layout">
        <section>
          <div className="searchbox">
            <Search size={21} />
            <input
              aria-label="Buscar producto por nombre o código"
              placeholder="Buscar por nombre o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-btn"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch("")}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div className="section-caption">
            <span>Catálogo de productos</span>
            <small>Precios por presentación</small>
          </div>
          {products.isPending ? (
            <Loading />
          ) : products.error ? (
            <ErrorState
              error={products.error}
              retry={() => void products.refetch()}
            />
          ) : products.data?.length ? (
            <div className="product-grid">
              {products.data.map((p) => (
                <ProductCard product={p} key={p.id} />
              ))}
            </div>
          ) : (
            <Empty
              title={
                search
                  ? "No encontramos productos"
                  : "El catálogo está listo para comenzar"
              }
              text={
                search
                  ? "Prueba otro nombre o código."
                  : "El administrador puede registrar productos e ingresar sus primeros lotes."
              }
            />
          )}
          <div className="pagination">
            <Button
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <span>Página {page + 1}</span>
            <Button
              variant="secondary"
              disabled={(products.data?.length ?? 0) < 24}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </section>
        <aside className="ticket desktop-ticket">{ticket}</aside>
      </div>
      <button className="mobile-cart" onClick={() => setCartOpen(true)}>
        <ShoppingCart size={21} />
        <span>Ver ticket · {cart.lines.length}</span>
        <strong>{money(sum)}</strong>
      </button>
      {cartOpen && !checkout && (
        <Modal title="Ticket de venta" onClose={() => setCartOpen(false)}>
          {ticket}
        </Modal>
      )}
      {clearConfirm && (
        <Modal
          title="¿Vaciar el ticket?"
          description="Se quitarán todos los productos de esta venta en preparación."
          onClose={() => setClearConfirm(false)}
        >
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setClearConfirm(false)}>
              Conservar ticket
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                cart.clear();
                setClearConfirm(false);
              }}
            >
              Vaciar ticket
            </Button>
          </div>
        </Modal>
      )}
      {quote && (
        <Modal
          title="Guardar proforma"
          onClose={() => {
            if (!busy) setQuote(false);
          }}
        >
          <label htmlFor="quote-name">Nombre del cliente</label>
          <input
            id="quote-name"
            maxLength={160}
            value={quoteName}
            onChange={(e) => setQuoteName(e.target.value)}
          />
          {error && <ErrorState error={new Error(error)} />}
          <div className="form-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setQuote(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void saveQuote()}>
              {busy ? "Guardando…" : "Guardar proforma"}
            </Button>
          </div>
        </Modal>
      )}
      {checkout && (
        <Checkout
          sum={sum}
          onClose={() => setCheckout(false)}
          onSuccess={(r) => {
            setCheckout(false);
            setCartOpen(false);
            setResult(r);
            cart.clear();
            void cache.invalidateQueries();
          }}
        />
      )}
      {result && (
        <Modal
          title="Venta registrada"
          description="La venta fue confirmada por el sistema."
          onClose={() => setResult(null)}
        >
          <div className="confirmation">
            <CheckCircle2 size={64} />
            <h3>¡Venta completada!</h3>
            <p>Venta N.º {result.number}</p>
            <strong>{money(result.total)}</strong>
            {result.payment === "cash" && (
              <p>
                Vuelto: {money(Number(result.received) - Number(result.total))}
              </p>
            )}
          </div>
          <div className="form-actions">
            <Link className="btn btn-secondary" to={`/ventas/${result.id}`}>
              Ver comprobante
            </Link>
            <Button onClick={() => setResult(null)}>Nueva venta</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Checkout({
  sum,
  onClose,
  onSuccess,
}: {
  sum: number;
  onClose: () => void;
  onSuccess: (r: Result) => void;
}) {
  const cart = useCart();
  const [payment, setPayment] = useState("cash");
  const [customer, setCustomer] = useState("");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const customers = useQuery({
    queryKey: ["credit-selector"],
    queryFn: () => rpc<Row[]>("acemar_customers_for_sale"),
    enabled: payment === "credit",
  });
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const r = await rpc<Result>("acemar_checkout", {
        p_key: cart.requestKey,
        p_items: cart.lines.map((l) => ({
          unit_id: l.unit.id,
          quantity: l.quantity,
        })),
        p_payment: payment,
        p_customer: payment === "credit" ? customer : null,
        p_received: payment === "cash" ? Number(received) : null,
        p_quotation: cart.quotationId,
      });
      onSuccess(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Confirmar cobro"
      description="Revisa el total y el tipo de venta antes de confirmar."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="checkout-total">
        <span>Total a cobrar</span>
        <strong>{money(sum)}</strong>
      </div>
      <fieldset className="payment-options">
        <legend>Tipo de venta</legend>
        {[
          ["cash", "Contado"],
          ["credit", "Crédito"],
        ].map(([v, label]) => (
          <label className={payment === v ? "selected" : ""} key={v}>
            <input
              type="radio"
              name="payment"
              checked={payment === v}
              onChange={() => setPayment(v)}
              disabled={busy}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {payment === "cash" ? (
        <>
          <label htmlFor="received">Importe recibido (S/)</label>
          <input
            id="received"
            type="number"
            step="0.01"
            min={sum}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            autoFocus
            disabled={busy}
          />
          <div className="total-line">
            <span>Vuelto</span>
            <strong>{money(Math.max(0, Number(received) - sum))}</strong>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="customer">Cliente autorizado</label>
          <select
            id="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            disabled={busy}
          >
            <option value="">Seleccionar cliente</option>
            {customers.data?.map((c) => (
              <option value={c.id} key={c.id}>
                {String(c.name)} · {String(c.document)}
              </option>
            ))}
          </select>
          {customers.error && <ErrorState error={customers.error} />}
          <p className="muted small">
            El límite disponible se verificará al confirmar.
          </p>
        </>
      )}
      {error && <ErrorState error={new Error(error)} />}
      <div className="form-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Volver
        </Button>
        <Button
          disabled={
            busy ||
            (payment === "cash"
              ? received === "" || Number(received) < sum
              : !customer)
          }
          onClick={() => void confirm()}
        >
          {busy ? "Confirmando…" : "Confirmar venta"}
        </Button>
      </div>
    </Modal>
  );
}
