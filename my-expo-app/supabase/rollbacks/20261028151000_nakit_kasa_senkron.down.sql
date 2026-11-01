-- Geri alma: 20261028151000_nakit_kasa_senkron.sql → canlı ÖNCE hâli (bkz. .before.txt)
-- Not: senkronun yazdığı hareketler (ref_type dolu) kalır; gerekiyorsa ayrıca silinir.

drop trigger if exists zz_cash_sync_payment on public.payments;
drop trigger if exists zz_cash_sync_receipt_line on public.clinic_receipt_lines;
drop trigger if exists zz_cash_sync_receipt on public.clinic_receipts;
drop trigger if exists zz_cash_sync_invoice on public.invoices;
drop trigger if exists zz_cash_sync_expense on public.expenses;

drop function if exists public._trg_cash_sync_payment();
drop function if exists public._trg_cash_sync_receipt_line();
drop function if exists public._trg_cash_sync_expense();
drop function if exists public._trg_cash_sync_receipt();
drop function if exists public._trg_cash_sync_invoice();
drop function if exists public._cash_sync(text, uuid);
drop function if exists public._cash_drawer(uuid, text);
