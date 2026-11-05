-- Geri alma: 20261105101000_ekstre_indirimi_rpc
-- Canlı önceki durum: rollbacks/20261105101000_ekstre_indirimi_rpc.before.txt
-- Bu migration yalnız yeni nesne eklediği için geri alma yalnız onları düşürür (geri yazılacak tanım yok).
-- Sayaç tablosu fonksiyonlardan sonra düşer (record onu kullanır; FK yalnız labs'a).
-- Bağımlılık sırası: tetikleyici → tetikleyici fonksiyonu → istemci RPC'leri → iç yardımcılar → sayaç tablosu.
-- Veri: clinic_statement_discounts satırları ve 'indirim' payları (Görev 2 şeması) yerinde kalır;
-- onları kaldırmak Görev 2 geri almasının işidir (20261105100000_ekstre_indirimi_sema.down.sql).
-- Bu geri almadan sonra fatura iptali / KDV düşüşü alacağı yeniden uygulamaz (bakiye görünümleri
-- alacağı unallocated_credit olarak göstermeye devam eder).
BEGIN;

DROP TRIGGER IF EXISTS zz_sd_invoice_credit ON public.invoices;
DROP FUNCTION IF EXISTS public._sd_invoice_credit_trg();

DROP FUNCTION IF EXISTS public.delete_statement_discount(uuid);
DROP FUNCTION IF EXISTS public.record_statement_discount(uuid, text, date, date, text, numeric, date, text, text);
DROP FUNCTION IF EXISTS public.preview_statement_discount(uuid, text, date, date, text, numeric);

DROP FUNCTION IF EXISTS public._sd_apply_credit(uuid, uuid, text);
DROP FUNCTION IF EXISTS public._sd_quote(uuid, uuid, text, date, date, text, numeric);

-- İND sayacı (Ruling O): numaralar clinic_statement_discounts.doc_no'da kalır; yeniden uygulanırsa sayaç
-- ilk kayıtta MAX(doc_no)+1 ile tohumlanır.
DROP TABLE IF EXISTS public.clinic_statement_discount_counters;

COMMIT;
