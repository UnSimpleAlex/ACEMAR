import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";

/** Prevent rendering failures from exposing internal errors or a blank page. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-screen">
        <section
          className="recovery-card"
          role="alert"
          aria-labelledby="recovery-title"
        >
          <TriangleAlert size={32} aria-hidden="true" />
          <h1 id="recovery-title">No pudimos mostrar esta pantalla</h1>
          <p>
            Recarga la aplicación para volver a intentarlo. Si el problema
            continúa, contacta al administrador.
          </p>
          <p>
            El ticket que aún no confirmaste podría perderse. Antes de repetir
            un cobro, revisa Ventas para comprobar si ya fue registrado.
          </p>
          <Button onClick={() => window.location.reload()}>
            Recargar aplicación
          </Button>
        </section>
      </main>
    );
  }
}
