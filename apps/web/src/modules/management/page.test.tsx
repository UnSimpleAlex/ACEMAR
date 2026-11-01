import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Management from "./page";
import { list } from "./repository";
vi.mock("../auth/auth", () => ({
  useAuth: () => ({ profile: { role: "admin" } }),
}));
vi.mock("./repository", () => ({
  catalog: vi.fn(async () => [
    {
      id: "p1",
      code: "CEM-001",
      name: "Cemento",
      base_unit: "Bolsa",
      stock: 12,
      minimum: 4,
      price: 32.5,
      units: [],
      image_url:
        "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/cemento.webp",
      image_generated: true,
    },
  ]),
  list: vi.fn(async () => []),
  action: vi.fn(),
}));
afterEach(cleanup);
for (const path of ["/productos", "/existencias"])
  it(`muestra imagen y exportaciones de producto en ${path}`, async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path=":module" element={<Management />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("img", { name: "Cemento" })).toHaveAttribute(
      "loading",
      "lazy",
    );
    expect(
      screen.getByRole("button", { name: "Exportar Excel" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeEnabled();
  });

it("muestra la imagen del producto en lotes", async () => {
  vi.mocked(list).mockResolvedValueOnce([
    {
      id: "lot",
      product_name: "Cemento de lote",
      image_url:
        "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/cemento.webp",
      available: 10,
      cost: 20,
      price: 30,
      created_at: "2026-11-01T05:00:00Z",
    },
  ]);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/lotes"]}>
        <Routes>
          <Route path=":module" element={<Management />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("img", { name: "Cemento de lote" }),
  ).toHaveAttribute("loading", "lazy");
});
