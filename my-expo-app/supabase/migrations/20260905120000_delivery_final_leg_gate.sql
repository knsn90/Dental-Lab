-- Kurye teslimatı → sipariş "teslim_edildi" senkronu: ARA BACAK ve DURAKLAMA koruması.
--
-- Bug: Bir siparişe bağlı herhangi bir kurye teslimatı 'teslim_edildi' olduğunda,
-- hem update_delivery_status RPC'si hem trg_bbk_sync_order_status trigger'ı siparişi
-- koşulsuz 'teslim_edildi' yapıyordu. Sonuç:
--   • Duraklamadaki (on_hold) / üretimdeki sipariş "teslim edildi" görünüyordu —
--     hold_status temizlenmediği için liste "Duraklatıldı", detay "Teslim edildi"
--     diyordu (çelişki).
--   • work_orders.delivered_at doldurulmadığı için teslim tarihi "—" kalıyordu.
--   • update_delivery_status purpose/direction'a hiç bakmadığı için bir ARA bacak
--     (model alma, prova, iade) teslim olunca bile sipariş tamamlanıyordu.
--
-- Düzeltme (iki yol için de aynı kural): bir kurye bacağı siparişi ancak
--   (a) NİHAİ teslimatsa  → direction='lab_to_clinic' AND purpose='teslimat'
--   (b) sipariş zaten TESLİMAT FAZINDAYSA → status in (kuryede, kurye_bekleniyor, teslimata_hazir)
-- tamamlar. O anda delivered_at doldurulur ve asılı kalan hold alanları temizlenir.
-- Duraklamadaki/üretimdeki siparişe ara bacak dokunamaz.

-- ── 1) Kendi kurye / manuel yol: update_delivery_status RPC ──────────────────
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_delivery_id uuid, p_status delivery_status, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_courier   UUID;
  v_wo        UUID;
  v_dir       TEXT;
  v_purpose   TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT courier_id, work_order_id, direction, purpose
    INTO v_courier, v_wo, v_dir, v_purpose
    FROM public.deliveries WHERE id = p_delivery_id;
  IF v_wo IS NULL THEN RAISE EXCEPTION 'delivery not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (
    v_user_type = 'admin'
    OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))
    OR v_caller = v_courier
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.deliveries
     SET status        = p_status,
         picked_up_at  = CASE WHEN p_status = 'teslim_alindi' AND picked_up_at IS NULL THEN NOW() ELSE picked_up_at END,
         delivered_at  = CASE WHEN p_status = 'teslim_edildi' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
         cancelled_at  = CASE WHEN p_status = 'iptal'         AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
         cancel_reason = CASE WHEN p_status = 'iptal' THEN COALESCE(p_note, cancel_reason) ELSE cancel_reason END,
         notes         = CASE WHEN p_note IS NOT NULL AND p_status <> 'iptal' THEN p_note ELSE notes END
   WHERE id = p_delivery_id;

  -- NİHAİ teslimat + sipariş teslimat fazında ise siparişi tamamla; ara bacak
  -- ya da duraklamadaki/üretimdeki siparişe dokunma.
  IF p_status = 'teslim_edildi'
     AND COALESCE(v_dir, 'lab_to_clinic') = 'lab_to_clinic'
     AND COALESCE(v_purpose, 'teslimat') = 'teslimat' THEN
    UPDATE public.work_orders SET
        status           = 'teslim_edildi',
        delivered_at     = COALESCE(delivered_at, NOW()),
        hold_status      = NULL, hold_reason = NULL, hold_category = NULL,
        hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
     WHERE id = v_wo
       AND status IN ('kuryede', 'kurye_bekleniyor', 'teslimata_hazir');
  END IF;

  RETURN TRUE;
END;
$function$;

-- ── 2) BanaBiKurye callback yolu: trg_bbk_sync_order_status ──────────────────
CREATE OR REPLACE FUNCTION public.trg_bbk_sync_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_active int;
begin
  if coalesce(NEW.external_provider,'') not ilike '%banabikurye%' then return NEW; end if;
  if coalesce(NEW.direction,'lab_to_clinic') <> 'lab_to_clinic'
     or coalesce(NEW.purpose,'teslimat') <> 'teslimat' then
    return NEW;
  end if;

  if NEW.status in ('beklemede','teslim_alindi','yolda') then
    -- kuryeye verildi / yolda → iş emri "kuryede"
    update public.work_orders set status='kuryede'
     where id = NEW.work_order_id
       and status in ('teslimata_hazir','kurye_bekleniyor');
  elsif NEW.status = 'teslim_edildi' then
    -- Nihai teslimat + sipariş teslimat fazında ise tamamla; duraklamadaki/
    -- üretimdeki siparişe ara bacak dokunmaz. Tamamlarken delivered_at doldurulur
    -- ve asılı kalan hold alanları temizlenir.
    update public.work_orders set
        status='teslim_edildi',
        delivered_at = coalesce(delivered_at, now()),
        hold_status=null, hold_reason=null, hold_category=null,
        hold_responsible=null, hold_started_at=null, hold_by=null
     where id = NEW.work_order_id
       and status in ('kuryede','kurye_bekleniyor','teslimata_hazir');
  elsif NEW.status = 'iptal' then
    -- başka aktif bbk nihai teslimat yoksa "teslimata_hazir"a geri al
    select count(*) into v_active from public.deliveries
     where work_order_id = NEW.work_order_id and id <> NEW.id
       and coalesce(external_provider,'') ilike '%banabikurye%'
       and coalesce(direction,'lab_to_clinic')='lab_to_clinic'
       and coalesce(purpose,'teslimat')='teslimat'
       and status not in ('teslim_edildi','iptal');
    if v_active = 0 then
      update public.work_orders set status='teslimata_hazir'
       where id = NEW.work_order_id and status in ('kuryede','kurye_bekleniyor');
    end if;
  end if;
  return NEW;
end
$function$;
