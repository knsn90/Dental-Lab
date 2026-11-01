-- Geri alma: 20261028152000_nakit_kasa_rpc.sql → canlı ÖNCE hâli (fonksiyonlar yoktu)
drop function if exists public.cash_unposted_summary();
drop function if exists public.cash_count_drawer(uuid, numeric);
drop function if exists public.cash_open_drawer(text, numeric);
