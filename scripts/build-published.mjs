/** Fail closed before publishing a build without its public backend settings. */
import { loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
const env = loadEnv("production", process.cwd(), "VITE_");
const url = env.VITE_INSFORGE_URL,
  key = env.VITE_INSFORGE_ANON_KEY;
if (!url || !key)
  throw Error(
    "Faltan VITE_INSFORGE_URL y/o VITE_INSFORGE_ANON_KEY. Publicación cancelada.",
  );
if (new URL(url).protocol !== "https:")
  throw Error("La conexión publicada debe usar HTTPS.");
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
const files = (await readdir("dist/assets")).filter((f) => f.endsWith(".js"));
const chunks = await Promise.all(
  files.map((f) => readFile("dist/assets/" + f, "utf8")),
);
if (!chunks.some((c) => c.includes(url) && c.includes(key)))
  throw Error(
    "La compilación no contiene la configuración pública esperada. Publicación cancelada.",
  );
console.log("Configuración pública de InsForge verificada en la compilación.");
