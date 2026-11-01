-- ════════════════════════════════════════════════════════════════════════════
-- Tarama randevuları — şema, özellik bayrağı, RLS (plan Task 1)
-- spec: docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md
--
-- İki düzey: randevu (ziyaret) ve tarama satırı (hasta). Ücret hasta × hizmet.
-- Yazma YALNIZ DEFINER RPC'lerden (Task 2+); yeni tablolarda istemciye yalnız SELECT.
-- Faturalanmış = status='ucretli' AND invoice_item_id IS NOT NULL;
-- havuz        = status='ucretli' AND invoice_item_id IS NULL
-- (taslak fatura silinirse ON DELETE SET NULL ile satır kendiliğinden havuza döner).
-- Özellik lab bazında: 'scan_appointments' bayrağı, varsayılan kapalı, Nexadent açık.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Bayrak ──
insert into public.platform_feature_flags (key, label, description, default_on)
values ('scan_appointments', 'Tarama randevuları',
        'Ağız içi tarama ve fotogrametri ziyaretleri: randevu, karar, faturalama, program bildirimi', false)
on conflict (key) do nothing;

insert into public.lab_feature_flags (lab_id, key, enabled)
values ('243ef1db-9853-424b-8292-0025abfca436', 'scan_appointments', true)
on conflict (lab_id, key) do update set enabled = excluded.enabled;

-- ── Eklemeli sütunlar ──
alter table public.lab_services
  add column if not exists scan_kind text,
  add column if not exists scan_free_if_order boolean not null default true;
alter table public.equipment
  add column if not exists scan_kind text;
alter table public.clinics
  add column if not exists geo_lat numeric,
  add column if not exists geo_lng numeric,
  add column if not exists geo_addr_hash text,
  add column if not exists geo_at timestamptz;
alter table public.lab_settings
  add column if not exists scan_hours_start time default '09:00',
  add column if not exists scan_hours_end time default '20:00',
  add column if not exists scan_workdays int[] default '{1,2,3,4,5,6}',
  add column if not exists scan_default_minutes int default 90,
  add column if not exists scan_buffer_minutes int default 10,
  add column if not exists scan_morning_at time default '08:00',
  add column if not exists scan_evening_at time default '18:00',
  add column if not exists scan_technician_ids uuid[] default '{}';

do $$ begin
  alter table public.lab_services add constraint lab_services_scan_kind_chk
    check (scan_kind in ('intraoral', 'photogrammetry'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.equipment add constraint equipment_scan_kind_chk
    check (scan_kind in ('intraoral', 'photogrammetry'));
exception when duplicate_object then null; end $$;

-- ── Tablolar ──
create table if not exists public.scan_appointments (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid not null references public.labs(id) on delete cascade,
  clinic_id     uuid not null references public.clinics(id),
  doctor_id     uuid,                                   -- doctors.id (polimorfik; FK yok)
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min between 15 and 600),
  technician_id uuid not null references public.profiles(id),
  status        text not null default 'planlandi'
                check (status in ('planlandi', 'yapildi', 'kapandi', 'iptal')),
  source        text not null default 'telefon'
                check (source in ('telefon', 'whatsapp', 'yuz_yuze', 'diger')),
  note          text,
  cancel_reason text,
  done_at       timestamptz,
  done_by       uuid references public.profiles(id),
  done_note     text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_scan_appt_lab_start  on public.scan_appointments (lab_id, starts_at);
create index if not exists idx_scan_appt_tech_start on public.scan_appointments (technician_id, starts_at);

create table if not exists public.scan_appointment_services (
  id             uuid primary key default gen_random_uuid(),
  lab_id         uuid not null references public.labs(id) on delete cascade,
  appointment_id uuid not null references public.scan_appointments(id) on delete cascade,
  service_id     uuid not null references public.lab_services(id),
  equipment_id   uuid references public.equipment(id) on delete set null,
  unique (appointment_id, service_id)
);

create table if not exists public.scan_patients (
  id             uuid primary key default gen_random_uuid(),
  lab_id         uuid not null references public.labs(id) on delete cascade,
  appointment_id uuid not null references public.scan_appointments(id) on delete cascade,
  patient_name   text,
  note           text,
  work_order_id  uuid references public.work_orders(id) on delete set null,
  status         text not null default 'karar_bekliyor'
                 check (status in ('karar_bekliyor', 'kapandi')),
  decision       text check (decision in ('siparise_baglandi', 'yeni_siparis', 'yalniz_tarama')),
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_scan_patients_appt on public.scan_patients (appointment_id);
create index if not exists idx_scan_patients_wo   on public.scan_patients (work_order_id) where work_order_id is not null;

create table if not exists public.scan_patient_charges (
  id              uuid primary key default gen_random_uuid(),
  lab_id          uuid not null references public.labs(id) on delete cascade,
  scan_patient_id uuid not null references public.scan_patients(id) on delete cascade,
  service_id      uuid not null references public.lab_services(id),
  status          text not null default 'beklemede'
                  check (status in ('beklemede', 'ucretsiz', 'ucretli')),
  bill_with_order boolean,
  price           numeric,
  currency        text,
  price_source    text,
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  unique (scan_patient_id, service_id)
);
create index if not exists idx_scan_charges_item on public.scan_patient_charges (invoice_item_id) where invoice_item_id is not null;

-- ── Yetki yardımcıları ──
create or replace function public._scan_enabled(p_lab uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.lab_feature_enabled(p_lab, 'scan_appointments'), false);
$$;

create or replace function public._scan_can_manage()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._scan_enabled(public.get_my_lab_id())
     and (
       coalesce((select p.user_type = 'admin'
                        or (p.user_type = 'lab' and p.role in ('manager', 'admin'))
                   from public.profiles p where p.id = auth.uid()), false)
       or coalesce(public.has_permission('manage_scan_appointments'), false)
     );
$$;

create or replace function public._scan_can_view()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._scan_can_manage()
      or (public._scan_enabled(public.get_my_lab_id())
          and coalesce(public.has_permission('view_scan_appointments'), false));
$$;

revoke all on function public._scan_enabled(uuid), public._scan_can_manage(), public._scan_can_view() from public, anon;
grant execute on function public._scan_enabled(uuid), public._scan_can_manage(), public._scan_can_view() to authenticated;

-- ── RLS: okuma politikası; yazma yalnız RPC ──
alter table public.scan_appointments         enable row level security;
alter table public.scan_appointment_services enable row level security;
alter table public.scan_patients             enable row level security;
alter table public.scan_patient_charges      enable row level security;

drop policy if exists scan_appt_select on public.scan_appointments;
create policy scan_appt_select on public.scan_appointments for select to authenticated
  using (lab_id = public.get_my_lab_id()
         and public._scan_enabled(lab_id)
         and (public._scan_can_view() or technician_id = auth.uid()));

drop policy if exists scan_appt_svc_select on public.scan_appointment_services;
create policy scan_appt_svc_select on public.scan_appointment_services for select to authenticated
  using (exists (select 1 from public.scan_appointments a where a.id = appointment_id));

drop policy if exists scan_patients_select on public.scan_patients;
create policy scan_patients_select on public.scan_patients for select to authenticated
  using (exists (select 1 from public.scan_appointments a where a.id = appointment_id));

drop policy if exists scan_charges_select on public.scan_patient_charges;
create policy scan_charges_select on public.scan_patient_charges for select to authenticated
  using (exists (select 1 from public.scan_patients p where p.id = scan_patient_id));

revoke all on public.scan_appointments, public.scan_appointment_services,
              public.scan_patients, public.scan_patient_charges from anon;
revoke insert, update, delete, truncate, references, trigger
    on public.scan_appointments, public.scan_appointment_services,
       public.scan_patients, public.scan_patient_charges from authenticated;
grant select on public.scan_appointments, public.scan_appointment_services,
                public.scan_patients, public.scan_patient_charges to authenticated;

-- ── Nexadent tohumu: mevcut tarama hizmetleri ──
update public.lab_services set scan_kind = 'intraoral'
 where lab_id = '243ef1db-9853-424b-8292-0025abfca436' and name = 'Intraoral Tarama hizmeti' and scan_kind is null;
update public.lab_services set scan_kind = 'photogrammetry'
 where lab_id = '243ef1db-9853-424b-8292-0025abfca436' and name = 'Photogrammetri Hizmeti' and scan_kind is null;
