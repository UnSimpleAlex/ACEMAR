-- Generated brand assets are imported by the operator before application users exist.
ALTER TABLE public.assets ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY acemar_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket='acemar-public');
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT ON storage.objects TO anon,authenticated;
-- No client upload/delete policy: trusted server/admin upload only.
CREATE FUNCTION public.acemar_attach_asset(p_product uuid,p_key text,p_url text,p_mime text,p_bytes integer,p_width integer,p_height integer,p_alt text,p_generated boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE eid uuid;actor uuid; BEGIN
 actor:=public.acemar_require(true);
 IF p_key NOT LIKE 'products/%' OR p_url NOT LIKE 'https://beft7ipm.us-east.insforge.app/api/storage/buckets/acemar-public/objects/%' THEN RAISE EXCEPTION 'Datos inválidos';END IF;
 INSERT INTO public.assets(product_id,object_key,url,mime,bytes,width,height,alt,generated,actor_id) VALUES(p_product,p_key,p_url,p_mime,p_bytes,p_width,p_height,p_alt,p_generated,actor) RETURNING id INTO eid;
 RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.acemar_attach_asset(uuid,text,text,text,integer,integer,integer,text,boolean) FROM PUBLIC,anon,authenticated;
-- Called by server-only code after validating and uploading the asset.
