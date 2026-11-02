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
export async function receiptRequest(
  body: Record<string, unknown>,
): Promise<ReceiptResult> {
  const { data, error } = await client().functions.invoke("acemar-receipt", {
    body,
  });
  if (error || data?.error)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "No se pudo preparar el documento. Revisa tu sesión e inténtalo otra vez.",
    );
  return data as ReceiptResult;
}
export function decodeFile(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
export const verifyReceiptURL = (code: string) =>
  "https://beft7ipm.function2.insforge.app/acemar-verify-receipt?code=" + code;
