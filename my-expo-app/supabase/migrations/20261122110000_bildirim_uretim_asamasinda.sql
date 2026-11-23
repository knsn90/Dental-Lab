-- Sipariş statü bildirimi: 'asamada' etiketi 'Üretimde' → 'Üretim Aşamasında'
-- (arayüzdeki etiketle aynı). Fonksiyonun geri kalanı birebir korunur:
-- canlı tanım okunur, yalnız bu satır değiştirilir. Satır bulunamazsa hata verir.
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.trg_work_order_notify_status()'::regprocedure);
  v_old text := $q$WHEN 'asamada'          THEN 'Üretimde'$q$;
  v_new text := $q$WHEN 'asamada'          THEN 'Üretim Aşamasında'$q$;
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'beklenen satır bulunamadı (asamada → Üretimde)';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
