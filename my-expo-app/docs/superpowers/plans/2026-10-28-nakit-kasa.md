# Nakit Kasa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siman, TL ve EUR nakit kasalarında "şu an ne kadar nakit olmalı" sorusunu cevaplar.

**Architecture:**
- Nakit tahsilat, makbuz satırı ve gider kayıtları, DEFINER tetikleyicilerle `cash_movements`'a kendiliğinden yazılır. Kayıt kaynağa `(ref_type, ref_id)` ile tekil bağlıdır.
- Açılış ve sayım bir anı kaydeder. Açılıştan önce oluşturulmuş kaynaklar kasaya yazılmaz.
- Mevcut "Kasa / Banka" ekranı nakit kasa odaklı hâle gelir.
- Dört formda ödeme yöntemi zorunlu seçime döner.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Expo + react-native-web, `node --test` (.mts).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-28-nakit-kasa-design.md`

## Global Constraints
- Veritabanı değişikliği beş adımlı protokolle yapılır:
  1. `.before.txt`: canlı tanım ve md5;
  2. `.down.sql`;
  3. geri alınan deneme (`gen_probe.py`, aşamalar ÖNCE / SONRA / GERİ ALMA);
  4. AskUserQuestion ile onay;
  5. `supabase db query --linked -f <mutlak yol>` ile uygulama ve canlı ölçüm.
- Denemelerde gönderim yapan fonksiyonlar çağrılmaz.
- Yeni tablo için:
  - `lab_id` alanı `labs(id)`'e FK'dir;
  - RLS açılır;
  - yazmalar istemciden REVOKE edilir.
- DEFINER fonksiyonlarda `set search_path to 'public'` kullanılır.
- Kaynak tablolardaki mevcut fonksiyon ve tetikleyiciler değiştirilmez; yalnız yeni tetikleyici eklenir. Kaynak tablolar `payments`, `clinic_receipts`, `clinic_receipt_lines` ve `expenses`.
- Kasa tetikleyicisi hata verirse kaynak yazımı ASLA engellenmez: `exception when others then raise warning`.
- Para birimi kaydın kendi para birimidir; sabit ₺ yazılmaz. Formatlayıcılar `(Number(n)||0)` ile yazılır.
- Her yeni metin aynı anda tr, en, de ve fa dillerine eklenir (`scratchpad/prova/i18n_add.mjs`). Veritabanına yazılan Türkçe metin "Sabit · değişken" biçimindedir.
- Arayüz kuralları:
  - koyu tema `useInkUI` tokenlarıyla;
  - pencereler ortada açılır ve arka planı `U.modalOverlay` olur;
  - her düğmede GlassTooltip vardır;
  - hata mesajı düğmenin yanında gösterilir.
- `npx tsc --noEmit --incremental false` sonucu 0 hata olmalı. Test takımı: `bash scratchpad/search/suite.sh`.
- Lazy rota kuralı: lazyRoute hedefi olan ekran modülü statik içe aktarılmaz.
- Commit yok (kullanıcı istemedikçe). Deploy yalnız "deploy" denince.

## Review Focus
1. Nakit tahsilat sonradan havale yapılırsa kasa hareketi silinmeli; yeniden nakit yapılırsa geri gelmeli. Pinlenir: Task 2, adım 2, senaryo C.
2. Makbuz faturalara dağıtılınca oluşan `payments` (`receipt_id` dolu) kasaya ikinci kez yazılmamalı. Pinlenir: Task 2, senaryo D.
3. Kasa açılışından önce oluşturulmuş nakit kayıtlar kasaya yazılmamalı. Pinlenir: Task 2, senaryo A.
4. Kurye ücreti, alış faturası ve düzenli giderden üretilmiş nakit giderler kasaya düşmemeli; nakit maaş ve avans düşmeli. Pinlenir: Task 2, senaryo E.
5. Teknisyen ve kurye kasa tablolarını okuyamamalı; istemci otomatik hareketi silememeli. Pinlenir: Task 1, senaryo R.

---

### Task 1: Şema, yetki, düzenli gider işareti (SQL)

**Files:**
- Create: `supabase/migrations/20261028150000_nakit_kasa_sema.sql`
- Create: `supabase/rollbacks/20261028150000_nakit_kasa_sema.{before.txt,down.sql}`
- Test: `scratchpad/kasa/t1_measure.sql` (ÖNCE / SONRA / GERİ ALMA)

**Interfaces:**
- Produces:
  - `cash_accounts.is_drawer boolean not null default false`;
  - `cash_accounts.opened_at timestamptz`;
  - tekil kısmi indeks `ux_cash_drawer (lab_id, currency) where is_drawer and is_active`;
  - `cash_movements` CHECK `category` listesine `transfer` ve `sayim` eklenir;
  - tekil kısmi indeks `ux_cash_movement_ref (ref_type, ref_id) where ref_type is not null`.
- Produces: tablo `cash_counts`:
  - sütunlar `id`, `lab_id`, `account_id`, `kind`, `counted_at`, `counted_amount`, `expected_amount`, `diff`, `movement_id`, `created_by`;
  - `lab_id` → `labs(id)`;
  - `account_id` → `cash_accounts(id)`, on delete cascade;
  - `kind`: `acilis` ya da `sayim`;
  - `counted_at timestamptz default now()`;
  - `movement_id` → `cash_movements(id)`, on delete set null;
  - yalnız SELECT kuralı var; yazma yalnız RPC ile.
- Produces:
  - `expenses.recurring_template_id uuid`;
  - BEFORE INSERT tetikleyicisi `trg_expense_recurring_mark`: nottaki `[otomatik · şablon: <uuid>]` işaretini sütuna yazar;
  - mevcut satırlara aynı işaretle geriye dönük doldurma.
- Produces: RLS (eski `*_lab_own` FOR ALL kuralları kalkar):
  - `cash_accounts`:
    - okuma: `is_platform_admin() OR (lab_id = get_my_lab_id() AND (has_permission('view_cash') OR has_permission('manage_cash')))`;
    - yazma: `… AND has_permission('manage_cash') AND NOT is_drawer`. Çekmece yalnız RPC ile açılır; açılış tutarı ve kesim anı istemciden değiştirilemez.
  - `cash_movements`:
    - okuma: aynı kural;
    - INSERT, UPDATE ve DELETE ek olarak `ref_type IS NULL` şartı taşır, böylece otomatik hareketler yalnız DEFINER ile yazılır.
  - Mevcut elle hareket formunun (`CashScreen.tsx:937` `createMovement`) `ref_type` göndermediği doğrulandı; bu şart onu bozmaz.
- `v_cash_account_summary` zaten `security_invoker=on`'dur (canlıda doğrulandı); dokunulmaz.

- [ ] **Step 1: Ölçüm betiğini yaz.** Senaryolar:
  - **R:** sahip `O` (`f6817e96…`), yönetici ve teknisyen `T1` için `cash_accounts` okuma ve ekleme denemesi.
    - Beklenen SONRA: sahip ve yönetici okur ve ekler; teknisyen 0 satır görür, eklemede RLS hatası alır.
    - İstemci olarak `ref_type='payment'` hareket ekleme: SONRA'da reddedilir.
    - Sahip olarak `is_drawer=true` hesap ekleme ve çekmecenin `opening_balance` değerini güncelleme: SONRA'da 0 satır ya da RLS hatası. `is_drawer=false` banka hesabı ekleme: kabul.
  - **M:** notunda `[otomatik · şablon: <uuid>]` olan bir gider eklenir. Beklenen SONRA: `recurring_template_id` dolu; ÖNCE'de sütun yok.
  - **U:** aynı lab ve para biriminde ikinci aktif çekmece. Beklenen SONRA: tekillik ihlali.
  - **Bütün labları kapsayan ölçüm:** `cash_accounts` ve `cash_movements` sayısı ile bunları kullanan rol dağılımı. Kural sıkılaşmadan etkilenecek başka lab var mı diye bakılır.
- [ ] **Step 2: Migration'ı, geri alma dosyasını ve "önce" kaydını yaz.** Kaynak tablolardaki mevcut tanımlara dokunulmaz.
- [ ] **Step 3: Denemeyi çalıştır.** Komut: `python3 scratchpad/gecmis/gen_probe.py scratchpad/kasa <mig> <down> scratchpad/kasa/t1_probe.sql scratchpad/kasa/t1_measure.sql`, ardından `supabase db query --linked -f …`.
  - Beklenen: ÖNCE'de teknisyen okur ve sütunlar yok; SONRA, R/M/U beklenen sonuçları verir; GERİ ALMA, ÖNCE ile aynı md5'leri verir.
  - Başka bir lab kasayı teknisyen yetkisiyle kullanıyorsa onaydan önce kullanıcıya bildirilir.
- [ ] **Step 4: Onay al, uygula ve canlıda ölç.** Ölçüm: md5'ler, kural listesi, `ux_` indeksleri.

### Task 2: Kendiliğinden kasa hareketi (SQL)

**Files:**
- Create: `supabase/migrations/20261028151000_nakit_kasa_senkron.sql`
- Create: `supabase/rollbacks/20261028151000_nakit_kasa_senkron.{before.txt,down.sql}`
- Test: `scratchpad/kasa/t2_measure.sql`

**Interfaces:**
- Consumes: Task 1 sütunları ve indeksleri.
- Produces:
  - `_cash_drawer(p_lab uuid, p_currency text) returns public.cash_accounts`: o lab ve para birimi için aktif çekmece, yoksa NULL;
  - `_cash_sync(p_ref_type text, p_ref_id uuid) returns void`. `p_ref_type` değerleri `payment`, `clinic_receipt_line` ya da `expense`. Fonksiyon olması gereken hareketi hesaplar, `(ref_type, ref_id)` üzerinden upsert eder, olmaması gerekiyorsa siler. DEFINER olup istemciye kapalıdır.
- Produces: tetikleyiciler (hepsi AFTER, satır başına; hata kaynak yazımını engellemez):
  - `payments`: INSERT, UPDATE, DELETE;
  - `clinic_receipt_lines`: INSERT, UPDATE, DELETE;
  - `clinic_receipts`: UPDATE OF `payment_method`, `receipt_date` → satırlarını yeniden senkronlar. Silmede satırlar cascade ile gider (`clinic_receipt_lines_receipt_id_fkey ON DELETE CASCADE`, canlıda doğrulandı); satır tetikleyicisi hareketi siler. Makbuzun iptal durumu yoktur, yalnız silinir.
  - `invoices`: UPDATE OF `status` → o faturanın `payments` satırlarını yeniden senkronlar. Fatura `iptal` olunca tahsilat hareketi kalkar, iptal geri alınınca geri gelir.
  - `expenses`: INSERT, UPDATE, DELETE. Giderin iptal durumu yoktur.
- **Kural:**

| Kaynak | Hareket varsa koşulu | Hareket |
|---|---|---|
| `payments` | yöntem `nakit`; `receipt_id IS NULL`; faturanın `status <> 'iptal'`; çekmece `(lab, currency)` var; `created_at > opened_at` | giriş, `tahsilat`, tarih `payment_date`, açıklama `Tahsilat · <fatura no>` |
| `clinic_receipt_lines` | makbuz yöntemi `nakit`; çekmece `(receipt.lab_id, line.currency)` var; `line.created_at > opened_at` | giriş, `tahsilat`, tarih `receipt_date`, açıklama `Makbuz · <klinik adı>` |
| `expenses` | yöntem `nakit`; `purchase_invoice_id`, `delivery_id` ve `recurring_template_id` boş; çekmece `(lab, currency)` var; `created_at > opened_at` | çıkış, tarih `expense_date`, açıklama `Gider · <description>` |

  - `payments.lab_id` NULL ise lab `invoices.lab_id` üzerinden bulunur.
  - Gider kategorisi eşlemesi:
    - `salary_payment_id` ya da `advance_id` dolu → `maas`;
    - kategori `personel` → `maas`;
    - kategori `kira`, `malzeme` ya da `vergi` → kendi adıyla;
    - diğerleri → `odeme`.

- [ ] **Step 1: Ölçüm betiğini yaz.** Hepsi geri alınan bir alt işlemde, sahip `O` olarak yürür. Önce TRY ve EUR çekmeceleri doğrudan INSERT ile açılır; `opened_at = now() - 1 minute`.
  - **A:** `opened_at`'tan önce oluşturulmuş nakit gider (`created_at` geri çekilmiş). Beklenen: hareket 0.
  - **B:** nakit TRY tahsilat → 1 giriş, TRY çekmecesi, tutar eşit. EUR faturaya nakit tahsilat → EUR çekmecesi.
  - **C:** B'deki tahsilat `havale` yapılınca hareket 0; tekrar `nakit` yapılınca 1; tutar değişince hareket tutarı güncellenir. Fatura `iptal` yapılınca 0, eski durumuna dönünce 1. Tahsilat silinince 0.
  - **D:** TRY 100 + EUR 50 satırlı nakit makbuz → 2 giriş. Makbuz `alloc_receipt_to_invoices` ile dağıtılır; `receipt_id` dolu payments oluşur. Beklenen: toplam hareket hâlâ 2. USD satırı eklenirse hareket eklenmez.
  - **E:** nakit giderler: elle → 1 çıkış; `salary_payment_id` dolu → 1 çıkış (`maas`); `delivery_id` dolu → 0; `purchase_invoice_id` dolu → 0; şablon işaretli not → 0.
  - **F:** çekmece özeti: `v_cash_account_summary.balance = opening + giriş − çıkış`.
  - **G:** tetikleyici hatası kaynağı engellemez. Örnek: çekmece `is_active=false` iken tahsilat kaydı başarıyla yazılır.
  - Beklenen ÖNCE: hareket yok. SONRA: yukarıdaki sayılar. GERİ ALMA: ÖNCE ile aynı.
- [ ] **Step 2: Migration'ı ve geri alma dosyasını yaz.** Yeni fonksiyonlar ve tetikleyiciler eklenir; mevcut kaynak tetikleyicileri değişmez.
- [ ] **Step 3: Denemeyi çalıştır ve senaryoları karşılaştır.** Komut Task 1 ile aynı kalıptadır.
- [ ] **Step 4: Onay al ve uygula.** Canlı ölçüm: md5'ler, tetikleyici listesi, Nexadent'te hareket sayısı. Henüz çekmece açılmadığı için 0 olmalı.

### Task 3: Açılış ve sayım RPC'leri (SQL)

**Files:**
- Create: `supabase/migrations/20261028152000_nakit_kasa_rpc.sql`
- Create: `supabase/rollbacks/20261028152000_nakit_kasa_rpc.{before.txt,down.sql}`
- Test: `scratchpad/kasa/t3_measure.sql`

**Interfaces:**
- Consumes: Task 1 ve Task 2.
- Produces:
  - `cash_open_drawer(p_currency text, p_amount numeric) returns uuid`:
    - `manage_cash` şartı vardır; para birimi yalnız `TRY` ya da `EUR` olabilir; tutar ≥ 0 olmalıdır;
    - aynı lab ve para biriminde aktif çekmece varsa `'Bu para biriminde kasa zaten açık'` hatası verir;
    - `cash_accounts` satırı oluşturur: ad `Nakit Kasa · <para birimi>`, `account_type='kasa'`, `is_drawer=true`, `opening_balance=p_amount`, `opened_at=now()`;
    - `cash_counts` satırına `kind='acilis'` yazar.
  - `cash_count_drawer(p_account uuid, p_counted numeric) returns jsonb` (`{expected, diff, movement_id}`):
    - `manage_cash` şartı vardır;
    - `expected` değeri `v_cash_account_summary.balance` alanından alınır;
    - fark sıfır değilse `category='sayim'` hareket yazılır: yön farkın işaretine göre, açıklama `Sayım farkı · <tarih>`, `ref_type='cash_count'`, `ref_id` sayım kimliği;
    - `cash_counts` satırına `kind='sayim'` yazılır.
  - `cash_unposted_summary() returns table(currency text, cnt int, total numeric)`: lab'ın ilk çekmece açılışından sonra oluşturulmuş, Task 2 kuralına göre kasaya düşmesi gereken ama çekmecesi olmayan para birimindeki (ör. USD) tahsilat, makbuz satırı ve giderleri toplar. `view_cash` ya da `manage_cash` şartı vardır.
- Açılış anı `now()` olur; spec'teki "kesim anı" bir zaman damgasıdır, bu yüzden açılış penceresi ayrıca tarih sormaz.
- Bankaya yatırma RPC değildir. İstemci `cash_movements`'a `direction='cikis'`, `category='transfer'`, `ref_type NULL` ile yazar; kural `manage_cash` şartını arar.

- [ ] **Step 1: Ölçüm betiğini yaz.**
  - Sahip ile TRY 1000 açılış → çekmece ve açılış sayımı oluşur.
  - İkinci TRY açılışı reddedilir.
  - `USD` açılış reddedilir.
  - Teknisyen ile açılış reddedilir.
  - Sayım: beklenen 1000, sayılan 950 → fark −50, `sayim` çıkış hareketi; özet bakiye 950. Sayılan beklenene eşitse hareket yok.
  - `cash_unposted_summary`: nakit USD makbuz satırı → (USD, 1, tutar).
- [ ] **Step 2: Migration'ı yaz, dene, onay al, uygula ve ölç.** Aynı protokol.

### Task 4: İstemci modeli ve API

**Files:**
- Create: `modules/cash/drawerModel.ts`, `modules/cash/drawerModel.test.mts`
- Modify: `modules/cash/api.ts`

**Interfaces:**
- Produces (`drawerModel.ts`, saf, içe aktarmasız):
  - `type DrawerCurrency = 'TRY' | 'EUR'`;
  - `drawerFor(accounts: { currency: string; is_drawer?: boolean; is_active: boolean }[], c: DrawerCurrency)`: o para birimindeki aktif çekmeceyi ya da `null` döndürür;
  - `countDiff(counted: number, expected: number): { diff: number; direction: 'giris' | 'cikis' | null }`: iki ondalığa yuvarlar; fark sıfırsa `null`;
  - `movementSource(m: { ref_type: string | null })`: `'tahsilat' | 'makbuz' | 'gider' | 'sayim' | 'elle'` döndürür;
  - `isEditable(m: { ref_type: string | null }): boolean`: yalnız `ref_type` boşsa `true`.
- Produces (`api.ts`):
  - `fetchDrawers()`: `v_cash_account_summary` satırları ve `is_drawer`, `opened_at`, ayrıca her çekmecenin son sayımı `last_count: { counted_at: string; diff: number } | null` (`cash_counts`, `kind='sayim'`, en yeni);
  - `openDrawer(currency: DrawerCurrency, amount: number)`: `rpc('cash_open_drawer')`;
  - `countDrawer(accountId: string, counted: number)`: `rpc('cash_count_drawer')`;
  - `depositToBank(accountId, amount, date, note?)`: `createMovement` kalıbıyla, kategori `transfer`, açıklama `note || 'Bankaya yatırıldı'`;
  - `fetchUnposted()`;
  - `MovementCategory`'ye `transfer` ve `sayim` eklenir; etiketler `Bankaya yatırma` ve `Sayım farkı`.

- [ ] **Step 1: Testleri yaz.**
  - `countDiff(950, 1000)` → `{diff: -50, direction: 'cikis'}`;
  - `countDiff(1000.004, 1000)` → `{diff: 0, direction: null}`;
  - `countDiff(1200, 1000)` → `{diff: 200, direction: 'giris'}`;
  - `drawerFor`: pasif çekmece ve `is_drawer=false` olan kasa yok sayılır;
  - `movementSource({ref_type: 'clinic_receipt_line'})` → `'makbuz'`;
  - `isEditable({ref_type: 'expense'})` → `false`.
- [ ] **Step 2: Testi çalıştır.** Komut: `node --test modules/cash/drawerModel.test.mts`. Beklenen: modül bulunamadığı için FAIL.
- [ ] **Step 3: `drawerModel.ts`'i yaz ve `api.ts`'e eklemeleri yap.**
- [ ] **Step 4: Testi ve tür denetimini çalıştır.** Komut: `node --test modules/cash/drawerModel.test.mts` ve `tsc`. Beklenen: PASS, 0 hata.

### Task 5: Kasa ekranı (nakit odaklı)

**Files:**
- Modify: `modules/cash/screens/CashScreen.tsx`
- Create:
  - `modules/cash/components/DrawerCard.tsx`;
  - `modules/cash/components/OpenDrawerModal.tsx`;
  - `modules/cash/components/CountDrawerModal.tsx`;
  - `modules/cash/components/DepositModal.tsx`.

**Interfaces:**
- Consumes: Task 4 API ve modeli.
- **Davranış:**
  - **Çekmece kartları:** üstte iki kart (TL, EUR). Her kart beklenen bakiyeyi, son sayım tarihini ve farkını gösterir; "Sayım yap" ve "Bankaya yatır" düğmeleri vardır. Kasa yoksa kartta "Kasayı aç" düğmesi olur; açılış penceresi sayılan tutarı sorar.
  - **Sayım penceresi:** "Sayımdan önce bugünkü nakit tahsilat ve giderlerin girildiğinden emin olun" uyarısını, beklenen tutarı ve canlı fark önizlemesini (`countDiff`) gösterir.
  - **Hareket listesi:** seçili çekmecenin hareketleri gösterilir. Satırda tarih, açıklama, kaynak çipi (`movementSource`) ve tutar yer alır.
    - Otomatik harekette silme düğmesi yoktur. Dokununca kaynağa gidilir: tahsilat → fatura detayı, makbuz → klinik bakiyesi, gider → gider detayı (panel-agnostik `/${seg}/…`).
  - **Kasası olmayan nakit:** `fetchUnposted` boş değilse küçük bir uyarı satırı gösterilir: "Kasası olmayan nakit: USD 2 kayıt".
  - **Banka hesapları ve elle hesap yönetimi:** mevcut özellikler "Diğer hesaplar" başlıklı kapalı bölüme taşınır; davranışları aynı kalır. Çekmeceler bu listede görünmez, düzenle/sil düğmesi almaz (RLS zaten reddeder).
  - Ekranda "Bu kasa, Siman'a girilen nakit tahsilat ve giderlerden hesaplanır" bilgisi yer alır.
- [ ] **Step 1: Bileşenleri ve ekranı yaz.** Dört dil, koyu tema ve tooltip kurallarına uyulur.
- [ ] **Step 2: Doğrula.**
  - `tsc` 0 hata; test takımı yeşil; sözlükler eşit (`missing_i18n` betiği kasa dosyalarına uyarlanır).
  - Önizlemede bilgi ekranları açılır.
  - Canlı hesapta açılış, sayım ya da yatırma işlemine BASILMAZ. Görsel kontrol için `/dev/scan-widget`'a `?view=cash` eklenir ve kartlar sahte veriyle çizilir.

### Task 6: Ödeme yönteminin seçilmesi zorunlu

**Files:**
- Modify:
  - `modules/invoices/screens/InvoiceDetailScreen.tsx` (~1395–1413: tahsilat penceresi);
  - `modules/invoices/screens/InvoicesListScreen.tsx` (~1302–1320: `BulkPaymentModal`);
  - `modules/invoices/components/ClinicReceiptModal.tsx` (58, 82, 87);
  - `modules/expenses/screens/ExpensesScreen.tsx` (952, 968).

**Interfaces:**
- **Davranış:**
  - **Yeni kayıt:** yöntem durumu `null` başlar; hiçbir seçenek seçili gelmez.
  - **Kaydet:** yöntem seçilmeden kaydet çalışmaz. Düğmenin yanında "Ödeme yöntemini seçin" yazar.
  - **Düzenleme:** kaydın mevcut yöntemi korunur.
- [ ] **Step 1: Dört formu değiştir.**
- [ ] **Step 2: Doğrula.**
  - `tsc` 0 hata.
  - Önizlemede her form yeni kayıtta açılır; yöntemsiz kaydet düğmesinin uyarı verdiği görülür. Kaydetmeye basılmaz, yalnız açılır ve kapanır.
  - Yöntem seçilince uyarı kalkar.

### Task 7: Kapanış
- [ ] Bütün işin bağımsız incelemesi yapılır; Review Focus ve `Ruling:` satırları incelemeciye verilir.
- [ ] Yol haritasında madde 8 güncellenir. `project_cash_drawer.md` hafıza kaydı ve MEMORY.md satırı yazılır.
