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
let identity,
  product,
  sale,
  receiptKeys = [],
  failure;
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
  const email = `acemar-receipt-${crypto.randomUUID()}@example.invalid`,
    password = randomBytes(30).toString("base64url") + "Aa9!";
  const created = await identities("POST", {
    email,
    password,
    name: "Prueba temporal de boleta",
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
    ".insforge/receipt-live-state.json",
    JSON.stringify({ identity }),
    { mode: 0o600 },
  );
  sql(
    `INSERT INTO public.profiles(id,name,role) VALUES('${identity}','Prueba temporal de boleta','admin')`,
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
    ".insforge/receipt-live-state.json",
    JSON.stringify({ identity, product }),
    { mode: 0o600 },
  );
  const lot = await user.database.rpc("acemar_save", {
    p_entity: "lots",
    p_data: { product_id: product, quantity: 10, cost: 10, price: 25 },
  });
  check(!lot.error, "test stock entry");
  const catalog = await user.database.rpc("acemar_catalog", {
    p_search: "MEDIA-" + identity.slice(0, 8),
    p_page: 0,
  });
  const unit = catalog.data[0].units[0].id;
  const sold = await user.database.rpc("acemar_checkout", {
    p_key: crypto.randomUUID(),
    p_items: [{ unit_id: unit, quantity: 2 }],
    p_payment: "cash",
    p_received: 100,
  });
  check(!sold.error, "test sale checkout");
  sale = sold.data.id;
  await writeFile(
    ".insforge/receipt-live-state.json",
    JSON.stringify({ identity, product, sale }),
  );
  const downloaded = await user.functions.invoke("acemar-receipt", {
    body: { action: "download", saleId: sale },
  });
  if (downloaded.error) {
    console.log(
      JSON.stringify({
        functionStatus: downloaded.error.status,
        details: downloaded.data,
      }),
    );
    throw Error("Receipt generation failed");
  }
  check(Boolean(downloaded.data?.pdf), "server produces verifiable PDF");
  const pdf = Buffer.from(downloaded.data.pdf, "base64");
  await writeFile(".insforge/live-receipt.pdf", pdf);
  const code = downloaded.data.code;
  const state = sql(
    `SELECT pdf_key FROM public.sale_receipts WHERE sale_id='${sale}'`,
  );
  receiptKeys =
    state.rows?.map((r) => r.pdf_key) ??
    state.data?.map((r) => r.pdf_key) ??
    [];
  const publicRead = await fetch(
    baseUrl + "/api/storage/buckets/acemar-receipts/objects/" + receiptKeys[0],
  );
  check(!publicRead.ok, "receipt PDF is not publicly readable");
  const url =
    "https://beft7ipm.function2.insforge.app/acemar-verify-receipt?code=" +
    code;
  const verified = await fetch(url);
  check(
    verified.ok && (await verified.text()).includes("Documento vigente"),
    "public QR verification",
  );
  const match = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, pdfHash: downloaded.data.pdfHash }),
  });
  check((await match.json()).matches === true, "original PDF hash matches");
  const mismatch = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, pdfHash: "0".repeat(64) }),
  });
  check((await mismatch.json()).matches === false, "altered PDF rejected");
  const draft = await user.functions.invoke("acemar-receipt", {
    body: { action: "draft", saleId: sale, email: "cliente@example.invalid" },
  });
  check(
    !draft.error && Boolean(draft.data?.eml),
    "professional email draft with PDF, no actual sending",
  );
  await writeFile(
    ".insforge/live-receipt.eml",
    Buffer.from(draft.data.eml, "base64"),
  );
  const cancelled = await user.database.rpc("acemar_change_sale", {
    p_id: sale,
    p_action: "cancel",
    p_reason: "Anulación de prueba temporal",
    p_quantities: {},
    p_expected: 0,
  });
  check(!cancelled.error, "sale cancellation");
  const after = await fetch(url);
  check(
    (await after.text()).includes("Venta anulada"),
    "QR reflects cancelled sale",
  );
} catch (error) {
  failure = error;
}
try {
  if (sale) {
    const state = sql(
      `SELECT pdf_key FROM public.sale_receipts WHERE sale_id='${sale}'`,
    );
    receiptKeys =
      state.rows?.map((r) => r.pdf_key) ??
      state.data?.map((r) => r.pdf_key) ??
      receiptKeys;
    for (const object of receiptKeys.filter(Boolean)) {
      const removed = await admin.storage
        .from("acemar-receipts")
        .remove(object);
      if (removed.error) throw Error("Private PDF cleanup failed");
    }
    sql(
      `DELETE FROM public.receipt_deliveries WHERE code IN(SELECT code FROM public.sale_receipts WHERE sale_id='${sale}');DELETE FROM public.sale_receipts WHERE sale_id='${sale}';DELETE FROM public.allocations WHERE line_id IN(SELECT id FROM public.sale_lines WHERE sale_id='${sale}');DELETE FROM public.stock_movements WHERE sale_id='${sale}';DELETE FROM public.sale_lines WHERE sale_id='${sale}';DELETE FROM public.sales WHERE id='${sale}';`,
    );
  }
  if (product)
    sql(
      `DELETE FROM public.assets WHERE product_id='${product}';DELETE FROM public.stock_movements WHERE lot_id IN(SELECT id FROM public.lots WHERE product_id='${product}');DELETE FROM public.lots WHERE product_id='${product}';DELETE FROM public.units WHERE product_id='${product}';DELETE FROM public.products WHERE id='${product}';`,
    );
  if (identity) {
    sql(
      `DELETE FROM public.product_media_usage WHERE actor_id='${identity}';DELETE FROM public.audit WHERE actor_id='${identity}';DELETE FROM public.profiles WHERE id='${identity}';`,
    );
    await identities("DELETE", { userIds: [identity] });
  }
  await writeFile(
    ".insforge/receipt-live-report.json",
    JSON.stringify({
      results,
      cleanup: true,
      date: new Date().toISOString(),
    }),
  );
  await unlink(".insforge/receipt-live-state.json").catch(() => {});
  console.log("Temporary identity, product and object cleaned.");
} catch {
  await writeFile(
    ".insforge/receipt-live-report.json",
    JSON.stringify({ results, cleanup: false }),
  );
  failure = Error(
    "Temporary data cleanup needs operator review; see ignored state file.",
  );
}
if (failure) throw failure;
