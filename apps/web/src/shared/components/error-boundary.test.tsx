import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./error-boundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("conserva el contenido cuando la pantalla funciona", () => {
  render(
    <ErrorBoundary>
      <p>Ventas registradas</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText("Ventas registradas")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ofrece recuperación sin filtrar el error interno ni prometer que el cobro falló", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("internal-sensitive-value");
  }
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("revisa Ventas");
  expect(
    screen.queryByText(/internal-sensitive-value/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Recargar aplicación" }),
  ).toBeEnabled();
});
