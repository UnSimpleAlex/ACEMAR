-- One bounded quota row per administrator. No prompts or model answers are stored.
CREATE TABLE public.assistant_usage (
 actor_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 hour_window timestamptz NOT NULL, day_window date NOT NULL,
 hour_count integer NOT NULL CHECK(hour_count BETWEEN 1 AND 20),
 day_count integer NOT NULL CHECK(day_count BETWEEN 1 AND 100)
);
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_usage FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.acemar_assistant_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid; allowed uuid; instant timestamptz:=statement_timestamp(); day date:=(statement_timestamp() AT TIME ZONE 'America/Lima')::date; result jsonb;
BEGIN
 actor:=public.acemar_require(true);
 INSERT INTO public.assistant_usage VALUES(actor,date_trunc('hour',instant),day,1,1)
 ON CONFLICT(actor_id) DO UPDATE SET
 hour_count=CASE WHEN assistant_usage.hour_window=date_trunc('hour',instant) THEN assistant_usage.hour_count+1 ELSE 1 END,
 day_count=CASE WHEN assistant_usage.day_window=day THEN assistant_usage.day_count+1 ELSE 1 END,
 hour_window=date_trunc('hour',instant), day_window=day
 WHERE (assistant_usage.hour_window<>date_trunc('hour',instant) OR assistant_usage.hour_count<20)
 AND (assistant_usage.day_window<>day OR assistant_usage.day_count<100)
 RETURNING actor_id INTO allowed;
 IF allowed IS NULL THEN RAISE EXCEPTION 'Límite de consultas alcanzado' USING ERRCODE='P0001'; END IF;
 result:=jsonb_build_object('date',day,'summary',public.acemar_summary(day,day));
 RETURN result||jsonb_build_object('low_stock_products',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
 SELECT p.code,p.name,p.base_unit,p.minimum,coalesce(sum(l.available),0) stock FROM public.products p LEFT JOIN public.lots l ON l.product_id=p.id AND NOT l.closed
 GROUP BY p.id HAVING coalesce(sum(l.available),0)<=p.minimum ORDER BY coalesce(sum(l.available),0),p.code LIMIT 10)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.acemar_assistant_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acemar_assistant_context() TO authenticated;
