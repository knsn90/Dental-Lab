-- Geri alma: 20261027100000_siparis_gecmisi
-- Üç fonksiyon da bu geçişle doğdu (canlıda öncesi yok — .before.txt); idx_activity_logs_lab'a dokunulmaz.
drop function if exists public.order_history(uuid);
drop function if exists public._order_history_name(uuid, boolean);
drop function if exists public.can_read_work_order(uuid);
drop index if exists public.idx_activity_logs_entity;
