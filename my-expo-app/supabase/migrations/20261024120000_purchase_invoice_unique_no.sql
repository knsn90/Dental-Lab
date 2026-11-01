-- Mükerrer alış faturasına veritabanı engeli (denetim 2. dalga 11. madde, 2026-10-24).
--
-- Kural: aynı lab + aynı tedarikçi + aynı fatura numarası bir kez girilebilir. Numara,
-- istemcideki normalizeInvoiceNo ile aynı biçimde karşılaştırılır: boşluk - / . _ atılır,
-- büyük harfe çevrilir, i/I/İ/ı tek harf (I) sayılır ("ftr 001" = "FTR-001").
-- Tedarikçi kaydı yoksa (supplier_id NULL) tedarikçi adı (küçük harf, kırpılmış) kullanılır.
-- Numarası boş (ya da yalnız ayraçtan oluşan) faturalar kurala girmez.
--
-- Önce tek mevcut çift temizlenir (kullanıcı onayı: "gerçekten mükerrer"):
--   Nexadent · LEPUS · LDA2026000000232 · 288 EUR · 2026-08-04
--   asıl:  604c23db-8840-40ee-9197-79233c5e7e71 (2026-08-07 girildi) — KALIR
--   kopya: 7cf8f3f5-09e1-4095-a728-9eda4683cb6e (2026-08-15 girildi) — SİLİNİR
-- Kopyanın etkileri tek tek geri alınır:
--   3 FIFO katmanı (hiç tüketilmemiş) · 3 stok giriş hareketi (miktar trg_stock_qty_sync ile -1)
--   · tedarikçi cari satırı (yalnız kopyanınki, id ile — delete_purchase_invoice fatura NO'suyla
--   sildiği için ASILINKİNİ de silerdi) · gider satırı + fatura (gider FK ile CASCADE).
-- Beklenen durum tutmazsa hiçbir şey yapılmaz (hata).
-- Geri alma: supabase/rollbacks/20261024120000_purchase_invoice_unique_no.down.sql

do $$
declare
  v_inv constant uuid := '7cf8f3f5-09e1-4095-a728-9eda4683cb6e';
  v_orig constant uuid := '604c23db-8840-40ee-9197-79233c5e7e71';
  v_stx constant uuid := 'bb2d1172-28ad-4609-b507-f0baaf7b4e83';
  v_movs constant uuid[] := array['4c9a085f-f038-4b57-a66d-b4ec128663de','d1118dbe-cf6f-4238-ae6c-1438981961a9','20451df9-5f38-4feb-bc58-ffdff1649a35']::uuid[];
  n int;
begin
  -- Zaten temizlenmişse (yeniden çalıştırma) atla.
  if not exists (select 1 from public.purchase_invoices where id = v_inv) then
    raise notice 'kopya fatura zaten yok, temizlik atlandı';
    return;
  end if;

  -- Beklenen durum
  perform 1 from public.purchase_invoices
   where id = v_orig and invoice_number = 'LDA2026000000232' and total = 288;
  if not found then raise exception 'asıl fatura beklenen durumda değil'; end if;
  perform 1 from public.purchase_invoices
   where id = v_inv and invoice_number = 'LDA2026000000232' and total = 288
     and supplier_id = (select supplier_id from public.purchase_invoices where id = v_orig);
  if not found then raise exception 'kopya fatura beklenen durumda değil'; end if;
  select count(*) into n from public.stock_movements where purchase_invoice_id = v_inv;
  if n <> 3 or (select count(*) from public.stock_movements where id = any(v_movs) and purchase_invoice_id = v_inv and type = 'IN') <> 3 then
    raise exception 'kopyanın stok hareketleri beklenen durumda değil (%)', n;
  end if;
  if exists (select 1 from public.fifo_layers where movement_id = any(v_movs) and qty_remaining <> qty_in) then
    raise exception 'kopyanın FIFO katmanından tüketim yapılmış — elle incelenmeli';
  end if;
  if exists (select 1 from public.fifo_allocations a join public.fifo_layers l on l.id = a.layer_id where l.movement_id = any(v_movs)) then
    raise exception 'kopyanın FIFO katmanına bağlı tüketim kaydı var — elle incelenmeli';
  end if;
  perform 1 from public.supplier_transactions
   where id = v_stx and type = 'PURCHASE' and invoice_no = 'LDA2026000000232' and amount = 288;
  if not found then raise exception 'kopyanın cari satırı beklenen durumda değil'; end if;

  -- Temizlik (sıra önemli: katman → hareket → cari → fatura)
  delete from public.fifo_layers where movement_id = any(v_movs);
  delete from public.stock_movements where id = any(v_movs);
  delete from public.supplier_transactions where id = v_stx;
  delete from public.purchase_invoices where id = v_inv;   -- expenses + purchase_invoice_extras CASCADE
end $$;

create unique index if not exists purchase_invoices_lab_supplier_no_uq
  on public.purchase_invoices (
    lab_id,
    (coalesce(supplier_id::text, lower(btrim(supplier_name)))),
    (translate(upper(regexp_replace(invoice_number, '[[:space:]./_-]+', '', 'g')), 'çşğüöıİ', 'ÇŞĞÜÖII'))
  )
  where regexp_replace(coalesce(invoice_number, ''), '[[:space:]./_-]+', '', 'g') <> '';
