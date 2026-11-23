-- Geri al: 'asamada' bildirim etiketi tekrar 'Üretimde'
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.trg_work_order_notify_status()'::regprocedure);
  v_old text := $q$WHEN 'asamada'          THEN 'Üretim Aşamasında'$q$;
  v_new text := $q$WHEN 'asamada'          THEN 'Üretimde'$q$;
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'beklenen satır bulunamadı';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
