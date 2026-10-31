CREATE FUNCTION public.acemar_save(p_entity text,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
  INSERT INTO public.suppliers(id,name,document,phone,address) VALUES(eid,trim(p_data->>'name'),coalesce(p_data->>'document',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'address',''))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,phone=excluded.phone,address=excluded.address;
 WHEN 'customers' THEN
  SELECT to_jsonb(c) INTO old_data FROM public.customers c WHERE id=eid FOR UPDATE;
  INSERT INTO public.customers(id,name,document,phone,credit_limit,authorized) VALUES(eid,trim(p_data->>'name'),coalesce(p_data->>'document',''),coalesce(p_data->>'phone',''),(p_data->>'credit_limit')::numeric,coalesce((p_data->>'authorized')::boolean,false))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,phone=excluded.phone,credit_limit=excluded.credit_limit,authorized=excluded.authorized;
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
CREATE FUNCTION public.acemar_allocate(p_sale uuid,p_line uuid,p_product uuid,p_quantity numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE lot public.lots; take_qty numeric; remaining numeric:=p_quantity; BEGIN
 IF remaining<=0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
 FOR lot IN SELECT * FROM public.lots WHERE product_id=p_product AND NOT closed AND available>0 ORDER BY created_at,id FOR UPDATE LOOP
  EXIT WHEN remaining<=0; take_qty:=least(lot.available,remaining);
  UPDATE public.lots SET available=available-take_qty WHERE id=lot.id;
  INSERT INTO public.allocations(line_id,lot_id,quantity,cost) VALUES(p_line,lot.id,take_qty,lot.cost);
  INSERT INTO public.stock_movements(lot_id,sale_id,quantity,reason,actor_id) VALUES(lot.id,p_sale,-take_qty,'Venta',auth.uid());
  remaining:=remaining-take_qty;
 END LOOP;
 IF remaining>0 THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
END $$;
CREATE FUNCTION public.acemar_checkout(p_key uuid,p_items jsonb,p_payment text,p_customer uuid DEFAULT NULL,p_received numeric DEFAULT NULL,p_quotation uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; sid uuid; existing public.sales; item jsonb; u public.units; p public.products; lid uuid; price numeric; qty numeric; subtotal numeric; grand numeric:=0; fingerprint text; c public.customers; BEGIN
 actor:=public.acemar_require();
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR octet_length(p_items::text)>30000 OR p_payment NOT IN ('cash','credit') THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 fingerprint:=md5(jsonb_build_object('items',p_items,'payment',p_payment,'customer',p_customer,'received',p_received,'quotation',p_quotation)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 SELECT * INTO existing FROM public.sales WHERE request_key=p_key;
 IF FOUND THEN
  IF existing.actor_id<>actor OR existing.request_hash<>fingerprint THEN RAISE EXCEPTION 'Solicitud ya utilizada'; END IF;
  RETURN jsonb_build_object('id',existing.id,'number',existing.number,'total',existing.total,'received',existing.received,'payment',existing.payment);
 END IF;
 IF p_customer IS NOT NULL THEN SELECT * INTO c FROM public.customers WHERE id=p_customer FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no autorizado'; END IF; END IF;
 IF p_payment='credit' AND (p_customer IS NULL OR NOT c.authorized) THEN RAISE EXCEPTION 'Cliente no autorizado'; END IF;
 IF p_quotation IS NOT NULL THEN
  PERFORM 1 FROM public.quotations WHERE id=p_quotation AND state='open' AND (actor_id=actor OR public.acemar_role()='admin') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proforma no disponible'; END IF;
 END IF;
 -- Lock products in deterministic order; units and lots are read only after their product lock.
 PERFORM 1 FROM public.products WHERE id IN(SELECT unit.product_id FROM public.units unit JOIN jsonb_array_elements(p_items) it ON unit.id=(it->>'unit_id')::uuid) ORDER BY id FOR UPDATE;
 INSERT INTO public.sales(request_key,request_hash,actor_id,customer_id,quotation_id,payment,received) VALUES(p_key,fingerprint,actor,p_customer,p_quotation,p_payment,p_received) RETURNING id INTO sid;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  qty:=(item->>'quantity')::numeric; IF qty IS NULL OR qty<=0 OR qty>100000000 OR qty<>round(qty,6) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  SELECT * INTO u FROM public.units WHERE id=(item->>'unit_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  SELECT * INTO p FROM public.products WHERE id=u.product_id;
  SELECT max(l.price)*u.factor INTO price FROM public.lots l WHERE l.product_id=p.id AND NOT l.closed AND available>0;
  IF price IS NULL OR price<=0 THEN RAISE EXCEPTION 'Precio no disponible'; END IF;
  subtotal:=round(qty*price,2); grand:=grand+subtotal;
  INSERT INTO public.sale_lines(sale_id,product_id,unit_id,product_name,unit_name,factor,quantity,price,subtotal) VALUES(sid,p.id,u.id,p.name,u.name,u.factor,qty,price,subtotal) RETURNING id INTO lid;
  PERFORM public.acemar_allocate(sid,lid,p.id,round(qty*u.factor,6));
 END LOOP;
 IF grand<=0 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF p_payment='credit' AND public.acemar_balance(p_customer)+grand>c.credit_limit THEN RAISE EXCEPTION 'Crédito insuficiente'; END IF;
 IF p_payment='cash' AND (p_received IS NULL OR p_received<grand OR p_received<>round(p_received,2)) THEN RAISE EXCEPTION 'Importe recibido insuficiente'; END IF;
 UPDATE public.sales SET total=grand WHERE id=sid;
 IF p_quotation IS NOT NULL THEN UPDATE public.quotations SET state='converted' WHERE id=p_quotation; END IF;
 INSERT INTO public.audit(entity,entity_id,action,after_data,actor_id) VALUES('sales',sid,'Confirmar venta',jsonb_build_object('total',grand),actor);
 RETURN jsonb_build_object('id',sid,'number',(SELECT number FROM public.sales WHERE id=sid),'total',grand,'received',p_received,'payment',p_payment);
END $$;
CREATE FUNCTION public.acemar_pay(p_key uuid,p_customer uuid,p_amount numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; existing public.payments; eid uuid; BEGIN
 actor:=public.acemar_require(true); IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 SELECT * INTO existing FROM public.payments WHERE request_key=p_key;
 IF FOUND THEN IF existing.customer_id<>p_customer OR existing.amount<>p_amount OR existing.actor_id<>actor THEN RAISE EXCEPTION 'Solicitud ya utilizada'; END IF;RETURN existing.id; END IF;
 PERFORM 1 FROM public.customers WHERE id=p_customer FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no autorizado'; END IF;
 IF p_amount>public.acemar_balance(p_customer) THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
 INSERT INTO public.payments(customer_id,amount,request_key,actor_id) VALUES(p_customer,p_amount,p_key,actor) RETURNING id INTO eid;
 INSERT INTO public.audit(entity,entity_id,action,after_data,actor_id) VALUES('payments',eid,'Registrar abono',jsonb_build_object('amount',p_amount,'customer_id',p_customer),actor); RETURN eid;
END $$;
CREATE FUNCTION public.acemar_detail(p_entity text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; s public.sales; q public.quotations; BEGIN actor:=public.acemar_require();
 IF p_entity='sales' THEN
  SELECT * INTO s FROM public.sales WHERE id=p_id AND (actor_id=actor OR public.acemar_role()='admin'); IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada'; END IF;
  RETURN jsonb_build_object('sale',to_jsonb(s),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.sale_lines l WHERE sale_id=p_id),'[]'));
 ELSIF p_entity='quotations' THEN
  SELECT * INTO q FROM public.quotations WHERE id=p_id AND(actor_id=actor OR public.acemar_role()='admin'); IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada'; END IF;
  RETURN jsonb_build_object('quotation',to_jsonb(q),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.quotation_lines l WHERE quotation_id=p_id),'[]'));
 ELSIF p_entity='customers' THEN
  PERFORM public.acemar_require(true); RETURN jsonb_build_object('customer',(SELECT to_jsonb(c)||jsonb_build_object('balance',public.acemar_balance(c.id)) FROM public.customers c WHERE c.id=p_id),
  'payments',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT id,amount,created_at FROM public.payments WHERE customer_id=p_id ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'sales',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT id,number,total,state,created_at FROM public.sales WHERE customer_id=p_id ORDER BY created_at DESC LIMIT 50)x),'[]'));
 END IF; RAISE EXCEPTION 'Datos inválidos';
END $$;
CREATE FUNCTION public.acemar_quotation(p_items jsonb,p_name text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; qid uuid; item jsonb; u public.units; pr numeric; BEGIN
 actor:=public.acemar_require(); IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 INSERT INTO public.quotations(customer_name,actor_id) VALUES(left(p_name,160),actor) RETURNING id INTO qid;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO u FROM public.units WHERE id=(item->>'unit_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  SELECT max(price)*u.factor INTO pr FROM public.lots WHERE product_id=u.product_id AND NOT closed AND available>0;IF pr IS NULL THEN RAISE EXCEPTION 'Precio no disponible'; END IF;
  INSERT INTO public.quotation_lines(quotation_id,unit_id,quantity,price,factor,product_name,unit_name) VALUES(qid,u.id,(item->>'quantity')::numeric,pr,u.factor,(SELECT name FROM public.products WHERE id=u.product_id),u.name);
 END LOOP; RETURN qid;
END $$;
CREATE FUNCTION public.acemar_summary(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; BEGIN PERFORM public.acemar_require(true);
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 SELECT jsonb_build_object('sales_total',coalesce(sum(total),0),'sales_count',count(*),'cash_sales',coalesce(sum(total) FILTER(WHERE payment='cash'),0)) INTO result FROM public.sales WHERE state='confirmed' AND created_at >= p_from::timestamp AT TIME ZONE 'America/Lima' AND created_at<(p_to+1)::timestamp AT TIME ZONE 'America/Lima';
 RETURN result||jsonb_build_object('payments_total',(SELECT coalesce(sum(amount),0) FROM public.payments WHERE created_at>=p_from::timestamp AT TIME ZONE 'America/Lima' AND created_at<(p_to+1)::timestamp AT TIME ZONE 'America/Lima'),
 'lots_value',(SELECT coalesce(sum(initial_quantity*cost),0) FROM public.lots WHERE created_at>=p_from::timestamp AT TIME ZONE 'America/Lima' AND created_at<(p_to+1)::timestamp AT TIME ZONE 'America/Lima'),
 'debt_total',(SELECT coalesce(sum(public.acemar_balance(id)),0) FROM public.customers),
 'low_stock',(SELECT count(*) FROM public.products p WHERE coalesce((SELECT sum(available) FROM public.lots WHERE product_id=p.id AND NOT closed),0)<=p.minimum));
END $$;
REVOKE ALL ON FUNCTION public.acemar_save(text,jsonb),public.acemar_allocate(uuid,uuid,uuid,numeric),public.acemar_checkout(uuid,jsonb,text,uuid,numeric,uuid),public.acemar_pay(uuid,uuid,numeric),public.acemar_detail(text,uuid),public.acemar_quotation(jsonb,text),public.acemar_summary(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_save(text,jsonb),public.acemar_checkout(uuid,jsonb,text,uuid,numeric,uuid),public.acemar_pay(uuid,uuid,numeric),public.acemar_detail(text,uuid),public.acemar_quotation(jsonb,text),public.acemar_summary(date,date) TO authenticated;
