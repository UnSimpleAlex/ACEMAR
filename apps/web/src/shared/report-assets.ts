export interface ReportAssets {
  logo?: Uint8Array;
  icons?: Uint8Array[];
  images: Record<string, Uint8Array>;
  missing: number;
}
const blobBytes = async (canvas: HTMLCanvasElement) =>
  new Uint8Array(
    await (
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("No se pudo convertir la imagen")),
          "image/png",
        ),
      )
    ).arrayBuffer(),
  );
export async function reportAssets(
  rows: Record<string, unknown>[],
): Promise<ReportAssets> {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el logo");
  ctx.fillStyle = "#EA6B32";
  for (const [x, y, w, h] of [
    [24, 4, 20, 10],
    [14, 18, 14, 10],
    [32, 18, 12, 10],
    [4, 32, 18, 10],
    [26, 32, 18, 10],
  ])
    ctx.fillRect(x * 1.8, y * 1.8 + 8, w * 1.8, h * 1.8);
  ctx.fillStyle = "#14243B";
  ctx.font = "800 54px Inter, sans-serif";
  ctx.fillText("ACEMAR", 100, 69);
  const result: ReportAssets = {
    logo: await blobBytes(canvas),
    images: {},
    missing: 0,
    icons: await Promise.all(
      ["inventory", "available", "stock", "value", "search"].map(
        async (name) => {
          const response = await fetch(`/report-icons/${name}.png`);
          if (!response.ok)
            throw new Error("No se pudo cargar un icono del reporte");
          return new Uint8Array(await response.arrayBuffer());
        },
      ),
    ),
  };
  const queue = rows
    .filter((r) => typeof r.image_url === "string" && r.image_url)
    .slice(0, 100);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const row = queue.shift()!;
        try {
          const url = new URL(String(row.image_url));
          if (
            url.origin !== "https://beft7ipm.us-east.insforge.app" ||
            !url.pathname.startsWith(
              "/api/storage/buckets/acemar-public/objects/",
            )
          )
            throw new Error();
          const response = await fetch(url, {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(10000),
          });
          if (
            !response.ok ||
            !/^image\/(webp|png|jpeg)(;|$)/.test(
              response.headers.get("content-type") ?? "",
            )
          )
            throw new Error();
          const blob = await response.blob();
          if (blob.size > 2097152) throw new Error();
          const image = await createImageBitmap(blob);
          try {
            if (image.width > 4096 || image.height > 4096) throw new Error();
            const c = document.createElement("canvas");
            c.width = 112;
            c.height = 112;
            const context = c.getContext("2d");
            if (!context) throw new Error();
            context.clearRect(0, 0, 112, 112);
            const scale = Math.min(112 / image.width, 112 / image.height);
            context.drawImage(
              image,
              (112 - image.width * scale) / 2,
              (112 - image.height * scale) / 2,
              image.width * scale,
              image.height * scale,
            );
            result.images[String(row.id)] = await blobBytes(c);
          } finally {
            image.close();
          }
        } catch {
          result.missing++;
        }
      }
    }),
  );
  return result;
}
