import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import POS from "./pos";
import { useCart } from "./cart";
import type { Product } from "../../shared/types";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../shared/backend", () => ({ rpc }));
const cement: Product = {
  id: "p1",
  code: "CEM-001",
  name: "Cemento Portland",
  base_unit: "saco",
  minimum: 2,
  stock: 120,
  price: 32.5,
  units: [{ id: "u1", name: "saco", factor: 1 }],
  image_url: null,
  image_generated: null,
};
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <POS />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  cleanup();
  useCart.getState().clear();
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === "acemar_catalog" ? [cement] : [],
  );
});
describe("punto de venta", () => {
  it("carrito vacío no permite cobrar", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: /Cobrar S\/\s*0\.00/ }),
    ).toBeDisabled();
  });
  it("agregar y modificar cantidades actualiza total", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Agregar Cemento Portland" }),
    );
    expect(
      screen.getByRole("button", { name: /Cobrar S\/\s*32\.50/ }),
    ).toBeEnabled();
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "Cantidad de Cemento Portland en saco",
      }),
      { target: { value: "2" } },
    );
    expect(
      screen.getByRole("button", { name: /Cobrar S\/\s*65\.00/ }),
    ).toBeEnabled();
  });
  it("cantidades que exceden stock impiden cobrar y explican el error", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Agregar Cemento Portland" }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "Cantidad de Cemento Portland en saco",
      }),
      { target: { value: "121" } },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no superar las existencias",
    );
    expect(screen.getByRole("button", { name: /Cobrar S\// })).toBeDisabled();
  });
  it("no comunica éxito cuando el servidor rechaza el cobro", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Agregar Cemento Portland" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Cobrar S\/\s*32\.50/ }),
    );
    fireEvent.change(screen.getByLabelText("Importe recibido (S/)"), {
      target: { value: "100" },
    });
    rpc.mockImplementation(async (name: string) => {
      if (name === "acemar_checkout") throw new Error("Stock insuficiente");
      return [cement];
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Stock insuficiente"),
    );
    expect(screen.queryByText("¡Venta completada!")).not.toBeInTheDocument();
    expect(useCart.getState().lines).toHaveLength(1);
  });
});
