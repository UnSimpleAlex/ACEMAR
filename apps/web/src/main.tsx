import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./modules/auth/auth";
import Layout from "./app/layout";
import Login from "./modules/auth/login";
import { Loading } from "./shared/components/feedback";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";
const POS = lazy(() => import("./modules/pos/pos"));
const Management = lazy(() => import("./modules/management/page"));
const Detail = lazy(() => import("./modules/sales/detail"));
const Dashboard = lazy(() => import("./modules/dashboard/dashboard"));
const Assistant = lazy(() => import("./modules/dashboard/assistant"));
const cache = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 20000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
function App() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.profile) return <Login />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              auth.profile.role === "admin" ? (
                <Dashboard />
              ) : (
                <Navigate to="/vender" replace />
              )
            }
          />
          <Route path="vender" element={<POS />} />
          <Route
            path="caja"
            element={
              auth.profile.role === "admin" ? (
                <Dashboard cash />
              ) : (
                <Navigate to="/vender" replace />
              )
            }
          />
          <Route
            path="asistente"
            element={
              auth.profile.role === "admin" ? (
                <Assistant />
              ) : (
                <Navigate to="/vender" replace />
              )
            }
          />
          <Route path="ventas/:id" element={<Detail />} />
          <Route path=":module" element={<Management />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
