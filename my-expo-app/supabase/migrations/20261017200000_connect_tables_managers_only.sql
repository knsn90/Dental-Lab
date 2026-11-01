-- =============================================================================
-- Klinik bağlantıları: doğrudan yazma kapalı, kod üretimi yalnız yönetici
-- =============================================================================
-- Önkoşul (canlı): 20261017150000_labs_update_managers_only (can_manage_lab_settings),
--                  20261017193000_clinic_self_signup_flow
--
-- SORUN (canlı, 2026-10-17)
--   • clm_lab_all / lcc_lab_all FOR ALL ve yalnız my_user_type() ∈ (lab, admin) +
--     kendi lab'ı istiyordu → teknisyen / kurye kendi lab'ının klinik üyeliklerini
--     doğrudan UPDATE/DELETE edebiliyor (aktif et, iptal et, sil), bağlantı kodlarını
--     (aktif davet kodları dahil) okuyup yazabiliyordu.
--   • lab_create_clinic_invite / lab_get_or_create_public_code her lab kullanıcısına
--     açıktı. 20261017193000'dan beri davet kodu yeni hesabı ANINDA açar → teknisyen
--     kod üretip kendi lab'ında onaylı klinik hesabı açabilirdi.
--
-- ÇÖZÜM
--   • Her iki tabloya yazan tüm yollar DEFINER RPC (ya da service_role edge fn):
--     _clinic_connect, lab_approve_clinic, lab_reject_clinic, lab_reopen_signup,
--     _activate_signup_member, lab_create_clinic_invite, lab_get_or_create_public_code.
--     İstemci bu tablolara yalnız SELECT atar → istemci yazma politikası gereksiz.
--   • clinic_lab_memberships: lab tarafı yalnız SELECT (koşul aynı).
--   • lab_connect_codes: yalnız yönetici, yalnız SELECT.
--   • İki tabloda anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE yetkisi geri alınır
--     (TRUNCATE RLS'i baypas eder).
--   • Kod üreten iki RPC can_manage_lab_settings() ister.
--   • clinic_lab_memberships realtime yayınına eklenir (onay ekranı / rozet canlı;
--     olaylar RLS'e tabi).
-- =============================================================================

-- 1) clinic_lab_memberships ------------------------------------------------------
drop policy if exists clm_lab_all on public.clinic_lab_memberships;
create policy clm_lab_select on public.clinic_lab_memberships
  for select
  using ((my_user_type() = any (array['lab'::text, 'admin'::text])) and (lab_id = get_my_lab_id()));

-- 2) lab_connect_codes -----------------------------------------------------------
drop policy if exists lcc_lab_all on public.lab_connect_codes;
create policy lcc_manager_select on public.lab_connect_codes
  for select
  using ((lab_id = get_my_lab_id()) and can_manage_lab_settings());

-- 3) Tablo yetkileri ----------------------------------------------------------------
revoke insert, update, delete, truncate on public.clinic_lab_memberships from anon, authenticated;
revoke insert, update, delete, truncate on public.lab_connect_codes      from anon, authenticated;

-- 4) Kod üretimi yalnız yönetici (canlı tanım + yetki satırı) -----------------------
CREATE OR REPLACE FUNCTION public.lab_create_clinic_invite(p_target_clinic_id uuid DEFAULT NULL::uuid, p_expires_hours integer DEFAULT 168)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_code text; v_try int := 0;
BEGIN
  IF NOT can_manage_lab_settings() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  v_lab := get_my_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'no lab context'; END IF;
  LOOP
    v_code := _gen_connect_code();
    BEGIN
      INSERT INTO lab_connect_codes (lab_id, code, kind, max_uses, expires_at, created_by)
      VALUES (v_lab, v_code, 'invite', 1, now() + make_interval(hours => GREATEST(p_expires_hours, 1)), auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1; IF v_try > 6 THEN RAISE; END IF;
    END;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.lab_get_or_create_public_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_code text; v_try int := 0;
BEGIN
  IF NOT can_manage_lab_settings() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  v_lab := get_my_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'no lab context'; END IF;
  SELECT code INTO v_code FROM lab_connect_codes WHERE lab_id = v_lab AND kind = 'public_join' AND active LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    v_code := _gen_connect_code();
    BEGIN
      INSERT INTO lab_connect_codes (lab_id, code, kind, created_by) VALUES (v_lab, v_code, 'public_join', auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1; IF v_try > 6 THEN RAISE; END IF;
    END;
  END LOOP;
END; $function$;

-- 5) Realtime ------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clinic_lab_memberships'
  ) then
    alter publication supabase_realtime add table public.clinic_lab_memberships;
  end if;
end $$;
