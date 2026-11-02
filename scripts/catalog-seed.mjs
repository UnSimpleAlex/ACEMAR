const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const prefix =
  "https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/";
function assetURLMatches(url, key) {
  try {
    const parsed = new URL(url);
    const base = new URL(prefix);
    return (
      parsed.origin === base.origin &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      parsed.pathname.startsWith(base.pathname) &&
      decodeURIComponent(parsed.pathname.slice(base.pathname.length)) === key &&
      [...parsed.searchParams].every(
        ([name, value]) => name === "v" && /^[a-f0-9]{32}$/.test(value),
      )
    );
  } catch {
    return false;
  }
}
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";

/** One transaction; reruns never refill consumed stock or change existing prices. */
export function catalogSeedSQL(products, assets, actor) {
  if (!uuid.test(actor) || !products.length || products.length > 100)
    throw Error("Invalid seed inputs");
  const codes = new Set();
  for (const p of products) {
    if (codes.has(p.code) || !/^[A-Z]{3}-\d{3}$/.test(p.code))
      throw Error("Invalid or duplicate code");
    codes.add(p.code);
    for (const field of [
      "product_id",
      "unit_id",
      "lot_id",
      "movement_id",
      "audit_id",
    ])
      if (!uuid.test(p[field])) throw Error("Invalid record ID");
    for (const field of ["price", "stock", "minimum"])
      if (!Number.isFinite(p[field]) || p[field] < 0)
        throw Error("Invalid numeric value");
    if (p.price <= 0 || p.stock <= 0 || !p.name || !p.base_unit)
      throw Error("Invalid product");
    const a = assets.find((a) => a.code === p.code);
    if (
      !a ||
      a.mime !== "image/webp" ||
      !/^products\/evaluation\/v1\/[A-Z]{3}-\d{3}-[a-f0-9]{12}\.webp$/.test(
        a.key,
      ) ||
      !assetURLMatches(a.url, a.key) ||
      a.bytes < 1 ||
      a.bytes > 2097152 ||
      !Number.isInteger(a.bytes) ||
      a.width !== 640 ||
      a.height !== 640 ||
      !/^[a-f0-9]{64}$/.test(a.sha256)
    )
      throw Error("Invalid WebP asset");
  }
  const rows = products.map((p) => ({
    ...p,
    asset: assets.find((a) => a.code === p.code),
  }));
  return `DO $seed$
DECLARE item jsonb; existing uuid; actor uuid := ${literal(actor)}; pid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('acemar:evaluation:v1',0));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(rows))}::jsonb) LOOP
  pid := (item->>'product_id')::uuid;
  SELECT id INTO existing FROM public.products WHERE code=item->>'code';
  IF existing IS NOT NULL AND existing<>pid THEN RAISE EXCEPTION 'Existing product code: %',item->>'code'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=pid) THEN
   INSERT INTO public.products(id,code,name,base_unit,minimum) VALUES(pid,item->>'code',item->>'name',item->>'base_unit',(item->>'minimum')::numeric);
   INSERT INTO public.units(id,product_id,name,factor) VALUES((item->>'unit_id')::uuid,pid,item->>'base_unit',1);
   INSERT INTO public.lots(id,product_id,initial_quantity,available,cost,price,actor_id) VALUES((item->>'lot_id')::uuid,pid,(item->>'stock')::numeric,(item->>'stock')::numeric,round((item->>'price')::numeric*0.70,2),(item->>'price')::numeric,actor);
   INSERT INTO public.stock_movements(id,lot_id,quantity,reason,actor_id) VALUES((item->>'movement_id')::uuid,(item->>'lot_id')::uuid,(item->>'stock')::numeric,'Carga de evaluación desde WPF',actor);
   INSERT INTO public.audit(id,entity,entity_id,action,after_data,actor_id) VALUES((item->>'audit_id')::uuid,'products',pid,'Carga de catálogo de evaluación',item-'asset',actor);
  END IF;
  IF EXISTS(SELECT 1 FROM public.assets WHERE object_key=item->'asset'->>'key' AND product_id IS DISTINCT FROM pid) THEN RAISE EXCEPTION 'Asset already assigned'; END IF;
  INSERT INTO public.assets(product_id,object_key,url,mime,bytes,width,height,alt,generated,actor_id)
  VALUES(pid,item->'asset'->>'key',item->'asset'->>'url','image/webp',(item->'asset'->>'bytes')::integer,640,640,left('Ilustración generada de '||(item->>'name'),200),true,actor)
  ON CONFLICT(object_key) DO NOTHING;
 END LOOP;
END $seed$;`;
}
