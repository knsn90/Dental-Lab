-- Geri alma: 20261031120000_makbuz_hesap.sql
alter table public.clinic_receipts drop column if exists account_label;
alter table public.clinic_receipts drop column if exists account_id;
