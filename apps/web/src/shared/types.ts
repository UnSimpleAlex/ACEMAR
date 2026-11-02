export interface Unit {
  id: string;
  name: string;
  factor: number;
}
export interface Product {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  minimum: number;
  stock: number;
  price: number;
  units: Unit[];
  image_url: string | null;
  image_generated: boolean | null;
}
export interface Profile {
  id: string;
  name: string;
  role: "admin" | "seller";
  counter: number;
}
export type Row = Record<string, unknown> & { id: string };
export interface CartLine {
  product: Product;
  unit: Unit;
  quantity: number;
}
export interface Sale {
  revision: number;
  id: string;
  number: number;
  total: number;
  received: number | null;
  payment: "cash" | "credit";
  state: "confirmed" | "cancelled";
  created_at: string;
  customer_id: string | null;
  actor_id: string;
}
export interface SaleLine {
  product_id?: string;
  image_url?: string | null;
  image_generated?: boolean | null;
  id: string;
  product_name: string;
  unit_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  factor: number;
  unit_id: string;
}
export interface SaleDetail {
  sale: Sale;
  lines: SaleLine[];
}
