import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
const xml = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
/** Native header filters keep images attached to their original records. SUBTOTAL drives the summary. */
export async function inventoryFilters(
  blob: Blob,
  rows: Record<string, unknown>[],
  sheetName: string,
  columns: number,
  products: boolean,
) {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const set = (path: string, value: string) => {
    zip[path] = strToU8(value);
  };
  const get = (path: string) => strFromU8(zip[path]);
  const filter = (sheet: string, range: string) =>
    sheet
      .replace(/<autoFilter\b[^>]*(?:\/>|>[\s\S]*?<\/autoFilter>)/g, "")
      .replace("</sheetData>", `</sheetData><autoFilter ref="${range}"/>`);
  let main = filter(
    get("xl/worksheets/sheet1.xml"),
    `A12:${String.fromCharCode(64 + columns)}${12 + rows.length}`,
  );
  if (products && rows.length) {
    const n = rows.length + 1;
    const ref = `'${sheetName.replaceAll("'", "''")}'`;
    const formula = (
      sheet: string,
      cell: string,
      expression: string,
      cached: unknown,
      string = false,
    ) => {
      const re = new RegExp(
        `<c\\b([^>]*\\br="${cell}"[^>]*)(?:\\/>|>[\\s\\S]*?<\\/c>)`,
      );
      if (!re.test(sheet)) throw Error(`Celda de reporte ausente: ${cell}`);
      return sheet.replace(
        re,
        (_, attrs: string) =>
          `<c${attrs.replace(/\s+t="[^"]*"/g, "")}${string ? ' t="str"' : ""}><f>${xml(expression)}</f><v>${xml(cached)}</v></c>`,
      );
    };
    let raw = get("xl/worksheets/sheet3.xml");
    const top = [...rows].sort(
      (a, b) => Number(b.stock_value) - Number(a.stock_value),
    );
    rows.forEach((r, i) => {
      const k = i + 2;
      const extra = `<c r="I${k}"><f>SUBTOTAL(103,${xml(ref)}!B${i + 13})</f><v>1</v></c><c r="J${k}"><f>${xml(`IF(I${k}=0,"",SUMPRODUCT($I$2:$I$${n},--($H$2:$H$${n}>H${k}))+COUNTIFS($H$2:H${k},H${k},$I$2:I${k},1))`)}</f><v>${top.indexOf(r) + 1}</v></c>`;
      raw = raw.replace(
        new RegExp(`(<row\\b[^>]*\\br="${k}"[^>]*>)([\\s\\S]*?)(<\\/row>)`),
        (_match, open, cells, close) => `${open}${cells}${extra}${close}`,
      );
      raw = formula(raw, `H${k}`, `ROUND(D${k}*E${k},2)`, r.stock_value);
      main = formula(main, `H${i + 13}`, `Datos!H${k}`, r.stock_value);
    });
    raw = raw.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:J${n}"/>`);
    raw = raw.replace(
      /<\/cols>/,
      '<col min="9" max="10" hidden="1" width="0" customWidth="1"/></cols>',
    );
    raw = filter(raw, `A1:H${n}`);
    const mask = `Datos!$I$2:$I$${n}`;
    const expressions = [
      `SUM(${mask})`,
      `COUNTIFS(${mask},1,Datos!$E$2:$E$${n},">0")`,
      `COUNTIFS(${mask},1,Datos!$G$2:$G$${n},"Stock bajo")+COUNTIFS(${mask},1,Datos!$G$2:$G$${n},"Agotado")`,
      `SUMIF(${mask},1,Datos!$H$2:$H$${n})`,
    ];
    const cached = [
      rows.length,
      rows.filter((r) => Number(r.stock) > 0).length,
      rows.filter((r) => r.stock_state !== "Disponible").length,
      rows.reduce((s, r) => s + Number(r.stock_value), 0),
    ];
    let summary = get("xl/worksheets/sheet2.xml");
    ["A8", "C8", "E8", "G8"].forEach((cell, i) => {
      main = formula(main, cell, expressions[i], cached[i]);
    });
    ["B8", "F8", "J8", "N8"].forEach((cell, i) => {
      summary = formula(
        summary,
        cell,
        `${ref}!${["A8", "C8", "E8", "G8"][i]}`,
        cached[i],
      );
    });
    ["Disponible", "Stock bajo", "Agotado"].forEach((state, i) => {
      summary = formula(
        summary,
        `E${14 + i}`,
        `COUNTIFS(${mask},1,Datos!$G$2:$G$${n},"${state}")`,
        rows.filter((r) => r.stock_state === state).length,
      );
    });
    top.slice(0, 5).forEach((r, i) => {
      summary = formula(
        summary,
        `B${28 + i}`,
        `IFERROR(INDEX(Datos!$B$2:$B$${n},MATCH(${i + 1},Datos!$J$2:$J$${n},0)),"")`,
        r.name,
        true,
      );
      summary = formula(
        summary,
        `G${28 + i}`,
        `IFERROR(INDEX(Datos!$H$2:$H$${n},MATCH(${i + 1},Datos!$J$2:$J$${n},0)),0)`,
        r.stock_value,
      );
    });
    set("xl/worksheets/sheet2.xml", summary);
    set("xl/worksheets/sheet3.xml", raw);
    const workbook = get("xl/workbook.xml")
      .replace(/<calcPr\b[^>]*\/>/, "")
      .replace(
        "</workbook>",
        '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
      );
    set("xl/workbook.xml", workbook);
  }
  // Move and size each product photo with its row so filtering hides it as well.
  const drawingPath = "xl/drawings/drawing1.xml";
  if (zip[drawingPath]) {
    const drawing = get(drawingPath).replace(
      /<xdr:oneCellAnchor>([\s\S]*?)<\/xdr:oneCellAnchor>/g,
      (original, body: string) => {
        const from = body.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1];
        const row = Number(from?.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]);
        if (!from || row < 12 || row >= 12 + rows.length) return original;
        const cx = Number(body.match(/<xdr:ext cx="(\d+)"/)?.[1]);
        const cy = Number(body.match(/<xdr:ext[^>]* cy="(\d+)"/)?.[1]);
        const to = from
          .replace(
            /<xdr:colOff>(\d+)<\/xdr:colOff>/,
            (_, v: string) => `<xdr:colOff>${Number(v) + cx}</xdr:colOff>`,
          )
          .replace(
            /<xdr:rowOff>(\d+)<\/xdr:rowOff>/,
            (_, v: string) => `<xdr:rowOff>${Number(v) + cy}</xdr:rowOff>`,
          );
        return `<xdr:twoCellAnchor editAs="twoCell">${body.replace(/<xdr:ext[^>]*\/>/, `<xdr:to>${to}</xdr:to>`)}</xdr:twoCellAnchor>`;
      },
    );
    set(drawingPath, drawing);
  }
  set("xl/worksheets/sheet1.xml", main);
  return new Blob([new Uint8Array(zipSync(zip, { level: 6 })).buffer], {
    type: blob.type,
  });
}
