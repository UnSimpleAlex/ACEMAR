REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['products','units','suppliers','lots','customers','quotations','quotation_lines','sales','sale_lines','allocations','payments','stock_movements','audit','cash_counts','assets'] LOOP
  EXECUTE format('CREATE POLICY rpc_only ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false)',t);
 END LOOP;
END $$;
CREATE INDEX sale_lines_unit ON public.sale_lines(unit_id);
CREATE INDEX sale_lines_product ON public.sale_lines(product_id);
CREATE INDEX quotation_lines_unit ON public.quotation_lines(unit_id);
CREATE INDEX lots_supplier ON public.lots(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX cash_counts_actor ON public.cash_counts(actor_id);
