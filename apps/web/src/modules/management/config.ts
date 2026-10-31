export interface Field {
  key: string;
  label: string;
  type?: "number" | "checkbox" | "select" | "text";
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  options?: { value: string; label: string }[];
  help?: string;
}
export interface Config {
  title: string;
  description: string;
  entity: string;
  singular: string;
  columns: [
    key: string,
    label: string,
    type?: "money" | "number" | "date" | "boolean" | "text",
  ][];
  fields: Field[];
  create?: boolean;
  edit?: boolean;
}
export const configs: Record<string, Config> = {
  productos: {
    title: "Productos",
    description: "Organiza tu catálogo y las unidades de venta.",
    entity: "products",
    singular: "producto",
    create: true,
    edit: true,
    columns: [
      ["code", "Código"],
      ["name", "Producto"],
      ["stock", "Existencias", "number"],
      ["price", "Precio base", "money"],
    ],
    fields: [
      { key: "code", label: "Código", required: true, max: 40 },
      { key: "name", label: "Nombre", required: true, max: 160 },
      {
        key: "base_unit",
        label: "Unidad base",
        required: true,
        max: 30,
        help: "No se modifica después de crear el producto.",
      },
      {
        key: "minimum",
        label: "Existencia mínima",
        type: "number",
        min: 0,
        step: "any",
        required: true,
      },
    ],
  },
  existencias: {
    title: "Existencias",
    description: "Consulta la disponibilidad actual en unidades base.",
    entity: "products",
    singular: "producto",
    columns: [
      ["code", "Código"],
      ["name", "Producto"],
      ["stock", "Disponible", "number"],
      ["base_unit", "Unidad base"],
      ["minimum", "Mínimo", "number"],
    ],
    fields: [],
  },
  lotes: {
    title: "Lotes",
    description: "Registra entradas y conserva su costo y procedencia.",
    entity: "lots",
    singular: "lote",
    create: true,
    columns: [
      ["product_name", "Producto"],
      ["supplier_name", "Proveedor"],
      ["available", "Disponible", "number"],
      ["cost", "Costo base", "money"],
      ["price", "Precio base", "money"],
      ["created_at", "Ingreso", "date"],
    ],
    fields: [
      { key: "product_id", label: "Producto", type: "select", required: true },
      { key: "supplier_id", label: "Proveedor", type: "select" },
      {
        key: "quantity",
        label: "Cantidad en unidad base",
        type: "number",
        min: 0.000001,
        step: "any",
        required: true,
      },
      {
        key: "cost",
        label: "Costo por unidad base (S/)",
        type: "number",
        min: 0,
        step: "any",
        required: true,
      },
      {
        key: "price",
        label: "Precio por unidad base (S/)",
        type: "number",
        min: 0.000001,
        step: "any",
        required: true,
      },
    ],
  },
  proveedores: {
    title: "Proveedores",
    description: "Gestiona los contactos que abastecen tu almacén.",
    entity: "suppliers",
    singular: "proveedor",
    create: true,
    edit: true,
    columns: [
      ["name", "Proveedor"],
      ["document", "Documento"],
      ["phone", "Teléfono"],
      ["address", "Dirección"],
    ],
    fields: [
      { key: "name", label: "Nombre o razón social", required: true, max: 160 },
      { key: "document", label: "Documento", max: 20 },
      { key: "phone", label: "Teléfono", max: 30 },
      { key: "address", label: "Dirección", max: 200 },
    ],
  },
  creditos: {
    title: "Créditos",
    description: "Consulta saldos y registra abonos de tus clientes.",
    entity: "customers",
    singular: "cliente",
    create: true,
    edit: true,
    columns: [
      ["name", "Cliente"],
      ["document", "Documento"],
      ["credit_limit", "Límite", "money"],
      ["balance", "Deuda", "money"],
      ["authorized", "Crédito autorizado", "boolean"],
    ],
    fields: [
      { key: "name", label: "Nombre", required: true, max: 160 },
      { key: "document", label: "Documento", max: 20 },
      { key: "phone", label: "Teléfono", max: 30 },
      {
        key: "credit_limit",
        label: "Límite de crédito (S/)",
        type: "number",
        min: 0,
        step: "0.01",
        required: true,
      },
      {
        key: "authorized",
        label: "Autorizar compras a crédito",
        type: "checkbox",
      },
    ],
  },
  ventas: {
    title: "Ventas",
    description: "Consulta las operaciones registradas y sus comprobantes.",
    entity: "sales",
    singular: "venta",
    columns: [
      ["number", "N.º venta"],
      ["created_at", "Fecha", "date"],
      ["customer_name", "Cliente"],
      ["payment", "Tipo"],
      ["state", "Estado"],
      ["total", "Total", "money"],
    ],
    fields: [],
  },
  proformas: {
    title: "Proformas",
    description: "Prepara cotizaciones y revísalas antes de vender.",
    entity: "quotations",
    singular: "proforma",
    columns: [
      ["number", "N.º"],
      ["customer_name", "Cliente"],
      ["created_at", "Fecha", "date"],
      ["state", "Estado"],
      ["total", "Total", "money"],
    ],
    fields: [],
  },
  usuarios: {
    title: "Usuarios",
    description:
      "Autoriza perfiles para identidades registradas en el sistema.",
    entity: "profiles",
    singular: "vendedor",
    create: true,
    edit: true,
    columns: [
      ["name", "Nombre"],
      ["role", "Rol"],
      ["counter", "Mostrador"],
    ],
    fields: [
      {
        key: "user_id",
        label: "ID de identidad autenticada",
        required: true,
        help: "El administrador obtiene este ID desde la gestión de identidades de InsForge.",
      },
      { key: "name", label: "Nombre", required: true, max: 120 },
      {
        key: "counter",
        label: "Mostrador",
        type: "number",
        required: true,
        min: 1,
        max: 5,
        step: "1",
      },
    ],
  },
  auditoria: {
    title: "Auditoría",
    description: "Revisa quién realizó los cambios y sus motivos.",
    entity: "audit",
    singular: "evento",
    columns: [
      ["created_at", "Fecha", "date"],
      ["actor_name", "Responsable"],
      ["action", "Acción"],
      ["reason", "Motivo"],
    ],
    fields: [],
  },
};
