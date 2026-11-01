-- Klinik tahsilatı: "nereye yatırıldığı" (kullanıcı: ekstrede tahsilat açıklamasında tür + yatırıldığı yer).
-- account_id  → Kasa / Banka hesabı (silinirse boşalır)
-- account_label → seçildiği andaki hesap adı: kasa yetkisi olmayan da ekstrede görür; hesap yeniden adlandırılsa
--                  da eski makbuz değişmez. Yazma mevcut clinic_receipts_lab_update kuralıyla (manage_finance).
-- Geri alma: supabase/rollbacks/20261031120000_makbuz_hesap.down.sql
alter table public.clinic_receipts
  add column account_id uuid references public.cash_accounts(id) on delete set null,
  add column account_label text;

comment on column public.clinic_receipts.account_id is 'Tahsilatın yatırıldığı Kasa/Banka hesabı (nakitte boş: nakit kasaya kendiliğinden yazılır)';
comment on column public.clinic_receipts.account_label is 'Seçim anındaki hesap adı (ekstre açıklaması)';
