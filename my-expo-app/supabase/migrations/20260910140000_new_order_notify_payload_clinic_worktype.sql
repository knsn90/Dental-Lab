-- ═══════════════════════════════════════════════════════════════════════════
-- Yeni sipariş bildirimi payload'ına KLİNİK + İŞLEM eklenir
--
-- SORUN: WhatsApp "yeni_siparis_lab" şablonu {{klinik}} ve {{detay}} değişkenlerini
-- bildirim payload'ından okuyor (send-whatsapp-meta → LAB_TEMPLATES.new_order:
-- p.clinic / p.workType). Bu trigger payload'a yalnız orderNumber + patient
-- koyuyordu → her mesajda "Klinik: —" ve "İşlem: —" gidiyordu.
--
-- Klinik adı zaten hesaplanıyordu (v_clinic, gövde metni için); işlem listesi de
-- gövdede türetiliyordu. İkisi de payload'a taşınıyor. Gövde/başlık DEĞİŞMİYOR.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_work_order_notify_new()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target  record; v_title text; v_body text; v_clinic text; v_work text;
begin
  if new.lab_id is null then return new; end if;
  v_title := 'Yeni iş emri' || coalesce(' · ' || new.order_number, '');
  select c.name into v_clinic
    from doctors d left join clinics c on c.id = d.clinic_id
   where d.id = new.doctor_id;

  -- İşlem listesi: work_type virgüllü segmentleri, tekilleştirilmiş.
  -- Eskiden yalnız gövde içinde satır-içi hesaplanıyordu; payload da kullanacağı
  -- için değişkene alındı.
  select string_agg(distinct btrim(s), ', ')
    into v_work
    from unnest(string_to_array(coalesce(new.work_type,''), ',')) s
   where btrim(s) <> '';

  v_body := nullif(
    concat_ws(' · ',
      nullif(new.patient_name, ''),
      nullif(v_work, ''),
      nullif(v_clinic, '')
    ), '');

  for v_target in
    select id from public.profiles
     where lab_id = new.lab_id
       and (user_type = 'admin' or (user_type = 'lab' and role = 'manager'))
       and coalesce(is_active, true) = true
  loop
    perform public._notify_dedup(
      v_target.id, 'new_order', v_title, v_body, 'work_order', new.id,
      '/order/' || new.id::text,
      -- clinic + workType: WhatsApp lab şablonunun {{klinik}} / {{detay}} kaynağı.
      jsonb_build_object(
        'orderNumber', new.order_number,
        'patient',     new.patient_name,
        'clinic',      v_clinic,
        'workType',    v_work
      )
    );
  end loop;
  return new;
end;
$function$;
