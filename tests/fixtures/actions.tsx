import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "../../apps/web/src/shared/components/modal";
import { ActionBar } from "../../apps/web/src/shared/components/action-bar";
import { Button } from "../../apps/web/src/shared/components/ui/button";
import "../../apps/web/src/styles.css";
function Fixture() {
  const [open, setOpen] = useState(true),
    [notice, setNotice] = useState("");
  return (
    <main className="main">
      <div className="page-heading">
        <div>
          <h1>Productos</h1>
          <p>
            Revisión visual de componentes reales; sin operaciones externas.
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary">Exportar Excel</Button>
          <Button variant="secondary">Exportar PDF</Button>
          <Button onClick={() => setOpen(true)}>Registrar producto</Button>
        </div>
      </div>
      <section className="panel">
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Producto">
                  Alicate universal aislado 8 pulgadas
                </td>
                <td data-label="Stock">30</td>
                <td data-label="Acciones">
                  <div className="row-actions">
                    <Button variant="ghost">Ver</Button>
                    <Button variant="ghost" onClick={() => setOpen(true)}>
                      Editar
                    </Button>
                    <Button variant="secondary">Unidades</Button>
                    <Button variant="destructive">Eliminar</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {notice && <p role="status">{notice}</p>}
      {open && (
        <Modal
          title="Editar producto"
          description="Revisión del pie fijo y validación nativa."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setNotice("Formulario validado");
              setOpen(false);
            }}
          >
            <div className="photo-field">
              <div className="upload-picker">
                <strong>Imagen del producto</strong>
                <Button variant="secondary">Seleccionar archivo</Button>
              </div>
            </div>
            {[
              "Código",
              "Nombre del producto",
              "Unidad base",
              "Stock mínimo",
              "Campo de prueba adicional 1",
              "Campo de prueba adicional 2",
              "Campo de prueba adicional 3",
              "Campo de prueba adicional 4",
            ].map((label, i) => (
              <React.Fragment key={label}>
                <label htmlFor={"qa-" + i}>{label}</label>
                <input
                  id={"qa-" + i}
                  defaultValue={
                    i === 1
                      ? "Alicate universal aislado 8 pulgadas"
                      : i === 3
                        ? "5"
                        : "DEMO"
                  }
                  required
                />
              </React.Fragment>
            ))}
            <ActionBar>
              <Button variant="destructive">Eliminar</Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </ActionBar>
          </form>
        </Modal>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
