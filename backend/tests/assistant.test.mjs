import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../../functions/acemar-assistant.mjs";
const context = {
  date: "2026-11-01",
  summary: { sales_count: 2, sales_total: 65, low_stock: 1 },
  low_stock_products: [{ name: "Cemento", stock: 1, minimum: 2 }],
};
const req = (body = { question: "Revisar stock" }, headers = {}) =>
  new Request("https://test/functions/acemar-assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer user-token",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const client = (error = null) => ({
  auth: { getCurrentUser: async () => ({ data: { user: { id: "admin" } } }) },
  database: { rpc: async () => ({ data: context, error }) },
});
test("el asistente rechaza origen, sesión ausente y entrada inválida antes del proveedor", async () => {
  const handler = createHandler({
    env: () => "secret",
    makeClient: () => {
      throw Error("not expected");
    },
    request: () => {
      throw Error("not expected");
    },
  });
  assert.equal(
    (await handler(req({}, { origin: "https://attacker.example" }))).status,
    403,
  );
  assert.equal((await handler(req({}, { Authorization: "" }))).status, 401);
  assert.equal((await handler(req({ question: "x".repeat(501) }))).status, 400);
});
test("la IA usa contexto autorizado del servidor y mantiene la clave fuera de respuesta", async () => {
  let input;
  const handler = createHandler({
    env: () => "test-secret",
    makeClient: () => client(),
    request: async (url, options) => {
      input = { url, ...options };
      return Response.json({
        candidates: [
          {
            content: { parts: [{ text: "Revisa el cemento." }] },
            finishReason: "STOP",
          },
        ],
      });
    },
  });
  const response = await handler(
    req({ question: "Revisar stock", context: { sales_total: 999999 } }),
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.answer, "Revisa el cemento.");
  const prompt = JSON.parse(JSON.parse(input.body).contents[0].parts[0].text);
  assert.deepEqual(prompt.context, context);
  assert.equal(input.headers["x-goog-api-key"], "test-secret");
  assert.ok(!JSON.stringify(result).includes("test-secret"));
});
test("permisos y cuota bloquean llamadas a Gemini; errores externos no se filtran", async () => {
  for (const [code, status] of [
    ["42501", 403],
    ["P0001", 429],
  ]) {
    const handler = createHandler({
      env: () => "secret",
      makeClient: () => client({ code }),
      request: () => {
        throw Error("not expected");
      },
    });
    assert.equal((await handler(req())).status, status);
  }
  const handler = createHandler({
    env: () => "secret",
    makeClient: () => client(),
    request: async () => new Response("sensitive diagnostic", { status: 429 }),
  });
  const r = await handler(req());
  assert.equal(r.status, 429);
  assert.ok(!(await r.text()).includes("sensitive diagnostic"));
});
