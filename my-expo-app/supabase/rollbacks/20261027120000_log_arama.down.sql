-- Geri alma: 20261027120000_log_arama — iki fonksiyon da bu geçişle doğdu (canlıda öncesi yok).
drop function if exists public.activity_log_search(timestamptz, timestamptz, uuid, text, text, timestamptz, int, uuid, text, text);
drop function if exists public.activity_log_actors();
