ALTER TABLE public.sales ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.acemar_checkout(p_key uuid,p_items jsonb,p_payment text,p_customer uuid DEFAULT NULL,p_received numeric DEFAULT NULL,p_quotation uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; sid uuid; existing public.sales; item jsonb; u public.units; p public.products; lid uuid; price numeric; qty numeric; subtotal numeric; grand numeric:=0; fingerprint text; c public.customers; prices jsonb; BEGIN
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
 SELECT jsonb_object_agg(p.id::text,(SELECT max(l.price) FROM public.lots l WHERE l.product_id=p.id AND NOT l.closed AND l.available>0)) INTO prices FROM public.products p WHERE p.id IN (SELECT un.product_id FROM public.units un JOIN jsonb_array_elements(p_items) it ON un.id=(it->>'unit_id')::uuid);
 INSERT INTO public.sales(request_key,request_hash,actor_id,customer_id,quotation_id,payment,received) VALUES(p_key,fingerprint,actor,p_customer,p_quotation,p_payment,p_received) RETURNING id INTO sid;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  qty:=(item->>'quantity')::numeric; IF qty IS NULL OR qty<=0 OR qty>100000000 OR qty<>round(qty,6) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  SELECT * INTO u FROM public.units WHERE id=(item->>'unit_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  SELECT * INTO p FROM public.products WHERE id=u.product_id;
  price:=(prices->>p.id::text)::numeric*u.factor;
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
CREATE OR REPLACE FUNCTION public.acemar_change_sale(p_id uuid,p_action text,p_reason text,p_quantities jsonb DEFAULT '{}'::jsonb,p_expected numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; s public.sales; before_snapshot jsonb; line public.sale_lines; alloc record; q numeric; grand numeric:=0; old_total numeric; BEGIN
 actor:=public.acemar_require(true); IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF s.state='cancelled' THEN RAISE EXCEPTION 'Venta ya anulada'; END IF;
 IF p_expected IS NULL OR s.revision<>p_expected THEN RAISE EXCEPTION 'Conflicto de versión'; END IF;
 IF p_action NOT IN('correct','cancel') THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF p_action='correct' AND s.created_at<now()-interval '30 days' THEN RAISE EXCEPTION 'Venta no corregible'; END IF;
 IF s.customer_id IS NOT NULL THEN PERFORM 1 FROM public.customers WHERE id=s.customer_id FOR UPDATE; END IF;
 PERFORM 1 FROM public.products WHERE id IN(SELECT product_id FROM public.sale_lines WHERE sale_id=p_id) ORDER BY id FOR UPDATE;
 before_snapshot:=public.acemar_detail('sales',p_id); old_total:=s.total;
 FOR alloc IN SELECT a.*,l.product_id FROM public.allocations a JOIN public.sale_lines l ON l.id=a.line_id WHERE l.sale_id=p_id ORDER BY a.lot_id LOOP
  UPDATE public.lots SET available=available+alloc.quantity WHERE id=alloc.lot_id;
  INSERT INTO public.stock_movements(lot_id,sale_id,quantity,reason,actor_id) VALUES(alloc.lot_id,p_id,alloc.quantity,'Reversión: '||trim(p_reason),actor);
 END LOOP;
 DELETE FROM public.allocations WHERE line_id IN(SELECT id FROM public.sale_lines WHERE sale_id=p_id);
 IF p_action='cancel' THEN UPDATE public.sales SET state='cancelled',revision=revision+1 WHERE id=p_id;
 ELSE
  FOR line IN SELECT * FROM public.sale_lines WHERE sale_id=p_id ORDER BY product_id,id LOOP
   IF NOT p_quantities ? line.id::text THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
   q:=(p_quantities->>line.id::text)::numeric; IF q IS NULL OR q<=0 OR q>100000000 OR q<>round(q,6) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
   UPDATE public.sale_lines SET quantity=q,subtotal=round(q*line.price,2) WHERE id=line.id;
   grand:=grand+round(q*line.price,2);
   PERFORM public.acemar_allocate(p_id,line.id,line.product_id,round(q*line.factor,6));
  END LOOP;
  IF grand<=0 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  UPDATE public.sales SET total=grand,revision=revision+1 WHERE id=p_id;
 END IF;
 IF s.payment='credit' THEN
  IF public.acemar_balance(s.customer_id)<0 THEN RAISE EXCEPTION 'Saldo insuficiente: requiere devolución financiera antes de corregir'; END IF;
  IF public.acemar_balance(s.customer_id)>(SELECT credit_limit FROM public.customers WHERE id=s.customer_id) THEN RAISE EXCEPTION 'Crédito insuficiente'; END IF;
 END IF;
 INSERT INTO public.audit(entity,entity_id,action,reason,before_data,after_data,actor_id) VALUES('sales',p_id,CASE WHEN p_action='cancel' THEN 'Anular venta' ELSE 'Corregir venta' END,trim(p_reason),before_snapshot,public.acemar_detail('sales',p_id),actor);
 RETURN public.acemar_detail('sales',p_id);
END $$;
