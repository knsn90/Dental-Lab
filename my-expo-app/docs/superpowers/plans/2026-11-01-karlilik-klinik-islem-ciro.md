# Karlılık: Klinik ve İşlem Bazında Ciro — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karlılık ekranı dönem kârını KDV hariç gösterir, eksik işçilik/gider uyarısı verir, klinik (hekim alt satırlı) ve işlem bazında ciroyu toplamları tutan biçimde listeler; yanıltıcı iki liste kalkar.

**Architecture:**
- Veritabanı satır çözümlemesini yapar. Tek bir gizli yardımcı (`_profit_revenue_lines`) her fatura kalemini klinik, hekim, işlem, döviz, KDV hariç tutar ve liste değeriyle çözer. İki DEFINER RPC (`profitability_by_clinic`, `profitability_by_service`) bunu gruplayıp döndürür.
- İstemcide saf bir model (`profitBreakdown.ts`) dövizleri birleştirir, payı, ortalama/liste fiyatını ve farkı hesaplar, sıralar. `node --test` ile sınanır.
- Mevcut `profitability_summary` ve `profitability_revenue_ccy` yalnız gelir ifadesinde KDV hariç olur.

**Tech Stack:** Supabase Postgres (plpgsql), Expo + react-native-web, `node --test` (.mts).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-01-karlilik-klinik-islem-ciro-design.md`

## Global Constraints
- Araçlar (bu oturumun çalışma klasörü, `SP=/private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/29c3d208-96e6-4afd-8f47-257e412730d4/scratchpad`):
  - prova üreteci `$SP/tools/gen_probe.py <dir> <mig> <down> <out> <measure>`;
  - sözlük ekleyici `node $SP/tools/i18n_add.mjs <harita.json>`;
  - tam doğrulama `bash $SP/tools/verify.sh` (taban: 286/286 test, tsc 0).
- Veritabanı değişikliği beş adımlıdır:
  1. `.before.txt` (canlı tanım + md5);
  2. `.down.sql`;
  3. geri alınan prova (ÖNCE / SONRA / GERİ ALMA);
  4. AskUserQuestion ile "Onaylıyorum, uygula";
  5. `supabase db query --linked -f <mutlak yol>` (my-expo-app'ten) ve canlı ölçüm.
- Provada kimlik:
  - lab `243ef1db-9853-424b-8292-0025abfca436`;
  - sahip `O = f6817e96-2aab-443f-8cb3-02b7718f18e4`;
  - teknisyen `5ab98f51-dbef-4916-aa61-76a82bbdf219`;
  - başka lab `039dcd67-d21b-4c71-8a64-def61b051c8d`.
  - Rol: `set_config('request.jwt.claims', json_build_object('sub',…,'role','authenticated')::text, true)` + `execute 'set local role authenticated'`. Çıktı `probe.out` ayarında birikir.
  - Desen: `$SP/../../92fed326-e9be-452e-a41e-d705e960980b/scratchpad/kasa/t1_measure.sql`.
  - Fatura tablolarında gönderim yapan tetikleyici yok (2026-11-01 doğrulandı).
- Yeni DEFINER fonksiyonlar:
  - `SET search_path TO 'public'`;
  - ilk iş `PERFORM assert_my_lab(p_lab_id)` + `can_view_lab_profit` kapısı (42501, summary ile aynı mesaj);
  - `REVOKE ALL … FROM public, anon` + `GRANT EXECUTE … TO authenticated, service_role`.
- KDV hariç kararı yalnız Karlılık ekranındadır. `finance_period_metrics` ve `core/metrics` tanımlarına dokunulmaz.
- Para biçimlendiriciler `(Number(n)||0)` kullanır; "yabancı döviz" kararı labın ana para birimine (`useBaseCurrency()`) göre verilir, sabit `'TRY'` ile değil.
- Her yeni metin tr + en + de + fa aynı anda eklenir. Farsça için `persian-writing` becerisi kullanılır.
- Koyu tema token'larla (`useMobileTokens`, `useInkUI().chipTones`) yapılır; açık tema değerleri değişmez. Her düğmede `GlassTooltip` bulunur.
- Hasta adı hiçbir yeni çıktıda yer almaz. Commit yok (kullanıcı istemedikçe). Deploy yalnız "deploy" denince.

## Review Focus
1. **Çok siparişli toplu fatura, farklı hekimler:** ciro her kalemin kendi hekimine gider, ilk siparişe toplanmaz. Siparişi bilinmeyen satır "Hekim belirtilmemiş" olur. Pinlenir: Task 3, senaryo E.
2. **Kalem toplamı `subtotal`'den farklı fatura:** fark "Kalemsiz fatura" satırına gider, toplam tutar. Pinlenir: Task 3, senaryo A (bütün lablar mutabakatı) ve senaryo E'deki kalan kontrolü.
3. **Ana para birimi fatura dövizinden farklı lab:** Nexadent'te ana para EUR, fatura TRY; `rate_at_time` boş olabilir. Kırılımın ana para toplamı summary geliriyle aynı olmalı. Pinlenir: Task 2 senaryo K ve Task 3 senaryo A.
4. **Eski önbellek:** v4 önbelleği yayından sonra kaldırılan listeleri bir an bile göstermemeli. Pinlenir: Task 5, adım 4 (grep `profit_screen_v5`, `profit_screen_v4` yok).
5. **Finans yetkisi olmayan rol ya da başka lab kimliği:** yeni RPC'lerden veri alamamalı; yardımcı fonksiyon istemciden çağrılamamalı. Pinlenir: Task 3, senaryo Y.

---

### Task 1: Saf kırılım modeli

**Files:**
- Create: `modules/finance/profitBreakdown.ts` (saf, içe aktarmasız)
- Test: `modules/finance/profitBreakdown.test.mts` (içe aktarma `./profitBreakdown.ts`)

**Interfaces:**
- Produces:
  ```ts
  type Num = number | string | null | undefined;            // Supabase numeric string döndürür
  export type Slice = { currency: string; total: number };
  export type ClinicLine = { clinic_id: string | null; clinic_name: string | null; doctor_id: string | null;
    doctor_name: string | null; currency: string; revenue: Num; revenue_base: Num; order_ids: string[] | null };
  export type DoctorRow = { key: string; name: string | null; revenueBase: number; slices: Slice[];
    orderCount: number; shareInClinic: number };
  export type ClinicRow = { key: string; kind: 'clinic' | 'doctorOnly' | 'none'; name: string | null;
    revenueBase: number; slices: Slice[]; orderCount: number; share: number; doctors: DoctorRow[] };
  export type ServiceLine = { row_kind: 'service' | 'other' | 'no_items'; service_id: string | null;
    service_name: string | null; unit: string | null; currency: string; quantity: Num; revenue: Num;
    revenue_base: Num; listed_quantity: Num; listed_revenue_base: Num; list_value_base: Num };
  export type ServiceRow = { key: string; kind: 'service' | 'other' | 'no_items'; name: string | null;
    unit: string | null; quantity: number; revenueBase: number; slices: Slice[]; share: number;
    avgUnitPrice: number | null; listUnitPrice: number | null; discountPct: number | null };
  export function buildClinicRows(lines: ClinicLine[]): ClinicRow[];
  export function buildServiceRows(lines: ServiceLine[]): ServiceRow[];
  export function sliceSum(rows: { slices: Slice[] }[]): Slice[];
  export function missingCosts(s: { total_revenue?: Num; total_labor?: Num; total_overhead?: Num } | null):
    { labor: boolean; overhead: boolean };
  export function marginLabel(margin: number | null, missing: { labor: boolean }):
    'Mükemmel' | 'İyi' | 'Düşük' | 'Risk' | null;
  ```
- Kurallar:
  - **Klinik anahtarı:** `clinic_id` → kind `clinic`. Klinik yok ama hekim var → `doctor:<doctor_id>`, kind `doctorOnly`, ad hekim adı. İkisi de yok → `none`.
  - **Hekim anahtarı:** `doctor_id ?? 'none'`.
  - **Dilimler:** para birimine göre birleşir, para birimi koduna göre sıralanır. Toplamı 0 olan dilim düşer; satır ve sipariş sayısı kalır (Task 3'teki 0 tutarlı sipariş satırı için).
  - **Klinik toplamı:** klinik dilimleri ve `revenueBase`, hekim satırlarının toplamından türetilir. Böylece "hekimler toplamı = klinik" eşitliği yapı gereği sağlanır.
  - **`share` / `shareInClinic`:** 1 ondalığa yuvarlanır. Payda 0 ise 0.
  - **Sıralama:**
    - klinikler `revenueBase` azalan, `none` en sonda;
    - hekimler azalan;
    - işlemler önce `service` (azalan), sonra `other`, en son `no_items`.
  - **`orderCount`:** `order_ids` birleşiminin tekil sayısı.
  - **`avgUnitPrice`:** yalnız `service` ve `quantity > 0` ise `revenueBase / quantity`, aksi `null`.
  - **`listUnitPrice`:** `listed_quantity > 0` ise `list_value_base / listed_quantity`.
  - **`discountPct`:** `list_value_base > 0` ise `round1((1 − listed_revenue_base / list_value_base) × 100)`.
  - **`missingCosts`:** gelir > 0 iken işçilik = 0 → `labor`; genel gider = 0 → `overhead`. Gelir 0 ya da `null` → ikisi de `false`.
  - **`marginLabel`:**
    - `labor` eksikse ya da `margin === null` ise `null`;
    - ≥30 `Mükemmel`, ≥20 `İyi`, ≥10 `Düşük`, diğer `Risk`.

- [ ] **Step 1: Testleri yaz.**
  - `clinic rows merge currencies and doctors`:
    - Girdi: A/d1 TRY 1000 (base 25, [o1]); A/d1 EUR 10 (base 10, [o1]); A/d2 TRY 2000 (base 50, [o2]); B/d3 TRY 4000 (base 100, [o3,o4]).
    - Beklenen sıra: B (share 54.1), sonra A (share 45.9).
    - A: `slices` `[{EUR,10},{TRY,3000}]`, `orderCount` 2, `doctors[0].key` `'d2'` (`shareInClinic` 58.8).
    - A'nın d1 satırı: `orderCount` 1.
  - `missing clinic falls back to doctor, then none (last)`: `clinic_id` null + `doctor_id` `'d9'` → key `'doctor:d9'`, kind `doctorOnly`. İkisi de null → `none` ve dizinin sonunda.
  - `numeric strings are tolerated`: `revenue: '12.5'`, `revenue_base: '1.25'` → slice total 12.5, `revenueBase` 1.25.
  - `service rows: averages, list and discount across currencies`:
    - s1 TRY: qty 4, base 10, listed_q 4, listed_rev 10, list_value 12.5.
    - s1 EUR: qty 1, base 3, listed 1/3/3.
    - Beklenen: quantity 5, revenueBase 13, `avgUnitPrice` 2.6, `listUnitPrice` 3.1, `discountPct` 16.1.
  - `service order keeps other and no_items last`: service base 13, other base 50, no_items base 5.
    - Beklenen kinds sırası `['service','other','no_items']`.
    - Shares 19.1 / 73.5 / 7.4. other/no_items için `avgUnitPrice` null.
  - `service without list price`: `list_value_base` 0 → `listUnitPrice` null, `discountPct` null.
  - `slice sums reconcile with input`: hem `sliceSum(buildClinicRows(L))` hem servis karşılığı, girdinin para birimi toplamlarına `deepEqual`. Ayrıca her klinik için `sliceSum(row.doctors)` = `row.slices`.
  - `zero-revenue line keeps order count`: A/d1 TRY 1000 (base 25, [o1]) + A/d5 TRY 0 (base 0, [o7]). Beklenen: A `orderCount` 2; d5 satırı var, `slices` `[]`, `orderCount` 1.
  - `missingCosts`:
    - `{total_revenue:'100', total_labor:'0', total_overhead:5}` → `{labor:true, overhead:false}`;
    - gelir 0 → `{false,false}`;
    - `null` → `{false,false}`.
  - `marginLabel`:
    - (35,{labor:false}) → `'Mükemmel'`; (25) → `'İyi'`; (12) → `'Düşük'`; (−1) → `'Risk'`;
    - (35,{labor:true}) → `null`; (null,{labor:false}) → `null`.
- [ ] **Step 2: Çalıştır.** `node --test modules/finance/profitBreakdown.test.mts`. Beklenen: modül bulunamadığı için FAIL.
- [ ] **Step 3: `profitBreakdown.ts`'i yaz.**
- [ ] **Step 4: Çalıştır.** Aynı komut → hepsi PASS. Ardından `bash $SP/tools/verify.sh` → 286 + yeni testler, fail 0, `tsc0`.

### Task 2: Gelir KDV hariç (SQL)

**Files:**
- Create: `supabase/migrations/20261101120000_karlilik_kdv_haric.sql`
- Create: `supabase/rollbacks/20261101120000_karlilik_kdv_haric.{before.txt,down.sql}`
- Test: `$SP/karlilik/t2_measure.sql`

**Interfaces:**
- Produces: aynı imzalı `profitability_summary` ve `profitability_revenue_ccy`. Yalnız gelir ifadeleri değişir:
  - summary `per_inv.base` = `i.subtotal * COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1)`;
  - `v_orig` = `sum(i.subtotal)`;
  - `revenue_ccy` = `SUM(i.subtotal)`.
  - Geri kalan metin canlı tanımla birebir aynıdır. Canlı tanımlar `$SP/def_profitability_summary.sql` ve `$SP/def_profitability_revenue_ccy.sql`'de; `.before.txt` öncesinde yeniden çekilir.

- [ ] **Step 1: Ölçüm betiğini yaz.** Dönemler Ekim `2026-10-01..2026-10-31` ve Tümü `2000-01-01..2027-12-31`.
  - **K (sahip O):** summary satırı ve `revenue_ccy` satırları. Doğrudan SQL ile Σ`subtotal×kur` ve Σ`tax_amount×kur` hesaplanır.
  - **L (bütün lablar, kimliksiz):** her lab için `revenue_ccy` döviz toplamları ve doğrudan Σ`subtotal` toplamları.
  - **md5:** iki fonksiyonun tanımı.
- [ ] **Step 2: Migration'ı, `.down.sql`'i (canlı tanımlar aynen) ve `.before.txt`'yi yaz.**
- [ ] **Step 3: Provayı çalıştır.** `python3 $SP/tools/gen_probe.py $SP/karlilik <mig> <down> $SP/karlilik/t2_probe.sql $SP/karlilik/t2_measure.sql`, ardından `supabase db query --linked -f $SP/karlilik/t2_probe.sql`. Beklenen:
  - SONRA gelir = doğrudan Σ`subtotal×kur` (|fark| < 0.01);
  - ÖNCE − SONRA = Σ`tax×kur`;
  - malzeme, işçilik ve genel gider ÖNCE ile aynı;
  - L'de her lab için `revenue_ccy` = Σ`subtotal`;
  - GERİ ALMA md5'leri = ÖNCE.
  - Uygulama Task 4'te.

### Task 3: Klinik ve işlem kırılım RPC'leri (SQL)

**Files:**
- Create: `supabase/migrations/20261101121000_karlilik_kirilim.sql`
- Create: `supabase/rollbacks/20261101121000_karlilik_kirilim.{before.txt,down.sql}` (before: fonksiyonların yokluğu; down: `DROP FUNCTION` üçü)
- Test: `$SP/karlilik/t3_measure.sql`

**Interfaces:**
- Consumes: Task 1'deki `ClinicLine` / `ServiceLine` alan adları. RPC sütunları bunlarla birebir aynıdır.
- Produces:
  - **`_profit_revenue_lines(p_lab_id uuid, p_from date, p_to date)`**
    - DEFINER, `STABLE`; `REVOKE ALL FROM public, anon, authenticated`.
    - Kalem başına bir satır döndürür. Sütunlar: `invoice_id`, `clinic_id`, `doctor_id`, `order_ids uuid[]`, `row_kind text`, `service_id`, `unit`, `currency`, `quantity`, `revenue`, `revenue_base`, `has_list bool`, `list_value_base`.
    - Kurallar spec §3'tedir: kesilmiş faturalar; dönem `issue_date`; `revenue = COALESCE(net_total,total)`; kur ifadesi Task 2 ile aynı.
    - **Kalan satırı:** kalem toplamı `subtotal`'den |0.005|'ten fazla farklıysa ya da fatura kalemsizse, fark `row_kind='no_items'` satırı olur.
    - **Hizmet eşleşmesi, sırayla:**
      1. `order_items.service_id`;
      2. `lower(trim(order_items.name))` = `lower(trim(lab_services.name))`;
      3. bağsız kalemde `regexp_replace(description, '^\s*\[[^\]]*\]\s*', '')` aynı kuralla;
      4. hiçbiri yoksa `other`.
      - Aynı adlı birden çok hizmet varsa `ORDER BY is_active DESC, created_at LIMIT 1`.
    - **Hekim zinciri:** spec §3.
    - **`order_ids`:** kalemin siparişi biliniyorsa yalnız o; değilse faturanın bütün bağlı siparişleri (`invoices.work_order_id` ∪ `invoice_orders`).
    - **Kalemsiz kalan sipariş:** faturaya bağlı olup hiçbir satırın `order_ids`'inde görünmeyen her sipariş için 0 tutarlı bir `no_items` satırı üretilir; hekimi o siparişin hekimidir. Böylece kliniğin sipariş sayısı spec §3'teki `per_wo` sayımıyla aynı olur. `profitability_by_service` 0 tutarlı ve 0 miktarlı satırları döndürmez.
    - **Liste değeri:** `lab_services.price > 0` ise `quantity × price × get_currency_rate(p_lab_id, s.currency, i.currency, i.issue_date) × fatura kuru`.
  - **`profitability_by_clinic(p_lab_id uuid, p_from date, p_to date)`**
    - Döner: `TABLE(clinic_id uuid, clinic_name text, doctor_id uuid, doctor_name text, currency text, revenue numeric, revenue_base numeric, order_ids uuid[])`.
    - Gruplama: klinik × hekim × döviz. `order_ids` tekilleştirilmiş birleşimdir.
    - Hekim adı `COALESCE(profiles.full_name, doctors.full_name)`.
  - **`profitability_by_service(p_lab_id uuid, p_from date, p_to date)`**
    - Döner: `TABLE(row_kind text, service_id uuid, service_name text, unit text, currency text, quantity numeric, revenue numeric, revenue_base numeric, listed_quantity numeric, listed_revenue_base numeric, list_value_base numeric)`.
    - Gruplama: kind × hizmet × döviz.
    - `listed_*` yalnız `has_list` kalemlerden toplanır.

- [ ] **Step 1: Ölçüm betiğini yaz.** Dönemler Task 2'deki gibi; kırılımlar Task 2 migration'ı uygulanmış varsayılarak ölçülür.
  - `gen_probe.py` tek mig ve tek down alır. Bu yüzden önce birleştirilir: `cat <t2 mig> <t3 mig> > $SP/karlilik/t3_mig_all.sql` ve `cat <t3 down> <t2 down> > $SP/karlilik/t3_down_all.sql`.
  - **A — mutabakat (O ve bütün lablar):** her dönemde, her döviz için
    - Σ`by_clinic.revenue` = Σ`by_service.revenue` = `revenue_ccy`;
    - Σ`revenue_base` (iki RPC) = summary `total_revenue`;
    - fark < 0.01.
  - **Y — yetki:**
    - teknisyenle çağrı → 42501;
    - O ile başka lab kimliği → hata;
    - `has_function_privilege('authenticated', '_profit_revenue_lines(uuid,date,date)', 'execute')` → false.
  - **E — sentetik toplu fatura (geri alınır):**
    - Hazırlık: farklı hekimli üç siparişe bağlı, kesildi durumlu bir fatura. İlk iki siparişin her birine bir sipariş kalemli fatura kalemi; üçüncü siparişin fatura kalemi yok. Ayrıca "Acil Ek Ücret" bağsız kalem.
    - Beklenen:
      - iki hekim satırı kendi kalem tutarlarını alır;
      - bağsız kalem `doctor_id` null, `row_kind` `other`;
      - üçüncü sipariş 0 tutarlı `no_items` satırı olarak kendi hekimiyle gelir; `by_service` bu satırı döndürmez;
      - kliniğin `order_ids` birleşimi 3 sipariş;
      - fatura `subtotal` = satırlar toplamı.
  - **D — dağılım:** Nexadent Tümü için `row_kind` sayıları ve `other` cirosunun payı (yalnız sayı ve yüzde).
- [ ] **Step 2: Migration'ı, before ve down dosyalarını yaz.**
- [ ] **Step 3: Provayı çalıştır.** Beklenen:
  - A'nın bütün satırları "tamam";
  - Y: 42501 / hata / false;
  - E beklenenle aynı;
  - GERİ ALMA'da üç fonksiyon yok, Task 2 md5'leri ÖNCE ile aynı.

### Task 4: Onay ve canlıya uygulama

- [ ] **Step 1: Kullanıcıya özet sun.** İçerik: iki migration'ın ne değiştirdiği, prova sonuçları (yalnız sayı/yüzde, isim ve tutar yok), Ekim marjının KDV hariç sonrası yönü. AskUserQuestion: "Onaylıyorum, uygula".
- [ ] **Step 2: Uygula.** `supabase db query --linked -f <mutlak yol>` ile önce 20261101120000, sonra 20261101121000.
- [ ] **Step 3: Canlıda ölç.** Task 3 A ve Y senaryoları geri alınmadan, yalnız okuyarak yeniden çalıştırılır. Beklenen: aynı sonuçlar; md5'ler migration dosyasıyla tutarlı.

### Task 5: Karlılık ekranı

**Files:**
- Modify: `modules/finance/screens/ProfitabilityScreen.tsx`
- Create: `modules/finance/components/ProfitClinicTable.tsx` — `export function ProfitClinicTable({ rows }: { rows: ClinicRow[] })`
- Create: `modules/finance/components/ProfitServiceTable.tsx` — `export function ProfitServiceTable({ rows }: { rows: ServiceRow[] })`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json` (araçla)

**Interfaces:**
- Consumes: Task 1 tipleri ve fonksiyonları; Task 3 RPC'leri.
- **Kaldırılanlar:**
  - RPC çağrıları: `profitability_top_orders` ×2, `profitability_by_doctor`, `profitability_by_doctor_revenue_ccy`;
  - state'ler: `best`, `worst`, `doctors`, `docRevByCcy`, `realWorst`;
  - bölümler: "En Kârlı/En Zararlı 5 Sipariş" ve "Doktor Bazlı Kârlılık" + dipnotu;
  - alt bileşenler `OrderListRow`, `DoctorRowView`; tipler `OrderRow`, `DoctorRow`;
  - kullanılmayan `router`, `segments`, `orderHref`.
- **Eklenenler:**
  - Aynı `Promise.all` içinde `profitability_by_clinic` ve `profitability_by_service` çağrılır; sonuçlar `buildClinicRows` / `buildServiceRows`'tan geçer.
  - Önbellek anahtarı `profit_screen_v5`; önbellekte ham satırlar tutulur.
  - **Hero:**
    - Kicker `Karlılık · Bu Dönem · KDV hariç`; Gelir kutucuğu etiketi `Gelir · KDV hariç`.
    - Açıklamadaki marj etiketi `marginLabel()`'dan gelir.
    - Dipnot ikinci cümlesi: `Dönem, faturanın kesildiği tarihe göredir; gelir KDV hariçtir ve faturanın kendi kuruyla çevrilir.`
    - `missingCosts()` doluysa, kutucukların üstünde `AlertTriangle` + `useInkUI().chipTones.warning` zeminli satır. Metin şunlardan biri:
      - `Bu dönem işçilik girilmemiş — kâr olduğundan yüksek görünüyor`
      - `Bu dönem genel gider girilmemiş — kâr olduğundan yüksek görünüyor`
      - `Bu dönem işçilik ve genel gider girilmemiş — kâr olduğundan yüksek görünüyor`
  - **Kırılım (spec §7 düzen seçimi):** kullanıcının taslakta tıkladığı A (sekmeli) uygulanır.
    - `SlideTabBar size="sm"`: `Klinikler` / `İşlemler`. Altında tek `MobileTableX`.
    - Başlıklar `Klinik Bazında Ciro` (sayaç `klinik`) / `İşlem Bazında Ciro` (sayaç `işlem`).
  - **`ProfitClinicTable`:**
    - Satır: ad (yoksa `Kliniksiz`), alt satırda `<n> sipariş`. Sağda döviz dilimleri `formatMoney(..., {fractionDigits:0})` ve `%<share>`.
    - Satıra dokununca hekimler açılır/kapanır: ad (yoksa `Hekim belirtilmemiş`), dilimler, `%<shareInClinic>`.
    - Satır `GlassTooltip title="Hekimleri göster"`.
  - **`ProfitServiceTable`:**
    - Satır: ad (`other` → `Diğer`, `no_items` → `Kalemsiz fatura`).
    - Alt satır: miktar + birim (birim yoksa yalnız sayı); `Ort. <fiyat>`; `Liste <fiyat>`, liste fiyatı yoksa `Liste —`. Birim fiyatlar ana para biriminde, 2 ondalık.
    - Sağda dilimler ve pay. `discountPct > 0` ise uyarı çipi `%<n> liste altı`.
    - `Diğer` satırı açılmaz; içindeki kalem adları gösterilmez (spec §7 kurucuya bıraktı; YAGNI).
  - **Dokunulmayanlar:** "Teknisyen Malzeme Verimi" ve "Materyal Fire Raporu" bölümleri ve onları besleyen çağrılar aynen kalır.
  - **Boş durum:** gelir 0 ve satır yoksa tablo yerine `Ciro, kesilen faturalardan hesaplanır; bu dönemde kesilmiş fatura yok.`

- [ ] **Step 1: Bileşenleri yaz, ekranı değiştir.**
- [ ] **Step 2: Yeni dizeleri dört dile ekle.** `$SP/karlilik/i18n.json` + `node $SP/tools/i18n_add.mjs`. Beklenen: "EŞİT" çıktısı, biçim kayması yok.
  - Dizeler: yukarıdaki bütün Türkçe metinler, ayrıca `Klinikler`, `İşlemler`, `Kliniksiz`, `Hekim belirtilmemiş`, `Diğer`, `Kalemsiz fatura`, `Ort.`, `Liste`, `liste altı`, `klinik`, `işlem`.
  - `${n} X` kalıpları `autoT` ile çağrı yerinde sarılır.
- [ ] **Step 3: Doğrula.** `bash $SP/tools/verify.sh` → fail 0, `tsc0`.
- [ ] **Step 4: Önbellek ve kalıntı taraması.** `grep -n "profit_screen_v4\|profitability_top_orders\|profitability_by_doctor\|OrderListRow\|DoctorRowView" modules/finance/screens/ProfitabilityScreen.tsx` → boş; `grep -n profit_screen_v5` → 1+ satır.

### Task 6: Önizleme ve kapanış

- [ ] **Step 1: Önizlemede doğrula.**
  - "Expo Web" önizlemesinde Mali İşlemler → Karlılık açılır; masaüstü ve 390px genişlikte, açık ve koyu temada bakılır.
  - Geçen Ay ve Bu Ay seçilir. Bu Ay'da fatura yoksa boş durum metni görünmelidir.
  - Klinik satırı açılıp kapanır.
  - Kontroller:
    - klinik döviz toplamları = hero Gelir dilimleri;
    - konsol hatası yok;
    - hasta adı yok.
  - Canlı hesapta hiçbir kayıt butonuna basılmaz; ekran görüntüsünde isim ve tutar kullanıcıya aktarılmaz.
- [ ] **Step 2: Bütün işin bağımsız incelemesi.** İncelemeciye Review Focus ve `Ruling:` satırları verilir.
- [ ] **Step 3: Kayıtları güncelle.**
  - Yol haritasında madde 12 yeni kapsamla işaretlenir.
  - Madde 9 satırındaki "web yayınını bekliyor" ifadesi düzeltilir.
  - Hafıza: `project_profitability_clinic_revenue.md` + MEMORY.md satırı.
