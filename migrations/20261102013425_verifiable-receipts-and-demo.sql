-- Remove the application AI quota; provider quotas remain external.
CREATE OR REPLACE FUNCTION public.acemar_assistant_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE today date:=(statement_timestamp() AT TIME ZONE 'America/Lima')::date;
BEGIN
 PERFORM public.acemar_require(true);
 RETURN jsonb_build_object('date',today,'summary',public.acemar_summary(today,today),'low_stock_products',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT p.code,p.name,p.base_unit,p.minimum,coalesce(sum(l.available),0) stock FROM public.products p LEFT JOIN public.lots l ON l.product_id=p.id AND NOT l.closed GROUP BY p.id HAVING coalesce(sum(l.available),0)<=p.minimum ORDER BY coalesce(sum(l.available),0),p.code LIMIT 10)x),'[]'::jsonb));
END $$;
ALTER TABLE public.customers ADD COLUMN email text NOT NULL DEFAULT '' CHECK(email='' OR (length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
ALTER TABLE public.suppliers ADD COLUMN email text NOT NULL DEFAULT '' CHECK(email='' OR (length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
CREATE FUNCTION public.acemar_delete_quotation(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; old_data jsonb; q public.quotations;
BEGIN
 actor:=public.acemar_require();SELECT * INTO q FROM public.quotations WHERE id=p_id AND(actor_id=actor OR public.acemar_role()='admin') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada'; END IF;
 IF q.state='converted' OR EXISTS(SELECT 1 FROM public.sales WHERE quotation_id=p_id) THEN RAISE EXCEPTION 'Proforma vinculada a venta: no se puede eliminar'; END IF;
 old_data:=public.acemar_detail('quotations',p_id);DELETE FROM public.quotation_lines WHERE quotation_id=p_id;DELETE FROM public.quotations WHERE id=p_id;
 INSERT INTO public.audit(entity,entity_id,action,before_data,actor_id) VALUES('quotations',p_id,'Eliminar proforma',old_data,actor);
END $$;
REVOKE ALL ON FUNCTION public.acemar_delete_quotation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_delete_quotation(uuid) TO authenticated;
CREATE TABLE public.sale_receipts(
 code text PRIMARY KEY CHECK(code ~ '^[a-f0-9]{64}$'), sale_id uuid NOT NULL REFERENCES public.sales(id), revision integer NOT NULL,
 snapshot jsonb NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(), pdf_key text, pdf_sha text CHECK(pdf_sha ~ '^[a-f0-9]{64}$'), content_sha text CHECK(content_sha ~ '^[a-f0-9]{64}$'), signature text CHECK(signature ~ '^[a-f0-9]{64}$'), UNIQUE(sale_id,revision)
);
CREATE TABLE public.receipt_deliveries(
 id uuid PRIMARY KEY, code text NOT NULL REFERENCES public.sale_receipts(code), actor_id uuid NOT NULL REFERENCES public.profiles(id), recipient text NOT NULL CHECK(length(recipient)<=254),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sent','unknown')), created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX receipt_deliveries_actor_date ON public.receipt_deliveries(actor_id,created_at);
ALTER TABLE public.sale_receipts ENABLE ROW LEVEL SECURITY;ALTER TABLE public.receipt_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_receipts,public.receipt_deliveries FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.acemar_receipt_prepare(p_sale uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; s public.sales; snap jsonb; r public.sale_receipts;
BEGIN
 actor:=public.acemar_require();SELECT * INTO s FROM public.sales WHERE id=p_sale AND(actor_id=actor OR public.acemar_role()='admin') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada';END IF;
 snap:=public.acemar_detail('sales',p_sale)||jsonb_build_object('customer_name',(SELECT name FROM public.customers WHERE id=s.customer_id));
 INSERT INTO public.sale_receipts(code,sale_id,revision,snapshot) VALUES(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),s.id,s.revision,snap) ON CONFLICT(sale_id,revision) DO NOTHING;
 SELECT * INTO r FROM public.sale_receipts WHERE sale_id=s.id AND revision=s.revision;
 RETURN to_jsonb(r)||jsonb_build_object('canonical',r.snapshot::text,'actor',actor);
END $$;
CREATE FUNCTION public.acemar_receipt_finalize(p_code text,p_actor uuid,p_key text,p_pdf_sha text,p_content_sha text,p_signature text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.sale_receipts;s public.sales;
BEGIN
 SELECT * INTO r FROM public.sale_receipts WHERE code=p_code FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Documento no disponible';END IF;
 SELECT * INTO s FROM public.sales WHERE id=r.sale_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND(role='admin' OR id=s.actor_id)) OR r.revision<>s.revision THEN RAISE EXCEPTION 'Documento reemplazado';END IF;
 IF p_key IS NULL OR p_pdf_sha IS NULL OR p_content_sha IS NULL OR p_signature IS NULL OR p_key NOT LIKE 'receipts/'||p_code||'/%' OR p_pdf_sha !~ '^[a-f0-9]{64}$' OR p_content_sha !~ '^[a-f0-9]{64}$' OR p_signature !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Datos inválidos';END IF;
 IF r.pdf_key IS NULL THEN UPDATE public.sale_receipts SET pdf_key=p_key,pdf_sha=p_pdf_sha,content_sha=p_content_sha,signature=p_signature WHERE code=p_code RETURNING * INTO r;END IF;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.acemar_receipt_lookup(p_code text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('code',r.code,'number',s.number,'revision',r.revision,'issued_at',r.issued_at,'issued_total',r.snapshot->'sale'->'total','current_total',s.total,'status',CASE WHEN s.state='cancelled' THEN 'cancelled' WHEN s.revision<>r.revision THEN 'replaced' ELSE 'valid' END,'pdf_sha',r.pdf_sha,'content_sha',r.content_sha,'signature',r.signature) FROM public.sale_receipts r JOIN public.sales s ON s.id=r.sale_id WHERE r.code=p_code AND r.pdf_sha IS NOT NULL
$$;
CREATE FUNCTION public.acemar_receipt_delivery_begin(p_code text,p_actor uuid,p_recipient text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.receipt_deliveries;s public.sales;r public.sale_receipts;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt-email:'||p_actor,0));
 SELECT * INTO r FROM public.sale_receipts WHERE code=p_code;SELECT * INTO s FROM public.sales WHERE id=r.sale_id;
 IF NOT FOUND OR r.pdf_sha IS NULL OR r.revision<>s.revision OR s.state='cancelled' OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND(role='admin' OR id=s.actor_id)) THEN RAISE EXCEPTION 'Operación no autorizada';END IF;
 SELECT * INTO d FROM public.receipt_deliveries WHERE id=p_id;
 IF FOUND THEN IF d.code<>p_code OR d.actor_id<>p_actor OR d.recipient<>p_recipient THEN RAISE EXCEPTION 'Solicitud ya utilizada';END IF;RETURN to_jsonb(d)||'{"claimed":false}'::jsonb;END IF;
 IF EXISTS(SELECT 1 FROM public.receipt_deliveries WHERE code=p_code AND recipient=p_recipient AND created_at>now()-interval '5 minutes') THEN RAISE EXCEPTION 'Envío reciente: revisa el estado antes de reenviar';END IF;
 IF (SELECT count(*) FROM public.receipt_deliveries WHERE actor_id=p_actor AND created_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'Límite de correos alcanzado';END IF;
 INSERT INTO public.receipt_deliveries(id,code,actor_id,recipient) VALUES(p_id,p_code,p_actor,p_recipient) RETURNING * INTO d;
 RETURN to_jsonb(d)||'{"claimed":true}'::jsonb;
END $$;
CREATE FUNCTION public.acemar_receipt_delivery_finish(p_id uuid,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF p_status NOT IN('sent','unknown') THEN RAISE EXCEPTION 'Datos inválidos';END IF;UPDATE public.receipt_deliveries SET status=p_status,sent_at=CASE WHEN p_status='sent' THEN now() ELSE NULL END WHERE id=p_id AND status='pending';END $$;
REVOKE ALL ON FUNCTION public.acemar_receipt_prepare(uuid),public.acemar_receipt_finalize(text,uuid,text,text,text,text),public.acemar_receipt_lookup(text),public.acemar_receipt_delivery_begin(text,uuid,text,uuid),public.acemar_receipt_delivery_finish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_receipt_prepare(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.acemar_save(p_entity text,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; eid uuid; old_data jsonb; pid uuid; u jsonb; q numeric; BEGIN
 actor:=public.acemar_require(true); IF octet_length(p_data::text)>20000 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 eid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 CASE p_entity
 WHEN 'products' THEN
  SELECT to_jsonb(p) INTO old_data FROM public.products p WHERE id=eid FOR UPDATE;
  INSERT INTO public.products(id,code,name,base_unit,minimum) VALUES(eid,trim(p_data->>'code'),trim(p_data->>'name'),trim(p_data->>'base_unit'),(p_data->>'minimum')::numeric)
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,minimum=excluded.minimum;
  IF old_data IS NULL THEN
   INSERT INTO public.units(product_id,name,factor) VALUES(eid,trim(p_data->>'base_unit'),1);
  END IF;
 WHEN 'units' THEN
  pid:=(p_data->>'product_id')::uuid; PERFORM 1 FROM public.products WHERE id=pid FOR UPDATE;
  INSERT INTO public.units(id,product_id,name,factor) VALUES(eid,pid,trim(p_data->>'name'),(p_data->>'factor')::numeric)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,factor=excluded.factor WHERE public.units.product_id=excluded.product_id;
 WHEN 'suppliers' THEN
  SELECT to_jsonb(s) INTO old_data FROM public.suppliers s WHERE id=eid;
  INSERT INTO public.suppliers(id,name,document,phone,address,email) VALUES(eid,trim(p_data->>'name'),coalesce(p_data->>'document',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'address',''),lower(trim(coalesce(p_data->>'email',''))))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,phone=excluded.phone,address=excluded.address,email=excluded.email;
 WHEN 'customers' THEN
  SELECT to_jsonb(c) INTO old_data FROM public.customers c WHERE id=eid FOR UPDATE;
  INSERT INTO public.customers(id,name,document,phone,credit_limit,authorized,email) VALUES(eid,trim(p_data->>'name'),coalesce(p_data->>'document',''),coalesce(p_data->>'phone',''),(p_data->>'credit_limit')::numeric,coalesce((p_data->>'authorized')::boolean,false),lower(trim(coalesce(p_data->>'email',''))))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,phone=excluded.phone,credit_limit=excluded.credit_limit,authorized=excluded.authorized,email=excluded.email;
 WHEN 'lots' THEN
  IF p_data ? 'id' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  pid:=(p_data->>'product_id')::uuid; PERFORM 1 FROM public.products WHERE id=pid FOR UPDATE;
  q:=(p_data->>'quantity')::numeric;
  INSERT INTO public.lots(id,product_id,supplier_id,initial_quantity,available,cost,price,actor_id) VALUES(eid,pid,nullif(p_data->>'supplier_id','')::uuid,q,q,(p_data->>'cost')::numeric,(p_data->>'price')::numeric,actor);
  INSERT INTO public.stock_movements(lot_id,quantity,reason,actor_id) VALUES(eid,q,'Entrada de lote',actor);
 WHEN 'profiles' THEN
  -- Profiles attach ONLY to existing identities; creating arbitrary auth identities is not exposed.
  eid:=(p_data->>'user_id')::uuid;
  INSERT INTO public.profiles(id,name,role,counter) VALUES(eid,trim(p_data->>'name'),'seller',(p_data->>'counter')::integer)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,counter=excluded.counter;
 ELSE RAISE EXCEPTION 'Datos inválidos'; END CASE;
 INSERT INTO public.audit(entity,entity_id,action,before_data,after_data,actor_id) VALUES(p_entity,eid,'Guardar '||p_entity,old_data,p_data-'password',actor);
 RETURN eid;
END $$;

CREATE TABLE public.demo_seed_state(key text PRIMARY KEY,data jsonb NOT NULL);
ALTER TABLE public.demo_seed_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_seed_state FROM PUBLIC,anon,authenticated;
