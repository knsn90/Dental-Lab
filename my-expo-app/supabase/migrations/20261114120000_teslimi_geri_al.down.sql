-- Geri alma: yalnız bu migration'ın eklediği dört fonksiyon kaldırılır (veri değişmez).
drop function if exists public.delivery_undo(uuid, uuid, text);
drop function if exists public.delivery_undo_preview(uuid);
drop function if exists public._delivery_undo_assert(uuid);
drop function if exists public._delivery_undo_check(uuid);
