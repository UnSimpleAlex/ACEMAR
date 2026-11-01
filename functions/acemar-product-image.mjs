/* global Deno */
const BASE = "https://beft7ipm.us-east.insforge.app";
const ORIGINS = new Set([
  "https://acemar-preview.braceddog.chatgpt.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const decoder = new TextDecoder();
export function webpInfo(bytes) {
  if (
    bytes.length < 20 ||
    bytes.length > 1048576 ||
    decoder.decode(bytes.slice(0, 4)) !== "RIFF" ||
    decoder.decode(bytes.slice(8, 12)) !== "WEBP"
  )
    throw Error("invalid");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) throw Error("invalid");
  let size,
    frames = 0;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw Error("invalid");
    const type = decoder.decode(bytes.slice(at, at + 4)),
      n = view.getUint32(at + 4, true),
      p = at + 8;
    if (
      p + n > bytes.length ||
      !["VP8X", "ALPH", "VP8 ", "VP8L"].includes(type)
    )
      throw Error("invalid");
    let current;
    if (type === "VP8X") {
      if (n !== 10 || bytes[p] & 2) throw Error("invalid");
      current = [
        1 + bytes[p + 4] + (bytes[p + 5] << 8) + (bytes[p + 6] << 16),
        1 + bytes[p + 7] + (bytes[p + 8] << 8) + (bytes[p + 9] << 16),
      ];
    }
    if (type === "VP8 ") {
      frames++;
      if (
        n < 10 ||
        bytes[p + 3] !== 157 ||
        bytes[p + 4] !== 1 ||
        bytes[p + 5] !== 42
      )
        throw Error("invalid");
      current = [
        view.getUint16(p + 6, true) & 16383,
        view.getUint16(p + 8, true) & 16383,
      ];
    }
    if (type === "VP8L") {
      frames++;
      if (n < 5 || bytes[p] !== 47) throw Error("invalid");
      const v = view.getUint32(p + 1, true);
      current = [(v & 16383) + 1, ((v >>> 14) & 16383) + 1];
    }
    if (current) {
      if (size && (size[0] !== current[0] || size[1] !== current[1]))
        throw Error("invalid");
      size = current;
    }
    at = p + n + (n % 2);
    if (at > bytes.length) throw Error("invalid");
  }
  if (frames !== 1 || !size || size.some((n) => n < 1 || n > 1024))
    throw Error("invalid");
  return { width: size[0], height: size[1] };
}
export function encodeImage(lib, bytes) {
  webpInfo(bytes);
  return lib.ImageMagick.read(bytes, (image) => {
    if (image.width > 1024 || image.height > 1024) throw Error("invalid");
    image.strip();
    image.quality = 85;
    return image.write(lib.MagickFormat.WebP, (output) => ({
      bytes: new Uint8Array(output),
      width: image.width,
      height: image.height,
    }));
  });
}
let ready;
async function normalize(bytes) {
  if (!ready)
    ready = (async () => {
      const lib = await import("npm:@imagemagick/magick-wasm@0.0.45");
      const r = await fetch(
        "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.45/dist/x86/magick.wasm",
        { signal: AbortSignal.timeout(20000) },
      );
      if (!r.ok) throw Error("decoder");
      const wasm = new Uint8Array(await r.arrayBuffer());
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", wasm)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (
        digest !==
        "54629cbcf06dd10db38b4d87fa6ab241b248c09c94f2d9689506e5f994ac5f0c"
      )
        throw Error("decoder");
      await lib.initializeImageMagick(wasm);
      return lib;
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  return encodeImage(await ready, bytes);
}
async function readBody(req, limit) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export function createImageHandler({
  makeClient,
  makeStorage,
  convert = normalize,
}) {
  return async (req) => {
    const origin = req.headers.get("origin"),
      headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, apikey, x-client-info",
      };
    const reply = (status, data) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && !ORIGINS.has(origin))
      return reply(403, { error: "Origen no permitido." });
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return reply(405, { error: "Método no permitido." });
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token)
      return reply(401, { error: "Inicia sesión para cargar imágenes." });
    try {
      const client = await makeClient(token);
      const { data: user, error: authError } =
        await client.auth.getCurrentUser();
      if (authError || !user?.user?.id)
        return reply(401, { error: "La sesión no es válida." });
      if (
        !req.headers.get("content-type")?.startsWith("application/json") ||
        Number(req.headers.get("content-length")) > 1500000
      )
        return reply(400, { error: "Imagen no válida." });
      let text;
      try {
        text = await readBody(req, 1500000);
      } catch {
        return reply(413, { error: "La imagen supera el tamaño permitido." });
      }
      if (text.length > 1500000)
        return reply(400, { error: "La imagen supera el tamaño permitido." });
      let body, bytes;
      try {
        body = JSON.parse(text);
        if (
          !/^[a-f0-9-]{36}$/i.test(body.productId) ||
          typeof body.image !== "string" ||
          body.image.length > 1398104
        )
          throw Error();
        bytes = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
        webpInfo(bytes);
      } catch {
        return reply(400, { error: "Selecciona una imagen válida." });
      }
      const { error: permission } = await client.database.rpc(
        "acemar_media_target",
        { p_id: body.productId },
      );
      if (permission)
        return reply(permission.code === "P0001" ? 429 : 403, {
          error:
            permission.code === "P0001"
              ? "Límite de imágenes alcanzado por hoy."
              : "No se puede modificar este producto.",
        });
      let image;
      try {
        image = await convert(bytes);
        webpInfo(image.bytes);
      } catch {
        return reply(422, {
          error: "No se pudo procesar la imagen. Selecciona otra o reintenta.",
        });
      }
      const storage = await makeStorage(),
        key = `products/uploads/${body.productId}/${crypto.randomUUID()}.webp`;
      const { data: uploaded, error: uploadError } = await storage
        .from("acemar-public")
        .upload(key, new Blob([image.bytes], { type: "image/webp" }));
      if (uploadError || !uploaded || uploaded.key !== key)
        return reply(502, {
          error: "No se pudo guardar la imagen. Reintenta.",
        });
      const { error: attachError } = await client.database.rpc(
        "acemar_commit_product_image",
        {
          p_product: body.productId,
          p_key: key,
          p_url: uploaded.url,
          p_bytes: image.bytes.length,
          p_width: image.width,
          p_height: image.height,
        },
      );
      if (attachError)
        return reply(409, {
          error:
            "El producto cambió durante la carga. Revisa el registro y reintenta.",
        });
      return reply(200, { url: uploaded.url, key });
    } catch {
      return reply(503, {
        error: "No se pudo cargar la imagen. Reintenta en unos momentos.",
      });
    }
  };
}
export default async function (req) {
  const { createClient, createAdminClient } =
    await import("npm:@insforge/sdk@1.5.2");
  return createImageHandler({
    makeClient: (token) =>
      createClient({ baseUrl: BASE, edgeFunctionToken: token }),
    makeStorage: () =>
      createAdminClient({ baseUrl: BASE, apiKey: Deno.env.get("API_KEY") })
        .storage,
  })(req);
}
