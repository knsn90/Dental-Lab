-- 20260912160000_stage_leftover_watch.sql
--
-- YARIM KALAN AŞAMA BİLDİRİMİ (admin/müdür, günlük)
--
-- Sorun: bazı işlerde doğrudan teslime geçiliyor (yanlış sipariş türü, kestirme
-- teslim vb.) ve aşamalar AÇIK kalıyor. "aktif" kalan aşamada süre işlemeye
-- devam ediyor → teknisyen performansı ve süre raporları bozuluyor.
-- Ölçüm (2026-09-12): 1 sipariş, 7 açık aşama, 1'i süre işletiyor.
--
-- Karar (kullanıcı): otomatik kapatma YOK — yalnız BİLDİRİM. Kapatma kararını
-- admin verir, çünkü bazı durumlarda aşama bilinçli açık bırakılmış olabilir.
--
-- Kanal: yalnız uygulama içi (_notify_inapp), kategori 'order_watch'
-- (zaten admin/müdür kapsamlı günlük takip kategorisi — yeni kategori açmıyoruz,
-- tercih ekranında kullanıcı kapatabiliyor). Mail/WhatsApp yok.

CREATE OR REPLACE FUNCTION public.fn_daily_stage_leftovers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab   record;
  v_rec   record;
  v_sent  integer := 0;
  v_title text;
  v_body  text;
BEGIN
  FOR v_lab IN
    SELECT wo.lab_id,
           count(DISTINCT wo.id)                                       AS order_ct,
           count(*)                                                     AS stage_ct,
           count(*) FILTER (WHERE s.status = 'aktif')                   AS running_ct,
           min(wo.order_number)                                         AS sample_no
      FROM public.work_orders wo
      JOIN public.order_stages s ON s.work_order_id = wo.id
     WHERE wo.lab_id IS NOT NULL
       AND wo.status IN ('teslim_edildi', 'iptal')
       AND s.status IN ('bekliyor','aktif','durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     GROUP BY wo.lab_id
  LOOP
    v_title := 'Yarım kalan aşama: ' || v_lab.order_ct || ' sipariş';
    v_body  := 'Kapanmış siparişlerde ' || v_lab.stage_ct || ' aşama açık kaldı'
            || CASE WHEN v_lab.running_ct > 0
                    THEN ' · ' || v_lab.running_ct || ' tanesinde süre işliyor' ELSE '' END
            || CASE WHEN v_lab.sample_no IS NOT NULL THEN ' · örn. #' || v_lab.sample_no ELSE '' END;

    FOR v_rec IN
      SELECT pr.id FROM public.profiles pr
       WHERE pr.lab_id = v_lab.lab_id
         AND COALESCE(pr.is_active, true)
         AND (pr.user_type = 'admin' OR (pr.user_type = 'lab' AND pr.role = 'manager'))
    LOOP
      PERFORM public._notify_inapp(
        v_rec.id, 'order_watch', v_title, v_body,
        'work_order', NULL, '/orders',
        jsonb_build_object('kind', 'stage_leftover',
                           'orders', v_lab.order_ct,
                           'stages', v_lab.stage_ct,
                           'running', v_lab.running_ct));
      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END; $$;

COMMENT ON FUNCTION public.fn_daily_stage_leftovers IS
  'Teslim/iptal edilmiş siparişlerde açık kalan aşamaları admin+müdüre uygulama içi bildirir. Kapatma YAPMAZ.';

-- Günlük 08:05 (UTC) — günlük iş takibi digestinden 5 dk sonra, aynı sabah bloğunda.
SELECT cron.unschedule('daily-stage-leftovers')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-stage-leftovers');

SELECT cron.schedule('daily-stage-leftovers', '5 8 * * *',
                     $cron$ SELECT public.fn_daily_stage_leftovers(); $cron$);
