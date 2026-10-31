import { create } from "zustand";
import type { CartLine, Product, Unit } from "../../shared/types";
interface Cart {
  lines: CartLine[];
  requestKey: string;
  quotationId: string | null;
  add: (p: Product, u: Unit) => void;
  setQuantity: (id: string, q: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  replace: (lines: CartLine[], quotationId: string) => void;
}
export const useCart = create<Cart>((set) => ({
  lines: [],
  requestKey: crypto.randomUUID(),
  quotationId: null,
  add: (product, unit) =>
    set((s) => {
      const found = s.lines.find((l) => l.unit.id === unit.id);
      return {
        lines: found
          ? s.lines.map((l) =>
              l.unit.id === unit.id ? { ...l, quantity: l.quantity + 1 } : l,
            )
          : [...s.lines, { product, unit, quantity: 1 }],
        requestKey: crypto.randomUUID(),
      };
    }),
  setQuantity: (id, q) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.unit.id === id ? { ...l, quantity: q } : l)),
      requestKey: crypto.randomUUID(),
    })),
  remove: (id) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.unit.id !== id),
      requestKey: crypto.randomUUID(),
    })),
  clear: () =>
    set({ lines: [], requestKey: crypto.randomUUID(), quotationId: null }),
  replace: (lines, quotationId) =>
    set({ lines, quotationId, requestKey: crypto.randomUUID() }),
}));
