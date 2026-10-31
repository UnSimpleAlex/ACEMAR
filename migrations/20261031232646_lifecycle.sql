CREATE FUNCTION public.acemar_change_sale(p_id uuid,p_action text,p_reason text,p_quantities jsonb DEFAULT '{}'::jsonb,p_expected numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; s public.sales; before_snapshot jsonb; line public.sale_lines; alloc record; q numeric; grand numeric:=0; old_total numeric; BEGIN
 actor:=public.acemar_require(true); IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF s.state='cancelled' THEN RAISE EXCEPTION 'Venta ya anulada'; END IF;
 IF p_expected IS NULL OR s.total<>p_expected THEN RAISE EXCEPTION 'Conflicto de versión'; END IF;
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
 IF p_action='cancel' THEN UPDATE public.sales SET state='cancelled' WHERE id=p_id;
 ELSE
  FOR line IN SELECT * FROM public.sale_lines WHERE sale_id=p_id ORDER BY product_id,id LOOP
   IF NOT p_quantities ? line.id::text THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
   q:=(p_quantities->>line.id::text)::numeric; IF q IS NULL OR q<=0 OR q>100000000 OR q<>round(q,6) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
   UPDATE public.sale_lines SET quantity=q,subtotal=round(q*line.price,2) WHERE id=line.id;
   grand:=grand+round(q*line.price,2);
   PERFORM public.acemar_allocate(p_id,line.id,line.product_id,round(q*line.factor,6));
  END LOOP;
  IF grand<=0 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  UPDATE public.sales SET total=grand WHERE id=p_id;
 END IF;
 IF s.payment='credit' THEN
  IF public.acemar_balance(s.customer_id)<0 THEN RAISE EXCEPTION 'Saldo insuficiente: requiere devolución financiera antes de corregir'; END IF;
  IF public.acemar_balance(s.customer_id)>(SELECT credit_limit FROM public.customers WHERE id=s.customer_id) THEN RAISE EXCEPTION 'Crédito insuficiente'; END IF;
 END IF;
 INSERT INTO public.audit(entity,entity_id,action,reason,before_data,after_data,actor_id) VALUES('sales',p_id,CASE WHEN p_action='cancel' THEN 'Anular venta' ELSE 'Corregir venta' END,trim(p_reason),before_snapshot,public.acemar_detail('sales',p_id),actor);
 RETURN public.acemar_detail('sales',p_id);
END $$;
CREATE FUNCTION public.acemar_action(p_entity text,p_id uuid,p_action text,p_reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; pid uuid; BEGIN
 actor:=public.acemar_require(p_entity<>'quotations');
 IF p_entity='lots' AND p_action='close' THEN
  SELECT product_id INTO pid FROM public.lots WHERE id=p_id; PERFORM 1 FROM public.products WHERE id=pid FOR UPDATE;
  PERFORM 1 FROM public.lots WHERE id=p_id AND available=0 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Lote con existencias'; END IF;
  UPDATE public.lots SET closed=true WHERE id=p_id;
 ELSIF p_entity='quotations' AND p_action='cancel' THEN
  UPDATE public.quotations SET state='cancelled' WHERE id=p_id AND state='open' AND (actor_id=actor OR public.acemar_role()='admin'); IF NOT FOUND THEN RAISE EXCEPTION 'Proforma no disponible'; END IF;
 ELSIF p_entity='suppliers' AND p_action='delete' THEN DELETE FROM public.suppliers WHERE id=p_id;
 ELSIF p_entity='customers' AND p_action='delete' THEN
  PERFORM 1 FROM public.customers WHERE id=p_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.sales WHERE customer_id=p_id) OR EXISTS(SELECT 1 FROM public.payments WHERE customer_id=p_id) THEN RAISE EXCEPTION 'Datos inválidos: cliente con historial'; END IF;
  DELETE FROM public.customers WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Datos inválidos'; END IF;
 INSERT INTO public.audit(entity,entity_id,action,reason,actor_id) VALUES(p_entity,p_id,p_action,left(p_reason,500),actor);
END $$;
CREATE FUNCTION public.acemar_count(p_day date,p_counted numeric,p_note text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; summary jsonb; eid uuid; BEGIN
 actor:=public.acemar_require(true); IF p_day>current_date OR p_counted IS NULL OR p_counted<0 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 summary:=public.acemar_summary(p_day,p_day);
 INSERT INTO public.cash_counts(day,counted,expected,note,actor_id) VALUES(p_day,p_counted,(summary->>'cash_sales')::numeric+(summary->>'payments_total')::numeric,left(p_note,500),actor) RETURNING id INTO eid;
 INSERT INTO public.audit(entity,entity_id,action,after_data,actor_id) VALUES('cash_counts',eid,'Registrar arqueo',jsonb_build_object('day',p_day,'counted',p_counted,'summary',summary),actor); RETURN eid;
END $$;
CREATE FUNCTION public.acemar_counts(p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.acemar_require(true); RETURN (SELECT to_jsonb(c) FROM public.cash_counts c WHERE day=p_day); END $$;
REVOKE ALL ON FUNCTION public.acemar_change_sale(uuid,text,text,jsonb,numeric),public.acemar_action(text,uuid,text,text),public.acemar_count(date,numeric,text),public.acemar_counts(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_change_sale(uuid,text,text,jsonb,numeric),public.acemar_action(text,uuid,text,text),public.acemar_count(date,numeric,text),public.acemar_counts(date) TO authenticated;
