import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Detail from "./detail";
import { RecordDetail } from "../management/record-detail";
const line = {
  id: "line",
  unit_id: "unit",
  product_name: "Nombre histórico",
  unit_name: "Bolsa",
  quantity: 1,
  price: 32.5,
  subtotal: 32.5,
  factor: 1,
  image_url:
    "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/cemento.webp",
  image_generated: true,
};
vi.mock("../auth/auth", () => ({
  useAuth: () => ({ profile: { role: "admin" } }),
}));
vi.mock("../../shared/backend", () => ({
  rpc: vi.fn(async () => ({
    sale: {
      id: "sale",
      number: 5,
      total: 32.5,
      received: 50,
      state: "confirmed",
      payment: "cash",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    lines: [line],
  })),
}));
afterEach(cleanup);
const provider = (child: React.ReactNode) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <MemoryRouter initialEntries={["/ventas/sale"]}>{child}</MemoryRouter>
  </QueryClientProvider>
);
it("ticket y corrección muestran la imagen con el nombre histórico", async () => {
  render(
    provider(
      <Routes>
        <Route path="/ventas/:id" element={<Detail />} />
      </Routes>,
    ),
  );
  expect(
    await screen.findByRole("img", { name: "Nombre histórico" }),
  ).toHaveAttribute("src", line.image_url);
  fireEvent.click(screen.getByRole("button", { name: "Corregir cantidades" }));
  expect(screen.getAllByRole("img", { name: "Nombre histórico", hidden: true })).toHaveLength(
    2,
  );
});
it("detalle de proforma muestra imagen y nombre histórico", async () => {
  render(
    provider(
      <RecordDetail
        entity="quotations"
        row={{ id: "quote", number: 5, total: 32.5 }}
        onClose={() => {}}
      />,
    ),
  );
  expect(
    await screen.findByRole("img", { name: "Nombre histórico" }),
  ).toHaveAttribute("src", line.image_url);
  expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeEnabled();
});
