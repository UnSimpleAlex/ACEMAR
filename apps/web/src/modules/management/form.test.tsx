import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EntityForm } from "./form";
import { configs } from "./config";
import { save } from "./repository";
import { preparePhoto, uploadProductPhoto } from "../../shared/product-photo";
vi.mock("./repository", () => ({ save: vi.fn(), list: vi.fn(async () => []) }));
vi.mock("../../shared/product-photo", () => ({
  preparePhoto: vi.fn(),
  uploadProductPhoto: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const mount = (row?: {
  id: string;
  name: string;
  code: string;
  base_unit: string;
  minimum: number;
}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntityForm
        config={configs.productos}
        row={row}
        onClose={() => {}}
        onSaved={() => {}}
        onDelete={row ? () => {} : undefined}
      />
    </QueryClientProvider>,
  );
it("muestra campo de imagen al crear y acciones explícitas al editar", () => {
  mount({
    id: "p",
    name: "Cemento",
    code: "CEM",
    base_unit: "Bolsa",
    minimum: 0,
  });
  expect(screen.getByLabelText("Imagen del producto")).toHaveAttribute(
    "accept",
    "image/png,image/jpeg,image/webp",
  );
  expect(screen.getByRole("button", { name: "Eliminar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
});
it("reintenta la foto con el ID ya guardado sin duplicar el producto", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:preview";
      }
      static revokeObjectURL() {}
    },
  );
  vi.mocked(preparePhoto).mockResolvedValue(
    new Blob(["webp"], { type: "image/webp" }),
  );
  vi.mocked(uploadProductPhoto)
    .mockRejectedValueOnce(new Error("Falló la carga"))
    .mockResolvedValueOnce({ url: "image", key: "key" });
  vi.mocked(save).mockResolvedValue("saved-product");
  mount();
  for (const [label, value] of [
    ["Código", "NEW"],
    ["Nombre", "Nuevo"],
    ["Unidad base", "Unidad"],
  ])
    fireEvent.change(screen.getByLabelText(new RegExp(label)), {
      target: { value },
    });
  fireEvent.change(screen.getByLabelText("Imagen del producto"), {
    target: { files: [new File(["a"], "photo.png", { type: "image/png" })] },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText(/imagen sigue pendiente/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(vi.mocked(save).mock.calls[1][1].id).toBe("saved-product");
  vi.unstubAllGlobals();
});
