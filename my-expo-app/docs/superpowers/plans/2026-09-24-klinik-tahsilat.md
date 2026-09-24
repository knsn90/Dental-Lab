# Klinik Toplu Tahsilatı — Uygulama Planı

> **Ajan çalışanlar için:** GEREKLİ ALT BECERİ: Bu planı görev görev uygulamak için
> `superpowers:subagent-driven-development` (önerilen) ya da `superpowers:executing-plans`
> kullanın. Adımlar takip için checkbox (`- [ ]`) biçimindedir.

**Hedef:** Klinikten tek seferde, faturaya bağlanmamış ve birden çok para biriminde tahsilat
alınabilsin; tutar en eski vadeli faturadan başlayarak otomatik dağılsın, artan klinikte alacak
olarak kalsın.

**Mimari:** Yeni `clinic_receipts` (fiş) + `clinic_receipt_lines` (para birimi başına satır).
Dağıtım, **faturanın kendi para biriminde ve kilitli kuruyla, kalanı aşmadan** sıradan bir
`payments` satırı yazar; böylece `invoices.paid_amount` → `v_clinic_balance` zinciri ve iki
ödeme muhafızı (`payments_financial_guard`) hiç değişmez. Artan tutar fişte durur ve bakiye
view'ine eklenen `unallocated_credit` sütunuyla bakiyeden düşülür.

**Teknoloji:** PostgreSQL (Supabase, PL/pgSQL, RLS) · TypeScript · React Native (Expo, web+native)

**Spec:** `docs/superpowers/specs/2026-09-24-klinik-tahsilat-design.md`

## Genel Kısıtlar

- **Deploy YOK.** Kullanıcı açıkça "deploy" demedikçe hiçbir şey yayınlanmaz.
- **Migration'ı çalıştırmadan önce kullanıcıya sor.** Canlı DB'ye yazan her adım onay ister.
- Her yeni Türkçe dize AYNI ANDA `core/i18n/locales/auto.{en,de,fa}.json` dosyalarına eklenir.
- Her yeni yüzey AYNI ANDA koyu tema farkındadır (`useMobileTokens` / `useInkUI`).
- Sayfa kenarı `PAGE_PADDING` (16). Çıplak sayı yasak.
- Yalnız HugeIcons, `core/ui/icons` üzerinden. Emoji yasak.
- İkon-butonlara `GlassTooltip`.
- `npx tsc --noEmit` → **0 hata** (deploy kararından önce temiz/tam çalıştırma).
- Para birimleri: `TRY, EUR, USD, GBP`. Baz: `lab_settings.default_currency`.
- Kur yönü: `amount_base = amount × rate` (1 birim currency'nin baz karşılığı).
- **Canlı view/fonksiyon tanımına güven, migration dosyasına değil** — değiştirmeden önce
  `pg_get_viewdef` / `pg_get_functiondef` ile oku.

## Test Yöntemi (bu repoda jest/vitest YOK)

İki tür doğrulama var:

1. **SQL doğrulama betiği.** `scratch/` altında bir `.sql` dosyası; tek bir `DO` bloğu deneme
   verisi oluşturur, iddiaları kontrol eder ve **sonunda `RAISE EXCEPTION` ile her şeyi geri
   alır** — canlı veriye hiçbir kalıcı yazma olmaz. Sonuç exception mesajında taşınır.
   Çalıştırma: `supabase db query --linked -f <mutlak yol>`.
   - "Test başarılı" = mesaj `ASSERT_OK:` ile başlıyor.
   - "Test başarısız" = mesaj `ASSERT_FAIL:` ile başlıyor ya da beklenmedik bir hata.
2. **`npx tsc --noEmit`** — istemci görevleri için.

Betikler `my-expo-app/scratch/` altında tutulur ve commit **edilmez** (`.gitignore`'a eklenir,
Görev 1 Adım 1).

## İnceleme Odağı

Spec'in ima ettiği ama hiçbir görevin doğal akışında denenmeyen, kullanıcıyı ısıracak beş girdi:

1. **Hiç açık fatura yokken tahsilat** — hepsi alacak olmalı, hata vermemeli. (Görev 2)
2. **Başka lab'ın kliniğine tahsilat** — yetki hatası fırlatmalı, veri yazılmamalı. (Görev 2)
3. **Geçersiz satır** (kur ≤ 0, tutar ≤ 0, boş dizi, tanınmayan para birimi) — reddedilmeli. (Görev 2)
4. **Faturanın `rate_at_time` NULL** — 1 kabul edilip dağıtım bozulmamalı. (Görev 2)
5. **Aynı idempotency anahtarıyla iki çağrı** — tek fiş, çift tahsis yok. (Görev 2)

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `supabase/migrations/20260924100000_clinic_receipts.sql` | İki yeni tablo, RLS, `payments.receipt_id` |
| `supabase/migrations/20260924100100_clinic_receipt_rpc.sql` | Dağıtım yardımcısı + `record_clinic_receipt` + `preview_clinic_receipt` |
| `supabase/migrations/20260924100200_apply_clinic_credit.sql` | `apply_clinic_credit` |
| `supabase/migrations/20260924100300_clinic_balance_credit.sql` | `v_clinic_balance` + `unallocated_credit` |
| `supabase/migrations/20260924100400_bulk_payment_currency_fix.sql` | `bulk_record_payment` para birimi hatası |
| `modules/invoices/api.ts` | İstemci API fonksiyonları (mevcut dosyaya eklenir) |
| `modules/invoices/components/ClinicReceiptModal.tsx` | Ortak tahsilat penceresi |
| `modules/invoices/screens/ClinicReceiptsScreen.tsx` | Finans sekmesi: fiş listesi |
| `modules/invoices/screens/ClinicBalanceScreen.tsx` | Giriş noktası + "Alacağı uygula" |
| `modules/finance/screens/FinanceHubScreen.tsx` | Yeni "Tahsilatlar" sekmesi kaydı |
| `core/i18n/locales/auto.{en,de,fa}.json` | Yeni dizeler |

---

## Görev 1: Tablolar, RLS ve `payments.receipt_id`

**Dosyalar:**
- Oluştur: `supabase/migrations/20260924100000_clinic_receipts.sql`
- Oluştur: `scratch/t1_schema.sql`
- Değiştir: `.gitignore` (scratch/ ekle)

**Arayüzler:**
- Üretir: `clinic_receipts(id, lab_id, clinic_id, receipt_date, payment_method, reference_no,
  notes, received_by, base_currency, total_base, allocated_base, idempotency_key,
  created_at, updated_at)`;
  `clinic_receipt_lines(id, receipt_id, currency, amount, rate, amount_base, created_at)`;
  `payments.receipt_id uuid NULL`.

- [ ] **Adım 1: `scratch/` dizinini git dışına al**

`.gitignore` sonuna ekle:

```
# Geçici SQL doğrulama betikleri (canlıya yazmaz, commit edilmez)
scratch/
```

- [ ] **Adım 2: Başarısız olan doğrulama betiğini yaz**

`scratch/t1_schema.sql`:

```sql
DO $$
DECLARE v_msg text := '';
BEGIN
  IF to_regclass('public.clinic_receipts') IS NULL THEN
    v_msg := v_msg || 'clinic_receipts tablosu yok; ';
  END IF;
  IF to_regclass('public.clinic_receipt_lines') IS NULL THEN
    v_msg := v_msg || 'clinic_receipt_lines tablosu yok; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='payments' AND column_name='receipt_id'
  ) THEN
    v_msg := v_msg || 'payments.receipt_id kolonu yok; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clinic_receipts'
  ) THEN
    v_msg := v_msg || 'clinic_receipts RLS politikası yok; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname='clinic_receipts' AND relrowsecurity
  ) THEN
    v_msg := v_msg || 'clinic_receipts RLS kapalı; ';
  END IF;

  IF v_msg = '' THEN
    RAISE EXCEPTION 'ASSERT_OK: şema hazır';
  ELSE
    RAISE EXCEPTION 'ASSERT_FAIL: %', v_msg;
  END IF;
END $$;
```

- [ ] **Adım 3: Betiği çalıştır, BAŞARISIZ olduğunu gör**

```bash
cd ~/Desktop/DentalSoftware/my-expo-app
supabase db query --linked -f "$PWD/scratch/t1_schema.sql"
```

Beklenen: `ASSERT_FAIL: clinic_receipts tablosu yok; ...`

- [ ] **Adım 4: Migration'ı yaz**

`supabase/migrations/20260924100000_clinic_receipts.sql`:

```sql
-- Klinik toplu tahsilatı — fiş + satır tabloları.
--
-- NEDEN: payments.invoice_id NOT NULL olduğu için faturaya bağlanmamış tahsilat
-- girilemiyordu; üstelik bir muhafız ödeme para birimini faturanınkine eşitliyor,
-- yani EUR faturaya USD ödeme DB seviyesinde reddediliyordu. Fiş, kasaya giren
-- GERÇEK parayı (800 USD + 600 TL) kendi para biriminde saklar; faturaya yazılan
-- tahsis ayrı bir payments satırıdır ve faturanın para biriminde olur.
--
-- Bakiye zinciri (payments -> trigger -> invoices.paid_amount -> v_clinic_balance)
-- ve ödeme muhafızları BİLEREK değiştirilmedi.

CREATE TABLE IF NOT EXISTS public.clinic_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  receipt_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  text NOT NULL DEFAULT 'nakit'
                  CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  reference_no    text,
  notes           text,
  received_by     uuid REFERENCES public.profiles(id),
  base_currency   text NOT NULL CHECK (base_currency IN ('TRY','EUR','USD','GBP')),
  total_base      numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_base >= 0),
  allocated_base  numeric(14,2) NOT NULL DEFAULT 0 CHECK (allocated_base >= 0),
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_receipts_alloc_le_total CHECK (allocated_base <= total_base)
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_receipts_idem_uq
  ON public.clinic_receipts (lab_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS clinic_receipts_clinic_idx
  ON public.clinic_receipts (clinic_id, receipt_date DESC);

CREATE TABLE IF NOT EXISTS public.clinic_receipt_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid NOT NULL REFERENCES public.clinic_receipts(id) ON DELETE CASCADE,
  currency    text NOT NULL CHECK (currency IN ('TRY','EUR','USD','GBP')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  rate        numeric(18,6) NOT NULL CHECK (rate > 0),
  amount_base numeric(14,2) NOT NULL CHECK (amount_base > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_receipt_lines_receipt_idx
  ON public.clinic_receipt_lines (receipt_id);

-- Tahsisin hangi fişten geldiği. Fatura içi mevcut tahsilat akışında BOŞ kalır.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_id uuid
  REFERENCES public.clinic_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_receipt_idx
  ON public.payments (receipt_id) WHERE receipt_id IS NOT NULL;

-- lab_id'yi payments'taki kalıpla doldur (doğrudan INSERT'ler için emniyet).
DROP TRIGGER IF EXISTS auto_set_lab_id_clinic_receipts ON public.clinic_receipts;
CREATE TRIGGER auto_set_lab_id_clinic_receipts
  BEFORE INSERT ON public.clinic_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_lab_id();

ALTER TABLE public.clinic_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_receipt_lines ENABLE ROW LEVEL SECURITY;

-- payments politikalarıyla birebir aynı kalıp.
DROP POLICY IF EXISTS clinic_receipts_lab_select ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_select ON public.clinic_receipts
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS clinic_receipts_lab_insert ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_insert ON public.clinic_receipts
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipts_lab_update ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_update ON public.clinic_receipts
  FOR UPDATE USING (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipts_lab_delete ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_delete ON public.clinic_receipts
  FOR DELETE USING (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipt_lines_lab_all ON public.clinic_receipt_lines;
CREATE POLICY clinic_receipt_lines_lab_all ON public.clinic_receipt_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.clinic_receipts r
             WHERE r.id = clinic_receipt_lines.receipt_id
               AND r.lab_id = get_my_lab_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.clinic_receipts r
             WHERE r.id = clinic_receipt_lines.receipt_id
               AND r.lab_id = get_my_lab_id())
  );
```

- [ ] **Adım 5: Kullanıcıdan onay al, migration'ı uygula**

Canlı DB'ye yazıyor — önce kullanıcıya ne yapacağını söyle ve onay al. Onay gelince:

```bash
cd ~/Desktop/DentalSoftware/my-expo-app
supabase db query --linked -f "$PWD/supabase/migrations/20260924100000_clinic_receipts.sql"
```

- [ ] **Adım 6: Doğrulama betiğini tekrar çalıştır, GEÇTİĞİNİ gör**

```bash
supabase db query --linked -f "$PWD/scratch/t1_schema.sql"
```

Beklenen: `ASSERT_OK: şema hazır`

- [ ] **Adım 7: Commit**

```bash
git add .gitignore supabase/migrations/20260924100000_clinic_receipts.sql
git commit -m "feat(finans): klinik tahsilat fişi tabloları + payments.receipt_id"
```

---

## Görev 2: Dağıtım yardımcısı + `record_clinic_receipt` + `preview_clinic_receipt`

**Dosyalar:**
- Oluştur: `supabase/migrations/20260924100100_clinic_receipt_rpc.sql`
- Oluştur: `scratch/t2_alloc.sql`

**Arayüzler:**
- Tüketir: Görev 1'in tabloları.
- Üretir:
  - `alloc_receipt_to_invoices(p_receipt_id uuid, p_clinic_id uuid, p_base numeric,
    p_base_ccy text, p_date date, p_method text) RETURNS numeric` (tüketilen bazı döner)
  - `record_clinic_receipt(p_clinic_id uuid, p_lines jsonb, p_receipt_date date,
    p_payment_method text, p_reference_no text, p_notes text, p_idempotency_key text)
    RETURNS jsonb` → `{receipt_id, total_base, allocated_base, credit_base, allocations:[...]}`
  - `preview_clinic_receipt(p_clinic_id uuid, p_lines jsonb) RETURNS jsonb`
    → `{total_base, allocated_base, credit_base, allocations:[{invoice_id, invoice_no, amount, currency}]}`

- [ ] **Adım 1: Başarısız doğrulama betiğini yaz**

`scratch/t2_alloc.sql` — kullanıcının senaryosu + İnceleme Odağı'ndaki beş girdi. Tüm deneme
verisi sonunda exception ile geri alınır.

```sql
DO $$
DECLARE
  v_lab     uuid;
  v_clinic  uuid;
  v_clinic2 uuid;
  v_inv1    uuid;
  v_inv2    uuid;
  v_res     jsonb;
  v_msg     text := '';
  v_bal     numeric;
  v_err     text;
BEGIN
  -- ── Deneme verisi (sonunda geri alınacak) ────────────────────────────
  SELECT id INTO v_lab FROM labs ORDER BY created_at LIMIT 1;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'ASSERT_FAIL: lab yok'; END IF;

  INSERT INTO clinics (name, lab_id, is_active)
    VALUES ('ZZ_TEST_TAHSILAT', v_lab, true) RETURNING id INTO v_clinic;
  INSERT INTO clinics (name, lab_id, is_active)
    VALUES ('ZZ_TEST_BASKA_LAB', gen_random_uuid(), true) RETURNING id INTO v_clinic2;

  -- 710 EUR borç: iki fatura (400 + 310), kur 1 EUR = 40 TRY, baz TRY
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, due_date, invoice_no)
    VALUES (v_clinic, v_lab, 400, 0, 'kesildi', 'EUR', 40, CURRENT_DATE - 30, 'ZZ-T-1')
    RETURNING id INTO v_inv1;
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, NULL::date, invoice_no)
    VALUES (v_clinic, v_lab, 310, 0, 'kesildi', 'EUR', 40, NULL, 'ZZ-T-2')
    RETURNING id INTO v_inv2;

  -- ── 1) Kullanıcının senaryosu: 800 USD (@34) + 600 TL (@1) = 27800 TRY ──
  -- 710 EUR borç = 28400 TRY. Yani hepsi tahsis edilmeli, alacak 0 kalmalı.
  v_res := record_clinic_receipt(
    v_clinic,
    '[{"currency":"USD","amount":800,"rate":34},{"currency":"TRY","amount":600,"rate":1}]'::jsonb,
    CURRENT_DATE, 'nakit', NULL, NULL, NULL);

  IF (v_res->>'total_base')::numeric <> 27800 THEN
    v_msg := v_msg || format('total_base 27800 bekleniyordu, %s geldi; ', v_res->>'total_base');
  END IF;
  IF (v_res->>'credit_base')::numeric <> 0 THEN
    v_msg := v_msg || format('credit_base 0 bekleniyordu, %s geldi; ', v_res->>'credit_base');
  END IF;
  -- En eski vadeli (ZZ-T-1) önce ve TAM kapanmalı: 400 EUR
  SELECT paid_amount INTO v_bal FROM invoices WHERE id = v_inv1;
  IF v_bal <> 400 THEN
    v_msg := v_msg || format('inv1 paid_amount 400 bekleniyordu, %s geldi; ', v_bal);
  END IF;
  -- Kalan 27800-16000=11800 TRY -> 295 EUR
  SELECT paid_amount INTO v_bal FROM invoices WHERE id = v_inv2;
  IF v_bal <> 295 THEN
    v_msg := v_msg || format('inv2 paid_amount 295 bekleniyordu, %s geldi; ', v_bal);
  END IF;
  -- Tahsis faturanın para biriminde yazılmış olmalı
  IF EXISTS (SELECT 1 FROM payments p JOIN invoices i ON i.id=p.invoice_id
              WHERE p.receipt_id = (v_res->>'receipt_id')::uuid
                AND p.currency <> i.currency) THEN
    v_msg := v_msg || 'tahsis para birimi faturanınkinden farklı; ';
  END IF;

  -- ── 2) Hiç açık fatura yokken: hepsi alacak ────────────────────────
  UPDATE invoices SET status='iptal' WHERE id IN (v_inv1, v_inv2);
  v_res := record_clinic_receipt(
    v_clinic, '[{"currency":"TRY","amount":100,"rate":1}]'::jsonb,
    CURRENT_DATE, 'nakit', NULL, NULL, NULL);
  IF (v_res->>'credit_base')::numeric <> 100 THEN
    v_msg := v_msg || format('açık fatura yokken credit_base 100 bekleniyordu, %s; ',
                             v_res->>'credit_base');
  END IF;

  -- ── 3) Geçersiz satırlar reddedilmeli ──────────────────────────────
  BEGIN
    PERFORM record_clinic_receipt(v_clinic, '[]'::jsonb,
            CURRENT_DATE, 'nakit', NULL, NULL, NULL);
    v_msg := v_msg || 'boş satır dizisi reddedilmedi; ';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    PERFORM record_clinic_receipt(v_clinic,
            '[{"currency":"TRY","amount":100,"rate":0}]'::jsonb,
            CURRENT_DATE, 'nakit', NULL, NULL, NULL);
    v_msg := v_msg || 'kur 0 reddedilmedi; ';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    PERFORM record_clinic_receipt(v_clinic,
            '[{"currency":"XXX","amount":100,"rate":1}]'::jsonb,
            CURRENT_DATE, 'nakit', NULL, NULL, NULL);
    v_msg := v_msg || 'tanınmayan para birimi reddedilmedi; ';
  EXCEPTION WHEN others THEN NULL; END;

  -- ── 4) rate_at_time NULL olan fatura: 1 kabul edilmeli ─────────────
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, due_date, invoice_no)
    VALUES (v_clinic, v_lab, 50, 0, 'kesildi', 'TRY', NULL, CURRENT_DATE, 'ZZ-T-3')
    RETURNING id INTO v_inv1;
  v_res := record_clinic_receipt(
    v_clinic, '[{"currency":"TRY","amount":50,"rate":1}]'::jsonb,
    CURRENT_DATE, 'nakit', NULL, NULL, NULL);
  SELECT paid_amount INTO v_bal FROM invoices WHERE id = v_inv1;
  IF v_bal <> 50 THEN
    v_msg := v_msg || format('rate NULL faturada paid_amount 50 bekleniyordu, %s; ', v_bal);
  END IF;

  -- ── 5) Idempotency: aynı anahtar iki kez -> tek fiş ────────────────
  PERFORM record_clinic_receipt(v_clinic, '[{"currency":"TRY","amount":10,"rate":1}]'::jsonb,
          CURRENT_DATE, 'nakit', NULL, NULL, 'ZZ-IDEM-1');
  PERFORM record_clinic_receipt(v_clinic, '[{"currency":"TRY","amount":10,"rate":1}]'::jsonb,
          CURRENT_DATE, 'nakit', NULL, NULL, 'ZZ-IDEM-1');
  IF (SELECT count(*) FROM clinic_receipts
       WHERE clinic_id = v_clinic AND idempotency_key = 'ZZ-IDEM-1') <> 1 THEN
    v_msg := v_msg || 'idempotency anahtarı iki fiş üretti; ';
  END IF;

  -- ── 6) Başka lab'ın kliniği reddedilmeli ───────────────────────────
  BEGIN
    PERFORM record_clinic_receipt(v_clinic2,
            '[{"currency":"TRY","amount":10,"rate":1}]'::jsonb,
            CURRENT_DATE, 'nakit', NULL, NULL, NULL);
    v_msg := v_msg || 'başka lab kliniği reddedilmedi; ';
  EXCEPTION WHEN others THEN NULL; END;

  -- ── 7) preview yazmamalı ───────────────────────────────────────────
  DECLARE v_cnt_before int; v_cnt_after int;
  BEGIN
    SELECT count(*) INTO v_cnt_before FROM clinic_receipts WHERE clinic_id = v_clinic;
    PERFORM preview_clinic_receipt(v_clinic, '[{"currency":"TRY","amount":5,"rate":1}]'::jsonb);
    SELECT count(*) INTO v_cnt_after FROM clinic_receipts WHERE clinic_id = v_clinic;
    IF v_cnt_after <> v_cnt_before THEN v_msg := v_msg || 'preview fiş yazdı; '; END IF;
  END;

  -- ── 8) Fazla ödeme muhafızı hâlâ çalışıyor mu ──────────────────────
  -- Dağıtımın muhafıza takılmaması, muhafızın KAPANDIĞI anlamına gelmemeli.
  DECLARE v_inv3 uuid;
  BEGIN
    INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                          rate_at_time, due_date, invoice_no)
      VALUES (v_clinic, v_lab, 100, 0, 'kesildi', 'TRY', 1, CURRENT_DATE, 'ZZ-T-4')
      RETURNING id INTO v_inv3;
    BEGIN
      INSERT INTO payments (invoice_id, amount, payment_date, payment_method, currency)
      VALUES (v_inv3, 150, CURRENT_DATE, 'nakit', 'TRY');
      v_msg := v_msg || 'fazla ödeme muhafızı devre dışı kalmış; ';
    EXCEPTION WHEN others THEN NULL; END;
  END;

  -- ── 9) Yuvarlama: küsuratlı kurda fatura TAM kapanmalı, kuruş artığı olmamalı ──
  DECLARE v_inv4 uuid; v_rem numeric;
  BEGIN
    -- 100 EUR fatura, kur 41.37 -> baz karşılığı 4137.00
    INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                          rate_at_time, due_date, invoice_no)
      VALUES (v_clinic, v_lab, 100, 0, 'kesildi', 'EUR', 41.37, CURRENT_DATE, 'ZZ-T-5')
      RETURNING id INTO v_inv4;
    PERFORM record_clinic_receipt(v_clinic,
            '[{"currency":"TRY","amount":4137,"rate":1}]'::jsonb,
            CURRENT_DATE, 'nakit', NULL, NULL, NULL);
    SELECT total - paid_amount INTO v_rem FROM invoices WHERE id = v_inv4;
    IF v_rem <> 0 THEN
      v_msg := v_msg || format('küsuratlı kurda fatura kapanmadı, kalan %s; ', v_rem);
    END IF;
  END;

  IF v_msg = '' THEN
    RAISE EXCEPTION 'ASSERT_OK: dağıtım doğru';
  ELSE
    RAISE EXCEPTION 'ASSERT_FAIL: %', v_msg;
  END IF;
END $$;
```

- [ ] **Adım 2: Betiği çalıştır, BAŞARISIZ olduğunu gör**

```bash
supabase db query --linked -f "$PWD/scratch/t2_alloc.sql"
```

Beklenen: `record_clinic_receipt` fonksiyonu bulunamadı hatası.

- [ ] **Adım 3: Migration'ı yaz**

`supabase/migrations/20260924100100_clinic_receipt_rpc.sql`:

```sql
-- Klinik tahsilat fişinin faturalara dağıtımı.
--
-- Tahsis, faturanın KENDİ para biriminde ve KİLİTLİ kuruyla yazılır; tutar
-- faturanın kalanını asla aşmaz. Böylece payments_financial_guard'ın iki kuralı
-- (para birimi eşitliği + fazla ödeme yasağı) kendiliğinden sağlanır ve
-- muhafıza dokunmak gerekmez.
--
-- floor() ŞART: round() yukarı yuvarlayıp elimizdeki bazdan fazlasını tahsis
-- edebilir, o zaman clinic_receipts_alloc_le_total kısıtı patlar.

CREATE OR REPLACE FUNCTION public.alloc_receipt_to_invoices(
  p_receipt_id uuid,
  p_clinic_id  uuid,
  p_base       numeric,
  p_base_ccy   text,
  p_date       date,
  p_method     text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rem  numeric := p_base;
  v_inv  RECORD;
  v_take numeric;
  v_used numeric;
BEGIN
  FOR v_inv IN
    SELECT id, currency, total, paid_amount, COALESCE(rate_at_time, 1) AS rate
      FROM invoices
     WHERE clinic_id = p_clinic_id
       AND status IN ('kesildi','kismi_odendi')
       AND total > paid_amount
     ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_rem <= 0;
    v_take := LEAST(floor(v_rem / v_inv.rate * 100) / 100,
                    v_inv.total - v_inv.paid_amount);
    CONTINUE WHEN v_take <= 0;
    v_used := round(v_take * v_inv.rate, 2);
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method,
                          currency, rate_at_time, amount_base, base_currency_at_time,
                          receipt_id, received_by)
    VALUES (v_inv.id, v_take, p_date, p_method,
            v_inv.currency, v_inv.rate, v_used, p_base_ccy,
            p_receipt_id, auth.uid());
    v_rem := v_rem - v_used;
  END LOOP;
  RETURN p_base - v_rem;
END $$;

-- Satır doğrulama + baz toplamı. record ve preview ortak kullanır.
CREATE OR REPLACE FUNCTION public.receipt_lines_total_base(p_lines jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v_l jsonb; v_sum numeric := 0; v_amt numeric; v_rate numeric; v_ccy text;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'En az bir tahsilat satırı gerekli';
  END IF;
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ccy  := v_l->>'currency';
    v_amt  := (v_l->>'amount')::numeric;
    v_rate := (v_l->>'rate')::numeric;
    IF v_ccy IS NULL OR v_ccy NOT IN ('TRY','EUR','USD','GBP') THEN
      RAISE EXCEPTION 'Geçersiz para birimi: %', COALESCE(v_ccy, 'NULL');
    END IF;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'Tutar sıfırdan büyük olmalı';
    END IF;
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'Kur sıfırdan büyük olmalı';
    END IF;
    v_sum := v_sum + round(v_amt * v_rate, 2);
  END LOOP;
  RETURN v_sum;
END $$;

CREATE OR REPLACE FUNCTION public.record_clinic_receipt(
  p_clinic_id       uuid,
  p_lines           jsonb,
  p_receipt_date    date    DEFAULT CURRENT_DATE,
  p_payment_method  text    DEFAULT 'nakit',
  p_reference_no    text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab       uuid;
  v_base_ccy  text;
  v_total     numeric;
  v_receipt   uuid;
  v_alloc     numeric;
  v_l         jsonb;
  v_existing  uuid;
  v_res_dup   jsonb;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Tekrar çağrıda da AYNI şekli döndür (receipt_id/total_base/allocated_base/
  -- credit_base/allocations). İstemci tek bir tip bekliyor; farklı şekil dönmek
  -- çift tıklamada arayüzü bozardı.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM clinic_receipts
     WHERE lab_id = v_lab AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      SELECT jsonb_build_object(
               'receipt_id',     r.id,
               'total_base',     r.total_base,
               'allocated_base', r.allocated_base,
               'credit_base',    r.total_base - r.allocated_base,
               'duplicate',      true,
               'allocations', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'invoice_id', p.invoice_id,
                          'invoice_no', i.invoice_no,
                          'amount',     p.amount,
                          'currency',   p.currency))
                   FROM payments p JOIN invoices i ON i.id = p.invoice_id
                  WHERE p.receipt_id = r.id), '[]'::jsonb))
        INTO v_res_dup
        FROM clinic_receipts r WHERE r.id = v_existing;
      RETURN v_res_dup;
    END IF;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  v_total := receipt_lines_total_base(p_lines);

  INSERT INTO clinic_receipts (lab_id, clinic_id, receipt_date, payment_method,
                               reference_no, notes, received_by, base_currency,
                               total_base, allocated_base, idempotency_key)
  VALUES (v_lab, p_clinic_id, p_receipt_date, p_payment_method,
          p_reference_no, p_notes, auth.uid(), v_base_ccy,
          v_total, 0, p_idempotency_key)
  RETURNING id INTO v_receipt;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
    VALUES (v_receipt, v_l->>'currency', (v_l->>'amount')::numeric,
            (v_l->>'rate')::numeric,
            round((v_l->>'amount')::numeric * (v_l->>'rate')::numeric, 2));
  END LOOP;

  v_alloc := alloc_receipt_to_invoices(v_receipt, p_clinic_id, v_total,
                                       v_base_ccy, p_receipt_date, p_payment_method);

  UPDATE clinic_receipts
     SET allocated_base = v_alloc, updated_at = now()
   WHERE id = v_receipt;

  RETURN jsonb_build_object(
    'receipt_id',     v_receipt,
    'total_base',     v_total,
    'allocated_base', v_alloc,
    'credit_base',    v_total - v_alloc,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'invoice_id', p.invoice_id,
               'invoice_no', i.invoice_no,
               'amount',     p.amount,
               'currency',   p.currency))
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.receipt_id = v_receipt), '[]'::jsonb)
  );
END $$;

-- Yazmadan dağıtım önizlemesi. UI kaydetmeden önce bunu çağırır.
CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(
  p_clinic_id uuid,
  p_lines     jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab   uuid;
  v_total numeric;
  v_rem   numeric;
  v_inv   RECORD;
  v_take  numeric;
  v_rows  jsonb := '[]'::jsonb;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  v_total := receipt_lines_total_base(p_lines);
  v_rem   := v_total;

  FOR v_inv IN
    SELECT id, invoice_no, currency, total, paid_amount,
           COALESCE(rate_at_time, 1) AS rate
      FROM invoices
     WHERE clinic_id = p_clinic_id
       AND status IN ('kesildi','kismi_odendi')
       AND total > paid_amount
     ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC
  LOOP
    EXIT WHEN v_rem <= 0;
    v_take := LEAST(floor(v_rem / v_inv.rate * 100) / 100,
                    v_inv.total - v_inv.paid_amount);
    CONTINUE WHEN v_take <= 0;
    v_rows := v_rows || jsonb_build_object(
      'invoice_id', v_inv.id, 'invoice_no', v_inv.invoice_no,
      'amount', v_take, 'currency', v_inv.currency);
    v_rem := v_rem - round(v_take * v_inv.rate, 2);
  END LOOP;

  RETURN jsonb_build_object(
    'total_base', v_total,
    'allocated_base', v_total - v_rem,
    'credit_base', v_rem,
    'allocations', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.record_clinic_receipt(uuid, jsonb, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_clinic_receipt(uuid, jsonb) TO authenticated;
```

- [ ] **Adım 4: Onay al, migration'ı uygula**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260924100100_clinic_receipt_rpc.sql"
```

- [ ] **Adım 5: Doğrulama betiğini çalıştır, GEÇTİĞİNİ gör**

```bash
supabase db query --linked -f "$PWD/scratch/t2_alloc.sql"
```

Beklenen: `ASSERT_OK: dağıtım doğru`. `ASSERT_FAIL` gelirse mesajdaki maddeyi düzelt ve tekrar
çalıştır — deneme verisi her çalıştırmada geri alındığı için tekrar güvenli.

- [ ] **Adım 6: Commit**

```bash
git add supabase/migrations/20260924100100_clinic_receipt_rpc.sql
git commit -m "feat(finans): tahsilat dağıtım RPC'leri (record + preview)"
```

---

## Görev 3: `apply_clinic_credit`

**Dosyalar:**
- Oluştur: `supabase/migrations/20260924100200_apply_clinic_credit.sql`
- Oluştur: `scratch/t3_credit.sql`

**Arayüzler:**
- Tüketir: `alloc_receipt_to_invoices(...)` (Görev 2).
- Üretir: `apply_clinic_credit(p_clinic_id uuid, p_receipt_id uuid DEFAULT NULL) RETURNS jsonb`
  → `{applied_base, receipts_touched}`

- [ ] **Adım 1: Başarısız doğrulama betiğini yaz**

`scratch/t3_credit.sql`:

```sql
DO $$
DECLARE
  v_lab uuid; v_clinic uuid; v_inv uuid; v_res jsonb; v_msg text := '';
  v_credit numeric; v_paid numeric;
BEGIN
  SELECT id INTO v_lab FROM labs ORDER BY created_at LIMIT 1;
  INSERT INTO clinics (name, lab_id, is_active)
    VALUES ('ZZ_TEST_KREDI', v_lab, true) RETURNING id INTO v_clinic;

  -- Açık fatura yokken 500 TRY tahsilat -> tamamı alacak
  PERFORM record_clinic_receipt(v_clinic, '[{"currency":"TRY","amount":500,"rate":1}]'::jsonb,
          CURRENT_DATE, 'nakit', NULL, NULL, NULL);
  SELECT SUM(total_base - allocated_base) INTO v_credit
    FROM clinic_receipts WHERE clinic_id = v_clinic;
  IF v_credit <> 500 THEN
    v_msg := v_msg || format('alacak 500 bekleniyordu, %s; ', v_credit);
  END IF;

  -- Sonra 200 TRY'lik fatura kesiliyor; OTOMATİK uygulanmamalı
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, due_date, invoice_no)
    VALUES (v_clinic, v_lab, 200, 0, 'kesildi', 'TRY', 1, CURRENT_DATE, 'ZZ-K-1')
    RETURNING id INTO v_inv;
  SELECT paid_amount INTO v_paid FROM invoices WHERE id = v_inv;
  IF v_paid <> 0 THEN
    v_msg := v_msg || 'alacak fatura kesilince OTOMATİK uygulandı (olmamalıydı); ';
  END IF;

  -- Elle uygula -> fatura kapanmalı, alacak 300'e inmeli
  v_res := apply_clinic_credit(v_clinic, NULL);
  SELECT paid_amount INTO v_paid FROM invoices WHERE id = v_inv;
  IF v_paid <> 200 THEN
    v_msg := v_msg || format('uygulamadan sonra paid_amount 200 bekleniyordu, %s; ', v_paid);
  END IF;
  SELECT SUM(total_base - allocated_base) INTO v_credit
    FROM clinic_receipts WHERE clinic_id = v_clinic;
  IF v_credit <> 300 THEN
    v_msg := v_msg || format('kalan alacak 300 bekleniyordu, %s; ', v_credit);
  END IF;
  IF (v_res->>'applied_base')::numeric <> 200 THEN
    v_msg := v_msg || format('applied_base 200 bekleniyordu, %s; ', v_res->>'applied_base');
  END IF;

  -- Uygulanacak açık fatura kalmayınca ikinci çağrı 0 dönmeli, hata vermemeli
  v_res := apply_clinic_credit(v_clinic, NULL);
  IF (v_res->>'applied_base')::numeric <> 0 THEN
    v_msg := v_msg || 'boşta ikinci çağrı 0 dönmedi; ';
  END IF;

  IF v_msg = '' THEN RAISE EXCEPTION 'ASSERT_OK: alacak uygulaması doğru';
  ELSE RAISE EXCEPTION 'ASSERT_FAIL: %', v_msg; END IF;
END $$;
```

- [ ] **Adım 2: Betiği çalıştır, BAŞARISIZ olduğunu gör**

```bash
supabase db query --linked -f "$PWD/scratch/t3_credit.sql"
```

Beklenen: `apply_clinic_credit` fonksiyonu bulunamadı.

- [ ] **Adım 3: Migration'ı yaz**

`supabase/migrations/20260924100200_apply_clinic_credit.sql`:

```sql
-- Klinikte duran kullanılmamış alacağı açık faturalara uygular.
--
-- BİLEREK ELLE: fatura kesme akışına trigger takılmadı. Bakiye zaten alacağı
-- düştüğü için rakam iki türlü de aynı; otomatik uygulama fatura kesmeye
-- görünmez bir yan etki ekler.

CREATE OR REPLACE FUNCTION public.apply_clinic_credit(
  p_clinic_id  uuid,
  p_receipt_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab     uuid;
  v_r       RECORD;
  v_credit  numeric;
  v_applied numeric;
  v_total   numeric := 0;
  v_count   int := 0;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  FOR v_r IN
    SELECT id, receipt_date, payment_method, base_currency,
           total_base - allocated_base AS credit
      FROM clinic_receipts
     WHERE clinic_id = p_clinic_id
       AND total_base > allocated_base
       AND (p_receipt_id IS NULL OR id = p_receipt_id)
     ORDER BY receipt_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    v_credit := v_r.credit;
    CONTINUE WHEN v_credit <= 0;
    v_applied := alloc_receipt_to_invoices(v_r.id, p_clinic_id, v_credit,
                                           v_r.base_currency, CURRENT_DATE,
                                           v_r.payment_method);
    IF v_applied > 0 THEN
      UPDATE clinic_receipts
         SET allocated_base = allocated_base + v_applied, updated_at = now()
       WHERE id = v_r.id;
      v_total := v_total + v_applied;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied_base', v_total, 'receipts_touched', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.apply_clinic_credit(uuid, uuid) TO authenticated;
```

- [ ] **Adım 4: Onay al, uygula, doğrulama betiğini çalıştır**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260924100200_apply_clinic_credit.sql"
supabase db query --linked -f "$PWD/scratch/t3_credit.sql"
```

Beklenen: `ASSERT_OK: alacak uygulaması doğru`

- [ ] **Adım 5: Commit**

```bash
git add supabase/migrations/20260924100200_apply_clinic_credit.sql
git commit -m "feat(finans): kullanılmamış alacağı faturalara uygula"
```

---

## Görev 4: Bakiye view'ine `unallocated_credit`

**Dosyalar:**
- Oluştur: `supabase/migrations/20260924100300_clinic_balance_credit.sql`
- Oluştur: `scratch/t4_balance.sql`

**Arayüzler:**
- Üretir: `v_clinic_balance.unallocated_credit numeric`; `v_clinic_balance.balance` artık
  alacağı düşer.

- [ ] **Adım 1: Canlı view tanımını YEDEKLE**

Migration dosyasına güvenme. Çalıştır ve çıktıyı `scratch/v_clinic_balance_before.sql`
dosyasına kaydet:

```bash
cd ~/Desktop/DentalSoftware/my-expo-app
cat > scratch/dump_view.sql <<'SQL'
select pg_get_viewdef('public.v_clinic_balance'::regclass, true) as def;
SQL
supabase db query --linked -f "$PWD/scratch/dump_view.sql" > scratch/v_clinic_balance_before.json
```

Bu dosya geri alma için gerekli — silme.

- [ ] **Adım 2: Başarısız doğrulama betiğini yaz**

`scratch/t4_balance.sql`:

```sql
DO $$
DECLARE
  v_lab uuid; v_clinic uuid; v_msg text := ''; v_bal numeric; v_cred numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='v_clinic_balance'
       AND column_name='unallocated_credit'
  ) THEN
    RAISE EXCEPTION 'ASSERT_FAIL: unallocated_credit sütunu yok';
  END IF;

  SELECT id INTO v_lab FROM labs ORDER BY created_at LIMIT 1;
  INSERT INTO clinics (name, lab_id, is_active)
    VALUES ('ZZ_TEST_BAKIYE', v_lab, true) RETURNING id INTO v_clinic;

  -- 300 TRY borç
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, due_date, invoice_no)
    VALUES (v_clinic, v_lab, 300, 0, 'kesildi', 'TRY', 1, CURRENT_DATE, 'ZZ-B-1');
  -- 500 TRY tahsilat -> 300 tahsis, 200 alacak
  PERFORM record_clinic_receipt(v_clinic, '[{"currency":"TRY","amount":500,"rate":1}]'::jsonb,
          CURRENT_DATE, 'nakit', NULL, NULL, NULL);

  SELECT balance, unallocated_credit INTO v_bal, v_cred
    FROM v_clinic_balance WHERE clinic_id = v_clinic;

  IF v_cred <> 200 THEN
    v_msg := v_msg || format('unallocated_credit 200 bekleniyordu, %s; ', v_cred);
  END IF;
  IF v_bal <> -200 THEN
    v_msg := v_msg || format('balance -200 bekleniyordu, %s; ', v_bal);
  END IF;

  IF v_msg = '' THEN RAISE EXCEPTION 'ASSERT_OK: bakiye alacağı düşüyor';
  ELSE RAISE EXCEPTION 'ASSERT_FAIL: %', v_msg; END IF;
END $$;
```

- [ ] **Adım 3: Betiği çalıştır, BAŞARISIZ olduğunu gör**

Beklenen: `ASSERT_FAIL: unallocated_credit sütunu yok`

- [ ] **Adım 4: Migration'ı yaz**

Adım 1'de yedeklediğin canlı tanımı temel al. Değişiklik yalnız iki yerde: yeni
`unallocated_credit` sütunu ve `balance`'tan çıkarılması. Diğer tüm sütunlar
(`total_billed`, `total_paid`, aging, `overdue_amount`, `oldest_overdue_date`,
`currency`, `*_original`) **aynen korunur**.

`supabase/migrations/20260924100300_clinic_balance_credit.sql`:

```sql
-- v_clinic_balance: kullanılmamış tahsilat alacağını bakiyeden düş.
--
-- Alacak baz para biriminde tutulur; v_clinic_balance_ccy (para birimi kırılımı)
-- BİLEREK değiştirilmedi — alacak kırılıma dağıtılamaz, ekranda ayrı gösterilir.
--
-- DİKKAT: aşağıdaki gövde, uygulama anındaki CANLI tanımdan türetilmiştir
-- (scratch/v_clinic_balance_before.json). Yeniden yazmadan önce canlıyı tekrar oku.

CREATE OR REPLACE VIEW public.v_clinic_balance
WITH (security_invoker = true) AS
SELECT
  c.id   AS clinic_id,
  c.name AS clinic_name,
  i.lab_id,
  count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal','taslak'])) AS invoice_count,
  COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1)))
           FILTER (WHERE i.status <> ALL (ARRAY['iptal','taslak'])), 0) AS total_billed,
  COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1))
           FILTER (WHERE i.status <> ALL (ARRAY['iptal','taslak'])), 0) AS total_paid,
  COALESCE(cr.credit, 0) AS unallocated_credit,
  COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1))
           FILTER (WHERE i.status <> ALL (ARRAY['iptal','taslak'])), 0)
    - COALESCE(cr.credit, 0) AS balance
  /* … canlı tanımdaki aging_current / aging_30 / aging_60 / aging_90 /
       overdue_amount / oldest_overdue_date / currency / total_billed_original /
       total_paid_original / balance_original sütunları BURAYA AYNEN kopyalanır … */
FROM clinics c
LEFT JOIN invoices i ON i.clinic_id = c.id
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(r.total_base - r.allocated_base), 0) AS credit
    FROM clinic_receipts r
   WHERE r.clinic_id = c.id
) cr ON true
GROUP BY c.id, c.name, i.lab_id, cr.credit;
```

> Uygulayan kişiye not: yukarıdaki gövdedeki `/* … */` yorumu, canlı tanımdan aynen
> taşınacak sütunların yerini gösterir. Migration'ı yazarken **o yorumu kaldır** ve
> `scratch/v_clinic_balance_before.json` içindeki sütun ifadelerini olduğu gibi yapıştır.
> Eksik sütun bırakmak `ClinicBalanceScreen`'i bozar.

- [ ] **Adım 5: Onay al, uygula, doğrulama betiğini çalıştır**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260924100300_clinic_balance_credit.sql"
supabase db query --linked -f "$PWD/scratch/t4_balance.sql"
```

Beklenen: `ASSERT_OK: bakiye alacağı düşüyor`

- [ ] **Adım 6: Eski sütunların kaybolmadığını doğrula**

```bash
cat > scratch/t4_cols.sql <<'SQL'
DO $$
DECLARE v_missing text := '';
BEGIN
  FOREACH v_missing IN ARRAY ARRAY['aging_current','aging_30','aging_60','aging_90',
                                   'overdue_amount','oldest_overdue_date','currency',
                                   'total_billed_original','total_paid_original',
                                   'balance_original']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='v_clinic_balance'
                      AND column_name = v_missing) THEN
      RAISE EXCEPTION 'ASSERT_FAIL: % sütunu kayboldu', v_missing;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'ASSERT_OK: tüm eski sütunlar yerinde';
END $$;
SQL
supabase db query --linked -f "$PWD/scratch/t4_cols.sql"
```

Beklenen: `ASSERT_OK: tüm eski sütunlar yerinde`

- [ ] **Adım 7: Commit**

```bash
git add supabase/migrations/20260924100300_clinic_balance_credit.sql
git commit -m "feat(finans): cari bakiyeden kullanılmamış tahsilat alacağını düş"
```

---

## Görev 5: `bulk_record_payment` para birimi hatası

**Dosyalar:**
- Oluştur: `supabase/migrations/20260924100400_bulk_payment_currency_fix.sql`
- Oluştur: `scratch/t5_bulk.sql`

**Arayüzler:** İmza değişmez: `bulk_record_payment(p_invoice_ids uuid[], p_total_amount numeric,
p_payment_method text, p_payment_date date, p_notes text)`.

- [ ] **Adım 1: Canlı fonksiyon tanımını oku**

```bash
cat > scratch/dump_bulk.sql <<'SQL'
select pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='bulk_record_payment';
SQL
supabase db query --linked -f "$PWD/scratch/dump_bulk.sql" > scratch/bulk_before.json
```

- [ ] **Adım 2: Başarısız doğrulama betiğini yaz**

`scratch/t5_bulk.sql`:

```sql
DO $$
DECLARE v_lab uuid; v_clinic uuid; v_inv uuid; v_msg text := ''; v_ccy text;
BEGIN
  SELECT id INTO v_lab FROM labs ORDER BY created_at LIMIT 1;
  INSERT INTO clinics (name, lab_id, is_active)
    VALUES ('ZZ_TEST_BULK', v_lab, true) RETURNING id INTO v_clinic;
  INSERT INTO invoices (clinic_id, lab_id, total, paid_amount, status, currency,
                        rate_at_time, due_date, invoice_no)
    VALUES (v_clinic, v_lab, 100, 0, 'kesildi', 'EUR', 40, CURRENT_DATE, 'ZZ-BK-1')
    RETURNING id INTO v_inv;

  -- EUR faturada toplu tahsilat: düzeltmeden ÖNCE muhafız hata fırlatır
  PERFORM bulk_record_payment(ARRAY[v_inv], 100, 'nakit', CURRENT_DATE, NULL);

  SELECT currency INTO v_ccy FROM payments WHERE invoice_id = v_inv LIMIT 1;
  IF v_ccy <> 'EUR' THEN
    v_msg := v_msg || format('ödeme para birimi EUR bekleniyordu, %s; ', v_ccy);
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = v_inv AND amount_base IS NULL) THEN
    v_msg := v_msg || 'amount_base NULL kaldı; ';
  END IF;

  IF v_msg = '' THEN RAISE EXCEPTION 'ASSERT_OK: toplu tahsilat para birimi doğru';
  ELSE RAISE EXCEPTION 'ASSERT_FAIL: %', v_msg; END IF;
END $$;
```

- [ ] **Adım 3: Betiği çalıştır, BAŞARISIZ olduğunu gör**

Beklenen: `payment currency TRY <> invoice currency EUR` hatası.

- [ ] **Adım 4: Migration'ı yaz**

Adım 1'de okuduğun canlı gövdeyi temel al; **yalnız `INSERT INTO payments` listesini**
genişlet. Diğer her şey (yetki kontrolü, `due_date ASC` dağıtımı, döngü) aynen kalır:

```sql
-- bulk_record_payment: ödeme satırına para birimi + kur yazılmıyordu.
--
-- Kolon varsayılanı 'TRY' olduğu için yabancı para faturalarda
-- payments_financial_guard "payment currency TRY <> invoice currency EUR" hatası
-- fırlatıyordu; TRY faturalarda da amount_base NULL kalıp raporları bozuyordu.
-- Düzeltme: değerler faturadan okunur.
--
-- DİKKAT: gövde, uygulama anındaki CANLI tanımdan türetilmiştir
-- (scratch/bulk_before.json). INSERT dışında hiçbir satır değiştirilmemelidir.

/* … canlı gövde … içindeki INSERT şu hâle gelir: */
--   INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes,
--                         currency, rate_at_time, amount_base, base_currency_at_time,
--                         received_by)
--   VALUES (v_inv.id, v_take, p_payment_date, p_payment_method, p_notes,
--           v_inv.currency, COALESCE(v_inv.rate_at_time, 1),
--           round(v_take * COALESCE(v_inv.rate_at_time, 1), 2),
--           COALESCE((SELECT default_currency FROM lab_settings
--                      WHERE lab_id = v_inv.lab_id), 'TRY'),
--           auth.uid());
```

> Uygulayan kişiye not: bu bloktaki yorumları kaldır; canlı gövdeyi `CREATE OR REPLACE
> FUNCTION` olarak yapıştır ve içindeki `INSERT INTO payments` ifadesini yukarıdaki hâliyle
> değiştir. Döngü değişkeninin adı canlı gövdede farklıysa (ör. `v_inv` değil `r`) ona göre
> uyarla; `currency` ve `rate_at_time` alanlarını o döngünün SELECT listesine ekle.

- [ ] **Adım 5: Onay al, uygula, doğrulama betiğini çalıştır**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260924100400_bulk_payment_currency_fix.sql"
supabase db query --linked -f "$PWD/scratch/t5_bulk.sql"
```

Beklenen: `ASSERT_OK: toplu tahsilat para birimi doğru`

- [ ] **Adım 6: Commit**

```bash
git add supabase/migrations/20260924100400_bulk_payment_currency_fix.sql
git commit -m "fix(finans): toplu tahsilat ödemeye para birimi ve kur yazmıyordu"
```

---

## Görev 6: İstemci API

**Dosyalar:**
- Değiştir: `modules/invoices/api.ts` (dosyanın sonuna ekle)
- Değiştir: `modules/invoices/types.ts`

**Arayüzler:**
- Tüketir: Görev 2-3'ün RPC'leri.
- Üretir:
  - `type ReceiptLine = { currency: 'TRY'|'EUR'|'USD'|'GBP'; amount: number; rate: number }`
  - `type ReceiptAllocation = { invoice_id: string; invoice_no: string | null; amount: number; currency: string }`
  - `type ReceiptResult = { receipt_id: string; total_base: number; allocated_base: number; credit_base: number; allocations: ReceiptAllocation[] }`
  - `previewClinicReceipt(clinicId: string, lines: ReceiptLine[]): Promise<ReceiptResult>`
  - `recordClinicReceipt(p: { clinicId: string; lines: ReceiptLine[]; receiptDate?: string; method?: string; referenceNo?: string | null; notes?: string | null; idempotencyKey?: string }): Promise<ReceiptResult>`
  - `applyClinicCredit(clinicId: string, receiptId?: string | null): Promise<{ applied_base: number; receipts_touched: number }>`
  - `fetchClinicReceipts(clinicId?: string): Promise<ClinicReceipt[]>`

- [ ] **Adım 1: Tipleri ekle**

`modules/invoices/types.ts` sonuna:

```ts
/** Tahsilat fişinde bir para birimi satırı — 800 USD @34 gibi. */
export type ReceiptLine = {
  currency: 'TRY' | 'EUR' | 'USD' | 'GBP';
  amount: number;
  /** 1 birim `currency`nin baz para birimi karşılığı. */
  rate: number;
};

export type ReceiptAllocation = {
  invoice_id: string;
  invoice_no: string | null;
  amount: number;
  currency: string;
};

export type ReceiptResult = {
  receipt_id: string;
  total_base: number;
  allocated_base: number;
  credit_base: number;
  allocations: ReceiptAllocation[];
};

export type ClinicReceipt = {
  id: string;
  clinic_id: string;
  receipt_date: string;
  payment_method: string;
  reference_no: string | null;
  notes: string | null;
  base_currency: string;
  total_base: number;
  allocated_base: number;
  lines: { currency: string; amount: number; rate: number; amount_base: number }[];
};
```

- [ ] **Adım 2: API fonksiyonlarını ekle**

`modules/invoices/api.ts` sonuna:

```ts
import type {
  ReceiptLine, ReceiptResult, ClinicReceipt,
} from './types';

/** Yazmadan dağıtım önizlemesi — pencere kaydetmeden bunu gösterir. */
export async function previewClinicReceipt(
  clinicId: string, lines: ReceiptLine[],
): Promise<ReceiptResult> {
  const { data, error } = await supabase.rpc('preview_clinic_receipt', {
    p_clinic_id: clinicId,
    p_lines: lines,
  });
  if (error) throw new Error(error.message);
  return data as ReceiptResult;
}

export async function recordClinicReceipt(p: {
  clinicId: string;
  lines: ReceiptLine[];
  receiptDate?: string;
  method?: string;
  referenceNo?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
}): Promise<ReceiptResult> {
  const { data, error } = await supabase.rpc('record_clinic_receipt', {
    p_clinic_id: p.clinicId,
    p_lines: p.lines,
    p_receipt_date: p.receiptDate ?? new Date().toISOString().slice(0, 10),
    p_payment_method: p.method ?? 'nakit',
    p_reference_no: p.referenceNo ?? null,
    p_notes: p.notes ?? null,
    p_idempotency_key: p.idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ReceiptResult;
}

export async function applyClinicCredit(
  clinicId: string, receiptId?: string | null,
): Promise<{ applied_base: number; receipts_touched: number }> {
  const { data, error } = await supabase.rpc('apply_clinic_credit', {
    p_clinic_id: clinicId,
    p_receipt_id: receiptId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { applied_base: number; receipts_touched: number };
}

export async function fetchClinicReceipts(clinicId?: string): Promise<ClinicReceipt[]> {
  let q = supabase
    .from('clinic_receipts')
    .select('id, clinic_id, receipt_date, payment_method, reference_no, notes, '
          + 'base_currency, total_base, allocated_base, '
          + 'lines:clinic_receipt_lines(currency, amount, rate, amount_base)')
    .order('receipt_date', { ascending: false })
    .limit(200);
  if (clinicId) q = q.eq('clinic_id', clinicId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ClinicReceipt[];
}
```

- [ ] **Adım 3: Tip kontrolü**

```bash
cd ~/Desktop/DentalSoftware/my-expo-app && npx tsc --noEmit
```

Beklenen: 0 hata. `import type` satırı dosyanın üstündeki mevcut import bloğuyla çakışıyorsa
oraya birleştir.

- [ ] **Adım 4: Commit**

```bash
git add modules/invoices/api.ts modules/invoices/types.ts
git commit -m "feat(finans): klinik tahsilatı istemci API'si"
```

---

## Görev 7: Ortak tahsilat penceresi

**Dosyalar:**
- Oluştur: `modules/invoices/components/ClinicReceiptModal.tsx`

**Arayüzler:**
- Tüketir: `previewClinicReceipt`, `recordClinicReceipt` (Görev 6); `getRate` (`core/money/currency`).
- Üretir: `<ClinicReceiptModal visible clinicId clinicName onClose onSaved />`

- [ ] **Adım 1: Pencerenin mantığını yaz**

Aşağıdaki iskelet **aynen** kullanılır; eksik olan yalnız görsel düzendir (alan kutuları,
pil şeridi, tablo satırları). Stil için `NewShipmentModal.tsx` kalıbını izle: `Modal
transparent animationType="fade"`, arka plan `rgba(10,14,26,0.52)` + web'de
`backdropFilter: 'blur(10px) saturate(120%)'`, kart `T.card` / `T.hairline` / radius 22.

```tsx
// ClinicReceiptModal — klinikten fatura-bağımsız, çoklu döviz tahsilat.
//
// Fiş satırları kasaya giren GERÇEK parayı tutar (800 USD, 600 TL). Dağıtım
// önizlemesi sunucudaki preview_clinic_receipt'ten gelir — dağıtım mantığının
// tek kaynağı orası; istemcide ikinci bir hesap YAZILMAZ (ikisi ayrışırdı).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { X, Plus, Trash2 } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { getRate } from '../../../core/money/currency';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { previewClinicReceipt, recordClinicReceipt } from '../api';
import type { ReceiptLine, ReceiptResult } from '../types';

const CCY: ReceiptLine['currency'][] = ['TRY', 'EUR', 'USD', 'GBP'];
const METHODS = ['nakit', 'kart', 'havale', 'cek', 'diger'] as const;

type Row = { currency: ReceiptLine['currency']; amount: string; rate: string };

export function ClinicReceiptModal({
  visible, clinicId, clinicName, onClose, onSaved,
}: {
  visible: boolean;
  clinicId: string | null;
  clinicName?: string;
  onClose: () => void;
  onSaved?: (r: ReceiptResult) => void;
}) {
  const T = useMobileTokens();
  const base = getBaseCurrency();
  const [rows, setRows]       = useState<Row[]>([{ currency: base as any, amount: '', rate: '1' }]);
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod]   = useState<string>('nakit');
  const [refNo, setRefNo]     = useState('');
  const [notes, setNotes]     = useState('');
  const [preview, setPreview] = useState<ReceiptResult | null>(null);
  const [busy, setBusy]       = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  // Çift tıklama tek fiş üretsin: anahtar pencere açılışında bir kez üretilir.
  const idemRef = useRef<string>('');
  const debRef  = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    idemRef.current = `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setRows([{ currency: base as any, amount: '', rate: '1' }]);
    setPreview(null); setRefNo(''); setNotes(''); setMethod('nakit');
    setDate(new Date().toISOString().slice(0, 10));
  }, [visible, base]);

  /** Para birimi değişince kuru o günün kuruyla DOLDUR — kullanıcı üzerine yazabilir. */
  const setRowCurrency = useCallback(async (i: number, c: ReceiptLine['currency']) => {
    setRows(prev => prev.map((r, k) => k === i ? { ...r, currency: c } : r));
    try {
      const rate = await getRate(c, base as any);
      setRows(prev => prev.map((r, k) => k === i ? { ...r, rate: String(rate ?? 1) } : r));
    } catch { /* kur alınamadı → kullanıcı elle girer */ }
  }, [base]);

  const validLines = (): ReceiptLine[] => rows
    .map(r => ({ currency: r.currency, amount: Number(r.amount.replace(',', '.')), rate: Number(r.rate.replace(',', '.')) }))
    .filter(l => isFinite(l.amount) && l.amount > 0 && isFinite(l.rate) && l.rate > 0);

  // Satırlar değiştikçe sunucudan dağıtım önizlemesi.
  useEffect(() => {
    if (!visible || !clinicId) return;
    const lines = validLines();
    if (debRef.current) clearTimeout(debRef.current);
    if (lines.length === 0) { setPreview(null); return; }
    debRef.current = setTimeout(async () => {
      setLoadingPrev(true);
      try { setPreview(await previewClinicReceipt(clinicId, lines)); }
      catch { setPreview(null); }
      finally { setLoadingPrev(false); }
    }, 400);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [visible, clinicId, JSON.stringify(rows)]);

  const save = async () => {
    if (!clinicId) return;
    const lines = validLines();
    if (lines.length === 0) { toast.error(autoT('En az bir tahsilat satırı gerekli')); return; }
    setBusy(true);
    try {
      const res = await recordClinicReceipt({
        clinicId, lines, receiptDate: date, method,
        referenceNo: refNo.trim() || null, notes: notes.trim() || null,
        idempotencyKey: idemRef.current,
      });
      toast.success(autoT('Tahsilat kaydedildi'));
      onSaved?.(res);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? autoT('Tahsilat kaydedilemedi'));
    } finally { setBusy(false); }
  };

  const totalBase = validLines().reduce((s, l) => s + l.amount * l.rate, 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* … düzen: NewShipmentModal kalıbı. İçerik sırası:
          başlık (clinicName + kapat düğmesi, GlassTooltip'li)
          tarih · yöntem pilleri · referans · not
          satır listesi: her satır -> para birimi seçici (setRowCurrency),
            tutar TextInput, kur TextInput, baz karşılığı (amount*rate),
            sil düğmesi (GlassTooltip 'Satırı sil')
          'Satır ekle' düğmesi (GlassTooltip)
          Toplam: totalBase + base
          'Dağıtım' bölümü: loadingPrev ? ActivityIndicator :
            preview?.allocations.map(a => invoice_no + amount + currency)
            ve altta 'Kalan alacak': preview?.credit_base
          alt bar: Vazgeç · Kaydet (busy iken disabled) … */}
    </Modal>
  );
}
```

> Uygulayan kişiye not: yukarıdaki JSX yorumu yerine gerçek düzeni yaz. Mantığın tamamı
> (kur doldurma, önizleme gecikmesi, idempotency, doğrulama) yukarıda tamamdır — onu
> değiştirme. Dağıtımı istemcide yeniden hesaplama; tek kaynak `preview_clinic_receipt`.

- [ ] **Adım 2: Tip kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Adım 3: Yeni dizeleri üç sözlüğe ekle**

Pencerede kullanılan yeni Türkçe dizeleri `core/i18n/locales/auto.{en,de,fa}.json`
dosyalarına ekle. Eklemeden önce var mı diye bak; sözlükler alfabetik sıralı, sırayı koru.

Asgari liste (pencerede bunlar geçiyor):

```
Tahsilat ekle
Tahsilat satırı
Satır ekle
Satırı sil
Baz karşılığı
Dağıtım
Kalan alacak
Tahsilat kaydedildi
Tahsilat kaydedilemedi
En az bir tahsilat satırı gerekli
Kur
```

- [ ] **Adım 4: Eksik çeviri kalmadığını doğrula**

```bash
cd ~/Desktop/DentalSoftware/my-expo-app && python3 - <<'PY'
import json, re, glob
src = open('modules/invoices/components/ClinicReceiptModal.tsx', encoding='utf-8').read()
lits = set(re.findall(r"autoT\(\s*'([^']+)'\s*\)", src))
d = {l: json.load(open(f'core/i18n/locales/auto.{l}.json', encoding='utf-8'))
     for l in ('en','de','fa')}
missing = [s for s in sorted(lits) if any(s not in d[l] for l in d)]
print('eksik:', missing if missing else 'yok')
PY
```

Beklenen: `eksik: yok`

- [ ] **Adım 5: Commit**

```bash
git add modules/invoices/components/ClinicReceiptModal.tsx core/i18n/locales/auto.*.json
git commit -m "feat(finans): klinik tahsilat penceresi (çoklu döviz + dağıtım önizlemesi)"
```

---

## Görev 8: Giriş noktaları

**Dosyalar:**
- Oluştur: `modules/invoices/screens/ClinicReceiptsScreen.tsx`
- Değiştir: `modules/invoices/screens/ClinicBalanceScreen.tsx`
- Değiştir: `modules/finance/screens/FinanceHubScreen.tsx`

**Arayüzler:**
- Tüketir: `ClinicReceiptModal` (Görev 7), `fetchClinicReceipts`, `applyClinicCredit` (Görev 6).

- [ ] **Adım 1: Finans sekmesi ekranını yaz**

`ClinicReceiptsScreen.tsx`: beyaz hero (kicker "Finans", başlık "Tahsilatlar", sağda toplam
tahsilat ve kullanılmamış alacak rakamları), altında arama + `Filtrele`, sonra fiş tablosu
(tarih · klinik · yöntem · satırlar özeti · toplam · tahsis · alacak). Hero'nun sağ altında
"Yeni tahsilat" düğmesi → `ClinicReceiptModal`. Navy tablo başlığı, `PAGE_PADDING`,
koyu tema, boş durum.

- [ ] **Adım 2: Finans hub'ına sekmeyi kaydet**

`FinanceHubScreen.tsx` içindeki `TAB_GROUPS` dizisine yeni sekme ekle (mevcut kalıbı birebir
izle: `key`, `label`, `icon`, `hint`) ve `ClinicReceiptsScreen`'i render eden dalı ekle.

- [ ] **Adım 3: Cari hesap ekranına iki düğme ekle**

`ClinicBalanceScreen.tsx`: her klinik satırına "Tahsilat ekle" (pencereyi o klinikle açar) ve
— yalnız `unallocated_credit > 0` olan satırlarda — "Alacağı uygula" düğmesi
(`applyClinicCredit(clinicId)` → başarıda listeyi yenile + `toast.success`). İkisine de
`GlassTooltip`. Ekranın `unallocated_credit` sütununu da göstermesi gerekiyor: bakiye
sütununun yanında ayrı bir rakam olarak.

- [ ] **Adım 4: Tip kontrolü + çeviri kontrolü**

```bash
npx tsc --noEmit
```

Sonra Görev 7 Adım 4'teki betiği bu üç dosya için tekrar çalıştır (dosya yolunu değiştirerek).

- [ ] **Adım 5: Commit**

```bash
git add modules/invoices/screens/ClinicReceiptsScreen.tsx \
        modules/invoices/screens/ClinicBalanceScreen.tsx \
        modules/finance/screens/FinanceHubScreen.tsx \
        core/i18n/locales/auto.*.json
git commit -m "feat(finans): tahsilat giriş noktaları (finans sekmesi + cari hesap)"
```

---

## Görev 9: Uçtan uca doğrulama

**Dosyalar:** yok (yalnız doğrulama)

- [ ] **Adım 1: Temiz tam tip kontrolü**

```bash
cd ~/Desktop/DentalSoftware/my-expo-app
rm -f tsconfig.tsbuildinfo
npx tsc --noEmit
```

Beklenen: çıktı boş. Artımlı derleme hayalet hata verebilir; bu yüzden `.tsbuildinfo` silinir.

- [ ] **Adım 2: Tüm SQL doğrulama betiklerini tekrar çalıştır**

```bash
for f in t1_schema t2_alloc t3_credit t4_balance t4_cols t5_bulk; do
  echo "=== $f"
  supabase db query --linked -f "$PWD/scratch/$f.sql" 2>&1 | grep -o 'ASSERT_[A-Z]*[^"]*' | head -1
done
```

Beklenen: altısı da `ASSERT_OK`.

- [ ] **Adım 3: Deneme verisi sızmadığını doğrula**

```bash
cat > scratch/t9_clean.sql <<'SQL'
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM clinics WHERE name LIKE 'ZZ_TEST%';
  IF v_n > 0 THEN RAISE EXCEPTION 'ASSERT_FAIL: % adet test kliniği kalmış', v_n; END IF;
  SELECT count(*) INTO v_n FROM invoices WHERE invoice_no LIKE 'ZZ-%';
  IF v_n > 0 THEN RAISE EXCEPTION 'ASSERT_FAIL: % adet test faturası kalmış', v_n; END IF;
  RAISE EXCEPTION 'ASSERT_OK: canlı veri temiz';
END $$;
SQL
supabase db query --linked -f "$PWD/scratch/t9_clean.sql"
```

Beklenen: `ASSERT_OK: canlı veri temiz`. Değilse kalan satırları elle sil.

- [ ] **Adım 4: Kullanıcıya rapor et, deploy BEKLE**

Ne yapıldığını, hangi doğrulamaların geçtiğini ve neyin canlıda olduğunu (migration'lar
canlıda, istemci kodu DEĞİL) söyle. **"deploy" demeden yayınlama.**
