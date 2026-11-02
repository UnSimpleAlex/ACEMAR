export interface ReportFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}
let pending: Promise<ReportFontBytes> | undefined;
export function reportFont(): Promise<ReportFontBytes> {
  if (!pending)
    pending = Promise.all(
      ["regular", "bold"].map(async (weight) => {
        const response = await fetch(`/fonts/acemar-report-${weight}.ttf`);
        if (!response.ok)
          throw new Error("No se pudo cargar la tipografía del reporte");
        return new Uint8Array(await response.arrayBuffer());
      }),
    )
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error) => {
        pending = undefined;
        throw error;
      });
  return pending;
}
