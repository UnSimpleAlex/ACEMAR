import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { catalogSeedSQL } from "../../scripts/catalog-seed.mjs";
const db = new PGlite();
const actor = "00000000-0000-4000-8000-000000000001";
const { products } = JSON.parse(
  await readFile("data/evaluation/products.json", "utf8"),
);
const assets = products.map((p) => ({
  code: p.code,
  key: `products/evaluation/v1/${p.code}-012345abcdef.webp`,
  url: `https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/products/evaluation/v1/${p.code}-012345abcdef.webp`,
  mime: "image/webp",
  bytes: 12000,
  width: 640,
  height: 640,
  sha256: "a".repeat(64),
}));
before(async () => {
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`,
  );
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("migrations/" + file, "utf8");
    if (sql.includes("storage.objects"))
      await db.exec(
        "CREATE SCHEMA IF NOT EXISTS storage;CREATE TABLE IF NOT EXISTS storage.objects(bucket text,key text,uploaded_by text);GRANT USAGE ON SCHEMA storage TO anon,authenticated;",
      );
    await db.exec(sql);
  }
  await db.query("INSERT INTO auth.users(id) VALUES($1)", [actor]);
  await db.query(
    "INSERT INTO public.profiles(id,name,role) VALUES($1,'Admin','admin')",
    [actor],
  );
});
after(() => db.close());
test("la carga conserva stock, costos, fotografías y no repone ni duplica al repetir", async () => {
  await db.exec(catalogSeedSQL(products, assets, actor));
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM public.products")).rows[0]
      .n,
    12,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM public.assets WHERE generated AND mime='image/webp'",
      )
    ).rows[0].n,
    12,
  );
  const first = products[0];
  assert.equal(
    Number(
      (
        await db.query("SELECT cost FROM public.lots WHERE id=$1", [
          first.lot_id,
        ])
      ).rows[0].cost,
    ),
    22.75,
  );
  await db.query("UPDATE public.lots SET available=available-1 WHERE id=$1", [
    first.lot_id,
  ]);
  await db.exec(catalogSeedSQL(products, assets, actor));
  assert.equal(
    Number(
      (
        await db.query("SELECT available FROM public.lots WHERE id=$1", [
          first.lot_id,
        ])
      ).rows[0].available,
    ),
    34,
  );
  for (const table of ["lots", "stock_movements", "assets", "audit"])
    assert.equal(
      (await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0]
        .n,
      12,
    );
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  const catalog = (await db.query("SELECT public.acemar_catalog('',0) AS data"))
    .rows[0].data;
  assert.equal(catalog.length, 12);
  assert.ok(
    catalog.every((p) => p.image_url.endsWith(".webp") && p.image_generated),
  );
});
test("un código ocupado aborta sin modificar datos existentes", async () => {
  const changed = products.map((p, i) =>
    i ? p : { ...p, product_id: "00000000-0000-4000-8000-000000000099" },
  );
  await assert.rejects(
    db.exec(catalogSeedSQL(changed, assets, actor)),
    /Existing product code/,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM public.products")).rows[0]
      .n,
    12,
  );
});
test("rechaza actores sin privilegios y medios fuera del bucket permitido", async () => {
  await assert.rejects(
    db.exec(
      catalogSeedSQL(products, assets, "00000000-0000-4000-8000-000000000099"),
    ),
    /Administrator required/,
  );
  assert.throws(
    () =>
      catalogSeedSQL(
        products,
        assets.map((a, i) =>
          i ? a : { ...a, url: "https://external.invalid/x.webp" },
        ),
        actor,
      ),
    /Invalid WebP asset/,
  );
});

test("acepta la URL codificada y versionada que devuelve Storage", () => {
  const encoded = assets.map((a) => ({
    ...a,
    url:
      "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/" +
      encodeURIComponent(a.key) +
      "?v=" +
      "a".repeat(32),
  }));
  assert.ok(catalogSeedSQL(products, encoded, actor).includes("%2F"));
});

test("catálogo ampliado añade ocho referencias y reemplaza doce fotos sin reponer stock", async () => {
  const { expandedCatalogSQL } =
    await import("../../scripts/expanded-catalog-seed.mjs");
  const { products: expanded } = JSON.parse(
    await readFile("data/catalog-v2/products.json", "utf8"),
  );
  const media = expanded.map((p, i) => ({
    code: p.code,
    key: `products/catalog/v2/${p.code}-012345abcdef.webp`,
    url: `https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/products/catalog/v2/${p.code}-012345abcdef.webp`,
    mime: "image/webp",
    bytes: 12000,
    width: 640,
    height: 640,
    sha256: i.toString(16).padStart(64, "0"),
  }));
  await db.exec("RESET ROLE");
  // Existing demo references represent the twelve products being re-illustrated.
  await db.exec(
    expandedCatalogSQL(expanded.slice(0, 12), media.slice(0, 12), actor),
  );
  const first = expanded[0];
  await db.query(
    "UPDATE public.lots SET available=available-1 WHERE product_id=$1",
    [first.product_id],
  );
  await db.exec(expandedCatalogSQL(expanded, media, actor));
  const counts = (
    await db.query(
      "SELECT (SELECT count(*)::int FROM public.products) products,(SELECT count(*)::int FROM public.assets) assets,sum(available)::text stock FROM public.lots",
    )
  ).rows[0];
  await db.exec(expandedCatalogSQL(expanded, media, actor));
  assert.deepEqual(
    (
      await db.query(
        "SELECT (SELECT count(*)::int FROM public.products) products,(SELECT count(*)::int FROM public.assets) assets,sum(available)::text stock FROM public.lots",
      )
    ).rows[0],
    counts,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT available FROM public.lots WHERE product_id=$1",
          [first.product_id],
        )
      ).rows[0].available,
    ),
    first.stock - 1,
  );
  const duplicated = media.map((a) => ({ ...a, sha256: "a".repeat(64) }));
  assert.throws(
    () => expandedCatalogSQL(expanded, duplicated, actor),
    /Duplicate illustration/,
  );
});
