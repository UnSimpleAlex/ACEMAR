const lit = (value) => "'" + String(value).replaceAll("'", "''") + "'";
/** Idempotent demo expansion. All transactions use the real business commands. */
export function demoSeedSQL(products, assets, actor) {
  if (
    !/^[a-f0-9-]{36}$/.test(actor) ||
    products.length !== 16 ||
    assets.length !== 16
  )
    throw Error("Invalid demo inputs");
  const rows = products.map((p) => ({
    ...p,
    asset: assets.find((a) => a.code === p.code),
  }));
  if (
    rows.some(
      (p) =>
        !p.asset ||
        !/^products\/demo\/v1\/[A-Z]{3}-\d{3}-[a-f0-9]{12}\.webp$/.test(
          p.asset.key,
        ),
    )
  )
    throw Error("Invalid asset");
  return `DO $demo$
 DECLARE actor uuid:=${lit(actor)}; item jsonb; pid uuid; uid uuid; supplier uuid; demo_suppliers uuid[]:='{}'; demo_customers uuid[]:='{}'; demo_units uuid[]:='{}'; q uuid; sale jsonb; i integer:=0; demo_day date:=(now() AT TIME ZONE 'America/Lima')::date;
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('acemar:demo:v1',0));
 IF EXISTS(SELECT 1 FROM public.demo_seed_state WHERE key='demo-v1') THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='admin') THEN RAISE EXCEPTION 'Administrator required';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 FOR i IN 1..4 LOOP
  supplier:=public.acemar_save('suppliers',jsonb_build_object('name',(ARRAY['Distribuidora Andina DEMO','Suministros El Constructor DEMO','Eléctricos del Norte DEMO','Herramientas Horizonte DEMO'])[i],'document','DEMO-P00'||i,'phone','DEMO 000-00'||i,'address','Avenida de Ejemplo '||(100+i)||', Ciudad DEMO','email','proveedor'||i||'@example.invalid'));
  demo_suppliers:=array_append(demo_suppliers,supplier);
  demo_customers:=array_append(demo_customers,public.acemar_save('customers',jsonb_build_object('name',(ARRAY['Constructora Los Olivos DEMO','Taller La Unión DEMO','Obras Rivera DEMO','Cliente Mostrador DEMO'])[i],'document','DEMO-C00'||i,'phone','DEMO 000-10'||i,'email','cliente'||i||'@example.invalid','credit_limit',CASE WHEN i<4 THEN 3000 ELSE 0 END,'authorized',i<4)));
 END LOOP;
 i:=0;
 FOR item IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(rows))}::jsonb) LOOP
  i:=i+1; pid:=(item->>'product_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.products WHERE code=item->>'code') THEN RAISE EXCEPTION 'Demo code already exists';END IF;
  PERFORM public.acemar_save('products',jsonb_build_object('id',pid,'code',item->>'code','name',item->>'name','base_unit',item->>'base_unit','minimum',(item->>'minimum')::numeric));
  SELECT id INTO uid FROM public.units WHERE product_id=pid AND factor=1;demo_units:=array_append(demo_units,uid);
  PERFORM public.acemar_save('lots',jsonb_build_object('product_id',pid,'supplier_id',demo_suppliers[1+(i-1)%4],'quantity',(item->>'stock')::numeric,'cost',round((item->>'price')::numeric*0.7,2),'price',(item->>'price')::numeric));
  INSERT INTO public.assets(product_id,object_key,url,mime,bytes,width,height,alt,generated,actor_id) VALUES(pid,item->'asset'->>'key',item->'asset'->>'url','image/webp',(item->'asset'->>'bytes')::integer,640,640,'Ilustración de demostración: '||(item->>'name'),true,actor);
 END LOOP;
 -- Alternative presentations, open/cancelled/converted quotations, cash and credit sales.
 PERFORM public.acemar_save('units',jsonb_build_object('product_id',(SELECT product_id FROM public.units WHERE id=demo_units[14]),'name','Paquete de 10 cajas','factor',10));
 FOR i IN 1..3 LOOP
  q:=public.acemar_quotation(jsonb_build_array(jsonb_build_object('unit_id',demo_units[i+6],'quantity',2),jsonb_build_object('unit_id',demo_units[i+10],'quantity',1)),'Proyecto de demostración '||i);
  IF i=2 THEN PERFORM public.acemar_action('quotations',q,'cancel','Cancelación de ejemplo DEMO'); END IF;
  IF i=3 THEN sale:=public.acemar_checkout(gen_random_uuid(),jsonb_build_array(jsonb_build_object('unit_id',demo_units[i+6],'quantity',2),jsonb_build_object('unit_id',demo_units[i+10],'quantity',1)),'cash',demo_customers[4],1000,q);END IF;
 END LOOP;
 FOR i IN 1..3 LOOP
  sale:=public.acemar_checkout(gen_random_uuid(),jsonb_build_array(jsonb_build_object('unit_id',demo_units[i],'quantity',2),jsonb_build_object('unit_id',demo_units[i+4],'quantity',1)),'cash',demo_customers[4],1000,NULL);
 END LOOP;
 FOR i IN 1..2 LOOP
  sale:=public.acemar_checkout(gen_random_uuid(),jsonb_build_array(jsonb_build_object('unit_id',demo_units[i+11],'quantity',2)),'credit',demo_customers[i],NULL,NULL);
  PERFORM public.acemar_pay(gen_random_uuid(),demo_customers[i],20);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.cash_counts WHERE day=demo_day-1) THEN
  -- A historical demonstration count avoids overwriting the operator's current close.
  PERFORM public.acemar_count(demo_day-1,0,'Arqueo de demostración DEMO; sin movimientos en esta fecha');
 END IF;
 INSERT INTO public.demo_seed_state(key,data) VALUES('demo-v1',jsonb_build_object('products',16,'suppliers',demo_suppliers,'customers',demo_customers,'seeded_at',now()));
 END $demo$;`;
}
