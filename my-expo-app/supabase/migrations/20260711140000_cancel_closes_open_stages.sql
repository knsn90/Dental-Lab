-- ============================================================
-- 20260711 — Y9: İptal edilen sipariş üretimde kalıyor
--
-- Sorun: iptal (client_cancel_order RPC'si veya iptal-talebi onayı)
-- yalnız work_orders.status='iptal' yapıyordu; açık order_stages
-- satırları ('bekliyor'/'aktif'/'durakladi'/'makine_bekliyor'/
-- 'reddedildi') açık kalıyor → teknisyen kanban'ında iş görünmeye
-- devam ediyordu. Ayrıca v_active_orders_kanban yalnız
-- 'teslim_edildi'yi dışlıyordu, 'iptal'i değil.
--
-- Kapsam:
--   1. _close_open_stages(p_order_id, p_actor) — açık aşamaları
--      'skipped' yapar (skipped_reason zorunlu CHECK'i karşılanır).
--   2. client_cancel_order — iptal sonrası açık aşamaları kapatır
--      (planlama öncesi olduğu için normalde aşama yoktur; defansif).
--   3. approve_order_cancellation(p_request_id) — iptal talebi onayı
--      tek SECURITY DEFINER RPC: work_orders.status='iptal' + açık
--      aşamaları kapat + talebi approved işaretle. Yetki:
--      is_cancel_approver() (admin veya lab manager) — client'taki
--      approveCancelRequest bu RPC'yi çağırır (RPC yoksa eski
--      direkt-update yoluna düşer, geriye uyumlu).
--   4. v_active_orders_kanban — 'iptal' de dışlanır. DİKKAT: canlı
--      view tanımı migration dosyalarından SAPMIŞ durumda (canlıda
--      parallel_group kolonu + UNION ALL var, repo'da yok) → tanım
--      pg_get_viewdef ile CANLIDAN okunur ve yalnız
--      'teslim_edildi' filtresi genişletilerek geri yazılır.
--      Kolon listesi/gövde birebir korunur.
--
-- Idempotent.
-- ============================================================

-- ── 1. Açık aşamaları kapat ─────────────────────────────────
CREATE OR REPLACE FUNCTION public._close_open_stages(
  p_order_id uuid,
  p_actor    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.order_stages
     SET status         = 'skipped',
         skipped_reason = 'Sipariş iptal edildi',
         skipped_at     = now(),
         skipped_by     = COALESCE(p_actor, auth.uid())
   WHERE work_order_id = p_order_id
     AND status IN ('bekliyor', 'aktif', 'durakladi', 'makine_bekliyor', 'reddedildi',
                    'onay_bekliyor', 'bloklu', 'yeniden');
END;
$$;

-- Yalnız SECURITY DEFINER RPC'ler içinden çağrılır — client doğrudan çağıramaz.
-- (Definer fonksiyon içinden çağrıda EXECUTE yetkisi owner'a göre denetlenir.)
REVOKE EXECUTE ON FUNCTION public._close_open_stages(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. client_cancel_order — iptal + açık aşamaları kapat ───
-- (20260705000000_client_order_edit_cancel.sql tanımı, yalnız
--  _close_open_stages çağrısı eklendi.)
create or replace function public.client_cancel_order(p_order_id uuid)
returns public.work_orders
language plpgsql security definer set search_path to 'public'
as $$
declare v_row public.work_orders;
begin
  if not public._client_owns_order(p_order_id) then
    raise exception 'Bu siparişi iptal etme yetkiniz yok.' using errcode = '42501';
  end if;
  if public._order_planning_started(p_order_id) then
    raise exception 'Planlaması başlamış bir sipariş iptal edilemez.' using errcode = 'P0001';
  end if;

  update public.work_orders
     set status = 'iptal', updated_at = now()
   where id = p_order_id and status <> 'iptal'
   returning * into v_row;

  if v_row.id is null then
    -- zaten iptal veya bulunamadı → mevcut satırı döndür
    select * into v_row from public.work_orders where id = p_order_id;
  else
    -- Y9: iptal edilen siparişin açık aşamalarını kapat
    perform public._close_open_stages(p_order_id, auth.uid());
  end if;
  return v_row;
end;
$$;

grant execute on function public.client_cancel_order(uuid) to authenticated;

-- ── 3. İptal talebi onayı — tek RPC ─────────────────────────
CREATE OR REPLACE FUNCTION public.approve_order_cancellation(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req public.order_cancellation_requests;
BEGIN
  IF NOT public.is_cancel_approver() THEN
    RAISE EXCEPTION 'İptal talebini onaylama yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
    FROM public.order_cancellation_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'İptal talebi bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Talep zaten sonuçlandırılmış.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_orders
     SET status = 'iptal', updated_at = now()
   WHERE id = v_req.work_order_id
     AND status <> 'iptal';

  PERFORM public._close_open_stages(v_req.work_order_id, auth.uid());

  UPDATE public.order_cancellation_requests
     SET status      = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_order_cancellation(uuid) TO authenticated;

-- ── 4. v_active_orders_kanban — 'iptal' de dışlansın ────────
-- Canlı tanım migration dosyalarından farklı (parallel_group vb.) →
-- tanımı canlıdan oku, yalnız durum filtresini genişlet, geri yaz.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_viewdef('public.v_active_orders_kanban'::regclass) INTO v_def;

  IF v_def ILIKE '%''iptal''%' THEN
    RAISE NOTICE 'v_active_orders_kanban zaten iptal''i dışlıyor — atlandı.';
    RETURN;
  END IF;

  -- pg_get_viewdef normalize biçimleri: "<> 'teslim_edildi'::work_order_status"
  -- veya "<> ALL (ARRAY['teslim_edildi'::work_order_status])"
  v_new := replace(
    v_def,
    '<> ALL (ARRAY[''teslim_edildi''::work_order_status])',
    '<> ALL (ARRAY[''teslim_edildi''::work_order_status, ''iptal''::work_order_status])'
  );
  v_new := replace(
    v_new,
    '<> ''teslim_edildi''::work_order_status',
    '<> ALL (ARRAY[''teslim_edildi''::work_order_status, ''iptal''::work_order_status])'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION
      'v_active_orders_kanban: ''teslim_edildi'' filtresi beklenen biçimde bulunamadı — pg_get_viewdef çıktısını kontrol edip filtreyi elle genişletin.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_active_orders_kanban AS ' || v_new;
  -- CREATE OR REPLACE reloption''ları sıfırlayabilir — güvenliği geri kur
  EXECUTE 'ALTER VIEW public.v_active_orders_kanban SET (security_invoker = true)';
END $$;
