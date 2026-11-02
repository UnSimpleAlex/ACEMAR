import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Modal } from "./modal";
import { ActionBar } from "./action-bar";
import { Button } from "./ui/button";
it("las acciones quedan fuera del área desplazable y conservan el envío nativo", () => {
  const submit = vi.fn((e) => e.preventDefault());
  render(
    <Modal title="Editar producto" onClose={() => {}}>
      <form onSubmit={submit}>
        <label htmlFor="sample-name">Nombre</label>
        <input id="sample-name" defaultValue="Alicate" />
        <ActionBar>
          <Button variant="destructive">Eliminar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button type="submit">Guardar</Button>
        </ActionBar>
      </form>
    </Modal>,
  );
  const save = screen.getByRole("button", { name: "Guardar" });
  expect(save.closest(".modal-footer")).not.toBeNull();
  expect(save.closest(".modal-body")).toBeNull();
  expect((save as HTMLButtonElement).form).toBe(
    screen.getByLabelText("Nombre").closest("form"),
  );
  fireEvent.click(save);
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(submit).toHaveBeenCalledTimes(1);
});
it("las acciones normales fuera de un diálogo permanecen en su formulario", () => {
  const submit = vi.fn((e) => e.preventDefault());
  render(
    <form onSubmit={submit}>
      <ActionBar>
        <Button type="submit">Confirmar abono</Button>
      </ActionBar>
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar abono" }));
  expect(submit).toHaveBeenCalledTimes(1);
});
