# Ön Ekstre — Plan 1/5: Kesinleşmiş Fatura Kilidi ve Düzeltme Belgesi (DZ) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kesilmiş fatura hiçbir yoldan (istemci, RPC, edge, toplu işlem) düzenlenemesin, taslağa dönmesin, silinemesin. Düzeltme, belirli bir kaleme bağlı, eksi tutarlı, silinemeyen **düzeltme belgesi (DZ)** ile yapılsın.

**Architecture:**
- **Kilit:** iki BEFORE tetikleyicisi, ad sırasında en son çalışır: `invoices` üzerinde `zzz_invoice_issued_lock`, `invoice_items` üzerinde `zzz_invoice_items_issued_lock`. Yasaklı sütunların ve yasaklı durum geçişlerinin listesi tetikleyicide tutulur.
  - Mevcut kilitler `current_user='postgres'` olunca geçiyor. Bu kilit geçmez; tek kaçış kapısı işlem-yerel `siman.invoice_lock = 'off'` ayarıdır.
- **DZ:** mevcut ekstre indirimi altyapısının ikinci belge türüdür.
  - `clinic_statement_discounts` tablosuna `doc_type` ('IND' | 'DZ') ve hedef fatura ile kalem eklenir.
  - Pay ve alacak modeli, bakiye görünümleri, raporlar ve alacak dağıtımı (`_sd_apply_credit`) değişmeden yeniden kullanılır. DZ bu yüzden ödeme gibi kapatır, fazlası alacak olur, toplamlar her ekranda aynı kalır.

**Tech Stack:** Expo Router + React Native Web, Supabase Postgres (tetikleyici, SECURITY DEFINER RPC), `node --test` (Node 24).

**Spec:** `docs/superpowers/specs/2026-11-06-on-ekstre-onay-design.md`. Bu plan §2.8, §2.9, K1, K4 ve K7'yi kapsar. Bağlayıcı belge spec'tir.

**Bütün yollar `my-expo-app/` köküne göredir.**

**Plan dizisi** (her biri ayrı plan, bu sırayla):
1. Kilit ve DZ (bu plan).
2. Tahsilat dağıtımı ve dönem hatırlatması.
3. Ön ekstre çekirdeği: ayar, not/itiraz, onay, aylık tek fatura.
4. Onay bağlantısı/karekod, ay sonu gönderim, PDF özet/ayrıntılı, çok işli ekran.
5. E-fatura birleşik satır ve iş dökümü.

---

## Global Constraints

### Veritabanı değişikliği (her DB görevi beş adımla yapılır, hiçbiri atlanmaz)

1. **Önceki durumu yakala.** Değişecek her canlı nesnenin tanımını yakala:
   - fonksiyonlar `pg_get_functiondef`,
   - kısıtlar `pg_get_constraintdef`,
   - yetkiler `information_schema.routine_privileges`,
   - tetikleyici listesi `pg_trigger`.

   Hepsini `supabase/rollbacks/<ts>_<ad>.before.txt` dosyasına yaz. İlk satır `-- <ts>_<ad> — CANLI durum (2026-11-07)`, bölümler `## <nesne>`. Fonksiyon bölümlerinde `-- md5(pg_get_functiondef) = …` satırı da bulunur.
2. **Geri alma dosyası.** `supabase/rollbacks/<ts>_<ad>.down.sql`: `BEGIN; … COMMIT;` içinde önceki tanımları geri yazar ve yeni nesneleri düşürür.
3. **Prob.** Dosya scratchpad'de `probe_<ad>.sql` olarak durur.
   - Akış: `BEGIN;` → migration gövdesi → senaryo → her beklenti için `IF … THEN RAISE EXCEPTION 'PROBE FAIL: <ne>'` → en sonda `RAISE EXCEPTION 'PROBE OK';`. Böylece her şey geri alınır.
   - Beklenen çıktı: `ERROR: PROBE OK`.
   - Lab kullanıcısı şöyle taklit edilir: `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true);`.
   - Demo lab: memory `project_iyzico_demo_account`. Yalnız lab ve kullanıcı kimliklerini al. **Şifreyi asla yazdırma ve kullanma.**
   - **Gönderici çağrılmaz.** Fikstürden önce `invoices`/`payments` üzerinde `net.http_post` ya da `_notify*` çağıran tetikleyicileri bul ve probun içinde `ALTER TABLE … DISABLE TRIGGER` ile kapat.
   - Çıktıda kişi adı ya da gerçek tutar olmaz. Fikstür tutarları 100, 250, 500 gibi yapay sayılardır.
4. **Onay.** `AskUserQuestion` ile açık onay al; seçenek metni **"Onaylıyorum, uygula"**. Soruda ne değişeceği, hangi akışların etkileneceği ve risk madde madde yazar.
5. **Uygula ve ölç.** `cd my-expo-app && supabase db query --linked -f <mutlak yol>`. `LegacyPlatformAuthRequiredError` alırsan bir kez yeniden dene. Ardından canlıda ölç:
   - yeni nesneler var mı,
   - değişen fonksiyonların `md5(pg_get_functiondef)` değeri,
   - ACL `.before.txt` ile aynı mı.

**DB yazım kuralları:**
- Migration `BEGIN; SET LOCAL lock_timeout = '3s'; … COMMIT;` içinde yazılır.
- Fonksiyonlarda `SET search_path TO 'public'` bulunur.
- İç (alt çizgili) fonksiyonlar ve tetikleyici fonksiyonları için `REVOKE ALL … FROM PUBLIC, anon, authenticated`.
- İstemci RPC'lerinde `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`.
- Yazan RPC'lerin yetki kapısı: `is_platform_admin() OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))`. Burada `v_lab` = `clinics.lab_id`.
- `'indirim'` payı yazan her yol `pg_advisory_xact_lock(hashtext('sd:'||clinic_id))` alır. `payments` yazımı `set_config('siman.sd_write','on',true)` altında yapılır ve önceki değer geri yüklenir (desen: `delete_statement_discount`).

### Arayüz
- **Dört dil birlikte.** Kaynak Türkçedir. `core/i18n/locales/auto.{en,de,fa}.json` aynı anahtarları içerir. Görevler parite testiyle biter (desen: `modules/invoices/statementDiscountI18n.test.mts`).
- **Sözlükleri yalnız kendi anahtarlarınla stage et.** Sözlüklerde başka oturumun bekleyen satırları var ("Tam kafa"). Kendi eklediğin hunk'ları `git diff -U0 … | awk` + `git apply --cached --unidiff-zero` ile stage et; o satırlara dokunma.
- JSX dışı metin (hata eşleme tabloları, PDF/HTML, toast) `autoT()` ile sarılır.
- **Koyu tema aynı anda:** `useInkUI()` (`U.*`). Beyaz butonlar `U.plainBtn`. Pencere için `<Modal transparent animationType="fade">` + `U.modalOverlay` + `U.modalCard`. İkon yalnız `core/ui/icons`.
- **Hata görünürlüğü:** doğrulama hatası düğmenin yanında satır içi görünür (desen: `ClinicReceiptModal` `methodErr`). Yalnız toast yetmez.
- **Para:** formatlayıcılar defansiftir: `(Number(n)||0)`. Sabit ₺ yazılmaz; para birimi faturadan gelir.

### Doğrulama ve teslim
- **Görev sonu testi:** `cd my-expo-app && find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test > <workspace>/suite.log 2>&1; grep -E "^ℹ (pass|fail)" <workspace>/suite.log` → `ℹ fail 0`. Taban 564 geçen.
- **Tip kontrolü:** `npx tsc --noEmit --incremental false` → çıkış 0.
- **Yeni `.test.mts` dosyaları:** içe aktardıkları `.ts` dosyalarını uzantıyla yazar (`./x.ts`). Test edilen saf dosyalar uzantısız yerel içe aktarma içermez (`import type` serbest).
- **Commit:** `main` üzerinde yapılır; yalnız görevin dosyaları adla `git add` edilir.
  - `modules/ar-scanner/**`, `modules/viewer-3d/**` ve `FaceScanQuickAction.tsx` dosyalarına dokunulmaz.
  - Mesaj `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter. Push yapılmaz.
- **Yayın:** web yayını yalnız kullanıcı "deploy" deyince yapılır. Bu planda edge değişikliği yok.

### Kurucu kararları (spec'in kurucuya bıraktıkları)
- **P1 — Kilit kapsamı.**
  - **Kesinleşmiş:** `status <> 'taslak'`. `iptal` de bu kapsamdadır; kalemleri ve tutarı donar.
  - **Yasak sütunlar:** `lab_id`, `clinic_id`, `doctor_id`, `currency`, `invoice_number`, `issue_date`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `discount_type`, `discount_value`, `discount_amount`.
  - **Serbest:** `status` (aşağıdaki iki geçiş hariç), `paid_amount`, `due_date`, `notes`, `work_order_id`, kur alanları (`rate_at_time`, `amount_base`, `base_currency_at_time`), `efatura_*`, `updated_at`, `created_by`, `total_amount`.
- **P2 — Yasak geçişler.** Kesinleşmişten `taslak`'a geçiş ve `iptal`'den çıkış yasaktır. İptal kalıcıdır ve doğrusu yeniden kesilir (spec §2.8 tablosu).
- **P3 — Yabancı anahtar istisnaları.** `ON DELETE SET NULL` ve `CASCADE` zincirleri çalışmayı sürdürür:
  - Hedef satır artık yoksa `clinic_id` ya da `doctor_id` NULL'a dönebilir.
  - `labs` satırı yoksa fatura silinebilir.
  - Ana fatura satırı yoksa kalem silinebilir.
  - Yalnız `order_item_id` NULL'a dönüyorsa ve sipariş kalemi yoksa kalem güncellenebilir.
- **P4 — Kaçış kapısı.** Kaçış yalnız işlem-yerel `siman.invoice_lock = 'off'` ile olur. `current_user` istisnası yoktur; postgres, service_role ve definer RPC'ler de kilide takılır. İstemci `set_config` çağıramaz (`pg_catalog` PostgREST'te açık değil).
- **P5 — Hata kodu.** `INV_ISSUED_LOCKED`, `ERRCODE '42501'`.
- **P6 — DZ'nin yeri.** DZ, `clinic_statement_discounts` tablosunda `doc_type='DZ'` satırıdır.
  - `kind='fixed'`, `value = amount`, `base_amount` = hedef kalemin `net_total`'ı.
  - `period_from = period_to` = hedef faturanın `issue_date`'i.
  - `currency` ve `rate` faturadan alınır (`rate_at_time`, yoksa 1). `description` = gerekçe.
- **P7 — DZ numarası.** Lab başına ayrı sayaçtır: yeni tablo `clinic_correction_counters`. Görünüm `DZ-<doc_no>`. İND numaraları DZ'den etkilenmez.
- **P8 — DZ'nin uygulanması.**
  - Önce hedef faturanın açık kısmına pay yazılır (`notes = 'DZ-<n>'`).
  - Kalan kısım `_sd_apply_credit` ile kliniğin aynı para birimindeki açık faturalarına uygulanır, kalırsa alacak olur (K7).
  - Ödenmiş faturada payın tamamı bu yoldan gider.
- **P9 — DZ silinemez.** Fazla yazılmış bir DZ ek faturayla düzeltilir (spec §2.8 "Ek fatura").
- **P10 — Raporlar.** Raporlar DZ'yi ciro düşüşü sayar, İND gibi (mevcut `row_kind 'statement_discount'`). Ekstrede DZ İndirim sütununa ve indirim toplamına **girmez**; Alacak sütununda kendi satırıyla görünür.
- **P11 — `_sd_quote` dönem tavanı.** Dönem tavanı, döneme düşen DZ'leri "önceki indirimler" içinde sayar. Bu, mevcut sorgunun davranışıdır; değiştirilmez.
- **P12 — "Taslağa Dön" kaldırılır.** KDV oranı yalnız taslakta düzenlenir. Kesilmiş faturada KDV değişikliği artık iptal ve yeniden kesimle yapılır. Bu, çalışan bir davranışı değiştirir; spec K4 onaylı.

## Review Focus

1. **Kalemsiz eski kesilmiş fatura (canlıda 6 adet).** Tahsilat, iptal ve e-fatura alan güncellemesi çalışmayı sürdürmeli. `aa_enforce_invoice_totals` tutarları dondurur, kilit tetiklenmemeli → Görev 1 probu, senaryo 9.
2. **E-fatura birleştirme yolu** (`efatura-luca` `promoteIds`: `taslak → kesildi` + efatura alanları). Kesinleşmeden önceki geçiş serbest kalmalı → Görev 1 probu, senaryo 7.
3. **Tahsilat iptali ya da silinmesi** kesilmiş faturanın `paid_amount` ve `status` değerlerini geri çevirir (`recalc_invoice_payment_state`). Kilide takılmamalı → Görev 1 probu, senaryo 5.
4. **Aynı kaleme art arda iki DZ.** İkincisi kalan tavanı aşıyorsa `DZ_CAP` döner ve ilki bozulmaz → Görev 3 probu, senaryo 3.
5. **Ödenmiş faturaya DZ.** Fatura `odendi` kalır. Tutar kliniğin açık faturalarına uygulanır, açık fatura yoksa `v_clinic_balance_ccy.unallocated_credit` artar ve `balance` düşer → Görev 3 probu, senaryo 4.

---

### Task 1: Kesinleşmiş fatura kilidi (DB)

**Files:**
- Create: `supabase/migrations/20261107100000_kesin_fatura_kilidi.sql`
- Create: `supabase/rollbacks/20261107100000_kesin_fatura_kilidi.before.txt` (canlı tetikleyici listesi: `invoices`, `invoice_items`)
- Create: `supabase/rollbacks/20261107100000_kesin_fatura_kilidi.down.sql` (iki tetikleyiciyi ve iki fonksiyonu düşürür)
- Create (scratchpad): `probe_kesin_kilit.sql`

**Interfaces:**
- **Produces:**
  - `public._invoice_issued_lock() RETURNS trigger` (SECURITY INVOKER) → `CREATE TRIGGER zzz_invoice_issued_lock BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW`.
  - `public._invoice_items_issued_lock() RETURNS trigger` (SECURITY INVOKER) → `CREATE TRIGGER zzz_invoice_items_issued_lock BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW`.
  - Hata mesajı tam olarak `INV_ISSUED_LOCKED`, `ERRCODE '42501'`. Görev 2 istemcide bu dizeyi eşler.
- **Consumes:** bypass `current_setting('siman.invoice_lock', true) = 'off'`.

- [ ] **Step 1: Yakala.** `.before.txt` içine `invoices` ve `invoice_items` tetikleyici listesini (ad, fonksiyon, zaman, olay) yaz. Bu iki adın canlıda bulunmadığını not et.
- [ ] **Step 2: Migration'ı yaz.**
  - **`_invoice_issued_lock`:**
    - Kaçış açıksa → `RETURN COALESCE(NEW, OLD)`.
    - `DELETE`: `OLD.status = 'taslak'` → izin. `NOT EXISTS (labs.id = OLD.lab_id)` → izin. Aksi halde hata.
    - `UPDATE`, `OLD.status = 'taslak'` → izin.
    - `UPDATE`, kesinleşmiş:
      - `OLD.status <> 'taslak' AND NEW.status = 'taslak'` → hata.
      - `OLD.status = 'iptal' AND NEW.status <> 'iptal'` → hata.
      - P1'deki yasak sütunlardan herhangi biri `IS DISTINCT FROM` → hata. İki istisna:
        - `clinic_id`: `NEW.clinic_id IS NULL` ve `OLD.clinic_id` artık `clinics`'te yoksa izin.
        - `doctor_id`: `NEW.doctor_id IS NULL` ve `OLD.doctor_id` artık `doctors`'ta yoksa izin.
  - **`_invoice_items_issued_lock`:**
    - Kaçış açıksa → izin.
    - Ana fatura `COALESCE(NEW.invoice_id, OLD.invoice_id)` ile okunur:
      - Bulunamazsa → izin (zincirleme silme).
      - `status = 'taslak'` → izin.
    - `UPDATE` iken yalnız `order_item_id` NULL'a dönüyorsa ve `order_items` satırı yoksa → izin.
      - Karşılaştırma `(NEW.*) minus order_item_id` ile değil, şu sütunlarla yapılır: `invoice_id`, `description`, `quantity`, `unit_price`, `sort_order`, `discount_type`, `discount_value`, `list_unit_price`, `list_discount_pct`.
    - Aksi halde → hata.
  - Her iki fonksiyona `REVOKE ALL … FROM PUBLIC, anon, authenticated` uygula.
- [ ] **Step 3: `.down.sql` yaz.** `DROP TRIGGER IF EXISTS` ×2 ve `DROP FUNCTION IF EXISTS` ×2.
- [ ] **Step 4: Probu yaz.**
  - Fikstür, demo lab'da bir klinik üzerinde kurulur:
    - **A:** taslak fatura + 1 kalem (100), sonra `kesildi` yapılır.
    - **B:** taslak fatura + 1 kalem.
    - **C:** canlıdaki kalemsiz kesilmiş faturalardan biri. Yoksa kalemsiz fatura oluştur ve `kesildi` yap.
  - Senaryolar postgres olarak koşar. 1, 2 ve 5'i lab yöneticisi taklidiyle de tekrarla.
  - Senaryolar:
    1. A'da `total` / `tax_rate` / `clinic_id` / `currency` / `issue_date` / `invoice_number` / `discount_value` güncellemesinin her biri `INV_ISSUED_LOCKED`. `BEGIN … EXCEPTION WHEN OTHERS` bloğunda `SQLERRM = 'INV_ISSUED_LOCKED'` kontrolü.
    2. A `status → 'taslak'` → `INV_ISSUED_LOCKED`. A `DELETE` → `INV_ISSUED_LOCKED`.
    3. A kalemine `INSERT`, `UPDATE unit_price` ve `DELETE` → her biri `INV_ISSUED_LOCKED`.
    4. A `due_date`, `notes`, `efatura_status='pending'` ve `rate_at_time` güncellemesi başarılı.
    5. A'ya 40 tutarlı `havale` ödemesi → `status='kismi_odendi'`. Ödeme silinince → `status='kesildi'`, `paid_amount=0`. Hata yok.
    6. A `status → 'iptal'` başarılı. Ardından `status → 'kesildi'` → `INV_ISSUED_LOCKED`.
    7. B kalemi güncellenir; B `status → 'kesildi'` başarılı. Başka bir taslak (B2) silinir ve kalemleri zincirleme silinir; başarılı.
    8. `set_config('siman.invoice_lock','off',true)` sonrası A `notes` dışı bir yasak sütun güncellemesi başarılı. Kaçışı geri kapat.
    9. C'ye 10 tutarlı ödeme başarılı; C `iptal` başarılı.
    10. A'nın kalemine bağlı bir `order_items` satırı varsa silinir ve kalemin `order_item_id`'si NULL'a döner; hata yok. Fikstürde böyle bir satır yoksa bu senaryoyu atla ve probta `-- skipped: no order_item` yaz.
  - Sonunda `RAISE EXCEPTION 'PROBE OK'`.
- [ ] **Step 5: Probu çalıştır.** Beklenen: `ERROR: PROBE OK`.
- [ ] **Step 6: Onay al ve uygula.**
  - Soruda şunlar yazar:
    - "Taslağa Dön" artık sunucuda reddedilir.
    - Kesilmiş faturada KDV, tutar ve kalem değişmez.
    - Kesilmiş fatura silinemez.
    - Tahsilat ve iptal etkilenmez.
  - Uygula ve ölç: iki tetikleyici var mı, fonksiyon ACL'i `{postgres=X/postgres,service_role=X/postgres}` mi.
- [ ] **Step 7: Commit.** `supabase/migrations/20261107100000_kesin_fatura_kilidi.sql` + iki rollback dosyası, mesaj `feat(fatura): kesinleşmiş fatura kilidi (INV_ISSUED_LOCKED)`.

---

### Task 2: Kilidin arayüzü — "Taslağa Dön" kalkar, KDV yalnız taslakta, okunur hata

**Files:**
- Modify: `modules/invoices/lib/statementDiscount.ts`. `SD_STATUS_TEXTS` adı korunur; içine `INV_ISSUED_LOCKED` eklenir.
- Modify: `modules/invoices/screens/InvoiceDetailScreen.tsx`:
  - `handleRevertToDraft` ile `Undo2` düğmesi (satır ~526–541 ve ~661–663) silinir. `Undo2` başka yerde kullanılmıyorsa importu da kalkar.
  - `canEditTax` (satır ~361) koşuluna `invoice.status === 'taslak'` eklenir.
  - `handleCancel` hatası `invoiceStatusErrorText` üzerinden gösterilir.
- Modify: `modules/invoices/lib/statementDiscount.test.mts`, `modules/invoices/statementDiscountI18n.test.mts`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** sunucu hatası `INV_ISSUED_LOCKED` (Görev 1).
- **Produces:** `invoiceStatusErrorText(message)` artık `INV_ISSUED_LOCKED` için şu Türkçe metni döner: `'Kesilmiş fatura değiştirilemez ve silinemez. Düzeltme için düzeltme belgesi (DZ), iptal ya da ek fatura kullanın.'`
  - Eşleme regex'i `/(SD|INV)_[A-Z_]+/`.

- [ ] **Step 1: Failing test yaz** (`statementDiscount.test.mts`): `test('kesinleşmiş fatura kilidi okunur metne çevrilir', …)`.
  - `invoiceStatusErrorText('INV_ISSUED_LOCKED')` → yukarıdaki metin.
  - `invoiceStatusErrorText('ERROR: INV_ISSUED_LOCKED (SQLSTATE 42501)')` → aynı metin.
  - `invoiceStatusErrorText('INV_OTHER')` → `'INV_OTHER'` (ham).
- [ ] **Step 2: Testi çalıştır.** `node --test modules/invoices/lib/statementDiscount.test.mts` → FAIL.
- [ ] **Step 3: Uygula.** `statementDiscount.ts`'te eşleme genişler. `statementDiscountI18n.test.mts`'teki `FINAL` dizisine `'INV_ISSUED_LOCKED'` eklenir. Metin üç sözlüğe çevrilir.
- [ ] **Step 4: Ekranı değiştir.** "Files" altındaki üç ekran değişikliğini yap. `handleMarkSent` hatası da `invoiceStatusErrorText` ile sarılır.
- [ ] **Step 5: Doğrula.** İki test dosyası PASS; tam takım `ℹ fail 0`; `tsc` 0.
- [ ] **Step 6: Commit.** Ekran ve iki lib/test dosyası adla eklenir; sözlükler yalnız kendi hunk'larıyla stage edilir. Mesaj `feat(fatura): Taslağa Dön kaldırıldı, KDV yalnız taslakta`.

---

### Task 3: Düzeltme belgesi (DB)

**Files:**
- Create: `supabase/migrations/20261107101000_duzeltme_belgesi.sql`
- Create: `supabase/rollbacks/20261107101000_duzeltme_belgesi.{before.txt,down.sql}`. Yakalanacaklar:
  - `record_statement_discount`, `delete_statement_discount`, `_sd_apply_credit` tanımları ve md5'leri,
  - `clinic_statement_discounts` kısıtları,
  - yetkiler.
- Create (scratchpad): `probe_dz.sql`

**Interfaces:**
- **Produces (şema):** `clinic_statement_discounts` tablosuna eklenenler:
  - `doc_type text NOT NULL DEFAULT 'IND' CHECK (doc_type IN ('IND','DZ'))`
  - `invoice_id uuid NULL REFERENCES invoices(id)`
  - `invoice_item_id uuid NULL REFERENCES invoice_items(id)`
  - Kısıt `clinic_statement_discounts_dz_target CHECK ((doc_type = 'DZ') = (invoice_id IS NOT NULL AND invoice_item_id IS NOT NULL))`
  - Kısıt `clinic_statement_discounts_dz_reason CHECK (doc_type <> 'DZ' OR length(btrim(coalesce(description,''))) > 0)`
  - Benzersizlik `(lab_id, doc_no)` → `(lab_id, doc_type, doc_no)`, adı `clinic_statement_discounts_lab_type_doc_no_key`.
  - İndeks `(invoice_item_id) WHERE doc_type='DZ'`.
  - Yeni tablo `clinic_correction_counters(lab_id uuid PK REFERENCES labs ON DELETE CASCADE, last_doc_no int NOT NULL)`. RLS açık, `authenticated`/`anon` için hiçbir yetki yok.
- **Produces (RPC):** `public.record_correction_document(p_invoice_item_id uuid, p_amount numeric, p_doc_date date, p_reason text, p_idempotency_key text) RETURNS jsonb`
  - Dönüş alanları: `id`, `doc_no`, `amount`, `to_invoice`, `to_credit`, `replayed`.
  - Hata dizeleri: `DZ_REASON` (boş gerekçe), `DZ_VALUE` (tutar ≤ 0 ya da kuruşa yuvarlanınca 0), `DZ_STATUS` (fatura `kesildi`/`kismi_odendi`/`odendi` değil), `DZ_CAP` (tutar > kalemin `net_total` − o kaleme önceki DZ'lerin toplamı), `DZ_IDEMPOTENCY_CONFLICT`, `Yetkiniz yok`.
  - SECURITY DEFINER; `GRANT EXECUTE TO authenticated`.
- **Değişen:**
  - `record_statement_discount`: iki `MAX(doc_no)` alt sorgusuna `AND d.doc_type = 'IND'` eklenir; başka değişiklik yok.
  - `delete_statement_discount`: satır `doc_type='DZ'` ise `RAISE EXCEPTION 'DZ_DELETE_LOCKED'` (yetki kontrolünden sonra, silmeden önce).
  - `_sd_apply_credit`: pay notu `CASE WHEN sd.doc_type='DZ' THEN 'DZ-' ELSE 'İND-' END || doc_no`. Döngü seçimi `sd.doc_type`'ı da okur. Sıralama aynı kalır.

- [ ] **Step 1: Yakala.** Files altında listelenenleri `.before.txt`'e yaz.
- [ ] **Step 2: Migration'ı yaz.** `record_correction_document` akışı:
  1. Gerekçe, tutar ve idempotency anahtarını doğrula; tutar `ROUND(p_amount,2)`.
  2. Kalem → fatura → klinik → `v_lab` zincirini oku ve yetki kapısını uygula.
  3. Aynı lab + aynı anahtar daha önce yazılmışsa ve parametreler eşleşiyorsa `replayed:true` ile eski sonucu dön; eşleşmiyorsa `DZ_IDEMPOTENCY_CONFLICT`. Bu kontrol kilitten hem önce hem sonra yapılır (desen: `record_statement_discount`).
  4. `pg_advisory_xact_lock(hashtext('sd:'||clinic_id))`, ardından fatura satırını `FOR UPDATE` ile kilitle. Durum ve tavanı kilit altında kontrol et.
  5. Numara: `clinic_correction_counters` upsert (`pg_advisory_xact_lock(hashtext('dz:'||v_lab))` altında).
  6. P6 değerleriyle satırı ekle.
  7. `siman.sd_write='on'` altında hedef faturaya `LEAST(amount, total − Σ payments.amount)` kadar `'indirim'` payı yaz (`statement_discount_id`, `notes='DZ-'||n`, kur faturadan). `> 0` değilse yazma.
  8. `_sd_apply_credit(lab, clinic, currency)` çağır.
  9. GUC'u geri yükle.
  10. `log_activity('correction_document_created','invoice', invoice_id, 'DZ-'||n, jsonb{amount, currency, invoice_item_id, reason}, v_lab, auth.uid())`.
  11. `to_invoice` = hedef faturaya yazılan pay; `to_credit` = `amount − to_invoice`.
- [ ] **Step 3: `.down.sql` yaz.**
  - Üç fonksiyonu `.before.txt`'ten geri yaz.
  - `record_correction_document` ve `clinic_correction_counters`'ı düşür.
  - Sırayla:
    1. DZ satırlarını sil (paylar zincirleme gider).
    2. Kısıtları ve sütunları düşür.
    3. Eski benzersizliği geri koy.
- [ ] **Step 4: Probu yaz.**
  - Fikstür:
    - **Fatura A** kesildi: kalem K1 = 500, K2 = 100.
    - **Fatura B** kesildi: kalem 300, aynı klinik ve para birimi.
  - Senaryolar lab yöneticisi taklidiyle koşar:
    1. K1'e DZ 200 → `to_invoice=200`, `to_credit=0`. A `paid_amount=200`, `status='kismi_odendi'`. Pay notu `'DZ-'||doc_no`. Ödeme satırı `payment_method='indirim'`.
    2. Aynı anahtarla tekrar → `replayed:true`, satır sayısı değişmez. Aynı anahtar + farklı tutar → `DZ_IDEMPOTENCY_CONFLICT`.
    3. K1'e DZ 400 → `DZ_CAP` (200 + 400 > 500). K1'e DZ 300 → başarılı (tavan tam dolar).
    4. A'yı ödeme ile kapat (`odendi`). K2'ye DZ 50 → `to_invoice=0`, `to_credit=50`. B `paid_amount` 50 artar. Ardından B'yi de kapat ve başka bir DZ yaz: `v_clinic_balance_ccy.unallocated_credit` o kadar artar ve `balance` o kadar düşer.
    5. Gerekçe `'  '` → `DZ_REASON`. Tutar 0 → `DZ_VALUE`. Taslak faturanın kalemi → `DZ_STATUS`. İptal faturanın kalemi → `DZ_STATUS`.
    6. DZ satırına `delete_statement_discount` → `DZ_DELETE_LOCKED`.
    7. `record_statement_discount` ile bir İND yaz. `doc_no`, lab'ın önceki İND en büyüğü + 1'dir; DZ numaraları etkilemez.
    8. Teknisyen taklidi → `Yetkiniz yok`.
    9. A'nın `total` değeri değişmedi; Görev 1 kilidi tetiklenmedi.
  - Sonunda `RAISE EXCEPTION 'PROBE OK'`.
- [ ] **Step 5: Probu çalıştır.** Beklenen: `ERROR: PROBE OK`.
- [ ] **Step 6: Onay al, uygula, ölç.** Soruda yazanlar: yeni belge türü, mevcut İND'lerin numarası ve davranışı aynı kalır, DZ silinemez.
  - Ölçüm:
    - `record_correction_document` ACL `authenticated=X` içerir ve `anon` içermez.
    - Değişen üç fonksiyonun md5'i migration'daki tanımla eşleşir.
    - Mevcut İND satırlarının `doc_type` değeri `'IND'`.
- [ ] **Step 7: Commit.** `feat(fatura): düzeltme belgesi (DZ) — şema ve RPC`.

---

### Task 4: DZ saf kuralları ve istemci API'si

**Files:**
- Create: `modules/invoices/lib/correctionDoc.ts`, `modules/invoices/lib/correctionDoc.test.mts`
- Modify: `modules/invoices/types.ts`:
  - `StatementDiscount` arayüzüne `doc_type: 'IND' | 'DZ'; invoice_id: string | null; invoice_item_id: string | null`.
  - Yeni `CorrectionDoc` = `StatementDiscount & { doc_type: 'DZ' }`.
- Modify: `modules/invoices/buildStatementHtml.ts`: `StatementLine` arayüzüne `docKind?: 'IND' | 'DZ'`.
- Modify: `modules/invoices/lib/statementDiscount.ts`, `modules/invoices/lib/statementDiscount.test.mts`
- Modify: `modules/invoices/api.ts`

**Interfaces:**
- **Produces** (`correctionDoc.ts`, saf, yerel içe aktarma yalnız `import type`):
  - `correctionDocNo(n: number): string` → `'DZ-' + n`
  - `correctionCap(itemNetTotal: number, priorOnItem: number): number` → `max(0, round2(itemNetTotal − priorOnItem))`
  - `correctionSplit(p: { invoiceTotal: number; paidAmount: number; amount: number }): { toInvoice: number; toCredit: number }`
    - `toInvoice = min(amount, max(0, total − paid))`; yuvarlama SQL `ROUND(x,2)` ile aynı (yarım değerler sıfırdan uzağa).
  - `validateCorrection(p: { amount: number; reason: string; cap: number }): 'DZ_VALUE' | 'DZ_CAP' | 'DZ_REASON' | null`
    - Sıra: `DZ_VALUE`, `DZ_CAP`, `DZ_REASON`.
  - `dzErrorText(code: string | null | undefined): string`. Bilinmeyen kod → `'Düzeltme belgesi kaydedilemedi.'`. Bilinen kodlar:
    - `DZ_VALUE`: `"Tutar 0'dan büyük olmalı."`
    - `DZ_CAP`: `'Tutar, kalemin kalan tutarını aşamaz.'`
    - `DZ_REASON`: `'Gerekçe zorunludur.'`
    - `DZ_STATUS`: `'Düzeltme belgesi yalnız kesilmiş faturaya yazılır.'`
    - `DZ_DELETE_LOCKED`: `'Düzeltme belgesi silinemez. Fazla yazıldıysa ek fatura kesin.'`
    - `DZ_IDEMPOTENCY_CONFLICT`: `'Bu kayıt zaten farklı bilgilerle yapılmış. Sayfayı yenileyin.'`
  - `isCorrectionShare(p: { payment_method: string; notes?: string | null }): boolean` → `payment_method === 'indirim' && /^DZ-\d+$/.test(notes ?? '')`
- **Produces** (`statementDiscount.ts`):
  - `discountStatementLines` her satıra `docKind = d.doc_type ?? 'IND'` yazar. `invoiceNo` DZ için `correctionDocNo`, İND için `statementDiscountDocNo` olur.
  - `discountTotal`, `hasAnyDiscount` ve `discountCellValue` yalnız `docKind !== 'DZ'` satırlarını sayar.
  - `discountCellValue` DZ satırı için `null` döner.
- **Produces** (`api.ts`):
  - `fetchStatementDiscounts` seçimine `doc_type, invoice_id, invoice_item_id` eklenir.
  - `recordCorrectionDocument(p: { invoiceItemId: string; amount: number; date: string; reason: string; idempotencyKey: string }): Promise<{ data: { id: string; doc_no: number; toInvoice: number; toCredit: number; replayed: boolean } | null; error: string | null }>`
    - Hata `sdServerError` ile kod ya da ham mesaj olarak döner. 40P01'de aynı anahtarla bir kez yeniden dener (desen: `recordStatementDiscount`).
  - `fetchCorrectionsForInvoice(invoiceId: string): Promise<{ data: CorrectionDoc[]; error: string | null }>` → `doc_type='DZ' AND invoice_id = invoiceId`, `doc_no` sırasıyla.

- [ ] **Step 1: Failing testleri yaz.**
  - `correctionDoc.test.mts`:
    - `correctionDocNo(17) === 'DZ-17'`.
    - `correctionCap(500, 200) === 300`; `correctionCap(500, 600) === 0`.
    - `correctionSplit({invoiceTotal:600, paidAmount:200, amount:500})` → `{toInvoice:400, toCredit:100}`.
    - `correctionSplit({invoiceTotal:600, paidAmount:600, amount:50})` → `{toInvoice:0, toCredit:50}`.
    - `validateCorrection({amount:0, reason:'x', cap:10}) === 'DZ_VALUE'`.
    - `validateCorrection({amount:11, reason:'x', cap:10}) === 'DZ_CAP'`.
    - `validateCorrection({amount:5, reason:'  ', cap:10}) === 'DZ_REASON'`.
    - `validateCorrection({amount:5, reason:'ok', cap:10}) === null`.
    - `dzErrorText('DZ_CAP')` yukarıdaki metin; `dzErrorText('zzz')` genel metin.
    - `isCorrectionShare({payment_method:'indirim', notes:'DZ-3'}) === true`.
    - `isCorrectionShare({payment_method:'indirim', notes:'İND-3'}) === false`.
  - `statementDiscount.test.mts` testi `test('DZ satırı indirim sütununa ve toplamına girmez', …)`. Biri `doc_type:'IND'` amount 100, biri `doc_type:'DZ'` amount 40 olan iki kayıt:
    - `discountStatementLines` → `invoiceNo` değerleri `['İND-1','DZ-1']`, `docKind` değerleri `['IND','DZ']`.
    - `discountTotal(lines) === 100`.
    - `discountCellValue(dzLine,'amount') === null`.
    - Yalnız DZ satırı varken `hasAnyDiscount([dzLine]) === false`.
- [ ] **Step 2: Testleri çalıştır.** İki dosya FAIL.
- [ ] **Step 3: Uygula.** Tipleri, saf fonksiyonları ve API'yi yaz.
- [ ] **Step 4: Doğrula.** İki dosya PASS; tam takım `ℹ fail 0`; `tsc` 0. `tsc`, `StatementDiscount`'u oluşturan başka yerler (fikstür ve test nesneleri) için yeni zorunlu alanları isteyebilir; oralara `doc_type:'IND', invoice_id:null, invoice_item_id:null` ekle.
- [ ] **Step 5: Commit.** `feat(fatura): DZ saf kuralları ve API`.

---

### Task 5: DZ arayüzü — fatura detayı ve ekstre

**Files:**
- Create: `modules/invoices/components/CorrectionDocModal.tsx`
- Create: `modules/invoices/correctionDocI18n.test.mts`
- Modify: `modules/invoices/screens/InvoiceDetailScreen.tsx`
- Modify: `modules/invoices/screens/ClinicStatementScreen.tsx`
- Modify: `modules/invoices/buildStatementHtml.ts` (satır etiketi)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:**
  - `recordCorrectionDocument`, `fetchCorrectionsForInvoice` (Görev 4).
  - `correctionCap`, `correctionSplit`, `validateCorrection`, `dzErrorText`, `isCorrectionShare`, `correctionDocNo` (Görev 4).
- **Produces:** `CorrectionDocModal` props:
  ```ts
  {
    visible: boolean;
    onClose(): void;
    onSaved(): void;
    invoice: Pick<Invoice, 'id' | 'invoice_number' | 'currency' | 'total' | 'paid_amount' | 'efatura_uuid' | 'efatura_status'>;
    item: { id: string; description: string; net_total: number };
    priorOnItem: number;
  }
  ```

**Davranış (spec §2.9):**
- **Fatura detayı, kalem satırı.** `!readOnly && ['kesildi','kismi_odendi','odendi'].includes(invoice.status)` ise her kalem satırında ikincil ince düğme "Düzeltme" (ikon `FilePen` ya da adaptörde varsa eşdeğer line ikon; yoksa `core/ui/icons.tsx`'e HugeIcons karşılığını ekle).
  - Kalemin altında o kaleme ait DZ'ler listelenir: `DZ-17 · −500,00 · <gerekçe> · <tarih>`. Kaynak: `fetchCorrectionsForInvoice` ile yüklenir, `invoice_item_id`'ye göre gruplanır.
  - `priorOnItem` = o kalemin DZ toplamı.
- **Pencere.**
  - Alanlar: tutar (sayı), gerekçe (çok satırlı, zorunlu), belge tarihi (varsayılan bugün; mevcut tarih alanı bileşeni kullanılır).
  - "Kalan tutar: X" satırı (`correctionCap`).
  - Önizleme satırı: "Bu faturaya: X · Alacağa: Y" (`correctionSplit`).
  - `invoice.efatura_uuid && invoice.efatura_status !== 'cancelled'` ise uyarı kutusu (`U.chipTones.warning`): `'Bu faturanın e-faturası gönderilmiş. E-fatura tarafını (iade/fiyat farkı) muhasebecinizle düzenleyin; DZ yalnız Siman içi belgedir.'`
  - "Kaydet" düğmesinin yanında `validateCorrection` / `dzErrorText` hatası satır içi görünür.
  - Anahtar pencere açılışında bir kez üretilir (`crypto.randomUUID`, yoksa zaman+rastgele).
  - Başarıda toast `'Düzeltme belgesi kaydedildi: DZ-<n>'` (`autoT('Düzeltme belgesi kaydedildi')` + `': ' + correctionDocNo(n)`), ardından `onSaved()` → detay yeniden yüklenir.
- **Fatura detayı, tahsilat listesi.** `isCorrectionShare(p)` satırının yöntem etiketi `'Düzeltme belgesi'` olur; not alanı (`DZ-n`) görünür. Bu satırda "Tahsilatı geri al" gösterilmez; mevcut `indirim` kuralı neyse aynısı.
- **Ekstre (`ClinicStatementScreen`).** `docKind === 'DZ'` satırı:
  - Açıklama: `autoT('Düzeltme belgesi') + ' · ' + <fatura no> + ' · ' + description`. Fatura numarası `invoice_id` ile o ekrandaki faturalardan bulunur; bulunamazsa atlanır.
  - Satır açılınca silme eylemi görünmez.
  - Tür etiketi (satır ~254): `'Düzeltme'`.
- **PDF (`buildStatementHtml.ts`).** DZ satırının cari türü (`kind`) `'discount'` kalır ama etiket `autoT('Düzeltme')` olur; İndirim sütunu hücresi boştur. Görev 4'teki `discountCellValue` bunu zaten sağlar.

- [ ] **Step 1: Failing i18n parite testini yaz** (`correctionDocI18n.test.mts`).
  - Bu görevin bütün yeni Türkçe metinleri ve `dzErrorText`'in altı kodu + genel metni, `auto.en/de/fa.json` üçünde de anahtar olarak var mı (desen: `statementDiscountI18n.test.mts`).
- [ ] **Step 2: Testi çalıştır.** FAIL.
- [ ] **Step 3: Uygula.** Pencereyi, fatura detayı değişikliklerini, ekstre ve PDF etiketlerini yaz. Çevirileri üç sözlüğe ekle.
- [ ] **Step 4: Doğrula.** Parite testi PASS; tam takım `ℹ fail 0`; `tsc` 0.
- [ ] **Step 5: Görsel kontrol (salt okunur).**
  - Mock düzeni (memory `project_mocked_supabase_browser_harness`) ile kesilmiş bir faturada pencereyi aç. Açık ve koyu temada, masaüstü ve 375px'te ekran görüntüsü al. Kaydet'e canlı hesapta basma.
  - Kontrol listesi:
    - Pencere ortada ve arkası bulanık.
    - Hata düğmenin yanında.
    - Koyu temada beyaz patlama yok.
    - Taslak faturada "Düzeltme" görünmüyor.
- [ ] **Step 6: Commit.** `feat(fatura): düzeltme belgesi arayüzü (fatura detayı, ekstre, PDF)`. Sözlükler yalnız kendi hunk'larıyla stage edilir.
