import { ActionBar } from "../../shared/components/action-bar";
import { ProductImage } from "../../shared/components/product-image";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Printer,
  ArrowLeft,
  ShieldCheck,
  Mail,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  receiptRequest,
  decodeFile,
  verifyReceiptURL,
  type ReceiptResult,
} from "./receipt-api";
import { randomUUID } from "../../shared/uuid";
import { rpc } from "../../shared/backend";
import type { SaleDetail } from "../../shared/types";
import { money, date, lineTotal, total } from "../../shared/money";
import { useAuth } from "../auth/auth";
import { Loading, ErrorState } from "../../shared/components/feedback";
import { Button } from "../../shared/components/ui/button";
import { Modal } from "../../shared/components/modal";
export default function Detail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const cache = useQueryClient();
  const data = useQuery({
    queryKey: ["sale", id],
    queryFn: () =>
      rpc<SaleDetail>("acemar_detail", { p_entity: "sales", p_id: id }),
  });
  const [mode, setMode] = useState<"correct" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailReady, setMailReady] = useState(false);
  const [mailNotice, setMailNotice] = useState("");
  const [mailRequestId, setMailRequestId] = useState("");

  if (data.isPending) return <Loading />;
  if (data.error || !data.data)
    return <ErrorState error={data.error} retry={() => void data.refetch()} />;
  const { sale, lines } = data.data;
  const sum = total(
    lines.map((l) => ({
      quantity: quantities[l.id] ?? Number(l.quantity),
      price: Number(l.price),
    })),
  );
  async function exportPDF() {
    if (exportBusy) return;
    setExportBusy(true);
    setError("");
    try {
      const { download } = await import("../../shared/download");
      const result = await receiptRequest({
        saleId: sale.id,
        action: "download",
      });
      if (!result.pdf) throw Error();
      setReceipt(result);
      download(
        new Blob([decodeFile(result.pdf).buffer], { type: "application/pdf" }),
        `ACEMAR-venta-${sale.number}.pdf`,
      );
    } catch {
      setError("No se pudo generar el documento. Reintenta.");
    } finally {
      setExportBusy(false);
    }
  }
  async function openMail() {
    setMailOpen(true);
    setMailNotice("");
    setError("");
    setMailRequestId(randomUUID());
    try {
      const status = await receiptRequest({ action: "capabilities" });
      setMailReady(Boolean(status.emailConfigured));
    } catch {
      setMailReady(false);
    }
  }
  async function sendMail(action: "draft" | "send") {
    if (mailBusy || !email.trim()) return;
    setMailBusy(true);
    setError("");
    setMailNotice("");
    try {
      const result = await receiptRequest({
        saleId: sale.id,
        action,
        email: email.trim(),
        requestId: mailRequestId,
      });
      if (action === "draft" && result.eml) {
        const { download } = await import("../../shared/download");
        download(
          new Blob([decodeFile(result.eml).buffer], { type: "message/rfc822" }),
          `ACEMAR-venta-${sale.number}.eml`,
        );
        setMailNotice(
          "Correo preparado con el PDF adjunto. Ábrelo en tu aplicación de correo, revisa el remitente y envíalo.",
        );
      } else if (result.sent)
        setMailNotice("Correo enviado al destinatario indicado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMailBusy(false);
    }
  }
  async function change() {
    setBusy(true);
    setError("");
    try {
      await rpc("acemar_change_sale", {
        p_id: id,
        p_action: mode,
        p_reason: reason,
        p_quantities: quantities,
        p_expected: sale.revision,
      });
      setMode(null);
      await cache.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(action: "correct" | "cancel") {
    setQuantities(
      Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)])),
    );
    setMode(action);
    setReason("");
    setReview(false);
    setError("");
  }
  return (
    <>
      <Link className="text-link" to="/ventas">
        <ArrowLeft size={17} />
        Volver a ventas
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DETALLE DE VENTA</span>
          <h1 id="page-title" tabIndex={-1}>
            Venta N.º {sale.number}
          </h1>
          <p>{date(sale.created_at)}</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => void openMail()}>
            <Mail size={18} /> Enviar por correo
          </Button>
          <Button
            variant="secondary"
            disabled={exportBusy}
            onClick={() => void exportPDF()}
          >
            <Printer size={18} />
            {exportBusy ? "Generando…" : "Descargar PDF verificable"}
          </Button>
        </div>
      </div>
      {error && !mode && !mailOpen && <ErrorState error={new Error(error)} />}
      <section className="panel receipt">
        <div className="receipt-header">
          <div className="brand">
            <img src="/brand.svg" alt="" />
            ACEMAR
          </div>
          <span
            className={`badge ${sale.state === "cancelled" ? "warning" : "success"}`}
          >
            {sale.state === "cancelled" ? "Anulada" : "Confirmada"}
          </span>
        </div>
        <p>
          Documento interno de venta · No es un comprobante electrónico SUNAT.
        </p>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidad</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td data-label="Producto">
                    <div className="product-list-identity">
                      <ProductImage
                        compact
                        src={l.image_url ?? null}
                        name={l.product_name}
                      />
                      <span>
                        {l.product_name}
                        {l.image_generated && <small>Ilustración actual</small>}
                      </span>
                    </div>
                  </td>
                  <td data-label="Unidad">{l.unit_name}</td>
                  <td data-label="Cantidad">{l.quantity}</td>
                  <td data-label="Precio">{money(l.price)}</td>
                  <td data-label="Subtotal">{money(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="receipt-totals">
          <span>
            {sale.payment === "cash" ? "Venta al contado" : "Venta a crédito"}
          </span>
          <div className="total-line">
            <span>Total registrado</span>
            <strong>{money(sale.total)}</strong>
          </div>
          {sale.received !== null && <p>Recibido: {money(sale.received)}</p>}
          {sale.state === "cancelled" && (
            <p className="error">
              Esta venta está anulada y no forma parte de los totales activos.
            </p>
          )}
        </div>
      </section>
      {receipt?.code && (
        <section className="receipt-security">
          <strong>Documento verificable · Revisión {receipt.revision}</strong>
          <p>
            <code>{receipt.code}</code>
          </p>
          <a
            className="text-link"
            href={verifyReceiptURL(receipt.code)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} /> Verificar autenticidad y archivo PDF
          </a>
        </section>
      )}
      {mailOpen && (
        <Modal
          title={`Enviar venta N.º ${sale.number}`}
          description="Revisa el correo del cliente. Se adjuntará el PDF original generado por el servidor."
          onClose={() => {
            if (!mailBusy) setMailOpen(false);
          }}
        >
          <form
            className="receipt-mail-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (mailReady) void sendMail("send");
            }}
          >
            <label htmlFor="receipt-email">Correo del cliente</label>
            <input
              id="receipt-email"
              type="email"
              required
              maxLength={254}
              value={email}
              disabled={mailBusy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@ejemplo.com"
            />
            <p>
              Venta N.º {sale.number} · Total {money(sale.total)} · PDF con QR
              de verificación.
            </p>
            {!mailReady && (
              <p className="notice">
                El envío directo aún no está disponible. Puedes descargar el
                correo profesional con el PDF adjunto y enviarlo desde tu
                aplicación de correo.
              </p>
            )}
            {error && <ErrorState error={new Error(error)} />}
            {mailNotice && (
              <p role="status" className="notice">
                {mailNotice}
              </p>
            )}
            <ActionBar>
              <Button
                variant="secondary"
                disabled={mailBusy || !email.trim()}
                onClick={() => void sendMail("draft")}
              >
                <Download size={16} /> Descargar correo con PDF
              </Button>
              <Button
                type="submit"
                disabled={mailBusy || !mailReady || !email.trim()}
              >
                <Mail size={16} />
                {mailBusy ? "Preparando…" : "Enviar al cliente"}
              </Button>
            </ActionBar>
          </form>
        </Modal>
      )}
      {profile?.role === "admin" && sale.state === "confirmed" && (
        <section className="panel admin-actions">
          <div>
            <ShieldCheck />
            <h2>Control administrativo</h2>
            <p>Los cambios requieren un motivo y quedan registrados.</p>
          </div>
          <Button
            variant="secondary"
            disabled={
              Date.now() - new Date(sale.created_at).getTime() > 30 * 86400000
            }
            onClick={() => open("correct")}
          >
            Corregir cantidades
          </Button>
          <Button variant="destructive" onClick={() => open("cancel")}>
            Anular venta
          </Button>
        </section>
      )}
      {mode && (
        <Modal
          title={mode === "correct" ? "Corregir venta" : "Anular venta"}
          description="Revisa el efecto sobre la venta y el inventario antes de confirmar."
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          {mode === "correct" &&
            lines.map((l) => (
              <div className="correction-line" key={l.id}>
                <label htmlFor={`q-${l.id}`}>
                  <ProductImage
                    compact
                    src={l.image_url ?? null}
                    name={l.product_name}
                  />
                  {l.product_name}
                  <small>
                    Antes: {l.quantity} {l.unit_name} · {money(l.subtotal)}
                  </small>
                </label>
                <input
                  id={`q-${l.id}`}
                  type="number"
                  min="0.000001"
                  step="any"
                  value={quantities[l.id]}
                  disabled={busy || review}
                  onChange={(e) =>
                    setQuantities({
                      ...quantities,
                      [l.id]: Number(e.target.value),
                    })
                  }
                />
                <span>
                  {money(lineTotal(quantities[l.id], Number(l.price)))}
                </span>
              </div>
            ))}
          <label htmlFor="reason">Motivo (mínimo 5 caracteres)</label>
          <textarea
            id="reason"
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy || review}
          />
          {review && (
            <div className="notice">
              <strong>
                {mode === "cancel"
                  ? "La venta quedará anulada."
                  : `Total: ${money(sale.total)} → ${money(sum)}`}
              </strong>
              <p>
                {mode === "cancel"
                  ? "Se restituirán los consumos originales."
                  : "Se recalculará el consumo de lotes conservando precios y factores históricos."}
              </p>
            </div>
          )}
          {error && <ErrorState error={new Error(error)} />}
          <ActionBar>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => (review ? setReview(false) : setMode(null))}
            >
              {review ? "Volver a editar" : "Cancelar"}
            </Button>
            <Button
              variant={mode === "cancel" ? "destructive" : "default"}
              disabled={
                busy ||
                reason.trim().length < 5 ||
                Object.values(quantities).some(
                  (q) => !Number.isFinite(q) || q <= 0,
                )
              }
              onClick={() => (review ? void change() : setReview(true))}
            >
              {busy
                ? "Procesando…"
                : review
                  ? "Confirmar cambio"
                  : "Revisar cambio"}
            </Button>
          </ActionBar>
        </Modal>
      )}
    </>
  );
}
