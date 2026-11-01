import { client } from "./backend";
export async function preparePhoto(file: File): Promise<Blob> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5242880 ||
    !file.size
  )
    throw new Error("Usa una imagen PNG, JPG o WebP de hasta 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (
    !(
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71
    ) &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) &&
    !(
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    )
  )
    throw new Error("El archivo no es una imagen compatible.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40000000)
      throw new Error(
        "La imagen tiene demasiada resolución. Usa una versión más pequeña.",
      );
    const scale = Math.min(1, 1024 / image.width, 1024 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("No se pudo convertir la imagen.")),
        "image/webp",
        0.85,
      ),
    );
    if (blob.type !== "image/webp" || blob.size > 1048576)
      throw new Error("Usa una imagen más sencilla o pequeña.");
    return blob;
  } finally {
    image.close();
  }
}
export async function uploadProductPhoto(productId: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192)
    binary += String.fromCharCode(...bytes.slice(at, at + 8192));
  const { data, error } = await client().functions.invoke(
    "acemar-product-image",
    { body: { productId, image: btoa(binary) } },
  );
  if (error || !data?.url)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "No se pudo guardar la foto. El producto ya está guardado; reintenta para adjuntarla.",
    );
  return data as { url: string; key: string };
}
