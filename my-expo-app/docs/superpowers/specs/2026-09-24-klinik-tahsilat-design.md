# Klinik Toplu Tahsilatı (fatura-bağımsız, çoklu döviz) — Tasarım

**Tarih:** 2026-09-24
**Durum:** Onaylandı (yaklaşım A · artan = alacak · alacak otomatik uygulanmaz)

---

## 1. Amaç

Bir klinikten **tek seferde**, önceden bir faturaya bağlanmamış tahsilat alınabilmeli. Tahsilat
**birden fazla para biriminde** olabilir.

Kullanıcının verdiği gerçek örnek: IdealCare kliniğinin **710 EUR** borcuna karşılık **800 USD +
600 TL nakit** alındı. Bugün bu girilemiyor.

**Başarı ölçütü:** Bu tahsilat tek bir pencereden girilebiliyor; kliniğin cari bakiyesi doğru
azalıyor; kasaya giren gerçek para (800 USD ve 600 TL) kaydın içinde ayrı ayrı görünüyor;
açık faturalar en eskiden başlayarak kapanıyor.

**Kime:** Lab yöneticisi / finans yetkilisi (`has_permission('manage_finance')`).

---

## 2. Bugünkü durum (canlı veritabanında doğrulandı)

- `payments.invoice_id` **NOT NULL**; tabloda `clinic_id` **yok**. Faturasız ödeme DB
  seviyesinde imkânsız.
- `payments_financial_guard` trigger'ı iki kural dayatıyor:
  1. `payments.currency` = `invoices.currency` (farklıysa exception),
  2. fazla ödeme yasak (`SUM(payments) + NEW.amount <= invoices.total`).
- `recalc_invoice_payment_state` → `invoices.paid_amount = SUM(payments.amount)` ve statü
  (`odendi` / `kismi_odendi` / `kesildi`).
- `v_clinic_balance` **yalnız `invoices`'tan** besleniyor; `payments` tablosuna hiç bakmıyor.
  `taslak` ve `iptal` hariç. Bakiye = `Σ (total − paid_amount) × rate_at_time`.
- Fatura statüleri: `taslak, kesildi, kismi_odendi, odendi, iptal`.
- Baz para birimi: `lab_settings.default_currency` (TRY/EUR/USD/GBP).
- Kur: `get_currency_rate(p_lab_id, p_currency, p_base_currency, p_at_date)` → `1 birim
  currency` karşılığı baz tutar. Yani `amount_base = amount × rate`.
- `payments` üzerinde `auto_set_lab_id_payments` trigger'ı `lab_id`'yi kendisi dolduruyor.

**Mevcut hata (kapsama dâhil):** `bulk_record_payment` RPC'si INSERT'te `currency` yazmıyor →
kolon varsayılanı `'TRY'` → yabancı para faturalarda muhafız "payment currency TRY <> invoice
currency EUR" hatası fırlatıyor.

---

## 3. Kararlar

| Konu | Karar |
|---|---|
| Yaklaşım | **A** — tahsilat fişi + satırlar; tahsisler sıradan `payments` satırı olarak yazılır |
| Bakiye zinciri | **Değişmez** — `payments → trigger → invoices.paid_amount → view` korunur |
| Trigger'lar | **Değişmez** — tahsis faturanın para biriminde ve kalanı aşmadan yazılır |
| Dağıtım | En eski vadeli açık faturadan başlayarak otomatik |
| Artan tutar | Klinikte **kullanılmamış alacak** olarak kalır, bakiyeden düşülür |
| Alacağın yeni faturaya uygulanması | **Otomatik DEĞİL.** Kullanıcı "Alacağı uygula" der. Fatura kesme akışına dokunulmaz |
| Kur | Tahsilat tarihinin kuru dolu gelir, **elle değiştirilebilir**, kaydedilince satıra donar |
| Giriş noktaları | Finans · klinik detayı · (fatura içi mevcut pencere aynen kalır) |

---

## 4. Veri modeli

### 4.1 `clinic_receipts` — tahsilat fişi

```sql
CREATE TABLE public.clinic_receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id         uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  receipt_date   date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'nakit'
                 CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  reference_no   text,
  notes          text,
  received_by    uuid REFERENCES public.profiles(id),
  base_currency  text NOT NULL CHECK (base_currency IN ('TRY','EUR','USD','GBP')),
  total_base     numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_base >= 0),
  allocated_base numeric(14,2) NOT NULL DEFAULT 0 CHECK (allocated_base >= 0),
  idempotency_key text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_receipts_alloc_le_total CHECK (allocated_base <= total_base)
);

CREATE UNIQUE INDEX clinic_receipts_idem_uq
  ON public.clinic_receipts (lab_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX clinic_receipts_clinic_idx ON public.clinic_receipts (clinic_id, receipt_date DESC);
```

`credit_base` = `total_base − allocated_base` (kolon değil, hesaplanır).

`auto_set_lab_id` trigger'ı `payments`'taki kalıpla birebir eklenir.

### 4.2 `clinic_receipt_lines` — para birimi başına bir satır

```sql
CREATE TABLE public.clinic_receipt_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid NOT NULL REFERENCES public.clinic_receipts(id) ON DELETE CASCADE,
  currency    text NOT NULL CHECK (currency IN ('TRY','EUR','USD','GBP')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  rate        numeric(18,6) NOT NULL CHECK (rate > 0),
  amount_base numeric(14,2) NOT NULL CHECK (amount_base > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinic_receipt_lines_receipt_idx ON public.clinic_receipt_lines (receipt_id);
```

`rate` = 1 birim `currency`'nin baz karşılığı. `amount_base = round(amount × rate, 2)`.
Aynı fişte aynı para biriminden birden çok satır serbest (farklı kurdan iki ayrı bozdurma).

### 4.3 `payments.receipt_id` — yeni kolon

```sql
ALTER TABLE public.payments
  ADD COLUMN receipt_id uuid REFERENCES public.clinic_receipts(id) ON DELETE SET NULL;

CREATE INDEX payments_receipt_idx ON public.payments (receipt_id) WHERE receipt_id IS NOT NULL;
```

Fatura içi mevcut tahsilat akışında **boş kalır**; o akış hiç değişmez.

### 4.4 RLS

`payments` üzerindeki kalıp birebir kopyalanır:

- SELECT: `lab_id = get_my_lab_id()`
- INSERT/UPDATE/DELETE: `is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))`
- `clinic_receipt_lines` politikaları üst fiş üzerinden (`EXISTS (SELECT 1 FROM clinic_receipts r WHERE r.id = receipt_id AND r.lab_id = get_my_lab_id())`).

Klinik portalı tarafı **kapsam dışı**: klinik, tahsisin sonucunu zaten mevcut `payments`
politikalarıyla görüyor.

---

## 5. Dağıtım algoritması

`record_clinic_receipt` RPC'si, tek transaction, `SECURITY DEFINER`, `search_path=public`.

**İmza**

```sql
record_clinic_receipt(
  p_clinic_id      uuid,
  p_lines          jsonb,     -- [{"currency":"USD","amount":800,"rate":38.5}, …]
  p_receipt_date   date    DEFAULT CURRENT_DATE,
  p_payment_method text    DEFAULT 'nakit',
  p_reference_no   text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL,
  p_idempotency_key text   DEFAULT NULL
) RETURNS jsonb
```

**Adımlar**

1. **Yetki:** çağıran `is_platform_admin()` veya (`clinics.lab_id = get_my_lab_id()` ve
   `has_permission('manage_finance')`). Değilse exception.
2. **Baz para birimi:** `lab_settings.default_currency`; yoksa `'TRY'`.
3. **Satır doğrulama:** her satırda `currency` listede, `amount > 0`, `rate > 0`. En az bir
   satır zorunlu. `amount_base = round(amount × rate, 2)`.
4. `total_base = Σ amount_base`. Fiş ve satırlar yazılır.
5. **Açık faturalar** kilitlenerek çekilir:
   `status IN ('kesildi','kismi_odendi') AND clinic_id = p_clinic_id AND total > paid_amount`,
   sıralama `due_date ASC NULLS LAST, created_at ASC, id ASC` (deterministik), `FOR UPDATE`.
6. `remaining_base := total_base`. Her fatura için:
   - `inv_rate := COALESCE(invoices.rate_at_time, 1)`
   - `inv_remaining := invoices.total − invoices.paid_amount` (fatura para biriminde)
   - `take := LEAST(floor(remaining_base / inv_rate * 100) / 100, inv_remaining)`
     **`floor` şart, `round` değil.** `round` yukarı yuvarlayabilir; o zaman
     `take × inv_rate > remaining_base` olur, `allocated_base` `total_base`'i aşar ve
     `clinic_receipts_alloc_le_total` kısıtı patlar. `floor` ile tüketilen baz asla eldekini
     geçmez; artan kuruş alacakta kalır.
   - `take <= 0` ise atla (kalan, o faturanın para biriminde bir kuruşu bile karşılamıyor).
   - `payments` satırı: `invoice_id`, `amount = take`, `currency = invoices.currency`,
     `rate_at_time = inv_rate`, `amount_base = round(take × inv_rate, 2)`,
     `base_currency_at_time = baz`, `payment_date = p_receipt_date`,
     `payment_method = p_payment_method`, `receipt_id = fiş`.
   - `remaining_base := remaining_base − round(take × inv_rate, 2)`
     (**tüketilen bazı yeniden hesapla** — yoksa yuvarlama artığı alacağa sızar)
   - `remaining_base <= 0` ise döngüden çık.
7. `allocated_base := total_base − remaining_base`; fiş güncellenir.
8. Dönen değer: `{receipt_id, total_base, allocated_base, credit_base, allocations:[{invoice_id, invoice_no, amount, currency}]}`.

**Neden muhafızlara takılmıyor:** `amount` faturanın kendi para biriminde yazılıyor (kural 1
sağlanır) ve `inv_remaining` ile kırpılıyor (kural 2 sağlanır). Yuvarlama son kuruşta faturayı
aşamaz.

**Önizleme:** Aynı dağıtımı **yazmadan** hesaplayan `preview_clinic_receipt(p_clinic_id,
p_lines)` RPC'si; UI kaydetmeden önce bunu çağırır. Tek gerçek kaynak olsun diye dağıtım
mantığı ortak bir yardımcı fonksiyonda durur.

### 5.1 Alacağın elle uygulanması

`apply_clinic_credit(p_clinic_id, p_receipt_id DEFAULT NULL)` — aynı dağıtım yardımcısını
fişin `credit_base`'i üzerinde çalıştırır, `allocated_base`'i günceller. `p_receipt_id` boşsa
kliniğin alacaklı fişleri eskiden yeniye işlenir. Fatura kesme akışına **hiçbir trigger
eklenmez**.

---

## 6. Bakiye view'i

`v_clinic_balance`'a iki ekleme:

```sql
unallocated_credit  -- Σ (total_base − allocated_base) o klinik için
balance             -- mevcut hesap − unallocated_credit
```

Diğer sütunlar (aging, overdue, total_billed/paid) **değişmez**; alacak yalnız `balance`'tan
düşülür. `taslak`/`iptal` hariç tutma kuralı aynen korunur.

`v_clinic_balance_ccy` (para birimi kırılımlı) **değişmez** — alacak baz para biriminde
tutuluyor, kırılıma dağıtılamaz. Bu bilinçli bir sınır; ekranda alacak ayrı satır olarak
gösterilir.

> Canlı view tanımı `pg_get_viewdef` ile alınıp üzerine yazılacak; migration dosyasındaki
> sürüme güvenilmeyecek.

---

## 7. İstemci

### 7.1 API — `modules/invoices/api.ts`

- `recordClinicReceipt(params)` → RPC
- `previewClinicReceipt(clinicId, lines)` → RPC
- `applyClinicCredit(clinicId, receiptId?)` → RPC
- `fetchClinicReceipts(clinicId?)` → fiş listesi + satırları

### 7.2 Ortak pencere — `modules/invoices/components/ClinicReceiptModal.tsx`

- Klinik seçimi (klinik detayından açıldıysa kilitli), tarih, yöntem, referans, not
- **Para birimi satırları:** para birimi + tutar + kur → baz karşılığı; "satır ekle" / "sil"
- Kur alanı `get_currency_rate` ile dolu gelir, düzenlenebilir
- **Dağıtım önizlemesi:** hangi faturaya ne kadar, altta "kalan alacak"
- Kaydet (idempotency key ile çift gönderime kapalı)

### 7.3 Giriş noktaları

| Yer | Ne eklenecek |
|---|---|
| Finans hub → yeni "Tahsilatlar" sekmesi | Fiş listesi + "Yeni tahsilat" |
| `ClinicBalanceScreen` (cari hesap) satırı | "Tahsilat ekle" + alacağı olan klinikte "Alacağı uygula" |
| `InvoiceDetailScreen` | **Değişmez** |

Tasarım dili: beyaz hero, `SlideTabBar`, `PAGE_PADDING`, cam tooltip, koyu tema — CLAUDE.md
kuralları geçerli.

---

## 8. Kapsamdaki hata düzeltmesi

`bulk_record_payment` INSERT'ine `currency`, `rate_at_time`, `amount_base`,
`base_currency_at_time` eklenir (faturadan okunarak). Böylece yabancı para faturalarda toplu
tahsilat çalışır ve `amount_base` NULL kalmaz.

---

## 9. Kapsam dışı (bilerek)

- **Kasa entegrasyonu.** `cash_movements`'a otomatik kayıt bu işte YOK; bugün de hiçbir ödeme
  kasaya otomatik yazmıyor, o ayrı bir iş.
- **Klinik portalından faturasız bildirim onayı.** `approve_payment_submission` faturasız
  bildirimi hâlâ reddedecek; bu tasarım lab tarafını çözüyor.
- **Klinik ekstresi ile lab bakiyesi arasındaki kur farkı** (biri donmuş, diğeri güncel kur) —
  bilinen tutarsızlık, ayrı iş.
- `v_clinic_balance_ccy`'ye alacak dağıtımı.

---

## 10. Doğrulama planı

Migration uygulandıktan sonra, **canlı veriye dokunmadan** bir test kliniği üzerinde:

1. **Kullanıcının senaryosu:** 710 EUR açık borç kur; 800 USD + 600 TL fiş gir; faturaların
   `paid_amount`'ının ve `v_clinic_balance.balance`'ın beklenen değere gittiğini SQL ile
   doğrula.
2. **Muhafız testi:** tahsis yazılırken `payments_financial_guard`'ın hata fırlatmadığını;
   fazla ödeme denendiğinde fırladığını gör.
3. **Yuvarlama:** faturayı tam kapatan tahsilat sonrası `total − paid_amount = 0` (0.01 artık
   yok) ve `credit_base` sızıntısı yok.
4. **Alacak:** borçtan fazla tahsilatta `credit_base > 0`, `balance` buna göre düşük.
5. **Idempotency:** aynı anahtarla iki çağrı tek fiş üretir.
6. **`bulk_record_payment`:** EUR faturada artık hata vermiyor.
7. `npx tsc --noEmit` → 0 hata.

---

## 11. Riskler

| Risk | Azaltma |
|---|---|
| `v_clinic_balance` paylaşılan — birkaç ekranın rakamı değişir | Yalnız `balance` değişiyor, o da istenen yönde; değişiklik öncesi canlı tanım yedeklenir |
| Yuvarlama artığının alacağa sızması | Tüketilen baz, yazılan tutardan geri hesaplanır (5.6) |
| Eşzamanlı iki tahsilat aynı faturaya | Faturalar `FOR UPDATE` ile kilitlenir; muhafız da satırı kilitliyor |
| Yanlış kur girilmesi | Kur alanı dolu gelir; fişte saklandığı için sonradan denetlenebilir |
| Fişin silinmesi bakiyeyi bozar | `payments.receipt_id` `ON DELETE SET NULL`; fiş silme UI'da yok, iptal ayrı iş |
