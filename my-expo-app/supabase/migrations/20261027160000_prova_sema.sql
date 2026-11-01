-- 2. dalga 4 — Prova ve randevu takibi: şema (spec docs/superpowers/specs/2026-10-27-prova-takibi-design.md)
--
-- provas:
--   * yeni durumlar: planlandı (Hazırlanıyor), onay_bekliyor (hekim "geri gönderdim", lab teslim almadı)
--   * sent_date NULL olabilir (planlanmış prova henüz gitmedi)
--   * client_returned_at/by — hekimin işareti; late_notified_at — gecikme bildirimi bir kez;
--     last_action — geri al için son elle işaretin anlık görüntüsü (yalnız sunucu yazar)
-- order_appointments: hastanın prova/takma randevuları; hekim önerisi lab onayına kadar pending_*'ta bekler.
--   Yazma yalnız RPC'lerle (Task 3) — authenticated'ın doğrudan INSERT/UPDATE/DELETE yetkisi yok.
-- Yardımcılar: lab yönetim yetkisi, dönüş için son gün, lab yöneticilerine uygulama içi bildirim,
--   hekim/klinik alıcıları.

alter table public.provas drop constraint if exists provas_status_check;
alter table public.provas add constraint provas_status_check
  check (status = any (array['planlandı'::text, 'gönderildi'::text, 'onay_bekliyor'::text, 'döndü'::text, 'tamamlandı'::text]));
alter table public.provas alter column sent_date drop not null;
alter table public.provas
  add column if not exists client_returned_at timestamptz,
  add column if not exists client_returned_by uuid references public.profiles(id) on delete set null,
  add column if not exists late_notified_at  timestamptz,
  add column if not exists last_action       jsonb;

create table if not exists public.order_appointments (
  id                  uuid primary key default gen_random_uuid(),
  lab_id              uuid not null references public.labs(id),
  work_order_id       uuid not null references public.work_orders(id) on delete cascade,
  kind                text not null check (kind in ('prova', 'takma')),
  appt_date           date,
  appt_time           time,
  pending_action      text check (pending_action in ('ekle', 'degistir', 'sil')),
  pending_date        date,
  pending_time        time,
  pending_by          uuid references public.profiles(id) on delete set null,
  pending_at          timestamptz,
  review_note         text,
  reviewed_at         timestamptz,
  removed_at          timestamptz,
  risk_notified_level text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- onaylı tarih yoksa satır yalnız bekleyen bir "ekle" önerisi olabilir
  constraint order_appointments_date_or_proposal check (appt_date is not null or pending_action = 'ekle')
);
create index if not exists order_appointments_order_idx
  on public.order_appointments (work_order_id) where removed_at is null;

alter table public.order_appointments enable row level security;
drop policy if exists order_appointments_read on public.order_appointments;
create policy order_appointments_read on public.order_appointments
  for select to authenticated using (public.can_read_work_order(work_order_id));
revoke all on public.order_appointments from anon;
revoke insert, update, delete, truncate, references, trigger on public.order_appointments from authenticated;
grant select on public.order_appointments to authenticated;

-- Lab adına prova/randevu yönetebilir mi: aynı lab, lab ya da admin kullanıcısı, teknisyen/kurye değil.
-- (Sipariş detayındaki "İşi beklet / Devam ettir" ile aynı kitle; spec 4.2 "Kimler işaretler".)
create or replace function public._prova_can_manage(p_order uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.is_platform_admin(), false)
      or exists (
           select 1 from public.work_orders wo
            where wo.id = p_order
              and wo.lab_id is not null
              and wo.lab_id = public.get_my_lab_id()
              and coalesce(public.my_user_type(), '') in ('lab', 'admin')
              and coalesce(public.my_role_key(), '') not in ('technician', 'courier')
         );
$function$;

-- Hekim ya da klinik bu siparişin tarafı mı (öneri ve "geri gönderdim" için).
create or replace function public._prova_client_can(p_order uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public._client_owns_order(p_order)
      or exists (select 1 from public.work_orders wo
                  where wo.id = p_order and public.doctor_owns_order_doctor(wo.doctor_id));
$function$;

-- Dönüş için son gün: gönderimden sonraki ilk onaylı prova randevusu; yoksa gönderim + 2.
-- Bugün bu günü geçtiyse ve prova dönmediyse gecikmiştir (spec 4.3).
create or replace function public._prova_return_by(p_prova uuid)
 returns date
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when pr.sent_date is null then null else
           coalesce((select min(a.appt_date) from public.order_appointments a
                      where a.work_order_id = pr.work_order_id and a.kind = 'prova'
                        and a.removed_at is null and a.appt_date is not null
                        and a.appt_date >= pr.sent_date),
                    pr.sent_date + 2)
         end
    from public.provas pr where pr.id = p_prova;
$function$;

-- Lab yöneticilerine (fn_daily_order_watch ile aynı kitle) uygulama içi bildirim; e-posta yok.
create or replace function public._prova_notify_lab(p_order uuid, p_title text, p_body text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_lab uuid; v_no text; v_uid uuid; n integer := 0;
begin
  select lab_id, order_number into v_lab, v_no from public.work_orders where id = p_order;
  if v_lab is null then return 0; end if;
  for v_uid in
    select p.id from public.profiles p
     where p.lab_id = v_lab
       and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
       and coalesce(p.is_active, true)
  loop
    perform public._notify_inapp(v_uid, 'order_status', p_title, p_body, 'work_order', p_order,
      '/order/' || p_order::text || '?tab=prova', jsonb_build_object('order_number', v_no));
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- Siparişin hekim ve klinik alıcıları (trg_work_order_notify_status kapsamı + açık hekim bağı).
create or replace function public._order_client_recipients(p_order uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select distinct p.id
    from public.work_orders wo
    left join lateral (select public._resolve_wo_clinic_id(wo.id) as clinic_id) c on true
    join public.profiles p
      on p.id = wo.doctor_id
      or (p.user_type = 'doctor' and p.doctor_id = wo.doctor_id)
      or (c.clinic_id is not null and p.clinic_id = c.clinic_id
          and p.user_type in ('clinic_admin', 'clinic_secretary'))
   where wo.id = p_order and coalesce(p.is_active, true);
$function$;

revoke all on function public._prova_can_manage(uuid)        from public, anon, authenticated;
revoke all on function public._prova_client_can(uuid)        from public, anon, authenticated;
revoke all on function public._prova_return_by(uuid)         from public, anon, authenticated;
revoke all on function public._prova_notify_lab(uuid, text, text) from public, anon, authenticated;
revoke all on function public._order_client_recipients(uuid) from public, anon, authenticated;
