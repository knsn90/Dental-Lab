-- Geri alma: 20261104140000_degerlendirme_ekrani_rpc
-- İki RPC canlıda yoktu (before.txt); yalnız düşürülür. review_followups'taki arama kayıtları kalır.
BEGIN;
DROP FUNCTION IF EXISTS public.review_followup_set_call(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_review_dashboard(date, uuid);
COMMIT;
