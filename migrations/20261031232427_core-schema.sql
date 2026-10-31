CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 role text NOT NULL CHECK(role IN ('admin','seller')), counter integer NOT NULL DEFAULT 1 CHECK(counter BETWEEN 1 AND 5)
);
CREATE FUNCTION public.acemar_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() $$;
CREATE FUNCTION public.acemar_require(p_admin boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR public.acemar_role() IS NULL OR (p_admin AND public.acemar_role()<>'admin') THEN RAISE EXCEPTION 'Operación no autorizada' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;
CREATE TABLE public.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK(length(code) BETWEEN 1 AND 40),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), base_unit text NOT NULL CHECK(length(base_unit) BETWEEN 1 AND 30),
 minimum numeric(18,6) NOT NULL DEFAULT 0 CHECK(minimum>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 30), factor numeric(18,6) NOT NULL CHECK(factor>0), UNIQUE(product_id,name)
);
CREATE TABLE public.suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 document text NOT NULL DEFAULT '' CHECK(length(document)<=20), phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30), address text NOT NULL DEFAULT '' CHECK(length(address)<=200)
);
CREATE TABLE public.lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id), supplier_id uuid REFERENCES public.suppliers(id),
 initial_quantity numeric(18,6) NOT NULL CHECK(initial_quantity>0), available numeric(18,6) NOT NULL CHECK(available>=0 AND available<=initial_quantity),
 cost numeric(18,6) NOT NULL CHECK(cost>=0), price numeric(18,6) NOT NULL CHECK(price>0), closed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX lots_fifo ON public.lots(product_id,created_at,id) WHERE NOT closed;
CREATE TABLE public.customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), document text NOT NULL DEFAULT '' CHECK(length(document)<=20),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30), credit_limit numeric(18,2) NOT NULL CHECK(credit_limit>=0), authorized boolean NOT NULL DEFAULT false
);
CREATE TABLE public.quotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 customer_name text NOT NULL DEFAULT '' CHECK(length(customer_name)<=160), state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','converted','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.quotation_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quotation_id uuid NOT NULL REFERENCES public.quotations(id), unit_id uuid NOT NULL REFERENCES public.units(id),
 quantity numeric(18,6) NOT NULL CHECK(quantity>0), price numeric(18,6) NOT NULL CHECK(price>0), factor numeric(18,6) NOT NULL CHECK(factor>0), product_name text NOT NULL, unit_name text NOT NULL
);
CREATE INDEX quotation_lines_parent ON public.quotation_lines(quotation_id);
CREATE TABLE public.sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE, request_key uuid NOT NULL UNIQUE,
 request_hash text NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id), customer_id uuid REFERENCES public.customers(id),
 quotation_id uuid UNIQUE REFERENCES public.quotations(id), payment text NOT NULL CHECK(payment IN ('cash','credit')),
 state text NOT NULL DEFAULT 'confirmed' CHECK(state IN ('confirmed','cancelled')), total numeric(18,2) NOT NULL DEFAULT 0 CHECK(total>=0),
 received numeric(18,2), created_at timestamptz NOT NULL DEFAULT now(), CHECK(payment<>'credit' OR customer_id IS NOT NULL)
);
CREATE INDEX sales_date ON public.sales(created_at DESC,id);
CREATE INDEX sales_actor ON public.sales(actor_id);
CREATE INDEX sales_customer ON public.sales(customer_id) WHERE customer_id IS NOT NULL;
CREATE TABLE public.sale_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES public.sales(id), product_id uuid NOT NULL REFERENCES public.products(id), unit_id uuid NOT NULL REFERENCES public.units(id),
 product_name text NOT NULL, unit_name text NOT NULL, factor numeric(18,6) NOT NULL CHECK(factor>0), quantity numeric(18,6) NOT NULL CHECK(quantity>0),
 price numeric(18,6) NOT NULL CHECK(price>0), subtotal numeric(18,2) NOT NULL CHECK(subtotal>=0)
);
CREATE INDEX sale_lines_parent ON public.sale_lines(sale_id);
CREATE TABLE public.allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_id uuid NOT NULL REFERENCES public.sale_lines(id), lot_id uuid NOT NULL REFERENCES public.lots(id),
 quantity numeric(18,6) NOT NULL CHECK(quantity>0), cost numeric(18,6) NOT NULL CHECK(cost>=0)
);
CREATE INDEX allocations_line ON public.allocations(line_id);
CREATE INDEX allocations_lot ON public.allocations(lot_id);
CREATE TABLE public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), amount numeric(18,2) NOT NULL CHECK(amount>0),
 request_key uuid NOT NULL UNIQUE, actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_customer ON public.payments(customer_id);
CREATE TABLE public.stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lot_id uuid NOT NULL REFERENCES public.lots(id), sale_id uuid REFERENCES public.sales(id), quantity numeric(18,6) NOT NULL CHECK(quantity<>0),
 reason text NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_lot ON public.stock_movements(lot_id);
CREATE TABLE public.audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL,
 reason text NOT NULL DEFAULT '', before_data jsonb, after_data jsonb, actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_date ON public.audit(created_at DESC,id);
CREATE TABLE public.cash_counts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL UNIQUE, counted numeric(18,2) NOT NULL CHECK(counted>=0),
 expected numeric(18,2) NOT NULL, note text NOT NULL CHECK(length(note)<=500), actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id), object_key text NOT NULL UNIQUE, url text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/webp','image/png','image/jpeg')), bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 4096), height integer NOT NULL CHECK(height BETWEEN 1 AND 4096), alt text NOT NULL CHECK(length(alt) BETWEEN 1 AND 200),
 generated boolean NOT NULL DEFAULT false, actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_product ON public.assets(product_id);
-- No runtime client can mutate financial, role, or stock tables directly.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','products','units','suppliers','lots','customers','quotations','quotation_lines','sales','sale_lines','allocations','payments','stock_movements','audit','cash_counts','assets'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING(id=(SELECT auth.uid()) OR (SELECT public.acemar_role())='admin');
CREATE FUNCTION public.acemar_balance(p_customer uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce((SELECT sum(total) FROM public.sales WHERE customer_id=p_customer AND payment='credit' AND state='confirmed'),0)-coalesce((SELECT sum(amount) FROM public.payments WHERE customer_id=p_customer),0)
$$;
CREATE FUNCTION public.acemar_catalog(p_search text DEFAULT '',p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 PERFORM public.acemar_require();
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (
 SELECT p.id,p.code,p.name,p.base_unit,p.minimum,
 coalesce((SELECT sum(l.available) FROM public.lots l WHERE l.product_id=p.id AND NOT l.closed),0) stock,
 coalesce((SELECT max(l.price) FROM public.lots l WHERE l.product_id=p.id AND NOT l.closed AND l.available>0),0) price,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'factor',u.factor) ORDER BY u.factor,u.name) FROM public.units u WHERE u.product_id=p.id),'[]') units,
 (SELECT a.url FROM public.assets a WHERE a.product_id=p.id ORDER BY a.created_at DESC LIMIT 1) image_url,
 (SELECT a.generated FROM public.assets a WHERE a.product_id=p.id ORDER BY a.created_at DESC LIMIT 1) image_generated
 FROM public.products p WHERE p.name ILIKE '%'||left(p_search,100)||'%' OR p.code ILIKE '%'||left(p_search,100)||'%'
 ORDER BY p.name,p.id LIMIT 24 OFFSET greatest(0,least(p_page,10000))*24
 ) x; RETURN result;
END $$;
CREATE FUNCTION public.acemar_customers_for_sale(p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; BEGIN PERFORM public.acemar_require();
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM (SELECT id,name,document FROM public.customers WHERE authorized AND name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 30)x; RETURN r; END $$;
-- Explicit allowlist: no user-controlled table names or SQL fragments.
CREATE FUNCTION public.acemar_list(p_entity text,p_page integer DEFAULT 0,p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; offst integer:=greatest(0,least(p_page,10000))*25; actor uuid; BEGIN
 actor:=public.acemar_require(p_entity NOT IN ('sales','quotations'));
 CASE p_entity
 WHEN 'suppliers' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT * FROM public.suppliers WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'lots' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT l.*,p.name product_name,p.base_unit,s.name supplier_name FROM public.lots l JOIN public.products p ON p.id=l.product_id LEFT JOIN public.suppliers s ON s.id=l.supplier_id WHERE p.name ILIKE '%'||left(p_search,100)||'%' ORDER BY l.created_at DESC,l.id LIMIT 25 OFFSET offst)x;
 WHEN 'customers' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT c.*,public.acemar_balance(c.id) balance FROM public.customers c WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'sales' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT s.*,c.name customer_name FROM public.sales s LEFT JOIN public.customers c ON c.id=s.customer_id WHERE (public.acemar_role()='admin' OR s.actor_id=actor) AND s.number::text ILIKE '%'||left(p_search,40)||'%' ORDER BY s.created_at DESC,s.id LIMIT 25 OFFSET offst)x;
 WHEN 'quotations' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT q.*,coalesce((SELECT sum(round(l.quantity*l.price,2)) FROM public.quotation_lines l WHERE l.quotation_id=q.id),0) total FROM public.quotations q WHERE (public.acemar_role()='admin' OR q.actor_id=actor) AND (q.customer_name ILIKE '%'||left(p_search,100)||'%' OR q.number::text=p_search) ORDER BY created_at DESC,id LIMIT 25 OFFSET offst)x;
 WHEN 'profiles' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT * FROM public.profiles WHERE name ILIKE '%'||left(p_search,100)||'%' ORDER BY name,id LIMIT 25 OFFSET offst)x;
 WHEN 'audit' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT a.*,p.name actor_name FROM public.audit a LEFT JOIN public.profiles p ON p.id=a.actor_id WHERE a.action ILIKE '%'||left(p_search,100)||'%' ORDER BY a.created_at DESC,a.id LIMIT 25 OFFSET offst)x;
 WHEN 'payments' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO r FROM(SELECT a.*,c.name customer_name FROM public.payments a JOIN public.customers c ON c.id=a.customer_id ORDER BY created_at DESC,id LIMIT 25 OFFSET offst)x;
 ELSE RAISE EXCEPTION 'Consulta inválida'; END CASE; RETURN r;
END $$;
-- Revoke PUBLIC EXECUTE even for helper functions: grant only the supported surface.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_role(),public.acemar_require(boolean),public.acemar_catalog(text,integer),public.acemar_customers_for_sale(text),public.acemar_list(text,integer,text) TO authenticated;
