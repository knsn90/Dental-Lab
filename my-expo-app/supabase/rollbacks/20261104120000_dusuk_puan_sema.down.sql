-- Geri alma: 20261104120000_dusuk_puan_sema
-- Canlı önceki durum: rollbacks/20261104120000_dusuk_puan_sema.before.txt
-- DİKKAT: review_followups düşerse arama kayıtları ve notları kaybolur.
-- Önce 20261104150000, 20261104140000 ve 20261104130000 geri alınmalı (bağımlılar).

DROP FUNCTION IF EXISTS public._notify_inapp_push(uuid, text, text, text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public._review_low_url(text, uuid);
DROP FUNCTION IF EXISTS public._review_low_scores_text(uuid);
DROP FUNCTION IF EXISTS public._review_low_min(uuid);
DROP TABLE IF EXISTS public.review_followups;
