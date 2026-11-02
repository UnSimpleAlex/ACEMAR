/* global Deno */
import { allowedWebOrigin } from "./web-origins.mjs";
import { createClient, createAdminClient } from "@insforge/sdk";
import {
  receiptPDF,
  hash,
  signReceipt,
  validReceipt,
  emailContent,
  draftEmail,
  bytesBase64,
} from "./receipt-core.mjs";
const BASE = "https://beft7ipm.us-east.insforge.app";

const emailValid = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s<>@,;:"\\]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(value);
export function smtpFailure(error) {
  if (error?.code === "EAUTH" && error?.responseCode === 525)
    return {
      code: "SMTP_IP_NOT_AUTHORIZED",
      message:
        "Brevo bloqueó la IP de salida del servidor. El administrador debe autorizarla en Brevo → Seguridad → IP autorizadas. No se confirmó el envío.",
    };
  if (error?.code === "EAUTH")
    return {
      code: "SMTP_AUTH_FAILED",
      message:
        "El proveedor rechazó las credenciales de correo. Contacta al administrador. No se confirmó el envío.",
    };
  return {
    code: "SMTP_DELIVERY_UNKNOWN",
    message:
      "No se pudo confirmar el envío. Revisa el correo antes de intentar enviarlo nuevamente.",
  };
}
export async function handleReceipt(
  req,
  { userClient, admin, env, render = receiptPDF, sendMail },
) {
  const origin = req.headers.get("origin"),
    headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, x-client-info",
    };
  // The SDK reads message for HTTP failures; error alone loses the explanation.
  const reply = (status, data) =>
    new Response(
      JSON.stringify({
        ...data,
        ...(data.error ? { message: data.error } : {}),
      }),
      { status, headers },
    );
  if (origin && !allowedWebOrigin(origin, env("ALLOWED_WEB_ORIGINS")))
    return reply(403, { error: "Origen no permitido." });
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply(405, { error: "Método no permitido." });
  try {
    const { data: identity, error: authError } =
      await userClient.auth.getCurrentUser();
    if (authError || !identity?.user?.id)
      return reply(401, { error: "Inicia sesión para acceder al documento." });
    if (Number(req.headers.get("content-length")) > 2048)
      return reply(400, { error: "Datos inválidos." });
    const text = await req.text();
    if (text.length > 2048) return reply(400, { error: "Datos inválidos." });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(400, { error: "Datos inválidos." });
    }
    const configured = Boolean(
      env("MAIL_SMTP_HOST") &&
      env("MAIL_SMTP_USER") &&
      env("MAIL_SMTP_PASS") &&
      env("MAIL_FROM"),
    );
    if (body.action === "capabilities")
      return reply(200, { emailConfigured: configured });
    if (
      !["download", "draft", "send"].includes(body.action) ||
      !/^[a-f0-9-]{36}$/i.test(body.saleId)
    )
      return reply(400, { error: "Datos inválidos." });
    if (body.action !== "download" && !emailValid(body.email))
      return reply(400, { error: "Escribe un correo válido." });
    if (
      body.action === "send" &&
      (!configured || body.email.endsWith(".invalid"))
    )
      return reply(503, {
        error: configured
          ? "Usa el correo real del cliente."
          : "El servicio de correo aún no tiene un remitente configurado. Puedes descargar el correo preparado.",
      });
    const { data: prepared, error } = await userClient.database.rpc(
      "acemar_receipt_prepare",
      { p_sale: body.saleId },
    );
    if (error)
      return reply(403, { error: "No tienes acceso a este documento." });
    let receipt = prepared,
      pdf;
    if (!receipt.pdf_key) {
      receipt.content_sha = await hash(receipt.canonical);
      pdf = new Uint8Array(await render(receipt));
      receipt.pdf_sha = await hash(pdf);
      receipt.signature = await signReceipt(
        receipt,
        env("RECEIPT_SIGNING_KEY"),
      );
      const key = `receipts/${receipt.code}/${crypto.randomUUID()}.pdf`;
      const uploaded = await admin.storage
        .from("acemar-receipts")
        .upload(key, new Blob([pdf], { type: "application/pdf" }));
      if (uploaded.error) throw Error("storage");
      const saved = await admin.database.rpc("acemar_receipt_finalize", {
        p_code: receipt.code,
        p_actor: identity.user.id,
        p_key: key,
        p_pdf_sha: receipt.pdf_sha,
        p_content_sha: receipt.content_sha,
        p_signature: receipt.signature,
      });
      if (saved.error) {
        await admin.storage.from("acemar-receipts").remove(key);
        return reply(409, {
          error:
            "La venta cambió. Actualiza la página y genera el documento otra vez.",
        });
      }
      receipt = saved.data;
      if (receipt.pdf_key !== key) {
        await admin.storage.from("acemar-receipts").remove(key);
        pdf = undefined;
      }
    }
    if (!pdf) {
      const file = await admin.storage
        .from("acemar-receipts")
        .download(receipt.pdf_key);
      if (file.error || !file.data) throw Error("storage");
      pdf = new Uint8Array(await file.data.arrayBuffer());
    }
    if (
      !(await validReceipt(receipt, env("RECEIPT_SIGNING_KEY"))) ||
      (await hash(pdf)) !== receipt.pdf_sha
    )
      return reply(409, {
        error:
          "El archivo no supera la verificación de integridad. Contacta al administrador.",
      });
    if (body.action === "download")
      return reply(200, {
        pdf: bytesBase64(pdf),
        code: receipt.code,
        pdfHash: receipt.pdf_sha,
        contentHash: receipt.content_sha,
        revision: receipt.revision,
      });
    const content = emailContent(receipt);
    if (body.action === "draft")
      return reply(200, {
        eml: bytesBase64(
          draftEmail(
            receipt,
            body.email,
            pdf,
            env("MAIL_FROM") || "ACEMAR <no-reply@acemar.invalid>",
          ),
        ),
        number: receipt.snapshot.sale.number,
      });
    if (!/^[a-f0-9-]{36}$/i.test(body.requestId))
      return reply(400, { error: "Solicitud inválida." });
    const delivery = await admin.database.rpc("acemar_receipt_delivery_begin", {
      p_code: receipt.code,
      p_actor: identity.user.id,
      p_recipient: body.email,
      p_id: body.requestId,
    });
    if (delivery.error)
      return reply(409, {
        error:
          "No se puede reenviar ahora. Revisa si ya se envió o si la venta cambió.",
      });
    if (!delivery.data.claimed)
      return reply(delivery.data.status === "sent" ? 200 : 409, {
        sent: delivery.data.status === "sent",
        error:
          delivery.data.status === "sent"
            ? undefined
            : "El envío anterior está pendiente de confirmación. No se enviará de nuevo automáticamente.",
      });
    try {
      await sendMail({
        from: env("MAIL_FROM"),
        to: body.email,
        ...content,
        attachments: [
          {
            filename: `ACEMAR-venta-${receipt.snapshot.sale.number}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
        ],
      });
      await admin.database.rpc("acemar_receipt_delivery_finish", {
        p_id: body.requestId,
        p_status: "sent",
      });
      return reply(200, { sent: true });
    } catch (error) {
      const failure = smtpFailure(error);
      console.warn(
        JSON.stringify({ event: "receipt_smtp_failed", code: failure.code }),
      );
      await admin.database.rpc("acemar_receipt_delivery_finish", {
        p_id: body.requestId,
        p_status: "unknown",
      });
      return reply(502, {
        code: failure.code,
        error: failure.message,
      });
    }
  } catch {
    return reply(503, {
      error: "No se pudo preparar el documento. Reintenta en unos momentos.",
    });
  }
}
export default async function (req) {
  const env = (name) => Deno.env.get(name),
    token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token && req.method !== "OPTIONS")
    return new Response(JSON.stringify({ error: "Inicia sesión." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  return handleReceipt(req, {
    env,
    userClient: createClient({ baseUrl: BASE, edgeFunctionToken: token }),
    admin: createAdminClient({ baseUrl: BASE, apiKey: env("API_KEY") }),
    sendMail: async (message) => {
      const { default: mailer } = await import("nodemailer");
      const port = Number(env("MAIL_SMTP_PORT") || 465);
      const transport = mailer.createTransport({
        host: env("MAIL_SMTP_HOST"),
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: env("MAIL_SMTP_USER"), pass: env("MAIL_SMTP_PASS") },
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 15000,
        socketTimeout: 20000,
      });
      try {
        await transport.sendMail(message);
      } finally {
        transport.close();
      }
    },
  });
}
