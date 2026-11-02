import { rpc } from "../../shared/backend";
import type { Row, Product } from "../../shared/types";
export const list = (entity: string, page: number, search: string) =>
  rpc<Row[]>("acemar_list", {
    p_entity: entity,
    p_page: page,
    p_search: search,
  });
export const catalog = (search: string, page: number) =>
  rpc<Product[]>("acemar_catalog", { p_search: search, p_page: page });
export const save = (entity: string, data: Record<string, unknown>) =>
  rpc<string>("acemar_save", { p_entity: entity, p_data: data });
export const action = (entity: string, id: string, action: string) =>
  entity === "quotations" && action === "delete"
    ? rpc<void>("acemar_delete_quotation", { p_id: id })
    : entity === "products" && action === "delete"
      ? rpc<void>("acemar_delete_product", { p_id: id })
      : rpc<void>("acemar_action", {
          p_entity: entity,
          p_id: id,
          p_action: action,
        });
