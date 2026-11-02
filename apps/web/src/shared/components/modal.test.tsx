import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./modal";
it("diálogo etiquetado permite cancelar mediante Escape", () => {
  const close = vi.fn();
  render(
    <Modal
      title="Revisar venta"
      description="Comprueba cantidades"
      onClose={close}
    >
      <button>Volver</button>
    </Modal>,
  );
  expect(
    screen.getByRole("dialog", { name: "Revisar venta" }),
  ).toHaveAccessibleDescription("Comprueba cantidades");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalled();
});
