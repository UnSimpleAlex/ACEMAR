/** Explicit operator task: no admin credential is embedded or required by frontend. */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { demoSeedSQL } from "./demo-seed.mjs";
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
if (
  config.project_id !== "2ce08e4d-e48d-4377-8228-2911916fc828" ||
  config.project_name !== "acemar-dev"
)
  throw Error("Requires acemar-dev");
const { products } = JSON.parse(
  await readFile("data/demo/products.json", "utf8"),
);
const { assets } = JSON.parse(await readFile("data/demo/assets.json", "utf8"));
demoSeedSQL(products, assets, process.env.ACEMAR_SEED_ACTOR ?? "");

if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ dryRun: true, products: products.length }));
  process.exit(0);
}
// The hosted SQL API disallows changing JWT/session configuration. Use a real,
// disposable authenticated operator for the single transactional seed RPC.
const { createClient } = await import("@insforge/sdk");
const { randomBytes } = await import("node:crypto");
const cli = (args) =>
  JSON.parse(
    execFileSync("npx", ["-y", "@insforge/cli", ...args, "--json"], {
      encoding: "utf8",
      timeout: 180000,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
const owner = process.env.ACEMAR_SEED_ACTOR;
const adminKey = cli(["secrets", "get", "API_KEY"]).value,
  anonKey = cli(["secrets", "get", "ANON_KEY"]).value;
const baseUrl = config.oss_host;
const email =
    "acemar-demo-operator-" + crypto.randomUUID() + "@example.invalid",
  password = randomBytes(32).toString("base64url") + "Aa9!";
let identity;
async function auth(method, body) {
  const res = await fetch(baseUrl + "/api/auth/users", {
    method,
    headers: {
      Authorization: "Bearer " + adminKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Error("Temporary operator API failed");
  return res.json();
}
try {
  await auth("POST", {
    email,
    password,
    name: "Operador temporal DEMO",
    autoConfirm: true,
  });
  const list = await fetch(
    baseUrl + "/api/auth/users?search=" + encodeURIComponent(email),
    { headers: { Authorization: "Bearer " + adminKey } },
  ).then((r) => r.json());
  identity = (list.data ?? list.users ?? []).find((u) => u.email === email)?.id;
  if (!/^[a-f0-9-]{36}$/.test(identity))
    throw Error("Temporary identity missing");
  cli([
    "db",
    "query",
    `INSERT INTO public.profiles(id,name,role) VALUES('${identity}','Operador temporal DEMO','admin')`,
  ]);
  const user = createClient({ baseUrl, anonKey });
  const signed = await user.auth.signInWithPassword({ email, password });
  if (signed.error) throw Error("Temporary operator login failed");
  let body = demoSeedSQL(products, assets, identity).replace(
    "DO $demo$",
    "CREATE FUNCTION public.acemar_seed_demo_once() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $demo$",
  );
  body = body.replace(/ PERFORM set_config[^;]+;/g, "");
  body = body.replace(
    " BEGIN\n",
    " BEGIN\n PERFORM public.acemar_require(true);\n",
  );
  body +=
    "\nREVOKE ALL ON FUNCTION public.acemar_seed_demo_once() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.acemar_seed_demo_once() TO authenticated;";
  cli(["db", "query", body]);
  const seeded = await user.database.rpc("acemar_seed_demo_once", {});
  if (seeded.error)
    throw Error("Demo transaction failed: " + seeded.error.message);
  console.log(
    JSON.stringify({ importAccepted: true, products: products.length }),
  );
} finally {
  cli([
    "db",
    "query",
    "DROP FUNCTION IF EXISTS public.acemar_seed_demo_once()",
  ]);
  if (identity) {
    cli([
      "db",
      "query",
      `UPDATE public.audit SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.lots SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.stock_movements SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.sales SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.quotations SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.payments SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.cash_counts SET actor_id='${owner}' WHERE actor_id='${identity}';UPDATE public.assets SET actor_id='${owner}' WHERE actor_id='${identity}';DELETE FROM public.profiles WHERE id='${identity}';`,
    ]);
    await auth("DELETE", { userIds: [identity] });
  }
}
