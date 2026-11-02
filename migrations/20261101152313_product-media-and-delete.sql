-- Uploads remain server-only; authenticated users cannot write to Storage directly.
CREATE TABLE public.product_media_usage(actor_id uuid PRIMARY KEY REFERENCES public.profiles(id),day date NOT NULL,requests integer NOT NULL CHECK(requests BETWEEN 1 AND 50));
ALTER TABLE public.product_media_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_media_usage FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.acemar_media_target(p_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; label text; allowed uuid; today date:=(statement_timestamp() AT TIME ZONE 'America/Lima')::date;
BEGIN
 actor:=public.acemar_require(true);
 SELECT name INTO label FROM public.products WHERE id=p_id; IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
 INSERT INTO public.product_media_usage VALUES(actor,today,1) ON CONFLICT(actor_id) DO UPDATE SET day=today,requests=CASE WHEN product_media_usage.day=today THEN product_media_usage.requests+1 ELSE 1 END WHERE product_media_usage.day<>today OR product_media_usage.requests<50 RETURNING actor_id INTO allowed;
 IF allowed IS NULL THEN RAISE EXCEPTION 'Límite de imágenes alcanzado' USING ERRCODE='P0001'; END IF;
 RETURN label;
END $$;
CREATE FUNCTION public.acemar_commit_product_image(p_product uuid,p_key text,p_url text,p_bytes integer,p_width integer,p_height integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; eid uuid; label text;
BEGIN
 actor:=public.acemar_require(true);
 SELECT name INTO label FROM public.products WHERE id=p_product FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
 IF p_key IS NULL OR p_key !~ ('^products/uploads/'||p_product::text||'/[a-f0-9-]{36}\.webp$') OR p_bytes NOT BETWEEN 1 AND 1048576 OR p_width NOT BETWEEN 1 AND 1024 OR p_height NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF p_url IS NULL OR split_part(p_url,'?',1) NOT IN ('https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/'||p_key,'https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/'||replace(p_key,'/','%2F')) OR (position('?' in p_url)>0 AND substring(p_url from position('?' in p_url)+1) !~ '^v=[a-f0-9]{32}$') THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket='acemar-public' AND key=p_key) THEN RAISE EXCEPTION 'Imagen no disponible'; END IF;
 INSERT INTO public.assets(product_id,object_key,url,mime,bytes,width,height,alt,generated,actor_id)
 VALUES(p_product,p_key,p_url,'image/webp',p_bytes,p_width,p_height,label,false,actor) RETURNING id INTO eid;
 INSERT INTO public.audit(entity,entity_id,action,after_data,actor_id) VALUES('products',p_product,'Cambiar imagen',jsonb_build_object('asset_id',eid),actor);
 RETURN eid;
END $$;
CREATE FUNCTION public.acemar_delete_product(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; old_data jsonb;
BEGIN
 actor:=public.acemar_require(true);
 SELECT to_jsonb(p) INTO old_data FROM public.products p WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
 IF EXISTS(SELECT 1 FROM public.lots WHERE product_id=p_id) OR EXISTS(SELECT 1 FROM public.stock_movements m JOIN public.lots l ON l.id=m.lot_id WHERE l.product_id=p_id) OR EXISTS(SELECT 1 FROM public.sale_lines l JOIN public.units u ON u.id=l.unit_id WHERE u.product_id=p_id) OR EXISTS(SELECT 1 FROM public.quotation_lines l JOIN public.units u ON u.id=l.unit_id WHERE u.product_id=p_id) THEN RAISE EXCEPTION 'Producto con historial: no se puede eliminar'; END IF;
 DELETE FROM public.assets WHERE product_id=p_id;
 DELETE FROM public.units WHERE product_id=p_id;
 DELETE FROM public.products WHERE id=p_id;
 INSERT INTO public.audit(entity,entity_id,action,before_data,actor_id) VALUES('products',p_id,'Eliminar producto',old_data,actor);
END $$;
REVOKE ALL ON FUNCTION public.acemar_media_target(uuid),public.acemar_commit_product_image(uuid,text,text,integer,integer,integer),public.acemar_delete_product(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_media_target(uuid),public.acemar_commit_product_image(uuid,text,text,integer,integer,integer),public.acemar_delete_product(uuid) TO authenticated;
-- The product's base presentation always remains factor 1; historical factors stay independent.
CREATE FUNCTION public.acemar_guard_base_unit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF OLD.name=(SELECT base_unit FROM public.products WHERE id=OLD.product_id) AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.factor<>1 OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN RAISE EXCEPTION 'Unidad base no modificable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.acemar_guard_base_unit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER acemar_base_unit_guard BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.acemar_guard_base_unit();
