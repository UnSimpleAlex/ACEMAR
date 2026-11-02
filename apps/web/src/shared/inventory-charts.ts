import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const finite = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const chartNS =
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const title = (label: string) =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1400" b="1"><a:latin typeface="Bahnschrift"/></a:rPr><a:t>${escape(label)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
function categories(labels: string[], range: string) {
  return `<c:cat><c:strRef><c:f>${range}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${labels.map((v, i) => `<c:pt idx="${i}"><c:v>${escape(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>`;
}
function numbers(values: number[], range: string) {
  return `<c:val><c:numRef><c:f>${range}</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${finite(v)}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val>`;
}
const labelStyle =
  '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="18212F"/></a:solidFill><a:latin typeface="Bahnschrift"/></a:defRPr></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>';
function anchor(id: string, name: string, fromRow: number, toRow: number) {
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>16</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id.endsWith("bar") ? 1001 : 1002}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}
/** Add editable OOXML charts to the exported summary without flattening them to images. */
export async function inventoryCharts(
  blob: Blob,
  rows: Record<string, unknown>[],
): Promise<Blob> {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const top = [...rows]
    .sort((a, b) => finite(b.stock_value) - finite(a.stock_value))
    .slice(0, 5);
  const names = top.map((r) => String(r.name)),
    values = top.map((r) => finite(r.stock_value));
  const states = ["Disponible", "Stock bajo", "Agotado"],
    counts = states.map((s) => rows.filter((r) => r.stock_state === s).length);
  const bar = `<c:chartSpace ${chartNS}><c:lang val="es-PE"/><c:chart>${title("Valor a precio de venta")}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Valor de venta (S/)</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="2855D9"/></a:solidFill></c:spPr>${categories(names, `Resumen!$B$28:$B$${27 + Math.max(top.length, 1)}`)}${numbers(values, `Resumen!$G$28:$G$${27 + Math.max(top.length, 1)}`)}</c:ser><c:gapWidth val="70"/><c:axId val="50101"/><c:axId val="50102"/></c:barChart><c:catAx><c:axId val="50101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/>${labelStyle}<c:crossAx val="50102"/><c:crosses val="autoZero"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="50102"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/>${labelStyle}<c:crossAx val="50101"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart>${labelStyle}</c:chartSpace>`;
  const donut = `<c:chartSpace ${chartNS}><c:chart>${title("Distribución por disponibilidad")}<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Productos</c:v></c:tx>${["16803C", "D97706", "C81025"].map((color, i) => `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`).join("")}${categories(states, "Resumen!$B$14:$B$16")}${numbers(counts, "Resumen!$E$14:$E$16")}</c:ser><c:firstSliceAng val="270"/><c:holeSize val="65"/></c:doughnutChart></c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/>${labelStyle}</c:legend><c:plotVisOnly val="1"/></c:chart>${labelStyle}</c:chartSpace>`;
  zip["xl/charts/acemar-bar.xml"] = strToU8(bar);
  zip["xl/charts/acemar-donut.xml"] = strToU8(donut);
  const relationType =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  const sheetPath = "xl/worksheets/sheet2.xml",
    sheetRelsPath = "xl/worksheets/_rels/sheet2.xml.rels";
  let sheet = strFromU8(zip[sheetPath]);
  let rels = zip[sheetRelsPath]
    ? strFromU8(zip[sheetRelsPath])
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const drawId = sheet.match(/<drawing\b[^>]*r:id="([^"]+)"/)?.[1];
  const target = drawId
    ? Array.from(rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g))
        .find((m) => m[1].includes(`Id="${drawId}"`))?.[1]
        .match(/Target="([^"]+)"/)?.[1]
    : undefined;
  const drawingPath = target
    ? "xl/" + target.replace(/^\.\.\//, "")
    : "xl/drawings/acemar-summary.xml";
  if (!/^xl\/drawings\/[a-zA-Z0-9_-]+\.xml$/.test(drawingPath))
    throw new Error("Dibujo XLSX inesperado");
  const drawingRelsPath =
    drawingPath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
  let drawing = zip[drawingPath]
    ? strFromU8(zip[drawingPath])
    : '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>';
  drawing = drawing.replace(
    "</xdr:wsDr>",
    anchor("rId-acemar-bar", "Valor de venta", 12, 30) +
      anchor("rId-acemar-donut", "Disponibilidad", 32, 44) +
      "</xdr:wsDr>",
  );
  let drawingRels = zip[drawingRelsPath]
    ? strFromU8(zip[drawingRelsPath])
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  drawingRels = drawingRels.replace(
    "</Relationships>",
    `<Relationship Id="rId-acemar-bar" Type="${relationType}chart" Target="../charts/acemar-bar.xml"/><Relationship Id="rId-acemar-donut" Type="${relationType}chart" Target="../charts/acemar-donut.xml"/></Relationships>`,
  );
  if (!drawId) {
    sheet = sheet.replace(
      "</worksheet>",
      '<drawing r:id="rId-acemar-summary"/></worksheet>',
    );
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="rId-acemar-summary" Type="${relationType}drawing" Target="../drawings/acemar-summary.xml"/></Relationships>`,
    );
  }
  zip[sheetPath] = strToU8(sheet);
  zip[sheetRelsPath] = strToU8(rels);
  zip[drawingPath] = strToU8(drawing);
  zip[drawingRelsPath] = strToU8(drawingRels);
  let types = strFromU8(zip["[Content_Types].xml"]);
  for (const path of [
    "xl/charts/acemar-bar.xml",
    "xl/charts/acemar-donut.xml",
    drawingPath,
  ]) {
    if (!types.includes(`PartName="/${path}"`))
      types = types.replace(
        "</Types>",
        `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.${path.includes("/charts/") ? "chart" : "drawing"}+xml"/></Types>`,
      );
  }
  zip["[Content_Types].xml"] = strToU8(types);
  return new Blob([new Uint8Array(zipSync(zip, { level: 6 })).buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
