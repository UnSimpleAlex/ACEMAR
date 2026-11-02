import { test } from "node:test";
import assert from "node:assert/strict";
import {
  webpInfo,
  createImageHandler,
} from "../../functions/acemar-product-image.mjs";
const bytes = Uint8Array.from(
  Buffer.from(
    "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA",
    "base64",
  ),
);
const id = "00000000-0000-4000-8000-000000000001";
const request = (body = {}, headers = {}) =>
  new Request("https://test/", {
    method: "POST",
    headers: {
      Authorization: "Bearer user",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("valida firma dimensiones longitud y rechaza contenido falso", () => {
  assert.deepEqual(webpInfo(bytes), { width: 2, height: 2 });
  assert.throws(() => webpInfo(bytes.slice(0, 20)));
  const fake = bytes.slice();
  fake[0] = 0;
  assert.throws(() => webpInfo(fake));
  const large = bytes.slice();
  large[26] = 255;
  large[27] = 63;
  assert.throws(() => webpInfo(large));
});
test("la carga no llega a storage sin sesión o autorización administrativa", async () => {
  let converted = false;
  const handler = createImageHandler({
    makeClient: () => ({
      auth: { getCurrentUser: async () => ({ data: { user: { id: "u" } } }) },
      database: { rpc: async () => ({ error: { code: "42501" } }) },
    }),
    makeStorage: () => {
      throw Error("unexpected");
    },
    convert: () => {
      converted = true;
    },
  });
  assert.equal((await handler(request({}, { Authorization: "" }))).status, 401);
  assert.equal(
    (
      await handler(
        request({
          productId: id,
          image: Buffer.from(bytes).toString("base64"),
        }),
      )
    ).status,
    403,
  );
  assert.equal(converted, false);
});
test("solo asocia metadatos de la imagen procesada y de la key única creada por el servidor", async () => {
  const calls = [];
  const handler = createImageHandler({
    makeClient: () => ({
      auth: { getCurrentUser: async () => ({ data: { user: { id: "u" } } }) },
      database: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: "ok" };
        },
      },
    }),
    makeStorage: () => ({
      from: () => ({
        upload: async (key, blob) => {
          assert.equal(blob.type, "image/webp");
          return { data: { key, url: "https://example.test/" + key } };
        },
      }),
    }),
    convert: () => ({ bytes, width: 2, height: 2 }),
  });
  const r = await handler(
    request({
      productId: id,
      image: Buffer.from(bytes).toString("base64"),
      url: "https://attacker.test/evil.svg",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(calls[1].name, "acemar_commit_product_image");
  assert.ok(calls[1].args.p_key.startsWith("products/uploads/" + id + "/"));
  assert.equal(
    calls[1].args.p_url,
    "https://example.test/" + calls[1].args.p_key,
  );
  assert.equal(calls[1].args.p_bytes, bytes.length);
  assert.equal(calls[1].args.p_width, 2);
});
