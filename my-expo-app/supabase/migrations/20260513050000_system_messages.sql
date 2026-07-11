-- ============================================================
-- 20260513050000 — Sipariş mesaj kutusuna sistem mesajları
--
-- Davranış:
--   • order_messages.sender_id NULL allow (system mesajları için)
--   • message_type kolonu: 'user' | 'system'
--   • Trigger'lar otomatik post eder:
--       - deliveries INSERT          → "Sipariş kuryeye verildi: X"
--       - deliveries status değişim  → "Kurye paketi aldı / Yola çıktı / Teslim etti"
--       - order_stages aktif/tamamlandı → "Aşama başladı/tamamlandı: X"
--       - work_orders.status değişim → "Sipariş statüsü: X"
-- ============================================================

BEGIN;

-- 1) Kolonlar + sender_id nullable
ALTER TABLE public.order_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'user'
    CHECK (message_type IN ('user', 'system'));

ALTER TABLE public.order_messages
  ALTER COLUMN sender_id DROP NOT NULL;

-- 2) RLS — system mesajlarını okuma izni mevcut policy'de var (sender_id check yok).
-- INSERT için: SECURITY DEFINER fonksiyonlar trigger'dan yazar, RLS bypass.

-- 3) Yardımcı: sistem mesajı yaz
CREATE OR REPLACE FUNCTION public.post_system_message(
  p_work_order_id UUID,
  p_content       TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_messages (work_order_id, sender_id, content, message_type)
  VALUES (p_work_order_id, NULL, p_content, 'system');
END;
$$;

-- 4) Trigger: deliveries — INSERT
CREATE OR REPLACE FUNCTION public.trg_delivery_inserted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_courier TEXT;
BEGIN
  IF NEW.mode = 'internal' THEN
    SELECT full_name INTO v_courier FROM public.profiles WHERE id = NEW.courier_id;
    PERFORM public.post_system_message(
      NEW.work_order_id,
      '📦 Sipariş kuryeye verildi: ' || COALESCE(v_courier, 'Atanmamış')
    );
  ELSE
    PERFORM public.post_system_message(
      NEW.work_order_id,
      '🚚 Kargo firması: ' || COALESCE(NEW.external_provider, 'Kargo')
      || COALESCE(' · Takip: ' || NEW.external_tracking_no, '')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_system_msg_insert ON public.deliveries;
CREATE TRIGGER deliveries_system_msg_insert
  AFTER INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_inserted();

-- 5) Trigger: deliveries status değişimi
CREATE OR REPLACE FUNCTION public.trg_delivery_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_msg := CASE NEW.status
      WHEN 'teslim_alindi' THEN '🤲 Kurye paketi aldı'
      WHEN 'yolda'         THEN '🚀 Kurye yolda · canlı konum açık'
      WHEN 'teslim_edildi' THEN '✅ Paket teslim edildi'
      WHEN 'iptal'         THEN '⚠️ Teslimat iptal edildi'
      ELSE NULL
    END;
    IF v_msg IS NOT NULL THEN
      PERFORM public.post_system_message(NEW.work_order_id, v_msg);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_system_msg_update ON public.deliveries;
CREATE TRIGGER deliveries_system_msg_update
  AFTER UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_status_changed();

-- 6) Trigger: order_stages status değişimi
CREATE OR REPLACE FUNCTION public.trg_stage_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_station TEXT;
  v_tech    TEXT;
  v_msg     TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT name INTO v_station FROM public.lab_stations WHERE id = NEW.station_id;
    SELECT full_name INTO v_tech FROM public.profiles WHERE id = NEW.technician_id;

    IF NEW.status = 'aktif' AND NEW.started_at IS NOT NULL AND (OLD.started_at IS NULL) THEN
      v_msg := '▶️ Aşama başladı: ' || COALESCE(v_station, '—') || COALESCE(' · ' || v_tech, '');
    ELSIF NEW.status = 'tamamlandi' THEN
      v_msg := '✓ Aşama tamamlandı: ' || COALESCE(v_station, '—') || COALESCE(' · ' || v_tech, '');
    ELSIF NEW.status = 'reddedildi' THEN
      v_msg := '✗ Aşama reddedildi: ' || COALESCE(v_station, '—');
    END IF;

    IF v_msg IS NOT NULL THEN
      PERFORM public.post_system_message(NEW.work_order_id, v_msg);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stages_system_msg_update ON public.order_stages;
CREATE TRIGGER stages_system_msg_update
  AFTER UPDATE OF status, started_at ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.trg_stage_status_changed();

-- 7) Trigger: work_orders status değişimi (5-step macro)
CREATE OR REPLACE FUNCTION public.trg_work_order_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_label := CASE NEW.status::TEXT
      WHEN 'alindi'           THEN 'Alındı'
      WHEN 'asamada'          THEN 'Üretimde'
      WHEN 'uretimde'         THEN 'Üretimde'
      WHEN 'kalite_kontrol'   THEN 'Final QC'
      WHEN 'teslimata_hazir'  THEN 'Kuryeye Teslim Edildi'
      WHEN 'teslim_edildi'    THEN 'Teslim Edildi'
      ELSE NEW.status::TEXT
    END;
    PERFORM public.post_system_message(NEW.id, '📌 Sipariş statüsü: ' || v_label);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_system_msg_status ON public.work_orders;
CREATE TRIGGER work_orders_system_msg_status
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_work_order_status_changed();

-- 8) Triage approval — work_orders.triage_approved_at NULL → NOT NULL
CREATE OR REPLACE FUNCTION public.trg_triage_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_approver TEXT;
BEGIN
  IF OLD.triage_approved_at IS NULL AND NEW.triage_approved_at IS NOT NULL THEN
    SELECT full_name INTO v_approver FROM public.profiles WHERE id = NEW.triage_approved_by;
    PERFORM public.post_system_message(
      NEW.id,
      '👍 Planlama onaylandı' || COALESCE(' · ' || v_approver, '')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_system_msg_triage ON public.work_orders;
CREATE TRIGGER work_orders_system_msg_triage
  AFTER UPDATE OF triage_approved_at ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_triage_approved();

COMMIT;

NOTIFY pgrst, 'reload schema';
