import { reportPDF } from "../apps/web/src/shared/documents.ts";
import QRCode from "qrcode";
import { receiptFonts } from "./receipt-fonts.mjs";
import { productImagePNG } from "./acemar-product-image.mjs";
export const VERIFY_BASE =
  "https://beft7ipm.function2.insforge.app/acemar-verify-receipt";
export const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export const hash = async (bytes) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function signingKey(secret) {
  if (!secret || secret.length < 32) throw Error("signing key missing");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const signedText = (r) => `${r.code}\n${r.content_sha}\n${r.pdf_sha}`;
export async function signReceipt(r, secret) {
  const result = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(signedText(r)),
  );
  return Array.from(new Uint8Array(result), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function validReceipt(r, secret) {
  if (!/^[a-f0-9]{64}$/.test(r?.signature ?? "")) return false;
  return crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    Uint8Array.from(r.signature.match(/../g), (v) => parseInt(v, 16)),
    new TextEncoder().encode(signedText(r)),
  );
}
export const verificationURL = (code) => VERIFY_BASE + "?code=" + code;
export async function receiptPDF(r, overrides = {}) {
  const detail = r.snapshot,
    images = {},
    cache = new Map();
  let missing = 0;
  if (overrides.images) Object.assign(images, overrides.images);
  else
    for (const line of detail.lines) {
      try {
        if (!line.image_url) {
          missing++;
          continue;
        }
        const url = new URL(line.image_url);
        if (
          url.origin !== "https://beft7ipm.us-east.insforge.app" ||
          !url.pathname.startsWith(
            "/api/storage/buckets/acemar-public/objects/",
          )
        )
          throw Error();
        if (!cache.has(url.href)) {
          if (cache.size >= 24) throw Error();
          const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw Error();
          const raw = new Uint8Array(await response.arrayBuffer());
          if (raw.length > 1048576) throw Error();
          cache.set(url.href, await productImagePNG(raw));
        }
        images[line.id] = cache.get(url.href);
      } catch {
        missing++;
      }
    }
  const qr = QRCode.create(verificationURL(r.code), {
    errorCorrectionLevel: "M",
  }).modules;
  return reportPDF({
    title: `Venta N. ${detail.sale.number}`,
    subtitle: `${new Date(detail.sale.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })} | ${detail.sale.state === "cancelled" ? "ANULADA" : "CONFIRMADA"} | Revisión ${r.revision}`,
    fontBytes: overrides.fontBytes ?? receiptFonts(),
    scope: detail.customer_name
      ? "Cliente: " + detail.customer_name
      : "Venta al público",
    columns: [
      { key: "image_url", label: "FOTO", image: true },
      { key: "product_name", label: "PRODUCTO" },
      { key: "unit_name", label: "UNIDAD" },
      { key: "quantity", label: "CANTIDAD", numeric: true },
      { key: "price", label: "PRECIO", numeric: true, currency: true },
      { key: "subtotal", label: "IMPORTE", numeric: true, currency: true },
    ],
    rows: detail.lines,
    assets: { images, missing },
    totals: [
      {
        label: "TOTAL REGISTRADO",
        value: "S/ " + Number(detail.sale.total).toFixed(2),
      },
      ...(detail.sale.received !== null
        ? [
            {
              label: "Recibido",
              value: "S/ " + Number(detail.sale.received).toFixed(2),
            },
          ]
        : []),
    ],
    verification: {
      code: r.code,
      url: verificationURL(r.code),
      contentHash: r.content_sha,
      qr,
    },
    footer:
      "Documento interno ACEMAR. No es un comprobante electrónico SUNAT." +
      (missing ? " Algunas imágenes no están disponibles." : ""),
  });
}
export const bytesBase64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(text);
};
export function emailContent(r) {
  const sale = r.snapshot.sale,
    url = verificationURL(r.code),
    total = "S/ " + Number(sale.total).toFixed(2);
  return {
    subject: `ACEMAR | Documento de venta ${sale.number}`,
    text: `Gracias por tu compra en ACEMAR. Adjuntamos el documento de venta ${sale.number}, por ${total}. Verifica su autenticidad en ${url}. Documento interno, no comprobante electrónico SUNAT.`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#18212f"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#14243b;color:#fff;padding:28px"><span style="color:#ea6b32;font-size:28px">▦</span> <strong style="font-size:28px">ACEMAR</strong><p style="color:#cbd5e1">GESTIÓN COMERCIAL</p></td></tr><tr><td style="padding:32px"><h1 style="font-size:24px">Gracias por tu compra</h1><p>Adjuntamos tu documento de venta en formato PDF.</p><table role="presentation" width="100%" style="background:#f8fafc;padding:20px"><tr><td>Documento</td><td align="right"><strong>N.º ${escapeHTML(sale.number)}</strong></td></tr><tr><td>Total</td><td align="right" style="font-size:24px;color:#2855d9"><strong>${total}</strong></td></tr></table><p>Comprueba el importe y el estado vigente mediante el QR del PDF o este enlace:</p><p><a href="${url}" style="display:inline-block;background:#2855d9;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Verificar documento</a></p><p style="font-size:12px;color:#52637b;overflow-wrap:anywhere">Código de verificación: ${r.code}</p></td></tr><tr><td style="padding:24px 32px;background:#f8fafc;font-size:12px;color:#52637b">Documento interno de ACEMAR. No constituye un comprobante electrónico SUNAT. No compartas el enlace de verificación fuera de las personas que necesitan revisar esta compra.</td></tr></table></td></tr></table></body></html>`,
  };
}
export function draftEmail(
  r,
  to,
  pdf,
  from = "ACEMAR <no-reply@acemar.invalid>",
) {
  const mail = emailContent(r),
    boundary = "acemar-" + crypto.randomUUID(),
    alt = "alt-" + crypto.randomUUID();
  const b64 = (text) => bytesBase64(new TextEncoder().encode(text));
  const folded = (text) => text.match(/.{1,76}/g)?.join("\r\n") ?? "";
  return new TextEncoder().encode(
    [
      `X-Unsent: 1`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      folded(b64(mail.text)),
      `--${alt}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      folded(b64(mail.html)),
      `--${alt}--`,
      `--${boundary}`,
      "Content-Type: application/pdf",
      `Content-Disposition: attachment; filename="ACEMAR-venta-${r.snapshot.sale.number}.pdf"`,
      "Content-Transfer-Encoding: base64",
      "",
      folded(bytesBase64(pdf)),
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
}
