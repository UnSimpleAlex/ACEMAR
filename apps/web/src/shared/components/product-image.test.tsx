import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductImage } from "./product-image";
afterEach(cleanup);
it("carga de forma diferida y mantiene texto alternativo", () => {
  render(
    <ProductImage src="https://example.invalid/nail.webp" name="Clavos" />,
  );
  expect(screen.getByRole("img", { name: "Clavos" })).toHaveAttribute(
    "loading",
    "lazy",
  );
});
it("recupera imágenes fallidas y reintenta cuando cambia su URL", () => {
  const { rerender } = render(
    <ProductImage src="https://example.invalid/old.webp" name="Clavos" />,
  );
  fireEvent.error(screen.getByRole("img", { name: "Clavos" }));
  expect(
    screen.getByRole("img", { name: /Sin imagen disponible/ }),
  ).toBeInTheDocument();
  rerender(
    <ProductImage src="https://example.invalid/new.webp" name="Clavos" />,
  );
  expect(screen.getByRole("img", { name: "Clavos" })).toHaveAttribute(
    "src",
    "https://example.invalid/new.webp",
  );
});
it("un producto sin foto mantiene una alternativa accesible", () => {
  render(<ProductImage src={null} name="Cemento" />);
  expect(
    screen.getByRole("img", { name: /Sin imagen disponible de Cemento/ }),
  ).toBeInTheDocument();
});
