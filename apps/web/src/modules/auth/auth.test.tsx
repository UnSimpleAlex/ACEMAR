import { beforeEach, it, expect, vi } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth";
const mocked = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("../../shared/backend", () => {
  const backend = {
    auth: { getCurrentUser: mocked.getCurrentUser, signOut: mocked.signOut },
    database: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mocked.profile }) }),
      }),
    },
  };
  return { backend, client: () => backend };
});
function Session() {
  const a = useAuth();
  const [error, setError] = useState("");
  return (
    <>
      <span>{a.profile?.name ?? "Sin sesión"}</span>
      <button
        disabled={a.loading}
        onClick={() => void a.logout().catch((e) => setError(e.message))}
      >
        Salir
      </button>
      {error && <div role="alert">{error}</div>}
    </>
  );
}
beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
  mocked.getCurrentUser.mockResolvedValue({
    data: { user: { id: "test-user" } },
    error: null,
  });
  mocked.profile.mockResolvedValue({
    data: {
      id: "test-user",
      name: "Vendedor de prueba",
      role: "seller",
      counter: 1,
    },
    error: null,
  });
  mocked.signOut.mockResolvedValue({ error: null });
});
it("cerrar sesión retira los datos del usuario y solicita limpiar el estado operativo", async () => {
  const cache = new QueryClient();
  cache.setQueryData(["sales"], "private-test-data");
  let cart = ["ticket temporal"];
  const clear = () => {
    cart = [];
  };
  render(
    <QueryClientProvider client={cache}>
      <AuthProvider onSessionEnd={clear}>
        <Session />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Vendedor de prueba");
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  await waitFor(() =>
    expect(screen.getByText("Sin sesión")).toBeInTheDocument(),
  );
  expect(cache.getQueryData(["sales"])).toBeUndefined();
  expect(cart).toEqual([]);
});
it("un error al cerrar sesión no descarta silenciosamente el trabajo", async () => {
  mocked.signOut.mockResolvedValue({ error: { message: "Network error" } });
  const clear = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider onSessionEnd={clear}>
        <Session />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Vendedor de prueba");
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo cerrar la sesión",
  );
  expect(clear).not.toHaveBeenCalled();
  expect(screen.getByText("Vendedor de prueba")).toBeInTheDocument();
});
