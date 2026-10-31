import { readFile } from "node:fs/promises";
import { createClient } from "@insforge/sdk";
const env = await readFile(".env.local", "utf8");
const values = Object.fromEntries(
  env
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const client = createClient({
  baseUrl: values.VITE_INSFORGE_URL,
  anonKey: values.VITE_INSFORGE_ANON_KEY,
});
const { data, error } = await client.database.rpc("acemar_catalog", {
  p_search: "",
  p_page: 0,
});
if (!error || data?.length) {
  throw new Error("El catálogo no debe estar disponible sin sesión.");
}
if (
  ![401, 403].includes(error.statusCode) &&
  !error.message.includes("permission denied")
)
  throw new Error("Respuesta no concluyente: " + error.statusCode);
console.log("InsForge responde y rechaza el catálogo sin sesión.");
