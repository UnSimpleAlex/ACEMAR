import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Assistant from "./assistant";
import { askAssistant } from "./assistant-api";
vi.mock("./assistant-api", () => ({ askAssistant: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("consulta Gemini y muestra fuente del servidor", async () => {
  vi.mocked(askAssistant).mockResolvedValue({
    answer: "Revisa el stock de cemento.",
    model: "gemini-3.5-flash",
    date: "2026-11-01",
  });
  render(<Assistant />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar stock" }));
  expect(
    await screen.findByText("Revisa el stock de cemento."),
  ).toBeInTheDocument();
  expect(askAssistant).toHaveBeenCalledWith("Revisar stock");
  expect(screen.getByText(/gemini-3.5-flash/)).toBeInTheDocument();
});
it("permite reintentar después de un fallo sin presentar respuestas locales como IA", async () => {
  vi.mocked(askAssistant).mockRejectedValue(
    new Error("Cuota disponible agotada"),
  );
  render(<Assistant />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar créditos" }));
  expect(
    await screen.findByText("Cuota disponible agotada"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Revisar créditos" }),
  ).toBeEnabled();
  expect(screen.queryByText(/Modo local/)).not.toBeInTheDocument();
});
