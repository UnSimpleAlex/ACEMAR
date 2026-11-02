import { client } from "../../shared/backend";
export interface ReceiptResult {
  pdf?: string;
  eml?: string;
  code?: string;
  pdfHash?: string;
  contentHash?: string;
  revision?: number;
  sent?: boolean;
  emailConfigured?: boolean;
}
export function receiptError(
  error: { statusCode?: number; message?: string; error?: string } | null,
) {
  const status = error?.statusCode;
  if (status === 401)
    return "Tu sesión venció. Inicia sesión nuevamente para enviar el documento.";
  if (status === 403) return "No tienes acceso a este documento.";
  // Only display the controlled messages produced by our receipt handler.
  const message = error?.message || error?.error || "";
  const prefixes = [
    "Brevo bloqueó la IP",
    "El proveedor rechazó las credenciales",
    "No se pudo confirmar el envío.",
    "No se puede reenviar ahora.",
    "El envío anterior está pendiente",
    "La venta cambió.",
    "El archivo no supera",
    "Escribe un correo válido.",
    "Usa el correo real",
    "El servicio de correo aún",
    "No se pudo preparar el documento. Reintenta",
  ];
  if (prefixes.some((prefix) => message.startsWith(prefix))) return message;
  if (status === 409)
    return "No se puede reenviar ahora. Revisa si ya se envió o si la venta cambió.";
  if (status === 502)
    return "No se pudo confirmar el envío. Revisa el correo antes de intentar enviarlo nuevamente.";
  return "No se pudo preparar el documento. Reintenta en unos momentos. Si continúa, contacta al administrador.";
}
export async function receiptRequest(
  body: Record<string, unknown>,
): Promise<ReceiptResult> {
  const { data, error } = await client().functions.invoke("acemar-receipt", {
    body,
  });
  if (error || data?.error)
    throw new Error(
      typeof data?.error === "string" ? data.error : receiptError(error),
    );
  return data as ReceiptResult;
}
export function decodeFile(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
export const verifyReceiptURL = (code: string) =>
  "https://beft7ipm.function2.insforge.app/acemar-verify-receipt?code=" + code;
