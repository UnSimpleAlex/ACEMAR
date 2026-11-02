/** Operator-only upload; public objects contain generated product illustrations only. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
if (config.project_id !== "2ce08e4d-e48d-4377-8228-2911916fc828")
  throw Error("Requires acemar-dev");
const { products } = JSON.parse(
  await readFile("data/catalog-v2/products.json", "utf8"),
);
const assets = [];
const cli = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("npx", ["-y", "@insforge/cli", ...args, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          Error(
            "Storage upload failed; inspect CLI without printing credentials",
          ),
        );
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(Error("Invalid upload response"));
      }
    });
  });
const queue = [...products];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      const path = `.insforge/catalog-v2-images/${p.code}.webp`;
      execFileSync(
        "python",
        [
          "-c",
          "from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.format=='WEBP' and im.size==(640,640) and getattr(im,'n_frames',1)==1; im.verify()",
          path,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const file = await readFile(path);
      if (
        file.toString("ascii", 0, 4) !== "RIFF" ||
        file.toString("ascii", 8, 12) !== "WEBP" ||
        file.length > 2097152
      )
        throw Error("Invalid WebP file");
      const sha256 = createHash("sha256").update(file).digest("hex");
      const key = `products/catalog/v2/${p.code}-${sha256.slice(0, 12)}.webp`;
      const uploaded = await cli([
        "storage",
        "upload",
        path,
        "--bucket",
        "acemar-public",
        "--key",
        key,
      ]);
      if (
        uploaded.key !== key ||
        uploaded.size !== file.length ||
        uploaded.mimeType !== "image/webp"
      )
        throw Error("Unexpected upload metadata");
      assets.push({
        code: p.code,
        key: uploaded.key,
        url: uploaded.url,
        mime: "image/webp",
        bytes: file.length,
        width: 640,
        height: 640,
        sha256,
        generated: true,
      });
      await writeFile(
        `.insforge/upload-${p.code}.json`,
        JSON.stringify({ assets }, null, 2) + "\n",
      );
      console.log("Uploaded " + p.code);
    }
  }),
);
assets.sort(
  (a, b) =>
    products.findIndex((p) => p.code === a.code) -
    products.findIndex((p) => p.code === b.code),
);
await writeFile(
  "data/catalog-v2/assets.json",
  JSON.stringify(
    { bucket: "acemar-public", generated: true, assets },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    uploaded: assets.length,
    bytes: assets.reduce((sum, a) => sum + a.bytes, 0),
  }),
);
