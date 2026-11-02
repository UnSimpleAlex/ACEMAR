-- Bound lock waits so conflicting operations fail recoverably rather than hang.
ALTER FUNCTION public.acemar_checkout(uuid,jsonb,text,uuid,numeric,uuid) SET lock_timeout = '5s';
ALTER FUNCTION public.acemar_pay(uuid,uuid,numeric) SET lock_timeout = '5s';
ALTER FUNCTION public.acemar_change_sale(uuid,text,text,jsonb,numeric) SET lock_timeout = '5s';
ALTER FUNCTION public.acemar_save(text,jsonb) SET lock_timeout = '5s';
ALTER FUNCTION public.acemar_action(text,uuid,text,text) SET lock_timeout = '5s';
-- Actor references and operational lookups that grow with business activity.
CREATE INDEX audit_actor ON public.audit(actor_id);
CREATE INDEX lots_actor ON public.lots(actor_id);
CREATE INDEX payments_actor ON public.payments(actor_id);
CREATE INDEX stock_movements_actor ON public.stock_movements(actor_id);
CREATE INDEX stock_movements_sale ON public.stock_movements(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX quotations_actor ON public.quotations(actor_id);
CREATE INDEX assets_actor ON public.assets(actor_id) WHERE actor_id IS NOT NULL;
