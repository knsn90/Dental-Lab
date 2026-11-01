# Denetim düzeltmeleri — 1. dalga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab yöneticisi denetiminin 1. dalgasını (güvenlik, para hatası, mobil menü, günlük kullanım, dil, KVKK) çalışan sistemi bozmadan, dört bağımsız paket hâlinde düzeltmek.

**Architecture:** Her paket kendi başına yayınlanır ve doğrulanır. Veritabanı işleri ayrı migration'larda yapılır; her birinin geri alma betiği vardır ve önce geri alınan işlemde rol rol denenir. Ekran işleri, saf yardımcılar (testli, içe aktarma yapmayan `.ts`) ile küçük bileşen değişikliklerine ayrılır. Davranışı değişen her yer görevde yazılı.

**Tech Stack:** Expo + react-native-web, TypeScript, Supabase (Postgres RLS, plpgsql), `node --test` (saf yardımcılar), puppeteer + yerleşik tarayıcı paneli (görsel kontrol).

**Spec:** `my-expo-app/docs/lab-yoneticisi-raporu/00-ozet.md` (+ alan raporları 1–5). Yol haritası: `2026-10-24-denetim-yol-haritasi.md`.

## Global Constraints

- **Kullanıcı kuralı:** "çalışan sistemi bozmadan aşama aşama". Bir görev doğrulanmadan sonrakine geçilmez. Mevcut akış korunur, eksikler eklenir.
- **Çeviri:** tr + en + de + fa aynı anda (`core/i18n/locales/auto.{en,de,fa}.json`, anahtarlı metinler `{tr,en,de,fa}.json`).
  - Şablon metinler `autoT()` ile yazılır.
  - Büyük harf, çeviriden SONRA yapılır: `autoT(x).toLocaleUpperCase(localeTag())`.
- **Görünüm:**
  - Koyu tema aynı anda yapılır (`useInkUI` / `useMobileTokens` token'ları); açık temada değer değişmez.
  - Emoji yok, ✓ da yok. İkonlar `core/ui/icons` üzerinden gelir.
  - Hata mesajı, eylem düğmesinin yanında gösterilir (footer); ScrollView'un dibinde değil.
  - Onay için `core/ui/ConfirmDialog` kullanılır (`ConfirmState`). `window.confirm` kullanılmaz.
- **Doğrulama:** `cd my-expo-app && npx tsc --noEmit -p .` → 0 hata.
  - Saf yardımcılar içe aktarma yapmayan `.ts` dosyalarında yazılır.
  - Testleri `.test.mts`; repo kökünden `node --test my-expo-app/<yol>` ile çalışır.
- **Veritabanı:**
  - Migration önce geri alınan işlemde denenir:
    `begin; <migration>; set_config('request.jwt.claims', …); set local role authenticated; …; rollback;`
  - Deneme şu komutla çalıştırılır: `supabase db query --linked -f <mutlak yol>` (`my-expo-app` içinde).
  - Canlı tanım değiştirilmeden önce kaydedilir (`pg_get_functiondef` / `pg_policies`).
  - Uygulamadan önce kullanıcıdan AÇIK onay alınır.
- **Yayın ve commit:**
  - Kullanıcı "deploy" demeden yayın yapılmaz.
  - Commit kullanıcı istemedikçe yapılmaz; çalışma ağacında 229 commit'lenmemiş değişiklik var.
- **Ortak bileşenler:** `MoreMenuSheet` ve `useChatMessages` tüm panellerde kullanılır. Bu planda bilerek değiştiriliyor; etkisi görevde yazılı.

## Review Focus

1. **Teknisyen kendi kaydıyla çalışmaya devam etmeli.** RLS sonrası teknisyenin avans talebi, avans geçmişi ve prim ekranları kendi kayıtlarını görmeye devam etmeli; başkasınınkini görmemeli. Görev 1–3'teki rol denemeleri bunu sınar.
2. **Ekstrede tarih + tür filtresi birlikte.** Açılış ve kapanış bakiyesi yalnız tarih penceresinden hesaplanmalı; "yalnız tahsilatlar" seçilince bile borç rakamı değişmemeli. Görev 4 testi.
3. **Mobil menü yalnız bozuk yerde değişmeli.** Telefonda ana ekrana eklenmiş uygulamada (PWA/standalone) ve masaüstünde değişmemeli; yalnız mobil tarayıcıda düzelmeli. Görev 5 doğrulaması.
4. **Fatura numarası yazımı.** "FTR 001", " ftr001 " ve "FTR-001" gibi yazımlar karşılaştırılmalı. Boş numarada mükerrer kontrolü yapılmamalı. Görev 6 testi.
5. **Bilinmeyen adres parametresi.** `?filter=xyz` ya da `?status=foo` yok sayılmalı; liste "Tümü" ile açılmalı. Görev 7 testi.

---

## PAKET 1 — Güvenlik (maaş ve personel verisi)

Ortak hazırlık (Görev 1'den önce bir kez):

- [ ] **Rol hesaplarını çıkar.** NexaDent (`243ef1db-9853-424b-8292-0025abfca436`) içinden her rol için bir uid seç: admin, lab_manager, technician, courier. Yalnız uid ve rol kullan, isim yazma.

  ```sql
  select id, user_type, role from public.profiles where lab_id = '243ef1db-9853-424b-8292-0025abfca436';
  ```
- [ ] **Canlı kuralları kaydet.** Etkilenecek tabloların kurallarını `pg_policies`'ten tam ifadeleriyle al ve `supabase/rollbacks/20261024-hr-rls.before.txt` dosyasına yaz. Tablolar: `salary_payments`, `employee_advances`, `employee_payroll`, `payroll_items`, `performance_bonuses`, `employees`, `employee_advance_requests`.
- [ ] **Teknisyen ekranlarını tara.** Ekip özetinin (`modules/employees/screens/EmployeesScreen.tsx`) lab müdürüne maaş ya da maaş ödemesi gösterip göstermediğini kodda kontrol et; lab müdüründe `view_salaries` yetkisi yok. Gösteriyorsa DUR: kullanıcıya "lab müdürü rolüne maaş görme yetkisi verilsin mi" diye sor. Bu, rol yetkisi değişikliğidir.

### Task 1: Maaş, bordro, avans ve prim tablolarının okuma kuralları

**Files:**
- Create: `my-expo-app/supabase/migrations/20261024110000_hr_payroll_read_rls.sql`
- Create: `my-expo-app/supabase/rollbacks/20261024110000_hr_payroll_read_rls.down.sql`

**Interfaces:**
- Produces: `public.my_employee_id() returns uuid`. STABLE, SECURITY DEFINER, `search_path = public`. Çağıranın aktif personel kaydı; yoksa NULL. Görev 2 ve 3 bunu kullanır.
- Produces: `public.can_view_payroll() returns boolean`. STABLE, SECURITY DEFINER.

- [ ] **Step 1: Migration'ı yaz.**
  - `my_employee_id()`: `core/api/resolveEmployee.ts` ile aynı kural. Önce e-posta eşleşmesi; yoksa aynı lab'da TEK tam-ad eşleşmesi.

    ```sql
    select e.id
    from public.employees e
    join public.profiles p on p.id = auth.uid()
    where e.lab_id = p.lab_id and e.is_active
      and (
        (nullif(lower(btrim(e.email)), '') is not null
          and lower(btrim(e.email)) = lower(btrim(p.email)))
        or (
          lower(btrim(e.full_name)) = lower(btrim(p.full_name))
          and not exists (select 1 from public.employees e2
                          where e2.lab_id = p.lab_id and e2.is_active and e2.id <> e.id
                            and lower(btrim(e2.full_name)) = lower(btrim(p.full_name)))
        )
      )
    order by (lower(btrim(e.email)) = lower(btrim(p.email))) desc nulls last
    limit 1;
    ```
  - `can_view_payroll()` gövdesi:
    `select is_platform_admin() or has_permission('view_salaries') or has_permission('manage_salaries') or has_permission('manage_finance')`.
  - Her iki fonksiyon için: `revoke all … from public, anon; grant execute … to authenticated;`.
  - Yalnız SELECT kurallarını değiştir. Yazma kuralları dokunulmadan kalır, çünkü zaten `manage_*` yetkisine bağlı.

    | Tablo | Yeni SELECT kuralı (adı aynı kalır) |
    |---|---|
    | `salary_payments` (`salary_payments_read`) | `is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id()))` |
    | `employee_advances` (`employee_advances_read`) | aynı ifade |
    | `employee_payroll` (`employee_payroll_read`) | aynı ifade |
    | `payroll_items` (`payroll_items_read`) | `is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or payroll_id in (select id from public.employee_payroll where employee_id = my_employee_id())))` |
    | `performance_bonuses` (`performance_bonuses_read`) | `is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or payroll_id in (select id from public.employee_payroll where employee_id = my_employee_id())))` |

  - Her kural için `drop policy if exists <ad> on <tablo>; create policy <ad> on <tablo> for select to authenticated using (…);` yaz.
- [ ] **Step 2: Geri alma betiğini yaz.**
  - Önceki 5 SELECT kuralını birebir geri kur. İfade hazırlıktaki `before.txt` dosyasından alınır; örnek: `is_platform_admin() OR (lab_id = get_my_lab_id())`.
  - İki yeni fonksiyonu düşür: `drop function if exists`.
- [ ] **Step 3: Rol rol, geri alınan işlemde dene.** Dosya: `begin; <migration>; …; rollback;`. Her rol için `set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true); set local role authenticated;`.
  - admin: 5 tablonun satır sayısı, migration öncesi sayıma eşit.
  - technician: `salary_payments`'ta yalnız `employee_id = my_employee_id()` olan satırlar; başkasına ait satır sayısı 0. `employee_advances` için de aynı.
  - lab_manager: `can_view_payroll()` false ise `salary_payments`'ta yalnız kendi satırı.
  - courier: technician ile aynı.

  Beklenen: `raise exception 'PROBE …'` çıktısında bu sayılar.
- [ ] **Step 4: Kullanıcıdan onay al.** Ne değişiyor, hangi rol neyi görmeyecek, geri alma betiğinin yolu. Onay gelmeden uygulama.
- [ ] **Step 5: Uygula ve canlıda doğrula.**
  - `supabase db query --linked -f …/20261024110000_hr_payroll_read_rls.sql` çalıştır.
  - Sonra `pg_policies` ile 5 SELECT kuralının yeni ifadeyi taşıdığını gör.
  - Step 3'teki teknisyen denemesini bu kez rollback'li ama migration'sız (canlı) çalıştır; aynı sonuç çıkmalı.
- [ ] **Step 6: Ekran kontrolü.** Kod okumasıyla şu ekranların yalnız kendi verisini ya da yetkili veriyi çektiğini kontrol et:
  - teknisyen avans talepleri: `modules/advance-requests/screens/TechAdvanceRequestsScreen.tsx`
  - prim: `modules/payroll/bonus/screens/TechnicianBonusScreen.tsx`
  - Finans → Maaşlar ve Avans Talepleri (admin)

### Task 2: Personel (`employees`) satır kuralları

**Files:**
- Create: `my-expo-app/supabase/migrations/20261024111000_employees_rls.sql`
- Create: `my-expo-app/supabase/rollbacks/20261024111000_employees_rls.down.sql`
- Modify: `my-expo-app/core/api/resolveEmployee.ts`, `resolveMyEmployeeId`

**Interfaces:**
- Consumes: `public.my_employee_id()` (Görev 1).
- Produces: `resolveMyEmployeeId(profile): Promise<string | null>`. İmza aynı kalır. Önce `supabase.rpc('my_employee_id')` çağrılır; hata alınırsa eski istemci eşleşmesine düşülür.

- [ ] **Step 1: Migration'ı yaz.** `employees_lab_own` (ALL) kuralını düşür; yerine dört kural kur:
  - SELECT: `is_platform_admin() or (lab_id = get_my_lab_id() and (has_permission('view_employees') or id = my_employee_id()))`
  - INSERT `with check`, UPDATE `using` + `with check`, DELETE `using`: `is_platform_admin() or (lab_id = get_my_lab_id() and has_permission('manage_employees'))`
- [ ] **Step 2: Geri alma betiğini yaz.** 4 kuralı düşür, `employees_lab_own` kuralını `for all using (lab_id = get_my_lab_id())` ile geri kur.
- [ ] **Step 3: Rol rol, geri alınan işlemde dene.**
  - technician: `count(*)` en fazla 1, yalnız kendi kaydı. Başka bir personele `update … set notes = notes` 0 satır etkiler. Başka personeli silmek 0 satır etkiler.
  - lab_manager: tüm personel görünür; update 1 satır etkiler.
  - admin: tümü görünür.
- [ ] **Step 4: `resolveMyEmployeeId`'yi RPC'ye geçir.** Davranış aynı kalır.
  ```bash
  cd /Users/saber/Desktop/DentalSoftware/my-expo-app && npx tsc --noEmit -p .
  ```
  Beklenen: 0 hata.
- [ ] **Step 5: Kullanıcı onayı, uygulama, canlı doğrulama.** Görev 1 Step 4–5 ile aynı düzen.
- [ ] **Step 6: Yeni kullanıcı eklemeyi kontrol et.** Ayarlar → Kullanıcılar'da kullanıcı eklenince personel kaydı da açılıyor (`modules/admin/users/LabUsersManagement.tsx:1689`, `:1741`). Bu, `manage_employees` yetkisi olan rollerde çalışmaya devam etmeli. Kontrol yalnız kodla ya da denemeyle yapılır; canlıda deneme kaydı açılmaz.

### Task 3: Avans talepleri (`employee_advance_requests`)

**Files:**
- Create: `my-expo-app/supabase/migrations/20261024112000_advance_requests_rls.sql`
- Create: `my-expo-app/supabase/rollbacks/20261024112000_advance_requests_rls.down.sql`

**Interfaces:**
- Consumes: `my_employee_id()`, `can_view_payroll()` (Görev 1).

- [ ] **Step 1: Mevcut akışı oku.** `modules/advance-requests/api.ts`:
  - teknisyen talebi doğrudan `insert` ile mi, RPC ile mi açıyor;
  - onay ve ret nasıl yapılıyor;
  - `status` değerleri neler (CHECK kısıtından al).
- [ ] **Step 2: Migration'ı yaz.** `ear_lab_own` (ALL) kuralını düşür; yerine:
  - SELECT: `lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id())`
  - INSERT `with check`: `lab_id = get_my_lab_id() and (employee_id = my_employee_id() or has_permission('manage_salaries'))`
  - UPDATE/DELETE: `lab_id = get_my_lab_id() and (has_permission('manage_salaries') or has_permission('manage_finance') or (employee_id = my_employee_id() and status = '<bekleyen durum değeri>'))`
  - Onay ve ret bir RPC ile yapılıyorsa (Step 1), RPC'nin SECURITY DEFINER olduğunu doğrula. Değilse kuralı RPC'nin ihtiyacına göre ayarla.
- [ ] **Step 3: Geri alma betiği ve rol denemesi.**
  - teknisyen yalnız kendi taleplerini görür.
  - teknisyen kendi adına talep açabilir; başkası adına açamaz.
  - admin hepsini görür ve onaylayabilir.
- [ ] **Step 4: Kullanıcı onayı, uygulama, canlı doğrulama.**

**Paket 1 kapanışı:** "Paket kapanışı" bölümü. Bu pakette web yayını gerekmez; Görev 2'deki istemci değişikliği için gerekir.

---

## PAKET 2 — Para ve mobil

### Task 4: Ekstrede açılış ve kapanış bakiyesi

**Files:**
- Create: `my-expo-app/modules/invoices/lib/statementTotals.ts`
- Test: `my-expo-app/modules/invoices/lib/statementTotals.test.mts`
- Modify: `my-expo-app/modules/invoices/buildStatementHtml.ts`, `buildStatementHtml` (satır 147–190)
- Modify: `my-expo-app/modules/invoices/screens/ClinicStatementScreen.tsx`: `exportExcel` (173–220), `handlePrint` (~562), `handleExcel` (~632)

**Interfaces:**
- Produces:
  ```ts
  statementPeriodTotals(
    lines: ReadonlyArray<{ date: string; debit: number; credit: number }>,
    from?: string,
    to?: string,
  ): { opening: number; closing: number }
  ```
  - `opening` = `date < from` olan satırların (borç − alacak) toplamı.
  - `closing` = `opening` + `from ≤ date ≤ to` olan satırların toplamı.
  - Tarihler `YYYY-MM-DD`, sınırlar dahil.
- Produces: `buildStatementHtml(..., currency = 'TRY', totals?: { opening: number; closing: number })`. `totals` yoksa bugünkü davranış korunur.

- [ ] **Step 1: Başarısız testi yaz.**
  ```ts
  const L = [
    { date: '2026-08-10', debit: 100, credit: 0 },
    { date: '2026-09-05', debit: 50,  credit: 0 },
    { date: '2026-09-20', debit: 0,   credit: 30 },
    { date: '2026-10-02', debit: 40,  credit: 0 },
  ];
  test('filtre yok: açılış 0, kapanış tümü', () =>
    assert.deepEqual(statementPeriodTotals(L), { opening: 0, closing: 160 }));
  test('başlangıç tarihi: öncesi devreder', () =>
    assert.deepEqual(statementPeriodTotals(L, '2026-09-01'), { opening: 100, closing: 160 }));
  test('dönem: Eylül', () =>
    assert.deepEqual(statementPeriodTotals(L, '2026-09-01', '2026-09-30'), { opening: 100, closing: 120 }));
  test('sınır günleri dahil', () =>
    assert.deepEqual(statementPeriodTotals(L, '2026-09-05', '2026-09-20'), { opening: 100, closing: 120 }));
  test('boş liste', () =>
    assert.deepEqual(statementPeriodTotals([], '2026-09-01'), { opening: 0, closing: 0 }));
  ```
- [ ] **Step 2: Testi çalıştır; modül bulunamadığı için FAIL vermeli.**
  ```bash
  node --test my-expo-app/modules/invoices/lib/statementTotals.test.mts
  ```
- [ ] **Step 3: `statementPeriodTotals`'ı yaz.** Kuruş taşmasını önlemek için toplamları `Math.round(x * 100) / 100` ile yuvarla.
- [ ] **Step 4: Testi tekrar çalıştır.** Beklenen: 5 pass.
- [ ] **Step 5: Ekrana bağla.**
  - Hesaplama:
    - `ClinicStatementScreen` içinde `const periodTotals = useMemo(() => statementPeriodTotals(allLines, dateFrom || undefined, dateTo || undefined), [allLines, dateFrom, dateTo])` tanımla.
    - Kaynak `allLines` (tür ve arama filtresi UYGULANMAMIŞ, seçili dövizdeki tüm satırlar). Review Focus 2.
  - PDF:
    - `handlePrint` → `buildStatementHtml(..., selectedCcy, periodTotals)`.
    - `buildStatementHtml` → `openingBalance: totals?.opening ?? 0`, `closingBalance: totals?.closing ?? <bugünkü reduce>`.
  - Excel:
    - `exportExcel(..., currency, totals?)`.
    - Başlık satırlarından sonra, tablo başlığının hemen altına `['', '', 'Devreden bakiye', '', '', Math.abs(opening).toFixed(2), ba(opening), '', '']` satırı ekle.
    - TOPLAM satırındaki bakiye `totals.closing` olsun.
- [ ] **Step 6: Tip kontrolü ve ekran kontrolü.**
  - `npx tsc --noEmit -p .` → 0 hata.
  - Tarayıcıda bir kliniğin ekstresinde dönem seç, Yazdır'ı aç. Açılış bakiyesi, dönem öncesi borca eşit olmalı. PDF'i yalnız önizle; kaydetme ya da gönderme yok.

### Task 5: Mobil tarayıcıda "Tüm Menü"

**Files:**
- Modify: `my-expo-app/core/ui/mobile/MoreMenuSheet.tsx:168`. Kök `View`'un stili; ortak bileşen, tüm panellerin ••• menüsü.

**Interfaces:** değişmez.

- [ ] **Step 1: Hatayı yeniden üret.**
  - Çalışan dev sunucusunda `/dev/nav-glass` sayfasını aç (girişsiz; `MoreMenuSheet` kullanıyor).
  - `resize_window` ile `preset: mobile` seç, sayfayı yeniden yükle, menüyü aç.
  - JS: `document.documentElement.classList.contains('doc-scroll')` ve menü kartının `getBoundingClientRect().bottom > innerHeight` değerini kaydet.
  - Hata bu sayfada çıkmıyorsa admin Özet ekranında, kullanıcının yerel girişiyle dene.
- [ ] **Step 2: Kök kapsayıcıyı değiştir.**
  - Web: `{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 } as any`.
  - Native: `StyleSheet.absoluteFillObject` olarak kalır.
- [ ] **Step 3: Doğrula.** Üç durumda kartın alt kenarı `innerHeight` içinde ve barın üstünde olmalı:
  - mobil tarayıcı (`doc-scroll`);
  - masaüstü boyutu;
  - Onaylar ekranı (`doc-scroll` yok).

  Ekran görüntüsü al.
- [ ] **Step 4:** `npx tsc --noEmit -p .` → 0 hata.

### Task 6: Mükerrer alış faturası uyarısı

**Files:**
- Create: `my-expo-app/modules/purchases/lib/invoiceNo.ts`
- Test: `my-expo-app/modules/purchases/lib/invoiceNo.test.mts`
- Modify: `my-expo-app/modules/purchases/api.ts`: yeni `findDuplicatePurchase`.
- Modify: `my-expo-app/modules/purchases/components/PurchaseFormModal.tsx`: kaydetme yolu (~419).
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Produces: `normalizeInvoiceNo(s: string | null | undefined): string`.
  - Boşlukları, `-` `/` `.` `_` işaretlerini siler; `toLocaleUpperCase('tr-TR')` uygular.
  - Boş girişte `''` döner.
- Produces:
  ```ts
  findDuplicatePurchase(q: {
    labId: string;
    supplierId: string | null;
    supplierName: string;
    invoiceNumber: string | null | undefined;
  }): Promise<{ id: string; invoice_date: string; total: number; currency: string } | null>
  ```
  - Normalize edilmiş numara boşsa sorgu yapmadan `null` döner.
  - Lab'ın aynı tedarikçisine ait (`supplier_id`; yoksa `supplier_name` ilike) faturaları çeker ve numarayı istemcide normalize ederek karşılaştırır.

- [ ] **Step 1: Başarısız testi yaz.**
  ```ts
  test('yazım farkları aynı numara', () => {
    assert.equal(normalizeInvoiceNo(' ftr 001 '), 'FTR001');
    assert.equal(normalizeInvoiceNo('FTR-001'), 'FTR001');
    assert.equal(normalizeInvoiceNo('ftr/001'), 'FTR001');
  });
  test('Türkçe harf', () => assert.equal(normalizeInvoiceNo('ifa-12'), 'İFA12'));
  test('boş', () => {
    assert.equal(normalizeInvoiceNo(''), '');
    assert.equal(normalizeInvoiceNo(null), '');
    assert.equal(normalizeInvoiceNo('  '), '');
  });
  ```
- [ ] **Step 2: Testi çalıştır.** FAIL vermeli.
- [ ] **Step 3: `normalizeInvoiceNo`'yu yaz.** Testi tekrar çalıştır; 3 pass.
- [ ] **Step 4: `findDuplicatePurchase`'ı yaz ve forma bağla.**
  - Yalnız elle girilen alışta çalışır (`efaturaEttn` yokken). e-Faturadan gelen alışın kendi ETTN tekilliği var.
  - Kaydet'e basıldığında mükerrer bulunursa ve `dupConfirmed` false ise:
    - kaydetme;
    - düğmenin yanındaki hata alanına şu metni yaz:
      `${autoT('Bu tedarikçiden aynı numaralı fatura zaten girilmiş')}: ${tarih} · ${tutar}. ${autoT('Yine de kaydetmek için tekrar basın.')}`;
    - `dupConfirmed = true` yap.
  - Tedarikçi ya da numara değişince `dupConfirmed = false` olur.
  - Yeni metinleri `auto.{en,de,fa}.json`'a ekle.
- [ ] **Step 5: Tip kontrolü ve ekran kontrolü.**
  - `npx tsc --noEmit -p .` → 0 hata.
  - Formu aç, var olan çift kaydın numarasını yaz. Uyarı düğmenin yanında çıkmalı. Kaydetme.
- [ ] **Step 6 (kapı): Mevcut çift kaydı kullanıcıya bildir.** Tüm lab'larda 1 grup, 2 satır. Tekil indeks yol haritasında 2. dalga 11. madde; bu planda yapılmaz.

**Paket 2 kapanışı:** "Paket kapanışı".

---

## PAKET 3 — Günlük kullanım

### Task 7: Sipariş listesi — teslim sütunu, Bugün/Yarın çipleri, Özet'ten filtreli geçiş

**Files:**
- Create: `my-expo-app/modules/orders/lib/listParams.ts`
- Test: `my-expo-app/modules/orders/lib/listParams.test.mts`
- Modify: `my-expo-app/modules/orders/screens/OrdersListScreenV2.tsx`:
  - durum (305–311), filtre (400–418), çip satırları (~640–690, ~820–895), masaüstü başlık (1605–1622), `DesktopRow` (~1722), mobil satır (~1405)
- Modify: `my-expo-app/app/(admin)/index.tsx:1883`: Geciken rozeti. `:1894` "Planlanacak" zaten `?status=alindi` gönderiyor; artık okunacak.
- Modify: `my-expo-app/modules/admin/components/AdminMobileDashboard.tsx:190`: kicker.
- Modify: `core/i18n/locales/{tr,en,de,fa}.json`: yeni `admin.cta.dueToday`. `auto.{en,de,fa}.json`: "Bugün teslim", "Yarın teslim", "Teslim".

**Interfaces:**
- Produces:
  ```ts
  export type DueFlag = 'overdue' | 'today' | 'tomorrow' | 'urgent';
  export function parseOrdersListParams(
    p: Record<string, string | string[] | undefined>,
    allowedStatuses: readonly string[],
  ): { status: string | null; flag: DueFlag | null };
  export function matchesDueFlag(
    o: { delivery_date: string; status: string; is_urgent?: boolean | null },
    flag: DueFlag | null,
    today: string,
    tomorrow: string,
  ): boolean;
  ```
  - `overdue`: `delivery_date < today && status !== 'teslim_edildi'`. Bugünkü liste tanımıyla aynı; tanım birleştirmesi 2. dalgada.
  - `today` / `tomorrow`: `delivery_date === gün && status !== 'teslim_edildi'`.
  - `urgent`: `!!is_urgent`.
  - `null`: hepsi geçer.

- [ ] **Step 1: Başarısız testi yaz.**
  ```ts
  const S = ['all', 'alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];
  test('geçerli parametreler', () => {
    assert.deepEqual(parseOrdersListParams({ status: 'alindi' }, S), { status: 'alindi', flag: null });
    assert.deepEqual(parseOrdersListParams({ filter: 'overdue' }, S), { status: null, flag: 'overdue' });
    assert.deepEqual(parseOrdersListParams({ filter: ['today'] }, S), { status: null, flag: 'today' });
  });
  test('bilinmeyen parametre yok sayılır', () =>
    assert.deepEqual(parseOrdersListParams({ status: 'foo', filter: 'xyz' }, S), { status: null, flag: null }));
  const o = (d: string, s = 'uretimde', u = false) => ({ delivery_date: d, status: s, is_urgent: u });
  test('bugün/yarın/geciken', () => {
    assert.equal(matchesDueFlag(o('2026-10-24'), 'today', '2026-10-24', '2026-10-25'), true);
    assert.equal(matchesDueFlag(o('2026-10-24', 'teslim_edildi'), 'today', '2026-10-24', '2026-10-25'), false);
    assert.equal(matchesDueFlag(o('2026-10-25'), 'tomorrow', '2026-10-24', '2026-10-25'), true);
    assert.equal(matchesDueFlag(o('2026-10-20'), 'overdue', '2026-10-24', '2026-10-25'), true);
    assert.equal(matchesDueFlag(o('2026-10-20'), null, '2026-10-24', '2026-10-25'), true);
  });
  ```
- [ ] **Step 2: Testi çalıştır; FAIL. Yardımcıları yaz; testi tekrar çalıştır: 3 pass.**
- [ ] **Step 3: Listeye bağla.**
  - **Durum:** `urgentOnly` ve `overdueOnly` korunur. Yanına `dueFlag: 'today' | 'tomorrow' | null` gelir; çipler birbirini dışlar, bugünkü kalıp.
  - **İlk açılış:** `useLocalSearchParams()` okunur, `parseOrdersListParams` → `setStatusFilter` / `setOverdueOnly` / `setUrgentOnly` / `setDueFlag` (yalnız mount'ta).
  - **Filtre:** `matchesDueFlag(o, dueFlag, today, tomorrow)` mevcut eşleşmelere eklenir. `tomorrow` yerel tarihten türetilir; bugünkü `today` hesaplamasının aynısı + 1 gün.
  - **Çipler:**
    - "Bugün teslim" ve "Yarın teslim" çipleri, Acil/Geciken çiplerinin yanına eklenir; masaüstü ve mobil satır ikisinde de.
    - Sayaçları gösterilir.
    - Renk token'larla verilir: koyu temada `isDark ? T.card : '#FFFFFF'` kalıbı.
  - **Masaüstü tablo:**
    - "Teslim" sütunu eklenir. Sütun oranları: Hasta 26 · Vaka 23 · Hekim 15 · **Teslim 12** · Oluşturma 10 · Durum 14.
    - Hücrede `fmtDate(delivery_date)` ve altında `deliveryText(...)` yazar. "gecikti" içeren metin tehlike rengiyle (`#DC2626` / koyuda `#F87171`) gösterilir.
  - **Mobil satır:** oluşturma tarihi yerine `dText` gösterilir; mevcut bileşenin yapısı korunur.
- [ ] **Step 4: Özet bağlantıları.**
  - Geciken rozeti `router.push('/(admin)/orders?filter=overdue')` olur.
  - Mobil kicker:
    - `t('admin.cta.dueToday', { count: todayDelivery })`, `todayDelivery > 0` iken;
    - sıfırsa bugünkü `admin.cta.newOrder`.
    - `todayDelivery` `app/(admin)/index.tsx`'te zaten hesaplanıyor; prop olarak (`liveDueToday`) geçir.
  - Anahtar değeri:
    - tr "BUGÜN {{count}} TESLİM"
    - en "{{count}} DUE TODAY"
    - de "HEUTE {{count}} FÄLLIG"
    - fa "{{count}} تحویل امروز"
  - Eski `admin.cta.ordersToday` anahtarı silinmez; başka kullanım varsa bozulmaz.
- [ ] **Step 5: Tip kontrolü ve ekran kontrolü.**
  - `npx tsc --noEmit -p .` → 0 hata.
  - Tarayıcıda (kullanıcının yerel girişi ya da `dev` maket sayfası):
    - `/orders?filter=overdue` Geciken çipi seçili açılmalı.
    - `/orders?status=alindi` Planlama sekmesinde açılmalı.
    - `/orders?filter=xyz` "Tümü" ile açılmalı.
  - Teslim sütunu açık ve koyu temada okunmalı; mobilde satırlar taşmamalı.

### Task 8: Otomatik "okundu" kaldırılır

**Files:**
- Modify: `my-expo-app/modules/orders/hooks/useChatMessages.ts`. İmza (~satır 40) ve `markRead` çağrıları (95, 115).
- Modify: `my-expo-app/modules/orders/screens/OrderDetailScreenV2.tsx:333`
- Modify: `my-expo-app/modules/orders/components/MessagesPopup.tsx:2125-2136`. Otomatik seçim.

**Interfaces:**
- Produces: `useChatMessages(workOrderId: string, currentUserId?: string, archiveOrderIds?: string[], opts?: { markRead?: boolean })`.
  - `opts.markRead` varsayılanı `true`; sohbet ekranları bugünkü gibi çalışır.
  - `false` iken açılışta ve yeni mesajda `markMessagesAsRead` çağrılmaz.

- [ ] **Step 1: `opts.markRead`'i ekle.** İki `markRead()` çağrısını `if (opts?.markRead !== false)` ile koru. `useEffect` bağımlılıklarına `opts?.markRead` ekle.
- [ ] **Step 2: Sipariş detayını bağla.** `OrderDetailScreenV2:333` → `useChatMessages(id, profile?.id, revParentIds, { markRead: false })`. Bu çağrı yalnız sayaç ve önizleme içindir. Sohbet paneli açılınca okundu işaretleyen kendi bileşeni (`MessagesB5Mobile` / popup) varsayılanla çalışmaya devam eder.
- [ ] **Step 3: Mesajlar penceresini düzelt.**
  - Masaüstünde `items[0]`'ın otomatik seçimi kaldırılır; `initialOrderId` ile seçim kalır.
  - Seçim yokken sağ panelde boş durum gösterilir. Bileşende yoksa ekle: ikon + `autoT('Bir sohbet seçin')`, token renkleriyle.
- [ ] **Step 4: Doğrula.**
  - `npx tsc --noEmit -p .` → 0 hata.
  - Tarayıcıda `read_network_requests`: sipariş detayı açılınca `order_messages`'a PATCH ya da `mark_*` isteği GİTMEMELİ. Mesajlar penceresi açılınca hiçbir sohbet seçili olmamalı ve PATCH gitmemeli.

### Task 9: Pasife almaya onay penceresi ve hata kontrolü

**Files:**
- Modify: `my-expo-app/modules/clinics/screens/ClinicsScreen.tsx:301-305` (`handleToggleClinic`) ve `:404-408` (`handleToggleDoctor`)
- Modify: `my-expo-app/modules/admin/users/LabUsersManagement.tsx:493-504` (`handleToggleActive`)

**Interfaces:**
- Consumes: `ConfirmDialog`, `ConfirmState` (`core/ui/ConfirmDialog.tsx`).

- [ ] **Step 1: Pasife alma onay ister; aktif etme istemez.** Pasife alırken `setConfirm({...})` ile sor:
  - başlık: `autoT('Pasife al')`
  - vurgu: kayıt adı
  - mesaj:
    - klinik ve hekim: `autoT('pasife alınacak; sipariş veremeyecek.')`
    - kullanıcı: `autoT('pasife alınacak; oturumu kapanır ve giriş yapamaz.')`
  - düğme: `autoT('Evet, pasife al')`
  - `variant: 'warning'`
- [ ] **Step 2: Hata kontrolü.**
  - `updateClinic` / `updateDoctor` `{ error }` döndürüyor. Hata varsa liste değişmez ve `toast.error(error.message)` gösterilir.
  - Liste güncellemesi yalnız başarıdan sonra yapılır.
- [ ] **Step 3: Çeviri, tip ve ekran kontrolü.**
  - Yeni metinleri `auto.{en,de,fa}.json`'a ekle.
  - `npx tsc --noEmit -p .` → 0 hata.
  - Anahtara bas, onay penceresi çıksın, Vazgeç'e bas. Canlıda gerçekten pasife alma YOK.

**Paket 3 kapanışı:** "Paket kapanışı".

---

## PAKET 4 — Dil ve KVKK

### Task 10: Yazım, büyük harf ve eksik çeviriler

**Files:**
- Modify: `my-expo-app/modules/invoices/screens/InvoicesListScreen.tsx:290`, `:700`, `:755`
- Modify: `my-expo-app/modules/orders/screens/OrderDetailScreenV2.tsx:2120`, `:2122`
- Modify: `my-expo-app/modules/stock/screens/StockScreen.tsx`: satır 108–111, 664, 672, 716, 3295–3297, 3414, 3438, 5211–5291
- Modify: `my-expo-app/core/store/permissionStore.ts:318`, `:321`
- Modify: `my-expo-app/modules/settings/screens/SettingsHubScreen.tsx:120`
- Modify: `my-expo-app/core/i18n/locales/auto.{en,de,fa}.json`

- [ ] **Step 1: Fatura durumu.**
  - `INVOICE_STATUS_LABELS[x].toUpperCase()` → `autoT(INVOICE_STATUS_LABELS[x]).toLocaleUpperCase(localeTag())`.
  - `'GECİKMİŞ'` → `autoT('Gecikmiş').toLocaleUpperCase(localeTag())`.
  - `Vadesi Gecen` → `Vadesi Geçen`.
- [ ] **Step 2: Sipariş ilerletme düğmesi.**
  - `` `${nextStatusLabel}'a geç` `` (iki yer) → `` `${autoT('Sonraki adım')}: ${autoT(nextStatusLabel)}` ``.
  - `nextStatusLabel`'ın Türkçe etiket olduğunu doğrula.
- [ ] **Step 3: Stok ekranındaki karaktersiz metinler.**
  - Her satırda önce metnin **ekranda gösterilen etiket mi, yoksa veritabanına yazılan / karşılaştırılan bir değer mi** olduğunu kontrol et.
  - Yalnız etiketleri düzelt: Tümü, Üretim, Diğer, Diş Başı, Üretim Entegrasyonu, gün, Azalıyor, Haftalık Tüketim, Günlük tüketim.
  - Değerse ekranda bir etiket eşlemesiyle göster; değeri değiştirme.
- [ ] **Step 4: Rol etiketi ve ayar alt yazısı.**
  - `'Lab Yoneticisi'` → `'Lab Yöneticisi'`, `'Klinik Yoneticisi'` → `'Klinik Yöneticisi'`. Önce anahtar olarak kullanılmadıklarını `grep` ile doğrula.
  - `'Rol bazli erisim yonetimi'` → `'Rol bazlı erişim yönetimi'`.
- [ ] **Step 5: Eksik çevirileri ekle.** `auto.{en,de,fa}.json`:
  - Ayar menüsü: Tabletler · Finans Ayarları · Kiosk cihaz yönetimi · Para birimi, KDV, kur, ödeme hatırlatmaları
  - Sipariş ve değerlendirme: Fiziksel ölçü · Marjinal Uyum · Estetik / Renk · Kenar uyumu / pasiflik · Sonraki adım
  - Yeni yazımlar: Rol bazlı erişim yönetimi · Lab Yöneticisi · Klinik Yöneticisi · Vadesi Geçen
  - Stok: Step 3'te düzeltilen etiketler.

  Önce anahtarın zaten var olup olmadığına bak.
- [ ] **Step 6: Doğrula.**
  - Bir `node` betiğiyle Step 5'teki her anahtarın üç sözlükte de olduğunu kontrol et.
  - `grep -n "Yoneticisi\|Rol bazli\|Vadesi Gecen\|'a geç" -r modules core` → yalnız beklenmeyen eşleşme kalmasın.
  - `npx tsc --noEmit -p .` → 0 hata.

### Task 11: TV panosu ve kuryede hasta adının baş harfe çevrilmesi

**Files:**
- Modify: `my-expo-app/modules/tv/api.ts:39`, `:235`, `:263`. `patient` alanı.
- Modify: `my-expo-app/modules/courier/screens/CourierDeliveryDetailScreen.tsx:413`, `:523`.
- Modify: kurye panelinde `patient_name` gösteren diğer yerler. `app/(courier)` ve `modules/courier/screens` altında ara. Lab tarafındaki `CourierTrackingScreen` hariç; o ekranı lab personeli kullanıyor.
- Test: `my-expo-app/modules/orders/lib/workLabel.test.mts` (yoksa oluştur).

**Interfaces:**
- Consumes: `patientInitials(name)` (`modules/orders/lib/workLabel.ts:30`, mevcut). Örnek: "Ayşe Nur Kaya" → "A. K.".

- [ ] **Step 1: Test.** Test dosyası `patientInitials` için `'Ayşe Nur Kaya' → 'A. K.'`, `'Ali' → 'A.'`, `'' → ''` beklesin. Çalıştır.
  - Var olan fonksiyon geçmeli: pass.
  - Fonksiyon içe aktarma yapıyorsa test dosyası `.ts` uzantısıyla import eder.
- [ ] **Step 2: TV.** `patient: patientInitials(<ad>) || null`. TV ekranındaki `job.patient ?? job.orderNumber` geri dönüşü değişmez.
- [ ] **Step 3: Kurye ekranları.** Gösterim `patientInitials(d.patient_name)` olur. "Hasta:" etiketi aynı kalır.
- [ ] **Step 4: Doğrula.**
  - `npx tsc --noEmit -p .` → 0 hata.
  - Kurye ve TV dosyalarında `patient_name`'in ham gösterimi kalmamalı:
    ```bash
    grep -n "patient_name" modules/courier/screens modules/tv
    ```

**Paket 4 kapanışı:** "Paket kapanışı".

---

## Paket kapanışı (her paketin sonunda)

- [ ] `cd my-expo-app && npx tsc --noEmit -p .` → 0 hata. Önce temiz çalıştırma: `rm -f tsconfig.tsbuildinfo`.
- [ ] Bu paketin tüm testleri yeşil. `node --test` ile her `.test.mts` dosyası ayrı ayrı çalıştırılır.
- [ ] `auto.{en,de,fa}.json` anahtar kümeleri: bu paketin eklediği anahtarlar üçünde de var.
- [ ] Görsel kontrol: değişen ekranlar açık ve koyu temada, masaüstünde ve telefonda. Geçici `app/dev/tmp-*` sayfaları silinmiş olmalı.
- [ ] Kullanıcıya rapor: ne değişti, neyi doğruladın, ne kaldı.
- [ ] **Yalnız kullanıcı "deploy" derse:**
  - Web için `preview_stop`, ardından `rm -rf dist .expo .vercel/output node_modules/.cache && NODE_OPTIONS="--max-old-space-size=8192" npm run deploy` (arka planda).
  - Doğrula:
    - READY ve Aliased satırları;
    - `siman.app` 200;
    - entry `?v` = sha256[:12];
    - değişen parçalar canlıda 200;
    - 0 boş parça.
  - Dev sunucusunu `--clear` ile yeniden başlat.
- [ ] **Sorun çıkarsa:**
  - Web: Vercel'de bir önceki üretim sürümünü geri yükle (`vercel rollback` ya da panelden "Promote").
  - Veritabanı: ilgili `supabase/rollbacks/*.down.sql` dosyasını çalıştır.
  - Ardından kullanıcıya bildir.
