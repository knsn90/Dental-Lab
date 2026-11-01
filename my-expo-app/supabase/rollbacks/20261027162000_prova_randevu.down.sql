-- Geri alma: 20261027162000_prova_randevu (yalnız yeni fonksiyonlar; tablo Task 1'in)
drop function if exists public.order_prova_flags();
drop function if exists public.order_prova_snapshot(uuid);
drop function if exists public.appt_review(uuid, boolean, text);
drop function if exists public.appt_remove(uuid);
drop function if exists public.appt_save(uuid, uuid, text, date, time);
drop function if exists public._appt_label(text, date, time);
drop function if exists public._appt_log(text, uuid, jsonb);
drop function if exists public._order_appt_risk(uuid);
