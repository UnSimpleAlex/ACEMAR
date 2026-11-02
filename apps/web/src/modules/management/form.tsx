import { ActionBar } from "../../shared/components/action-bar";
import { Upload, ImagePlus, X } from "lucide-react";
import { ProductImage } from "../../shared/components/product-image";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, type FieldValues } from "react-hook-form";
import type { Config } from "./config";
import type { Product, Row } from "../../shared/types";
import { rpc } from "../../shared/backend";
import { preparePhoto, uploadProductPhoto } from "../../shared/product-photo";
import { save, list } from "./repository";
import { Modal } from "../../shared/components/modal";
import { Button } from "../../shared/components/ui/button";
import { ErrorState } from "../../shared/components/feedback";
export function EntityForm({
  config,
  row,
  onClose,
  onSaved,
  onDelete,
}: {
  config: Config;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoName, setPhotoName] = useState("");
  const [savedId, setSavedId] = useState(row?.id ?? "");
  const [partial, setPartial] = useState(false);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function choosePhoto(file?: File) {
    setError("");
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await preparePhoto(file));
      setPhotoName(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

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
      if (row || savedId) data.id = savedId || row?.id;
      const id = await save(config.entity, data);
      if (config.entity === "products") {
        setSavedId(id);
        if (photo) {
          setPartial(true);
          await uploadProductPhoto(id, photo);
          setPartial(false);
        }
      }

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
        if (form.formState.isSubmitting || photoBusy) return;
        if (form.formState.isDirty || photo) setCancel(true);
        else onClose();
      }}
    >
      <form onSubmit={form.handleSubmit(submit)} noValidate>
        <fieldset
          disabled={form.formState.isSubmitting || photoBusy}
          className="form-fieldset"
        >
          {config.entity === "products" && (
            <div className="photo-field">
              <ProductImage
                src={
                  preview ||
                  (typeof row?.image_url === "string" ? row.image_url : null)
                }
                name={String(form.watch("name") || "Producto")}
              />
              <label htmlFor="product-photo">Imagen del producto</label>
              <div className="upload-picker">
                <ImagePlus size={28} aria-hidden="true" />
                <strong>
                  {photo
                    ? "Imagen seleccionada"
                    : "Añade una foto del producto"}
                </strong>
                <span>Elige una imagen desde tu dispositivo</span>
                <label htmlFor="product-photo" className="btn btn-secondary">
                  <Upload size={18} />{" "}
                  {photo ? "Cambiar imagen" : "Seleccionar archivo"}
                </label>
                <input
                  id="product-photo"
                  className="sr-only"
                  aria-label="Imagen del producto"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    void choosePhoto(file);
                  }}
                />
              </div>
              <small>
                PNG, JPG o WebP, hasta 5 MB. Se optimiza como WebP y se valida
                de nuevo en el servidor.
              </small>
              {photoName && photo && (
                <small>
                  Lista para guardar: {photoName} ·{" "}
                  {Math.ceil(photo.size / 1024)} KB
                </small>
              )}
              {photoBusy && <p role="status">Preparando imagen…</p>}
              {photo && (
                <Button variant="ghost" onClick={() => setPhoto(null)}>
                  <X size={16} /> Quitar selección
                </Button>
              )}
              {!row && (
                <p className="muted small">
                  El precio y las existencias se registran mediante un lote
                  después de crear el producto.
                </p>
              )}
            </div>
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
                Los selectores muestran los primeros resultados de esta
                búsqueda.
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
                            : f.type === "email"
                              ? "email"
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
                            ? {
                                value: f.min,
                                message: `El mínimo es ${f.min}.`,
                              }
                            : undefined,
                        max:
                          f.type === "number" && f.max !== undefined
                            ? {
                                value: f.max,
                                message: `El máximo es ${f.max}.`,
                              }
                            : undefined,
                        maxLength:
                          f.type !== "number" && f.max
                            ? {
                                value: f.max,
                                message: `Máximo ${f.max} caracteres.`,
                              }
                            : undefined,
                        validate: (v) => {
                          if (
                            f.required &&
                            f.type !== "checkbox" &&
                            !String(v ?? "").trim()
                          )
                            return "Completa este campo.";
                          return (
                            f.type !== "number" ||
                            Number.isFinite(Number(v)) ||
                            "Ingresa un número válido."
                          );
                        },
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
              Existencia actual: {selected.stock} {selected.base_unit}. El
              ingreso se sumará al registrar.
            </div>
          )}
        </fieldset>
        {partial && (
          <p role="status" className="notice">
            El producto está guardado, pero su imagen sigue pendiente. Puedes
            reintentar sin duplicar el producto.
          </p>
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
        <ActionBar>
          {row && onDelete && (
            <Button
              variant="destructive"
              disabled={form.formState.isSubmitting || photoBusy}
              onClick={onDelete}
            >
              Eliminar
            </Button>
          )}

          <Button
            variant="secondary"
            disabled={form.formState.isSubmitting || photoBusy}
            onClick={() =>
              form.formState.isDirty || photo ? setCancel(true) : onClose()
            }
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || photoBusy}
          >
            {form.formState.isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </ActionBar>
      </form>
    </Modal>
  );
}
