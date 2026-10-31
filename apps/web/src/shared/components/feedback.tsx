import { AlertCircle, LoaderCircle, PackageOpen } from "lucide-react";
import { Button } from "./ui/button";
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      Cargando información…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={20} />
      <div>
        {error instanceof Error
          ? error.message
          : "No se pudo cargar la información."}
        {retry && (
          <Button variant="secondary" onClick={retry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title = "Todavía no hay registros",
  text = "Los registros aparecerán aquí cuando se creen.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <PackageOpen size={40} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
