-- Ön ekstre: giriş yapılmış kullanıcıya (lab / klinik / hekim) hasta TAM ADI (2026-11-18).
-- Hekimler PDF'te hasta adını istedi. Yalnız get_pre_statement(uuid) değişir (anon'a kapalı);
-- girişsiz onay bağlantısı get_pre_statement_by_link baş harfte KALIR (KVKK: bağlantı sızarsa ad sızmasın).
-- patient_initials alanı korunur; yanına patient_name eklenir.
BEGIN;
DO $mig$
DECLARE
  v_oid regprocedure := 'public.get_pre_statement(uuid)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_old text := $o$             'doctor_name', it.doctor_name,$o$;
  v_new text := $n$             'patient_name', NULLIF(btrim(COALESCE(it.patient_name, '')), ''),
             'doctor_name', it.doctor_name,$n$;
BEGIN
  IF strpos(v_def, v_old) = 0 OR strpos(v_def, '''patient_name'', NULLIF') > 0 THEN
    RAISE EXCEPTION 'get_pre_statement: beklenen blok yok ya da zaten uygulanmış';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
COMMIT;
