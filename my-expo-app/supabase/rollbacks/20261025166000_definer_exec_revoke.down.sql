-- Geri alma: 20261025166000 — 2026-10-26 canlı ACL'ler:
-- get_admin_stats {postgres, authenticated, service_role}; diğer ikisi {PUBLIC, postgres, anon, authenticated, service_role}
grant execute on function public.get_admin_stats() to authenticated;
grant execute on function public.alloc_receipt_to_invoices(uuid, uuid, numeric, text, date, text) to public, anon, authenticated;
grant execute on function public._send_payment_reminder_core(uuid, uuid, uuid, text, text, text, text[], uuid) to public, anon, authenticated;
