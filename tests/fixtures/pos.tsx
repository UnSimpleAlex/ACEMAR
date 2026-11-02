import React from "react";
import assets from "../../data/catalog-v2/assets.json";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "../../apps/web/src/app/layout";
import POS from "../../apps/web/src/modules/pos/pos";
import { AuthProvider } from "../../apps/web/src/modules/auth/auth";
import "../../apps/web/src/styles.css";
if (!import.meta.env.DEV) throw Error("Development fixture only");
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
const names = [
  "Alicate universal aislado 8 pulgadas",
  "Arena fina tamizada",
  "Arena Gruesa Lavada",
  "Cinta métrica profesional de cinco metros",
];
queryClient.setQueryData(
  ["catalog", "", 0],
  names.map((name, i) => ({
    id: String(i),
    code: `PRUEBA-${i}`,
    name,
    base_unit: "unidad",
    minimum: 2,
    stock: 30,
    price: 25,
    units: [{ id: `unit-${i}`, name: "unidad", factor: 1 }],
    image_url: ["ALI-201", "ARE-102", "CEM-101", "DES-203"].map(
      (code) => assets.assets.find((asset) => asset.code === code)!.url,
    )[i],
    image_generated: false,
  })),
);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={["/vender"]}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/vender" element={<POS />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
