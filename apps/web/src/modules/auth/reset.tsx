import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { client } from "../../shared/backend";
import { Modal } from "../../shared/components/modal";
import { Button } from "../../shared/components/ui/button";
import { ErrorState } from "../../shared/components/feedback";
const requestSchema = z.object({ email: z.email("Ingresa un correo válido.") });
const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Ingresa el código de 6 dígitos."),
    password: z.string().min(12, "Usa al menos 12 caracteres.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Las contraseñas no coinciden.",
  });
export function Reset({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [error, setError] = useState("");
  const request = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
  });
  const reset = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
  });
  const busy = request.formState.isSubmitting || reset.formState.isSubmitting;
  async function send(v: z.infer<typeof requestSchema>) {
    setError("");
    try {
      const r = await client().auth.sendResetPasswordEmail({ email: v.email });
      if (r.error) throw new Error();
      setEmail(v.email);
      setStep("code");
    } catch {
      setError(
        "No se pudo solicitar la recuperación. Espera un momento y vuelve a intentarlo.",
      );
    }
  }
  async function confirm(v: z.infer<typeof resetSchema>) {
    setError("");
    try {
      const exchange = await client().auth.exchangeResetPasswordToken({
        email,
        code: v.code,
      });
      if (exchange.error || !exchange.data?.token) throw new Error();
      const r = await client().auth.resetPassword({
        newPassword: v.password,
        otp: exchange.data.token,
      });
      if (r.error) throw new Error();
      setStep("success");
      reset.reset();
    } catch {
      setError(
        "No se pudo cambiar la contraseña. Comprueba el código y su vigencia.",
      );
    }
  }
  return (
    <Modal
      title="Recuperar acceso"
      description="La recuperación utiliza el correo asociado a tu cuenta."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {step === "email" ? (
        <form noValidate onSubmit={request.handleSubmit(send)}>
          <label htmlFor="reset-email">Correo de trabajo</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            {...request.register("email")}
            aria-invalid={!!request.formState.errors.email}
            aria-describedby="reset-email-error"
          />
          <p id="reset-email-error" className="field-error">
            {request.formState.errors.email?.message}
          </p>
          {error && <ErrorState error={new Error(error)} />}
          <div className="form-actions">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Solicitando…" : "Solicitar código"}
            </Button>
          </div>
        </form>
      ) : step === "code" ? (
        <>
          <div className="notice">
            Si existe una cuenta con ese correo, recibirás las instrucciones
            para recuperar el acceso.
          </div>
          <form noValidate onSubmit={reset.handleSubmit(confirm)}>
            {[
              {
                key: "code" as const,
                label: "Código de recuperación",
                type: "text",
                auto: "one-time-code",
              },
              {
                key: "password" as const,
                label: "Nueva contraseña",
                type: "password",
                auto: "new-password",
              },
              {
                key: "confirm" as const,
                label: "Repetir contraseña",
                type: "password",
                auto: "new-password",
              },
            ].map((f) => (
              <div key={f.key}>
                <label htmlFor={`reset-${f.key}`}>{f.label}</label>
                <input
                  id={`reset-${f.key}`}
                  type={f.type}
                  autoComplete={f.auto}
                  maxLength={f.key === "code" ? 6 : 128}
                  inputMode={f.key === "code" ? "numeric" : undefined}
                  {...reset.register(f.key)}
                  aria-invalid={!!reset.formState.errors[f.key]}
                  aria-describedby={`reset-${f.key}-error`}
                />
                <p className="field-error" id={`reset-${f.key}-error`}>
                  {reset.formState.errors[f.key]?.message}
                </p>
              </div>
            ))}
            {error && <ErrorState error={new Error(error)} />}
            <div className="form-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
              >
                Volver
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Cambiar contraseña"}
              </Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="notice" role="status">
            Contraseña actualizada. Ya puedes ingresar con tu nueva contraseña.
          </div>
          <Button onClick={onClose}>Volver al acceso</Button>
        </>
      )}
    </Modal>
  );
}
