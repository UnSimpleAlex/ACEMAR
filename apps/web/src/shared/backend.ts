import { createClient } from "@insforge/sdk";
const baseUrl = import.meta.env.VITE_INSFORGE_URL;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;
export const configured = Boolean(baseUrl && anonKey);
export const backend = configured ? createClient({ baseUrl, anonKey }) : null;
export function client() {
  if (!backend) throw new Error("Configura la conexión a InsForge.");
  return backend;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().database.rpc(name, args);
  if (error) throw new Error(safeError(error.message));
  return data as T;
}
export function safeError(message: string) {
  const known = [
    "Stock insuficiente",
    "Crédito insuficiente",
    "Cliente no autorizado",
    "Operación no autorizada",
    "Cantidad inválida",
    "Unidad inválida",
    "Precio no disponible",
    "Importe recibido insuficiente",
    "Solicitud ya utilizada",
    "Saldo insuficiente",
    "Motivo obligatorio",
    "Venta no corregible",
    "Venta ya anulada",
    "Proforma no disponible",
    "Lote con existencias",
    "Datos inválidos",
    "El usuario ya tiene perfil",
    "Conflicto de versión",
  ];
  return (
    known.find((t) => message.includes(t)) ??
    "No se pudo completar la operación. Revisa los datos o vuelve a intentarlo."
  );
}
