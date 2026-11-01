-- Geri alma: 20261027160000_prova_sema
-- Not: canlıda planlanmış (sent_date NULL) ya da onay_bekliyor prova oluştuysa önce onlar
-- düzeltilmeli; aksi hâlde NOT NULL / CHECK geri yüklenemez (o anki satırlar .before.txt'deki gibi 0'dı).
drop function if exists public._order_client_recipients(uuid);
drop function if exists public._prova_notify_lab(uuid, text, text);
drop function if exists public._prova_return_by(uuid);
drop function if exists public._prova_client_can(uuid);
drop function if exists public._prova_can_manage(uuid);
drop table if exists public.order_appointments;

alter table public.provas
  drop column if exists last_action,
  drop column if exists late_notified_at,
  drop column if exists client_returned_by,
  drop column if exists client_returned_at;
alter table public.provas alter column sent_date set not null;
alter table public.provas drop constraint if exists provas_status_check;
alter table public.provas add constraint provas_status_check
  check (status = any (array['gönderildi'::text, 'döndü'::text, 'tamamlandı'::text]));
