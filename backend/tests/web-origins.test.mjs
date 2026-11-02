import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedWebOrigin } from "../../functions/web-origins.mjs";
test("CORS admite únicamente orígenes exactos autorizados", () => {
  const configured =
    "https://acemar-ejemplo.vercel.app, https://inventario.example.com";
  assert.equal(
    allowedWebOrigin("https://acemar-ejemplo.vercel.app", configured),
    true,
  );
  for (const origin of [
    "https://otro.vercel.app",
    "https://acemar-ejemplo.vercel.app.evil.com",
    "null",
    "http://acemar-ejemplo.vercel.app",
  ])
    assert.equal(allowedWebOrigin(origin, configured), false);
  for (const value of [
    "https://*.vercel.app",
    "https://inventario.example.com/",
    "https://user:pass@inventario.example.com",
    "http://inventario.example.com",
  ])
    assert.equal(
      allowedWebOrigin("https://inventario.example.com", value),
      false,
    );
  assert.equal(
    allowedWebOrigin("https://acemar-preview.braceddog.chatgpt.site"),
    true,
  );
});
