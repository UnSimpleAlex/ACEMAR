/** Opt-in integration test. Creates only disposable identities and rows in acemar-dev. */
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@insforge/sdk";
if (process.env.ACEMAR_LIVE_TESTS !== "1")
  throw new Error("Set ACEMAR_LIVE_TESTS=1 explicitly.");
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
if (config.project_name !== "acemar-dev")
  throw new Error("Requires isolated acemar-dev.");
const adminKey = JSON.parse(
  await readFile(".insforge/admin-response.json", "utf8"),
).value;
const anonKey = JSON.parse(
  await readFile(".insforge/anon-response.json", "utf8"),
).value;
const baseUrl = config.oss_host;
const identities = [],
  results = [];
let product;
const sql = (query) =>
  JSON.parse(
    execFileSync(
      "npx",
      ["-y", "@insforge/cli", "db", "query", query, "--json"],
      { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
async function identityRequest(method, body) {
  const res = await fetch(baseUrl + "/api/auth/users", {
    method,
    headers: {
      Authorization: "Bearer " + adminKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Identity API returned HTTP " + res.status);
  return data;
}
async function identity(role) {
  const email = `acemar-test-${crypto.randomUUID()}@example.invalid`;
  const password = randomBytes(30).toString("base64url") + "Aa9!";
  const data = await identityRequest("POST", {
    email,
    password,
    name: "Prueba temporal",
    autoConfirm: true,
  });
  let id = data.user?.id ?? data.data?.user?.id ?? data.id ?? data.data?.id;
  if (!id) {
    const lookup = await fetch(
      baseUrl + "/api/auth/users?search=" + encodeURIComponent(email),
      { headers: { Authorization: "Bearer " + adminKey } },
    );
    const listed = await lookup.json();
    const users = Array.isArray(listed.data)
      ? listed.data
      : (listed.users ?? []);
    id = users.find((u) => u.email === email)?.id;
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("No valid identity returned");
  identities.push(id);
  await writeFile(".insforge/live-identities.json", JSON.stringify(identities));
  sql(
    `INSERT INTO public.profiles(id,name,role) VALUES('${id}','Prueba temporal','${role}')`,
  );
  const client = createClient({ baseUrl, anonKey });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error)
    throw new Error(
      "Temporary test sign-in failed: HTTP " +
        login.error.statusCode +
        " " +
        login.error.message,
    );
  return client;
}
async function rpc(client, name, args) {
  const result = await client.database.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function assert(condition, label) {
  if (!condition) throw new Error(label);
  results.push(label);
  console.log("PASS: " + label);
}
let passed = false;
try {
  const a = await identity("admin"),
    first = await identity("seller"),
    second = await identity("seller");
  const guest = createClient({ baseUrl, anonKey });
  assert(
    Boolean(
      (await guest.database.rpc("acemar_catalog", { p_search: "", p_page: 0 }))
        .error,
    ),
    "anonymous catalog denied",
  );
  product = await rpc(a, "acemar_save", {
    p_entity: "products",
    p_data: {
      code: "TEST-" + crypto.randomUUID().slice(0, 8),
      name: "Material temporal de prueba",
      base_unit: "unidad",
      minimum: 0,
    },
  });
  const catalog = await rpc(a, "acemar_catalog", {
    p_search: "Material temporal de prueba",
    p_page: 0,
  });
  const unit = catalog.find((p) => p.id === product).units[0].id;
  await rpc(a, "acemar_save", {
    p_entity: "lots",
    p_data: { product_id: product, quantity: 1, cost: 10, price: 20 },
  });
  const payload = () => ({
    p_key: crypto.randomUUID(),
    p_items: [{ unit_id: unit, quantity: 1 }],
    p_payment: "cash",
    p_customer: null,
    p_received: 20,
    p_quotation: null,
  });
  const one = payload(),
    two = payload();
  const attempts = await Promise.allSettled([
    rpc(first, "acemar_checkout", one),
    rpc(second, "acemar_checkout", two),
  ]);
  assert(
    attempts.filter((r) => r.status === "fulfilled").length === 1 &&
      attempts.filter((r) => r.status === "rejected").length === 1,
    "last-unit concurrent sale has exactly one success",
  );
  const winner = attempts[0].status === "fulfilled" ? first : second;
  const request = attempts[0].status === "fulfilled" ? one : two;
  const winningResult = attempts.find((r) => r.status === "fulfilled").value;
  const repeat = await rpc(winner, "acemar_checkout", request);
  assert(repeat.id === winningResult.id, "network retry returns same sale");
  const current = await rpc(a, "acemar_catalog", {
    p_search: "Material temporal de prueba",
    p_page: 0,
  });
  assert(
    Number(current.find((p) => p.id === product).stock) === 0,
    "final stock is zero",
  );
  assert(
    Boolean(
      (
        await first.database.rpc("acemar_list", {
          p_entity: "customers",
          p_page: 0,
          p_search: "",
        })
      ).error,
    ),
    "seller debt access denied",
  );
  const costs = await first.database.from("lots").select("id,cost").limit(1);
  assert(
    Boolean(costs.error) || costs.data?.length === 0,
    "direct lot-cost access denied",
  );
  const escalation = await first.database
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", identities[1]);
  assert(Boolean(escalation.error), "role escalation denied");
  const unauthorized = await first.database.rpc("acemar_change_sale", {
    p_id: winningResult.id,
    p_action: "cancel",
    p_reason: "Intento no autorizado",
    p_quantities: {},
    p_expected: 0,
  });
  assert(Boolean(unauthorized.error), "seller cannot cancel sales");
  await rpc(a, "acemar_change_sale", {
    p_id: winningResult.id,
    p_action: "cancel",
    p_reason: "Fin de prueba temporal",
    p_quantities: {},
    p_expected: 0,
  });
  const restored = await rpc(a, "acemar_catalog", {
    p_search: "Material temporal de prueba",
    p_page: 0,
  });
  assert(
    Number(restored.find((p) => p.id === product).stock) === 1,
    "cancellation restores exact lot stock",
  );
  passed = true;
} finally {
  let cleanup = false;
  if (identities.length) {
    const ids = identities.map((id) => `'${id}'`).join(",");
    sql(
      `DO $$ BEGIN DELETE FROM public.allocations WHERE line_id IN(SELECT l.id FROM public.sale_lines l JOIN public.sales s ON s.id=l.sale_id WHERE s.actor_id IN(${ids})); DELETE FROM public.stock_movements WHERE actor_id IN(${ids}); DELETE FROM public.sale_lines WHERE sale_id IN(SELECT id FROM public.sales WHERE actor_id IN(${ids})); DELETE FROM public.sales WHERE actor_id IN(${ids}); DELETE FROM public.lots WHERE actor_id IN(${ids}); DELETE FROM public.audit WHERE actor_id IN(${ids}); ${product ? `DELETE FROM public.units WHERE product_id='${product}';DELETE FROM public.products WHERE id='${product}';` : ""} DELETE FROM public.profiles WHERE id IN(${ids}); END $$`,
    );
    await identityRequest("DELETE", { userIds: identities });
    cleanup = true;
  }
  await writeFile(
    ".insforge/live-report.json",
    JSON.stringify(
      { passed, results, cleanup, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    cleanup
      ? "Temporary identities and rows cleaned."
      : "No temporary identities created.",
  );
}
