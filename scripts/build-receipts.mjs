import { rolldown } from "rolldown";
import { readFile, mkdir } from "node:fs/promises";
const fonts = {
  regular: (await readFile("public/fonts/acemar-report-regular.ttf")).toString(
    "base64",
  ),
  bold: (await readFile("public/fonts/acemar-report-bold.ttf")).toString(
    "base64",
  ),
};
await mkdir(".insforge/functions", { recursive: true });
for (const name of [
  "acemar-receipt",
  "acemar-verify-receipt",
  "acemar-assistant",
  "acemar-product-image",
]) {
  const build = await rolldown({
    input: `functions/${name}.mjs`,
    external: (id) =>
      id.startsWith("npm:") ||
      [
        "@insforge/sdk",
        "pdf-lib",
        "decimal.js",
        "@pdf-lib/fontkit",
        "qrcode",
        "nodemailer",
      ].includes(id),
    plugins: [
      {
        name: "receipt-fonts",
        transform(code, id) {
          if (id.endsWith("receipt-fonts.mjs"))
            return code
              .replace("__ACEMAR_REGULAR_BASE64__", fonts.regular)
              .replace("__ACEMAR_BOLD_BASE64__", fonts.bold);
        },
      },
    ],
  });
  await build.write({
    file: `.insforge/functions/${name}.mjs`,
    format: "esm",
    codeSplitting: false,
    paths: {
      "@insforge/sdk": "npm:@insforge/sdk@1.5.2",
      "pdf-lib": "npm:pdf-lib@1.17.1",
      "decimal.js": "npm:decimal.js@10.6.0",
      "@pdf-lib/fontkit": "npm:@pdf-lib/fontkit@1.1.1",
      qrcode: "npm:qrcode@1.5.4",
      nodemailer: "npm:nodemailer@10.3.1",
    },
  });
  await build.close();
}
