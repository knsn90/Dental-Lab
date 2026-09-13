-- ═══════════════ FIX: lab_device_create "column reference id is ambiguous" ═══════════════
-- lab_device_create RETURNS TABLE(id, ...) → OUT değişkeni "id" oluşuyor. Fonksiyon içindeki
-- `select lab_id from profiles where id = auth.uid()` sorgusundaki çıplak "id", OUT değişkeni ile
-- çakışıyordu (42702). Sonuç: tablet ekleme HER ZAMAN "Oluşturulamadı" ile çöküyordu.
-- Çözüm: profiles sorgusunda kolonu takma adla nitele (p.id).
create or replace function public.lab_device_create(p_name text)
returns table(id uuid, pairing_code text, pairing_expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare v_lab uuid; v_id uuid; v_code text; v_exp timestamptz;
begin
  select p.lab_id into v_lab from public.profiles p where p.id = auth.uid();
  if not public.kiosk_can_manage(v_lab) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Cihaz adı gerekli'; end if;
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  v_exp  := now() + interval '15 minutes';
  insert into public.lab_devices(lab_id, name, pairing_code, pairing_expires_at, created_by)
    values (v_lab, trim(p_name), v_code, v_exp, auth.uid())
    returning lab_devices.id into v_id;
  return query select v_id, v_code, v_exp;
end; $$;
