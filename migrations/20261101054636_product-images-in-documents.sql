-- Enrich authorized results only; retain historical names, prices and existing access checks.
-- This helper is called only from the already-authorized audit read projection.
CREATE FUNCTION public.acemar_snapshot_images(p_data jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(p_data->'lines')='array' THEN jsonb_set(p_data,'{lines}',coalesce((SELECT jsonb_agg(l.value||coalesce((SELECT jsonb_build_object('image_url',a.url,'image_generated',a.generated) FROM public.units u LEFT JOIN LATERAL(SELECT url,generated FROM public.assets WHERE product_id=u.product_id ORDER BY created_at DESC,id DESC LIMIT 1)a ON true WHERE u.id::text=l.value->>'unit_id'),'{}'::jsonb) ORDER BY l.ordinality) FROM jsonb_array_elements(p_data->'lines') WITH ORDINALITY l(value,ordinality)),'[]'::jsonb)) ELSE p_data END
$$;
REVOKE ALL ON FUNCTION public.acemar_snapshot_images(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.acemar_list(p_entity text,p_page integer DEFAULT 0,p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; offst integer:=greatest(0,least(p_page,10000))*25; actor uuid; BEGIN
 actor:=public.acemar_require(p_entity NOT IN ('sales','quotations'));
 CASE p_entity
 WHEN 'suppliers' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT * FROM public.suppliers WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'lots' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT l.*, (SELECT a.url FROM public.assets a WHERE a.product_id=l.product_id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) image_url, (SELECT a.generated FROM public.assets a WHERE a.product_id=l.product_id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) image_generated,p.name product_name,p.base_unit,s.name supplier_name FROM public.lots l JOIN public.products p ON p.id=l.product_id LEFT JOIN public.suppliers s ON s.id=l.supplier_id WHERE p.name ILIKE '%'||left(p_search,100)||'%' ORDER BY l.created_at DESC,l.id LIMIT 25 OFFSET offst)x;
 WHEN 'customers' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT c.*,public.acemar_balance(c.id) balance FROM public.customers c WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'sales' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT s.*,c.name customer_name FROM public.sales s LEFT JOIN public.customers c ON c.id=s.customer_id WHERE (public.acemar_role()='admin' OR s.actor_id=actor) AND s.number::text ILIKE '%'||left(p_search,40)||'%' ORDER BY s.created_at DESC,s.id LIMIT 25 OFFSET offst)x;
 WHEN 'quotations' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT q.*,coalesce((SELECT sum(round(l.quantity*l.price,2)) FROM public.quotation_lines l WHERE l.quotation_id=q.id),0) total FROM public.quotations q WHERE (public.acemar_role()='admin' OR q.actor_id=actor) AND (q.customer_name ILIKE '%'||left(p_search,100)||'%' OR q.number::text=p_search) ORDER BY created_at DESC,id LIMIT 25 OFFSET offst)x;
 WHEN 'profiles' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT * FROM public.profiles WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'audit' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('before_data',public.acemar_snapshot_images(x.before_data),'after_data',public.acemar_snapshot_images(x.after_data))),'[]') INTO r FROM(SELECT a.*,p.name actor_name FROM public.audit a LEFT JOIN public.profiles p ON p.id=a.actor_id WHERE a.action ILIKE '%'||left(p_search,100)||'%' ORDER BY a.created_at DESC,a.id LIMIT 25 OFFSET offst)x;
 WHEN 'payments' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT a.*,c.name customer_name FROM public.payments a JOIN public.customers c ON c.id=a.customer_id ORDER BY created_at DESC,id LIMIT 25 OFFSET offst)x;
 ELSE RAISE EXCEPTION 'Consulta inválida'; END CASE; RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.acemar_detail(p_entity text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; s public.sales; q public.quotations; BEGIN actor:=public.acemar_require();
 IF p_entity='sales' THEN
  SELECT * INTO s FROM public.sales WHERE id=p_id AND (actor_id=actor OR public.acemar_role()='admin'); IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada'; END IF;
  RETURN jsonb_build_object('sale',to_jsonb(s),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)||coalesce((SELECT jsonb_build_object('product_id',u.product_id,'image_url',a.url,'image_generated',a.generated) FROM public.units u LEFT JOIN LATERAL (SELECT url,generated FROM public.assets WHERE product_id=u.product_id ORDER BY created_at DESC,id DESC LIMIT 1) a ON true WHERE u.id=l.unit_id),'{}'::jsonb) ORDER BY l.id) FROM public.sale_lines l WHERE sale_id=p_id),'[]'));
 ELSIF p_entity='quotations' THEN
  SELECT * INTO q FROM public.quotations WHERE id=p_id AND(actor_id=actor OR public.acemar_role()='admin'); IF NOT FOUND THEN RAISE EXCEPTION 'Operación no autorizada'; END IF;
  RETURN jsonb_build_object('quotation',to_jsonb(q),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)||coalesce((SELECT jsonb_build_object('product_id',u.product_id,'image_url',a.url,'image_generated',a.generated) FROM public.units u LEFT JOIN LATERAL (SELECT url,generated FROM public.assets WHERE product_id=u.product_id ORDER BY created_at DESC,id DESC LIMIT 1) a ON true WHERE u.id=l.unit_id),'{}'::jsonb) ORDER BY l.id) FROM public.quotation_lines l WHERE quotation_id=p_id),'[]'));
 ELSIF p_entity='customers' THEN
  PERFORM public.acemar_require(true); RETURN jsonb_build_object('customer',(SELECT to_jsonb(c)||jsonb_build_object('balance',public.acemar_balance(c.id)) FROM public.customers c WHERE c.id=p_id),
  'payments',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT id,amount,created_at FROM public.payments WHERE customer_id=p_id ORDER BY created_at DESC LIMIT 50)x),'[]'),
  'sales',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT id,number,total,state,created_at FROM public.sales WHERE customer_id=p_id ORDER BY created_at DESC LIMIT 50)x),'[]'));
 END IF; RAISE EXCEPTION 'Datos inválidos';
END $$;
