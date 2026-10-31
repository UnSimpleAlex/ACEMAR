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
  const catalog = await call("acemar_catalog", ["", 0]);
  unit = catalog[0].units[0].id;
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
    name: "saco",
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
    name: "saco",
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
