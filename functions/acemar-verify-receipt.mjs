/* global Deno */
import { createAdminClient } from "@insforge/sdk";
import { validReceipt, escapeHTML } from "./receipt-core.mjs";
export async function verifyRequest(req, { lookup, secret }) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    let code, provided;
    if (req.method === "GET") code = new URL(req.url).searchParams.get("code");
    else if (req.method === "POST") {
      const text = await req.text();
      if (text.length > 512) throw Error();
      const body = JSON.parse(text);
      code = body.code;
      provided = body.pdfHash;
      if (!/^[a-f0-9]{64}$/.test(provided)) throw Error();
    } else return new Response("Método no permitido", { status: 405, headers });
    if (!/^[a-f0-9]{64}$/.test(code ?? "")) throw Error();
    const receipt = await lookup(code);
    if (!receipt || !(await validReceipt(receipt, secret))) throw Error();
    if (req.method === "POST")
      return new Response(
        JSON.stringify({
          matches: provided === receipt.pdf_sha,
          status: receipt.status,
        }),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    const states = {
        valid: ["Documento vigente", "#15803d"],
        replaced: ["Documento reemplazado", "#b45309"],
        cancelled: ["Venta anulada", "#b91c1c"],
      },
      [label, color] = states[receipt.status] ?? ["No válido", "#b91c1c"];
    const nonce = crypto.randomUUID().replaceAll("-", "");
    headers["Content-Type"] = "text/html; charset=utf-8";
    headers["Content-Security-Policy"] =
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
    return new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación ACEMAR</title><style>body{margin:0;background:#f1f5f9;font:16px/1.6 system-ui;color:#18212f}main{max-width:600px;margin:40px auto;padding:32px;background:white;border-radius:16px;border-top:8px solid #2855d9}h1{font-size:24px}h2{color:${color};font-size:21px}dt{color:#52637b}dd{margin:0 0 16px;font-weight:600}code{overflow-wrap:anywhere;font-size:12px}input{max-width:100%}small{color:#52637b}@media(max-width:640px){main{margin:16px;padding:24px}}</style><main><strong style="font-size:28px">ACEMAR</strong><h1>Verificación de autenticidad</h1><h2>${label}</h2><dl><dt>Venta</dt><dd>N.º ${escapeHTML(receipt.number)}</dd><dt>Importe del documento</dt><dd>S/ ${Number(receipt.issued_total).toFixed(2)}</dd><dt>Revisión</dt><dd>${escapeHTML(receipt.revision)}</dd><dt>Generado</dt><dd>${escapeHTML(new Date(receipt.issued_at).toLocaleString("es-PE", { timeZone: "America/Lima" }))}</dd><dt>Código único</dt><dd><code>${code}</code></dd></dl><p>Firma del servidor verificada. Compara el importe y el estado con el documento recibido.</p><hr><h2 style="color:#18212f">¿El PDF fue modificado?</h2><p>Selecciona el PDF recibido para compararlo con el archivo original. El archivo se procesa en tu dispositivo; solo se consulta su huella SHA-256.</p><input type="file" id="file" accept="application/pdf" aria-label="PDF recibido"><p id="result" role="status"></p><small>Documento interno de ACEMAR. No es un comprobante electrónico SUNAT.</small></main><script nonce="${nonce}">document.getElementById('file').addEventListener('change',async e=>{const result=document.getElementById('result'),file=e.target.files[0];if(!file)return;if(file.size>10485760){result.textContent='Selecciona un archivo de hasta 10 MB.';return;}try{result.textContent='Verificando…';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${code}',pdfHash:hash})});if(!r.ok)throw Error();const d=await r.json();result.textContent=d.matches?(d.status==='valid'?'El PDF coincide con el original y está vigente.':'El PDF es original, pero la venta está anulada o el documento fue reemplazado.'):'El archivo NO coincide con el PDF original.';}catch{result.textContent='No se pudo verificar. Reintenta.';}});</script></html>`,
      { headers },
    );
  } catch {
    return new Response("No se encontró un documento válido con este código.", {
      status: 404,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
export default async function (req) {
  const admin = createAdminClient({
    baseUrl: "https://beft7ipm.us-east.insforge.app",
    apiKey: Deno.env.get("API_KEY"),
  });
  return verifyRequest(req, {
    secret: Deno.env.get("RECEIPT_SIGNING_KEY"),
    lookup: async (code) => {
      const r = await admin.database.rpc("acemar_receipt_lookup", {
        p_code: code,
      });
      return r.error ? null : r.data;
    },
  });
}
