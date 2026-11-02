import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001",
  seller = "00000000-0000-4000-8000-000000000002";
async function user(id, role = "authenticated") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
}
async function call(fn, args) {
  const q = await db.query(
    `SELECT public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) AS value`,
    args,
  );
  return q.rows[0].value;
}
const save = (entity, data) =>
  call("acemar_save", [entity, JSON.stringify(data)]);
let product, unit, lot1, sale;
before(async () => {
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`,
  );
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    let sql = await readFile("migrations/" + file, "utf8");
    // Storage policies exercise a platform-owned table; a minimal local fixture is installed below if needed.
    if (sql.includes("storage.objects"))
      await db.exec(
        `CREATE SCHEMA IF NOT EXISTS storage;CREATE TABLE IF NOT EXISTS storage.objects(bucket text,key text,uploaded_by text);GRANT USAGE ON SCHEMA storage TO anon,authenticated;`,
      );
    await db.exec(sql);
  }
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [admin, seller]);
  await db.query(
    "INSERT INTO public.profiles(id,name,role) VALUES($1,'Administrador de prueba','admin'),($2,'Vendedor de prueba','seller')",
    [admin, seller],
  );
  await user(admin);
});
after(() => db.close());
test("identidad sin perfil y anon no obtienen catálogo", async () => {
  await user("00000000-0000-4000-8000-000000000099");
  await assert.rejects(() => call("acemar_catalog", ["", 0]), /autorizada/);
  await user("", "anon");
  await assert.rejects(
    () => call("acemar_catalog", ["", 0]),
    /permission denied/,
  );
  await user(admin);
});
test("producto crea unidad base y lotes con trazabilidad", async () => {
  product = await save("products", {
    code: "TEST-001",
    name: "Cemento de prueba",
    base_unit: "saco",
    minimum: 2,
  });
  unit = await save("units", {
    product_id: product,
    name: "Presentación de prueba",
    factor: 1,
  });
  lot1 = await save("lots", {
    product_id: product,
    quantity: 2,
    cost: 20,
    price: 30,
  });
  await save("lots", {
    product_id: product,
    quantity: 3,
    cost: 22,
    price: 32.5,
  });
  assert.equal(Number((await call("acemar_catalog", ["", 0]))[0].stock), 5);
});
test("venta multilote usa precio máximo y FIFO", async () => {
  const key = crypto.randomUUID();
  sale = await call("acemar_checkout", [
    key,
    JSON.stringify([{ unit_id: unit, quantity: 3 }]),
    "cash",
    null,
    100,
    null,
  ]);
  assert.equal(Number(sale.total), 97.5);
  const d = await call("acemar_detail", ["sales", sale.id]);
  assert.equal(d.lines.length, 1);
  await db.exec("RESET ROLE");
  const a = await db.query(
    "SELECT lot_id,quantity,cost FROM public.allocations WHERE line_id=$1",
    [d.lines[0].id],
  );
  assert.equal(a.rows.length, 2);
  assert.equal(Number(a.rows.find((r) => r.lot_id === lot1).quantity), 2);
  await user(admin);
  const retry = await call("acemar_checkout", [
    key,
    JSON.stringify([{ unit_id: unit, quantity: 3 }]),
    "cash",
    null,
    100,
    null,
  ]);
  assert.equal(retry.id, sale.id);
  await assert.rejects(
    () =>
      call("acemar_checkout", [
        key,
        JSON.stringify([{ unit_id: unit, quantity: 2 }]),
        "cash",
        null,
        100,
        null,
      ]),
    /Solicitud ya utilizada/,
  );
});
test("error por stock revierte toda la operación", async () => {
  const before = await call("acemar_list", ["sales", 0, ""]);
  await assert.rejects(
    () =>
      call("acemar_checkout", [
        crypto.randomUUID(),
        JSON.stringify([{ unit_id: unit, quantity: 99 }]),
        "cash",
        null,
        10000,
        null,
      ]),
    /Stock insuficiente/,
  );
  assert.equal(
    (await call("acemar_list", ["sales", 0, ""])).length,
    before.length,
  );
  assert.equal(Number((await call("acemar_catalog", ["", 0]))[0].stock), 2);
});
test("vendedor no puede mutar stock, leer deuda ni ejecutar helper interno", async () => {
  await user(seller);
  await assert.rejects(
    () =>
      save("products", {
        code: "NO",
        name: "No autorizado",
        base_unit: "u",
        minimum: 0,
      }),
    /autorizada/,
  );
  await assert.rejects(
    () => call("acemar_list", ["customers", 0, ""]),
    /autorizada/,
  );
  await assert.rejects(
    () => db.query("UPDATE public.lots SET available=99"),
    /permission denied/,
  );
  await assert.rejects(
    () => call("acemar_allocate", [sale.id, crypto.randomUUID(), product, 1]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("UPDATE public.profiles SET role='admin' WHERE id=$1", [seller]),
    /permission denied/,
  );
  await user(admin);
});
test("corrección conserva factor histórico y registra motivo", async () => {
  const d = await call("acemar_detail", ["sales", sale.id]);
  await save("units", {
    id: unit,
    product_id: product,
    name: "Presentación de prueba",
    factor: 5,
  });
  const changed = await call("acemar_change_sale", [
    sale.id,
    "correct",
    "Cantidad solicitada corregida",
    JSON.stringify({ [d.lines[0].id]: 1 }),
    0,
  ]);
  assert.equal(Number(changed.sale.total), 32.5);
  assert.equal(Number(changed.lines[0].factor), 1);
  assert.equal(Number((await call("acemar_catalog", ["", 0]))[0].stock), 4);
  const audit = await call("acemar_list", ["audit", 0, "Corregir"]);
  assert.equal(audit[0].reason, "Cantidad solicitada corregida");
  await save("units", {
    id: unit,
    product_id: product,
    name: "Presentación de prueba",
    factor: 1,
  });
});
test("anulación restituye los consumos y rechaza doble anulación", async () => {
  await call("acemar_change_sale", [
    sale.id,
    "cancel",
    "Venta anulada por solicitud",
    JSON.stringify({}),
    1,
  ]);
  assert.equal(Number((await call("acemar_catalog", ["", 0]))[0].stock), 5);
  await assert.rejects(
    () =>
      call("acemar_change_sale", [
        sale.id,
        "cancel",
        "Solicitud duplicada",
        JSON.stringify({}),
        1,
      ]),
    /ya anulada/,
  );
});
test("crédito, límite, abono idempotente y sobreabono", async () => {
  const customer = await save("customers", {
    name: "Cliente de prueba",
    credit_limit: 100,
    authorized: true,
  });
  await call("acemar_checkout", [
    crypto.randomUUID(),
    JSON.stringify([{ unit_id: unit, quantity: 2 }]),
    "credit",
    customer,
    null,
    null,
  ]);
  await assert.rejects(
    () =>
      call("acemar_checkout", [
        crypto.randomUUID(),
        JSON.stringify([{ unit_id: unit, quantity: 2 }]),
        "credit",
        customer,
        null,
        null,
      ]),
    /Crédito insuficiente/,
  );
  const key = crypto.randomUUID();
  const receipt = await call("acemar_pay", [key, customer, 20]);
  assert.equal(await call("acemar_pay", [key, customer, 20]), receipt);
  await assert.rejects(
    () => call("acemar_pay", [crypto.randomUUID(), customer, 100]),
    /Saldo insuficiente/,
  );
  const c = await call("acemar_list", ["customers", 0, ""]);
  assert.equal(Number(c[0].balance), 45);
  await assert.rejects(
    () => call("acemar_action", ["customers", customer, "delete", ""]),
    /historial/,
  );
});
test("proforma no reserva stock y solo puede convertirse una vez", async () => {
  const before = Number((await call("acemar_catalog", ["", 0]))[0].stock);
  const q = await call("acemar_quotation", [
    JSON.stringify([{ unit_id: unit, quantity: 1 }]),
    "Cotización de prueba",
  ]);
  assert.equal(
    Number((await call("acemar_catalog", ["", 0]))[0].stock),
    before,
  );
  await call("acemar_checkout", [
    crypto.randomUUID(),
    JSON.stringify([{ unit_id: unit, quantity: 1 }]),
    "cash",
    null,
    100,
    q,
  ]);
  await assert.rejects(
    () =>
      call("acemar_checkout", [
        crypto.randomUUID(),
        JSON.stringify([{ unit_id: unit, quantity: 1 }]),
        "cash",
        null,
        100,
        q,
      ]),
    /Proforma no disponible/,
  );
});

test("lotes y documentos incorporan la imagen por unidad sin alterar el historial ni los permisos", async () => {
  await user(admin);
  const original = await call("acemar_detail", ["sales", sale.id]);
  const historicalName = original.lines[0].product_name;
  await db.exec("RESET ROLE");
  const url =
    "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/current.webp";
  await db.query(
    "INSERT INTO public.assets(product_id,object_key,url,mime,bytes,width,height,alt,generated,actor_id) VALUES($1,'current.webp',$2,'image/webp',100,640,640,'Ilustración',true,$3)",
    [product, url, admin],
  );
  await db.query(
    "UPDATE public.products SET name='Nombre actual distinto' WHERE id=$1",
    [product],
  );
  await user(admin);
  const lots = await call("acemar_list", ["lots", 0, ""]);
  assert.equal(lots[0].image_url, url);
  const detail = await call("acemar_detail", ["sales", sale.id]);
  assert.equal(detail.lines[0].image_url, url);
  assert.equal(detail.lines[0].product_id, product);
  assert.equal(detail.lines[0].product_name, historicalName);
  assert.equal(detail.lines[0].price, original.lines[0].price);
  const q = await call("acemar_quotation", [
    JSON.stringify([{ unit_id: unit, quantity: 1 }]),
    "Prueba de imagen",
  ]);
  const quote = await call("acemar_detail", ["quotations", q]);
  assert.equal(quote.lines[0].image_url, url);
  await user(seller);
  await assert.rejects(
    () => call("acemar_snapshot_images", [JSON.stringify({ lines: [] })]),
    /permission denied/,
  );
  await assert.rejects(
    () => call("acemar_detail", ["sales", sale.id]),
    /autorizada/,
  );
  await assert.rejects(
    () => call("acemar_detail", ["quotations", q]),
    /autorizada/,
  );
  await assert.rejects(
    () => call("acemar_list", ["lots", 0, ""]),
    /autorizada/,
  );
  await user(admin);
});

test("contexto IA exige administrador y permite más de veinte consultas sin cuota", async () => {
  await user(seller);
  await assert.rejects(
    () => call("acemar_assistant_context", []),
    /autorizada/,
  );
  await user(admin);
  for (let i = 0; i < 105; i++) {
    const context = await call("acemar_assistant_context", []);
    assert.ok(context.summary);
    assert.ok(Array.isArray(context.low_stock_products));
    assert.ok(context.low_stock_products.length <= 10);
  }
  assert.ok((await call("acemar_assistant_context", [])).summary);
  await assert.rejects(
    () => db.query("SELECT * FROM public.assistant_usage"),
    /permission denied/,
  );
});

test("producto sin historial se elimina; con operaciones se conserva y las fotos exigen permisos", async () => {
  await user(seller);
  await assert.rejects(
    () => call("acemar_delete_product", [product]),
    /autorizada/,
  );
  await assert.rejects(
    () => call("acemar_media_target", [product]),
    /autorizada/,
  );
  await user(admin);
  await assert.rejects(
    () => call("acemar_delete_product", [product]),
    /historial/,
  );
  const baseUnit = (
    await call("acemar_catalog", ["TEST-001", 0])
  )[0].units.find((u) => u.name === "saco");
  await assert.rejects(
    () =>
      save("units", {
        id: baseUnit.id,
        product_id: product,
        name: "Unidad adulterada",
        factor: 9,
      }),
    /base no modificable/,
  );
  const id = await save("products", {
    code: "PHOTO-QA",
    name: "Producto nuevo para imagen",
    base_unit: "Unidad",
    minimum: 0,
  });
  assert.equal(
    await call("acemar_media_target", [id]),
    "Producto nuevo para imagen",
  );
  await assert.rejects(
    () =>
      call("acemar_commit_product_image", [
        id,
        "products/other.webp",
        "https://invalid.test/photo",
        20,
        100,
        100,
      ]),
    /inválidos/,
  );
  const key = `products/uploads/${id}/${crypto.randomUUID()}.webp`;
  await assert.rejects(
    () =>
      call("acemar_commit_product_image", [
        id,
        key,
        "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/" +
          key,
        20,
        100,
        100,
      ]),
    /Imagen no disponible/,
  );
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO storage.objects(bucket,key) VALUES($1,$2)", [
    "acemar-public",
    key,
  ]);
  await user(admin);
  const returnedUrl =
    "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/" +
    encodeURIComponent(key) +
    "?v=" +
    "a".repeat(32);
  await call("acemar_commit_product_image", [
    id,
    key,
    returnedUrl,
    20,
    100,
    100,
  ]);
  const catalog = await call("acemar_catalog", ["PHOTO-QA", 0]);
  assert.equal(catalog[0].image_url, returnedUrl);
  assert.equal(catalog[0].image_generated, false);
  await call("acemar_delete_product", [id]);
  assert.equal((await call("acemar_catalog", ["PHOTO-QA", 0])).length, 0);
  const audit = await call("acemar_list", ["audit", 0, "Eliminar producto"]);
  assert.equal(audit[0].before_data.code, "PHOTO-QA");
});

test("proformas eliminables dejan auditoría y no admiten borrar ventas vinculadas", async () => {
  await user(admin);
  const q = await call("acemar_quotation", [
    JSON.stringify([{ unit_id: unit, quantity: 1 }]),
    "Eliminar prueba",
  ]);
  await user(seller);
  await assert.rejects(
    () => call("acemar_delete_quotation", [q]),
    /autorizada/,
  );
  await user(admin);
  await call("acemar_delete_quotation", [q]);
  await assert.rejects(
    () => call("acemar_detail", ["quotations", q]),
    /autorizada/,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM public.audit WHERE entity_id=$1 AND action='Eliminar proforma'",
        [q],
      )
    ).rows[0].n,
    1,
  );
  const converted = (
    await db.query(
      "SELECT id FROM public.quotations WHERE state='converted' LIMIT 1",
    )
  ).rows[0].id;
  await user(admin);
  await assert.rejects(
    () => call("acemar_delete_quotation", [converted]),
    /vinculada/,
  );
});
test("boleta estable por revisión; datos privados y helpers exclusivos del servidor", async () => {
  await user(admin);
  const r = await call("acemar_receipt_prepare", [sale.id]);
  assert.match(r.code, /^[a-f0-9]{64}$/);
  assert.equal((await call("acemar_receipt_prepare", [sale.id])).code, r.code);
  await assert.rejects(
    () => db.query("SELECT * FROM public.sale_receipts"),
    /permission denied/,
  );
  await assert.rejects(
    () => call("acemar_receipt_lookup", [r.code]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      call("acemar_receipt_finalize", [
        r.code,
        admin,
        "receipts/" + r.code + "/test.pdf",
        "a".repeat(64),
        "b".repeat(64),
        "c".repeat(64),
      ]),
    /permission denied/,
  );
  await user(seller);
  await assert.rejects(
    () => call("acemar_receipt_prepare", [sale.id]),
    /autorizada/,
  );
  await db.exec("RESET ROLE");
  await call("acemar_receipt_finalize", [
    r.code,
    admin,
    "receipts/" + r.code + "/test.pdf",
    "a".repeat(64),
    "b".repeat(64),
    "c".repeat(64),
  ]);
  const publicData = await call("acemar_receipt_lookup", [r.code]);
  assert.equal(publicData.status, "cancelled");
  assert.equal(publicData.snapshot, undefined);
  assert.equal(publicData.customer_name, undefined);
  await user(admin);
});
test("correos opcionales se guardan y rechazan valores inválidos", async () => {
  await user(admin);
  const id = await save("suppliers", {
    name: "Proveedor correo",
    email: "VENTAS@example.invalid",
  });
  await db.exec("RESET ROLE");
  assert.equal(
    (await db.query("SELECT email FROM public.suppliers WHERE id=$1", [id]))
      .rows[0].email,
    "ventas@example.invalid",
  );
  await user(admin);
  await assert.rejects(
    () => save("suppliers", { name: "Inválido", email: "no es correo" }),
    /check constraint/,
  );
});
test("demostración completa respeta saldos, referencias y no duplica al repetirse", async () => {
  const { demoSeedSQL } = await import("../../scripts/demo-seed.mjs");
  const { products } = JSON.parse(
    await readFile("data/demo/products.json", "utf8"),
  );
  const assets = products.map((p, i) => ({
    code: p.code,
    key: `products/demo/v1/${p.code}-${"a".repeat(12)}.webp`,
    url: "https://example.invalid/" + i,
    bytes: 100,
  }));
  const sql = demoSeedSQL(products, assets, admin);
  await db.exec("RESET ROLE");
  await db.exec(sql);
  const before = (
    await db.query(
      "SELECT sum(available)::text stock,(SELECT count(*)::int FROM public.sales) sales FROM public.lots",
    )
  ).rows[0];
  await db.exec(sql);
  const after = (
    await db.query(
      "SELECT sum(available)::text stock,(SELECT count(*)::int FROM public.sales) sales FROM public.lots",
    )
  ).rows[0];
  assert.deepEqual(after, before);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM public.customers WHERE name LIKE '%DEMO'",
      )
    ).rows[0].n,
    4,
  );
  await user(admin);
});

test("corregir reemplaza el código anterior y los envíos son idempotentes", async () => {
  await user(admin);
  const p = (await call("acemar_catalog", ["TAL-113", 0]))[0];
  const s = await call("acemar_checkout", [
    crypto.randomUUID(),
    JSON.stringify([{ unit_id: p.units[0].id, quantity: 1 }]),
    "cash",
    null,
    1000,
    null,
  ]);
  const r = await call("acemar_receipt_prepare", [s.id]);
  await db.exec("RESET ROLE");
  await call("acemar_receipt_finalize", [
    r.code,
    admin,
    "receipts/" + r.code + "/test.pdf",
    "a".repeat(64),
    "b".repeat(64),
    "c".repeat(64),
  ]);
  assert.equal((await call("acemar_receipt_lookup", [r.code])).status, "valid");
  const request = crypto.randomUUID();
  assert.equal(
    (
      await call("acemar_receipt_delivery_begin", [
        r.code,
        admin,
        "demo@example.invalid",
        request,
      ])
    ).claimed,
    true,
  );
  assert.equal(
    (
      await call("acemar_receipt_delivery_begin", [
        r.code,
        admin,
        "demo@example.invalid",
        request,
      ])
    ).claimed,
    false,
  );
  await assert.rejects(
    () =>
      call("acemar_receipt_delivery_begin", [
        r.code,
        admin,
        "demo@example.invalid",
        crypto.randomUUID(),
      ]),
    /reciente/,
  );
  await call("acemar_receipt_delivery_finish", [request, "sent"]);
  await user(admin);
  const detail = await call("acemar_detail", ["sales", s.id]);
  await call("acemar_change_sale", [
    s.id,
    "correct",
    "Corrección verificable de prueba",
    JSON.stringify({ [detail.lines[0].id]: 2 }),
    detail.sale.revision,
  ]);
  const next = await call("acemar_receipt_prepare", [s.id]);
  assert.notEqual(next.code, r.code);
  assert.equal(next.revision, r.revision + 1);
  await db.exec("RESET ROLE");
  assert.equal(
    (await call("acemar_receipt_lookup", [r.code])).status,
    "replaced",
  );
  await user(admin);
});
