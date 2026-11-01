-- Geri alma: 20261025140000_global_search — iki fonksiyon da öncesinde yoktu (bkz. .before.txt).
drop function if exists public.global_search(text, text[], uuid, boolean);
drop function if exists public.search_fold(text);
