/** Explicit operator task: no admin credential is embedded or required by frontend. */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { catalogSeedSQL } from "./catalog-seed.mjs";
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
if (
  config.project_id !== "2ce08e4d-e48d-4377-8228-2911916fc828" ||
  config.project_name !== "acemar-dev"
)
  throw Error("Requires acemar-dev");
const { products } = JSON.parse(
  await readFile("data/evaluation/products.json", "utf8"),
);
const { assets } = JSON.parse(
  await readFile("data/evaluation/assets.json", "utf8"),
);
const sql = catalogSeedSQL(
  products,
  assets,
  process.env.ACEMAR_SEED_ACTOR ?? "",
);
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({
      dryRun: true,
      products: products.length,
      assets: assets.length,
    }),
  );
} else {
  const result = execFileSync(
    "npx",
    ["-y", "@insforge/cli", "db", "query", sql, "--json"],
    { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const data = JSON.parse(result);
  if (data.error || data.success === false) throw Error("Import rejected");
  console.log(
    JSON.stringify({ importAccepted: true, products: products.length }),
  );
}
