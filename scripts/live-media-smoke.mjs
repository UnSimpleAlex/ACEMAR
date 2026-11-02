/** Opt-in: disposable identity/product only in acemar-dev; never uses an owner's password. */
import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient, createAdminClient } from "@insforge/sdk";
if (process.env.ACEMAR_LIVE_TESTS !== "1")
  throw Error("Explicit ACEMAR_LIVE_TESTS=1 required");
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
if (config.project_id !== "2ce08e4d-e48d-4377-8228-2911916fc828")
  throw Error("Requires acemar-dev");
const cli = (args) =>
  JSON.parse(
    execFileSync("npx", ["-y", "@insforge/cli", ...args, "--json"], {
      encoding: "utf8",
      timeout: 90000,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
const adminKey = cli(["secrets", "get", "API_KEY"]).value;
const anonKey = cli(["secrets", "get", "ANON_KEY"]).value;
const baseUrl = config.oss_host;
let identity, product, key, failure;
const results = [];
const sql = (text) => cli(["db", "query", text]);
const admin = createAdminClient({ baseUrl, apiKey: adminKey });
async function identities(method, body) {
  const r = await fetch(baseUrl + "/api/auth/users", {
    method,
    headers: {
      Authorization: "Bearer " + adminKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw Error("Identity API HTTP " + r.status);
  return r.json();
}
const check = (ok, label) => {
  if (!ok) throw Error(label);
  results.push(label);
  console.log("PASS " + label);
};
try {
  const email = `acemar-media-${crypto.randomUUID()}@example.invalid`,
    password = randomBytes(30).toString("base64url") + "Aa9!";
  const created = await identities("POST", {
    email,
    password,
    name: "Prueba temporal de imagen",
    autoConfirm: true,
  });
  identity =
    created.user?.id ??
    created.data?.user?.id ??
    created.id ??
    created.data?.id;
  if (!identity) {
    const lookup = await fetch(
      baseUrl + "/api/auth/users?search=" + encodeURIComponent(email),
      { headers: { Authorization: "Bearer " + adminKey } },
    );
    const listed = await lookup.json();
    const users = Array.isArray(listed.data)
      ? listed.data
      : (listed.users ?? listed.data?.users ?? []);
    identity = users.find((u) => u.email === email)?.id;
  }
  if (!/^[a-f0-9-]{36}$/i.test(identity)) throw Error("Missing test identity");
  await writeFile(
    ".insforge/media-live-state.json",
    JSON.stringify({ identity }),
    { mode: 0o600 },
  );
  sql(
    `INSERT INTO public.profiles(id,name,role) VALUES('${identity}','Prueba temporal de imagen','admin')`,
  );
  const user = createClient({ baseUrl, anonKey });
  const login = await user.auth.signInWithPassword({ email, password });
  check(!login.error, "temporary administrator signs in");
  const saved = await user.database.rpc("acemar_save", {
    p_entity: "products",
    p_data: {
      code: "MEDIA-" + identity.slice(0, 8),
      name: "Producto temporal de prueba de imagen",
      base_unit: "Unidad",
      minimum: 0,
    },
  });
  if (saved.error) throw Error("Cannot create test product");
  product = saved.data;
  await writeFile(
    ".insforge/media-live-state.json",
    JSON.stringify({ identity, product }),
    { mode: 0o600 },
  );
  const bytes = await readFile(".insforge/product-images/CEM-001.webp");
  const result = await user.functions.invoke("acemar-product-image", {
    body: { productId: product, image: bytes.toString("base64") },
  });
  check(
    !result.error && Boolean(result.data?.url),
    "authenticated image upload and server re-encoding",
  );
  key = result.data.key;
  await writeFile(
    ".insforge/media-live-state.json",
    JSON.stringify({ identity, product, key }),
    { mode: 0o600 },
  );
  const response = await fetch(result.data.url);
  check(
    response.ok &&
      response.headers.get("content-type")?.startsWith("image/webp"),
    "uploaded image is publicly readable WebP",
  );
  const catalog = await user.database.rpc("acemar_catalog", {
    p_search: "MEDIA-" + identity.slice(0, 8),
    p_page: 0,
  });
  check(
    catalog.data?.[0]?.image_url === result.data.url,
    "catalog preserves exact returned URL",
  );
  const deleted = await user.database.rpc("acemar_delete_product", {
    p_id: product,
  });
  check(!deleted.error, "unused product can be deleted");
  product = undefined;
} catch (error) {
  failure = error;
}
try {
  if (product)
    sql(
      `DELETE FROM public.assets WHERE product_id='${product}';DELETE FROM public.units WHERE product_id='${product}';DELETE FROM public.products WHERE id='${product}';`,
    );
  if (key) {
    const removed = await admin.storage.from("acemar-public").remove(key);
    if (removed.error) throw Error("Test object cleanup failed");
  }
  if (identity) {
    sql(
      `DELETE FROM public.product_media_usage WHERE actor_id='${identity}';DELETE FROM public.audit WHERE actor_id='${identity}';DELETE FROM public.profiles WHERE id='${identity}';`,
    );
    await identities("DELETE", { userIds: [identity] });
  }
  await writeFile(
    ".insforge/media-live-report.json",
    JSON.stringify({
      results,
      cleanup: true,
      date: new Date().toISOString(),
    }),
  );
  await unlink(".insforge/media-live-state.json").catch(() => {});
  console.log("Temporary identity, product and object cleaned.");
} catch {
  await writeFile(
    ".insforge/media-live-report.json",
    JSON.stringify({ results, cleanup: false }),
  );
  failure = Error(
    "Temporary data cleanup needs operator review; see ignored state file.",
  );
}
if (failure) throw failure;
