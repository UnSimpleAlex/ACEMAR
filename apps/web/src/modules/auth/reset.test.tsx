import { it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Reset } from "./reset";
const api = vi.hoisted(() => ({
  sendResetPasswordEmail: vi.fn(),
  exchangeResetPasswordToken: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("../../shared/backend", () => ({ client: () => ({ auth: api }) }));
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  api.sendResetPasswordEmail.mockResolvedValue({
    data: { success: true },
    error: null,
  });
  api.exchangeResetPasswordToken.mockResolvedValue({
    data: { token: "test-only-reset-token" },
    error: null,
  });
  api.resetPassword.mockResolvedValue({ data: { success: true }, error: null });
});
it("recuperación usa código y no presenta éxito antes de confirmar", async () => {
  render(<Reset onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Correo de trabajo"), {
    target: { value: "prueba@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Solicitar código" }));
  await screen.findByLabelText("Código de recuperación");
  expect(screen.getByText(/Si existe una cuenta/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Código de recuperación"), {
    target: { value: "123456" },
  });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: "UnaClaveDePrueba123!" },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña"), {
    target: { value: "UnaClaveDePrueba123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  await waitFor(() =>
    expect(api.resetPassword).toHaveBeenCalledWith({
      newPassword: "UnaClaveDePrueba123!",
      otp: "test-only-reset-token",
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Contraseña actualizada",
  );
});
it("código rechazado conserva un error recuperable", async () => {
  api.exchangeResetPasswordToken.mockResolvedValue({
    data: null,
    error: { statusCode: 400 },
  });
  render(<Reset onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Correo de trabajo"), {
    target: { value: "prueba@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Solicitar código" }));
  await screen.findByLabelText("Código de recuperación");
  for (const [label, value] of [
    ["Código de recuperación", "123456"],
    ["Nueva contraseña", "UnaClaveDePrueba123!"],
    ["Repetir contraseña", "UnaClaveDePrueba123!"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Comprueba el código",
  );
  expect(api.resetPassword).not.toHaveBeenCalled();
});
