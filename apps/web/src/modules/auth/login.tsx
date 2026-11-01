import { Reset } from "./reset";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import { client, configured } from "../../shared/backend";
import { useAuth } from "./auth";
import { Button } from "../../shared/components/ui/button";
const schema = z.object({
  email: z.email("Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});
export default function Login() {
  const auth = useAuth();
  const [visible, setVisible] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  async function submit(values: z.infer<typeof schema>) {
    setError("");
    try {
      const { error } = await client().auth.signInWithPassword(values);
      if (error) throw new Error();
      await auth.refresh();
    } catch {
      setError(
        "No se pudo iniciar sesión. Comprueba tus credenciales y conexión.",
      );
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <a className="brand" href="/">
          <img src="/brand.svg" alt="" />
          ACEMAR
        </a>
        <span className="eyebrow">FERRETERÍA & ALMACÉN</span>
        <h1>
          Tu negocio,
          <br />
          en orden.
        </h1>
        <p>Ventas, inventario y control en un mismo lugar.</p>
        <div className="story-illustration" aria-hidden="true">
          <img
            className="warehouse-art"
            src="/warehouse.webp"
            alt=""
            width="1200"
            height="600"
          />
          <div>
            <strong>Todo conectado</strong>
            <span>Del almacén al mostrador</span>
          </div>
        </div>
        <small>ACEMAR · Gestión comercial</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="security-icon">
            <ShieldCheck />
          </span>
          <h2>Bienvenido a ACEMAR</h2>
          <p>Ingresa con tu cuenta de trabajo.</p>
          {!configured && (
            <div className="error" role="alert">
              La conexión del sistema aún no está configurada. Contacta al
              administrador.
            </div>
          )}
          {auth.signedIn ? (
            <>
              <div className="notice">
                Tu identidad fue verificada, pero todavía no tienes un perfil
                autorizado. Solicita acceso al administrador.
              </div>
              <Button
                onClick={() =>
                  void auth
                    .logout()
                    .catch(() => setError("No se pudo cerrar sesión."))
                }
              >
                Cerrar sesión
              </Button>
            </>
          ) : (
            <form onSubmit={form.handleSubmit(submit)} noValidate>
              <label htmlFor="email">Correo de trabajo</label>
              <input
                id="email"
                autoComplete="username"
                type="email"
                {...form.register("email")}
                aria-invalid={!!form.formState.errors.email}
                aria-describedby="email-error"
              />
              <p className="field-error" id="email-error">
                {form.formState.errors.email?.message}
              </p>
              <label htmlFor="password">Contraseña</label>
              <div className="password-field">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  {...form.register("password")}
                  aria-invalid={!!form.formState.errors.password}
                  aria-describedby="password-error"
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={
                    visible ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {visible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="field-error" id="password-error">
                {form.formState.errors.password?.message}
              </p>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={!configured || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Ingresando…" : "Ingresar"}
                <ArrowRight size={18} />
              </Button>
              <Button
                variant="ghost"
                disabled={!configured}
                onClick={() => setResetOpen(true)}
              >
                Olvidé mi contraseña
              </Button>
              <p className="login-help">
                ¿Necesitas acceso? Contacta al administrador de tu negocio.
              </p>
            </form>
          )}
        </div>
      </section>
      {resetOpen && <Reset onClose={() => setResetOpen(false)} />}
    </main>
  );
}
