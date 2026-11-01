import { ProductImage } from "../../shared/components/product-image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, type FieldValues } from "react-hook-form";
import type { Config } from "./config";
import type { Product, Row } from "../../shared/types";
import { rpc } from "../../shared/backend";
import { save, list } from "./repository";
import { Modal } from "../../shared/components/modal";
import { Button } from "../../shared/components/ui/button";
import { ErrorState } from "../../shared/components/feedback";
export function EntityForm({
  config,
  row,
  onClose,
  onSaved,
}: {
  config: Config;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");
  const form = useForm<FieldValues>({
    defaultValues: {
      minimum: 0,
      credit_limit: 0,
      counter: 1,
      ...row,
      ...(row && config.entity === "profiles" ? { user_id: row.id } : {}),
    },
  });
  const [cancel, setCancel] = useState(false);
  const products = useQuery({
    queryKey: ["catalog", lookup, 0],
    queryFn: () =>
      rpc<Product[]>("acemar_catalog", { p_search: lookup, p_page: 0 }),
    enabled: config.entity === "lots",
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", lookup, 0],
    queryFn: () => list("suppliers", 0, lookup),
    enabled: config.entity === "lots",
  });
  const selected = products.data?.find(
    (p) => p.id === form.watch("product_id"),
  );
  async function submit(values: FieldValues) {
    setError("");
    try {
      const data: Record<string, unknown> = {};
      config.fields.forEach((f) => {
        data[f.key] =
          f.type === "number"
            ? Number(values[f.key])
            : f.type === "checkbox"
              ? Boolean(values[f.key])
              : String(values[f.key] ?? "").trim();
      });
      if (row) data.id = row.id;
      await save(config.entity, data);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={`${row ? "Editar" : "Registrar"} ${config.singular}`}
      description="Los campos indicados como obligatorios deben completarse."
      onClose={() => {
        if (form.formState.isSubmitting) return;
        if (form.formState.isDirty) setCancel(true);
        else onClose();
      }}
    >
      <form onSubmit={form.handleSubmit(submit)} noValidate>
        {row && config.entity === "products" && (
          <ProductImage
            src={typeof row.image_url === "string" ? row.image_url : null}
            name={String(row.name)}
          />
        )}
        {config.entity === "lots" && (
          <>
            <label htmlFor="lookup">Buscar producto o proveedor</label>
            <input
              id="lookup"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Escribe un nombre…"
            />
            <p className="muted small">
              Los selectores muestran los primeros resultados de esta búsqueda.
            </p>
          </>
        )}
        <div className="form-grid">
          {config.fields.map((f) => {
            let options = f.options;
            if (f.key === "product_id")
              options = products.data?.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.base_unit})`,
              }));
            if (f.key === "supplier_id")
              options = suppliers.data?.map((p) => ({
                value: p.id,
                label: String(p.name),
              }));
            return (
              <div
                className={f.type === "checkbox" ? "checkbox-field" : "field"}
                key={f.key}
              >
                <label htmlFor={f.key}>
                  {f.label}
                  {f.required && <span aria-hidden="true"> *</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    id={f.key}
                    {...form.register(f.key, {
                      required: f.required ? "Selecciona una opción." : false,
                    })}
                  >
                    <option value="">Seleccionar</option>
                    {options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={f.key}
                    type={
                      f.type === "checkbox"
                        ? "checkbox"
                        : f.type === "number"
                          ? "number"
                          : "text"
                    }
                    step={f.step}
                    min={f.min}
                    max={f.type === "number" ? f.max : undefined}
                    maxLength={f.type !== "number" ? f.max : undefined}
                    readOnly={Boolean(
                      row && ["base_unit", "user_id"].includes(f.key),
                    )}
                    aria-required={f.required}
                    aria-invalid={!!form.formState.errors[f.key]}
                    aria-describedby={`${f.key}-error ${f.key}-help`}
                    {...form.register(f.key, {
                      required: f.required ? "Completa este campo." : false,
                      min:
                        f.min !== undefined
                          ? { value: f.min, message: `El mínimo es ${f.min}.` }
                          : undefined,
                      max:
                        f.type === "number" && f.max !== undefined
                          ? { value: f.max, message: `El máximo es ${f.max}.` }
                          : undefined,
                      validate: (v) =>
                        f.type !== "number" ||
                        Number.isFinite(Number(v)) ||
                        "Ingresa un número válido.",
                    })}
                  />
                )}
                <small id={`${f.key}-help`}>{f.help}</small>
                <p className="field-error" id={`${f.key}-error`}>
                  {String(form.formState.errors[f.key]?.message ?? "")}
                </p>
              </div>
            );
          })}
        </div>
        {selected && (
          <div className="notice">
            <div className="product-list-identity">
              <ProductImage src={selected.image_url} name={selected.name} />
              <strong>{selected.name}</strong>
            </div>
            Existencia actual: {selected.stock} {selected.base_unit}. El ingreso
            se sumará al registrar.
          </div>
        )}
        {error && <ErrorState error={new Error(error)} />}
        {cancel && (
          <div className="notice" role="alert">
            Hay cambios sin guardar.
            <Button variant="secondary" onClick={() => setCancel(false)}>
              Seguir editando
            </Button>
            <Button variant="destructive" onClick={onClose}>
              Descartar cambios
            </Button>
          </div>
        )}
        <div className="form-actions">
          <Button
            variant="secondary"
            disabled={form.formState.isSubmitting}
            onClick={() =>
              form.formState.isDirty ? setCancel(true) : onClose()
            }
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
