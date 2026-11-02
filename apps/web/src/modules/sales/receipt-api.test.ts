import { describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("../../shared/backend", () => ({
  client: () => ({ functions: { invoke } }),
}));
import { receiptError, receiptRequest } from "./receipt-api";
describe("errores al enviar boletas", () => {
  it("conserva el rechazo SMTP tanto del SDK actual como del contrato anterior", async () => {
    const message =
      "Brevo bloqueó la IP de salida del servidor. Contacta al administrador.";
    for (const error of [
      { statusCode: 502, message },
      { statusCode: 502, error: message },
    ]) {
      invoke.mockResolvedValueOnce({ data: null, error });
      await expect(receiptRequest({ action: "send" })).rejects.toThrow(message);
    }
    expect(invoke).toHaveBeenCalledTimes(2); // never retries a send
  });
  it("no atribuye fallos SMTP a la sesión ni expone errores internos", () => {
    expect(receiptError({ statusCode: 502 })).toContain("Revisa el correo");
    expect(receiptError({ statusCode: 401 })).toContain("sesión venció");
    expect(
      receiptError({ statusCode: 503, message: "password=secret" }),
    ).not.toContain("secret");
  });
});
