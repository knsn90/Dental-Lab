# Genel arama (2. dalga 1, Y1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Üst "Ara..." kutusu, Ctrl+K/⌘K ve mobil arama düğmesi, bütün panellerde sipariş, klinik, hekim, fatura ve sayfaları arayan tek bir arama penceresi açsın; sonuca tıklayınca doğru sayfaya gidilsin.

**Architecture:** Arama sunucuda, çağıranın kimliğiyle (SECURITY INVOKER, RLS uygulanır) tek RPC `global_search` ile yapılır; Türkçe harf katlaması `search_fold` ile. İstemcide saf yardımcılar (`modules/search/lib/*`) panel→grup, hedef sayfa ve klavye sırasını belirler; mevcut `CommandPalette` isteğe bağlı `panel` prop'u alınca kayıt gruplarını gösterir, yoksa bugünkü gibi çalışır. Gidilecek sayfalara eklemeli iki parametre gelir: Sağlık Kurumları `?clinic=`, Siparişler `?doctor=`.

**Tech Stack:** Supabase Postgres (plpgsql/sql, RLS), Expo + react-native-web, expo-router, zustand, `node --test` (.test.mts).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-25-genel-arama-design.md`

## Global Constraints

- **Veritabanı adımı beş aşamalı:** canlı tanım `.before` → geri alma `supabase/rollbacks/<ts>.down.sql` → rol rol geri alınan işlemde KIRMIZI sonra YEŞİL → **kullanıcı onayı** → `supabase db query --linked -f <mutlak>` + canlı doğrulama.
- Yayın yalnız kullanıcı "deploy" deyince; commit yok. Canlı hesapta kayıt açılmaz/kaydedilmez.
- KVKK: arama metni (hasta adı) aktivite kaydına, bildirime, analitiğe yazılmaz; çıktılarda ad yok.
- Yeni her metin tr+en+de+fa aynı anda (`auto.{en,de,fa}.json` eşit kalır); koyu tema token'la (`useMobileTokens`/`useInkUI`); ikon yalnız `core/ui/icons`; `tsc --noEmit --incremental false` 0 hata.
- Katlama kuralı (spec §4, birebir): `translate(lower(x), 'ıiçğöşüâîû' || chr(775), 'iicgosuaiu')`.
- Sınırlar: siparişte 8 sonuç + `orders_more`; diğer gruplarda 6. En az 2 karakter; yazma durunca 250 ms.
- Grup sırası: Siparişler · Klinikler · Hekimler · Faturalar · Sayfalar.
- Arşiv yalnız admin panelinde (`p_include_archived = panel === 'admin'`); klinik/hekim faturalarında `iptal` hariç; klinik/hekim yalnız aktif lab (`getActiveLabId`).
- Lab personeli (`profiles.user_type in ('admin','lab')`) fatura sonucu için `has_permission('view_financials') or has_permission('view_finance') or has_permission('manage_finance')`.
- Paylaşılan bileşen değişiklikleri (PatternsShell, CommandPalette, PillTabBar) bütün panelleri etkiler — spec bunu istiyor; panel prop'u verilmeyen mount bugünkü gibi davranır.

## Review Focus

1. Hızlı yazarken eski yanıtın yenisinin üstüne yazılması → son istek kazanır (Task 2 `latestOnly` testi).
2. Aramada `%`, `_`, `\` → harfiyen aranır, her şeyi eşleştirmez (Task 1 YEŞİL ölçümü `q='%%'` → 0).
3. Aynı lab'daki başka kliniğin hasta adını klinik yöneticisi araması → sonuç yok (Task 1 YEŞİL).
4. Hekim hesabıyla açılmış siparişler `?doctor=` süzgecinde kaybolmaz (Task 6 `doctorOrderIds` + ekran ölçümü).
5. `panel` verilmeyen palet mount'u ve sayfa araması bugünkü gibi (Task 3 `buildPageCommands` testi + Task 4 kontrolü).

---

### Task 1: Veritabanı — `search_fold` + `global_search`

**Files:**
- Create: `supabase/migrations/20261025140000_global_search.sql`
- Create: `supabase/rollbacks/20261025140000_global_search.down.sql` (iki fonksiyonu DROP eder)
- Probe: `scratchpad/search/probe.sql` (RAISE ile geri alınır)

**Interfaces:**
- Produces:
  - `public.search_fold(p text) returns text` — `language sql immutable parallel safe`, `coalesce(p,'')` üzerinde Global Constraints'teki katlama.
  - `public.global_search(p_q text, p_kinds text[], p_lab_id uuid default null, p_include_archived boolean default false) returns jsonb` — `language plpgsql stable security invoker set search_path = public`. Dönüş:
    `{"orders":[{id,order_number,patient_name,status,delivery_date,work_type,is_archived,clinic_name,doctor_name}], "orders_more":bool, "clinics":[{id,name,is_active,doctor_count}], "doctors":[{id,full_name,clinic_name,is_active}], "invoices":[{id,invoice_number,efatura_number,clinic_name,total,currency,status}]}`. İstenmeyen grup boş dizi.
  - `grant execute … to authenticated`; `revoke … from anon, public`.

Kurallar (gövde uygulayıcının): `length(trim(p_q)) < 2` → hepsi boş. Desen `'%' || replace(replace(replace(search_fold(p_q),'\','\\'),'%','\%'),'_','\_') || '%'`, `like … escape '\'`. Sipariş: `work_orders` + `left join doctors d on d.id = wo.doctor_id` + `left join profiles p on p.id = wo.doctor_id` + `left join clinics c on c.id = coalesce(d.clinic_id, p.clinic_id)`; eşleşme `order_number`, `patient_name`, `coalesce(c.name, p.clinic_name)`, `coalesce(d.full_name, p.full_name)` katlanmış; `p_lab_id` verilirse `wo.lab_id = p_lab_id`; `p_include_archived` değilse `not coalesce(wo.is_archived,false)`; sıra: `lower(order_number) = lower(trim(p_q))` önce, sonra `created_at desc`; 9 çek, 8 döndür, 9. varsa `orders_more`. Klinik: ad, `p_lab_id`, `doctor_count` = o kliniğin `doctors` sayısı; aktifler önce, ada göre. Hekim: `doctors.full_name`, klinik adı. Fatura: `invoice_number` ya da `efatura_number`; klinik adı; lab personeliyse finans yetkisi şart (Global Constraints), değilse `status <> 'iptal'`; `p_lab_id` verilirse uygulanır; `issue_date desc`. Tutar alanı: fatura listesi ekranının gösterdiği alan (`total` ya da `total_amount`) — uygulayıcı `modules/invoices` listesinden doğrular.

- [ ] **Step 1:** Canlıda `global_search`/`search_fold` olmadığını, `work_orders`/`invoices`/`clinics`/`doctors`/`profiles` SELECT kurallarını `.before` dosyasına kaydet (`supabase/rollbacks/20261025140000_global_search.before.txt`). Deneme kimlikleri: sahip `f6817e96…`, müdür `8ce19a0e…`, teknisyen `5ab98f51…` (Nexadent `243ef1db…`); Nexadent'e bağlı siparişi olan bir `clinic_admin` ve bir `doctor` profili + başka bir kliniğin hasta adı + başka lab'ın bir sipariş no'su sorguyla seçilir (çıktıya ad yazılmaz, yalnız sayı).
- [ ] **Step 2: KIRMIZI.** Geri alınan işlemde: `select global_search('ay', array['orders'])` → 42883 (yok); `'Ayşe' ilike '%ayse%'` → false.
- [ ] **Step 3:** Geçiş + geri alma dosyalarını yaz.
- [ ] **Step 4: YEŞİL** (tek dosya: geçiş → ölçüm → geri alma → ölçüm → RAISE). Beklenen:

  | Kim | Deneme | Beklenen |
  |---|---|---|
  | Sahip | hasta adının katlanmış hâli ve BÜYÜK hâli | aynı sipariş kümesi, ≥1 |
  | Sahip | bir sipariş no'nun son 3 hanesi ve tam no | tam no ilk sırada |
  | Sahip | bir klinik adı | `clinics` ≥1 ve o kliniğin siparişleri `orders`'da |
  | Sahip | bir fatura no | `invoices` ≥1 |
  | Sahip | `'%%'`, `'__'` | hepsi 0 (harfiyen) |
  | Sahip | `p_include_archived` false/true | arşivli sipariş yalnız true'da |
  | Müdür, teknisyen | fatura no, `array['invoices']` | `invoices` 0 |
  | Müdür | aynı hasta adı | sahiple aynı sipariş sayısı |
  | Klinik yöneticisi / hekim | kendi kliniğinin hastası, `p_lab_id` = Nexadent | ≥1 |
  | Klinik yöneticisi / hekim | başka kliniğin hasta adı | 0 |
  | Herkes | başka lab'ın sipariş no'su | 0 |
  | Herkes | 1 karakter | hepsi boş |
  | Geri alma sonrası | çağrı | 42883 |

- [ ] **Step 5:** Kullanıcıya özet + **onay** → uygula → canlıda YEŞİL ölçümünü (geri alınan) tekrarla; `anon` EXECUTE yok. Ledger.

### Task 2: Arama modeli, API ve kanca

**Files:**
- Create: `modules/search/types.ts`, `modules/search/lib/fold.ts`, `modules/search/lib/searchModel.ts`, `modules/search/api.ts`, `modules/search/useGlobalSearch.ts`
- Test: `modules/search/lib/fold.test.mts`, `modules/search/lib/searchModel.test.mts`

**Interfaces:**
- Consumes: Task 1 RPC.
- Produces:
  - `types.ts`: `type SearchPanel = 'admin'|'lab'|'clinic'|'doctor'|'station'`; `type SearchKind = 'orders'|'clinics'|'doctors'|'invoices'`; `OrderHit`, `ClinicHit`, `DoctorHit`, `InvoiceHit` (Task 1 alanları); `GlobalSearchResult { orders; orders_more; clinics; doctors; invoices }`; `EMPTY_RESULT`.
  - `fold.ts`: `foldTR(s: string): string` — DB ile aynı sonuç.
  - `searchModel.ts`:
    - `MIN_QUERY = 2`, `DEBOUNCE_MS = 250`
    - `shouldSearch(q: string): boolean`
    - `kindsForPanel(panel: SearchPanel, navHrefs: string[]): SearchKind[]` — sipariş: panelin sipariş href'i menüdeyse (`/(admin)/orders`, `/(lab)/all-orders`, `/(clinic)/orders`, `/(doctor)/orders`, `/(station)/orders`); klinik: admin/lab ve `/(<p>)/clinics` menüde; hekim: admin/lab ve sipariş href'i menüde; fatura: admin/lab'da `/(<p>)/finance` menüde, klinik/hekimde `/(<p>)/finance` menüde; istasyon: yalnız sipariş.
    - `hrefFor(panel: SearchPanel, kind: SearchKind, id: string): string` — sipariş `/(<p>)/order/<id>`; klinik `/(<p>)/clinics?clinic=<id>`; hekim admin `/(admin)/orders?doctor=<id>`, lab `/(lab)/all-orders?doctor=<id>`; fatura `/(<p>)/invoice/<id>`.
    - `latestOnly<T>(): (p: Promise<T>) => Promise<T | typeof STALE>` + `STALE` sembolü — yalnız en son verilen sözün sonucunu geçirir.
  - `api.ts`: `globalSearch(q: string, kinds: SearchKind[], opts: { labId?: string | null; includeArchived?: boolean }): Promise<GlobalSearchResult>` — hata fırlatır.
  - `useGlobalSearch(q: string, panel: SearchPanel | undefined, kinds: SearchKind[]): { result: GlobalSearchResult; loading: boolean; error: string | null }` — `panel` yoksa hiç istek yok; klinik/hekimde `labId = getActiveLabId()`; `includeArchived = panel === 'admin'`; debounce + `latestOnly`.

- [ ] **Step 1: Testleri yaz.**
  ```ts
  // fold.test.mts
  assert.equal(foldTR('İsmail IŞIK Ayşe Çağla Öz Üstün'), 'ismail isik ayse cagla oz ustun');
  assert.equal(foldTR('AYŞE'), foldTR('ayse'));
  // searchModel.test.mts
  assert.equal(shouldSearch(' a '), false); assert.equal(shouldSearch('ay'), true);
  assert.deepEqual(kindsForPanel('admin', ['/(admin)/orders','/(admin)/clinics','/(admin)/finance']), ['orders','clinics','doctors','invoices']);
  assert.deepEqual(kindsForPanel('lab', ['/(lab)/all-orders','/(lab)/clinics']), ['orders','clinics','doctors']);   // finans yetkisi yok
  assert.deepEqual(kindsForPanel('clinic', ['/(clinic)/orders','/(clinic)/finance']), ['orders','invoices']);
  assert.deepEqual(kindsForPanel('station', ['/(station)/orders']), ['orders']);
  assert.deepEqual(kindsForPanel('station', []), []);
  assert.equal(hrefFor('lab','doctors','d1'), '/(lab)/all-orders?doctor=d1');
  assert.equal(hrefFor('admin','clinics','c1'), '/(admin)/clinics?clinic=c1');
  assert.equal(hrefFor('doctor','invoices','i1'), '/(doctor)/invoice/i1');
  // latestOnly: iki söz; ilki sonra çözülse de STALE döner, ikinci değerini döner
  ```
- [ ] **Step 2:** `node --test modules/search/lib/*.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** Uygula (types, fold, searchModel, api, hook).
- [ ] **Step 4:** Testler PASS; `tsc` 0.
- [ ] **Step 5:** Ledger.

### Task 3: Arama penceresi (CommandPalette) kayıt grupları

**Files:**
- Modify: `core/ui/CommandPalette.tsx` (props :52-56, komut listesi :99-136, render)
- Modify: `core/store/commandPaletteStore.ts` — `openPalette(initialQuery?: string)`
- Create: `core/ui/commandPaletteModel.ts` + Test `core/ui/commandPaletteModel.test.mts`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Consumes: Task 2 `useGlobalSearch`, `kindsForPanel`, `hrefFor`, `foldTR`, tipler.
- Produces:
  - `CommandPalette` yeni isteğe bağlı prop `panel?: SearchPanel`. Yoksa davranış birebir bugünkü.
  - `commandPaletteModel.ts`: `buildPageCommands(navItems, q): PageRow[]` (bugünkü süzgeç; eşleşme `foldTR` ile), `flattenRows(result: GlobalSearchResult, pages: PageRow[]): PaletteRow[]` — grup sırası Global Constraints; her satır `{ key, group, kind, id?, href? }`; `orders_more` true ise sipariş grubunun sonuna tıklanmaz `hint` satırı.

- [ ] **Step 1: Test.** `buildPageCommands` bugünkü sonucu verir (label/grup `includes`, artık "fatura" → "Faturalar" Türkçe katlamayla da); `flattenRows` sırası Siparişler→Klinikler→Hekimler→Faturalar→Sayfalar, boş gruplar atlanır, `orders_more` → son satır `kind:'hint'`; ok tuşu sırası = dizi sırası, `hint` seçilemez (`selectableIndex` testi).
- [ ] **Step 2:** FAIL. **Step 3:** Uygula: model + palet render (satırlar spec §5.3; "Aranıyor…", "Sonuç yok", "Arama yapılamadı" ve hint metni "Daha fazla sonuç var, aramayı daraltın" pencerede görünür; seçimde `closePalette(); onNavigate(hrefFor(...))`); store `openPalette(initialQuery)`; yeni metinler 4 dilde, koyu tema token'la; Enter/oklar `selectableIndex` ile.
- [ ] **Step 4:** Testler PASS; `tsc` 0; sözlük eşit. **Step 5:** Ledger.

### Task 4: Açılış noktaları — üst kutu, paneller, mobil düğme

**Files:**
- Modify: `core/layout/PatternsShell.tsx:683-689` — kutu paleti açar
- Modify: `app/(admin|lab|clinic|doctor|station)/_layout.tsx` — her `CommandPalette`'e `panel`; klinik/hekim/istasyon masaüstüne palet mount (admin'in `React.Suspense` + lazy deseni birebir, `app/(admin)/_layout.tsx:211-217`)
- Modify: `core/ui/mobile/PillTabBar.tsx:592-596` — yeni prop `showSearch?: boolean` (varsayılan false); `fabItem` ve `showSearch` varken FAB'ın üstünde `SearchAboveFab`. Beş panel `showSearch` verir; **kurye vermez** (paleti yok, spec §3 kapsam dışı — düğme ölü kalırdı).
- Test: `scratchpad/search/check_t4.sh`

**Interfaces:**
- Consumes: Task 3 `panel` prop, `openPalette(initialQuery?)`.
- Produces: yok (bağlama).

- [ ] **Step 1: `check_t4.sh` (KIRMIZI):** beş layout'ta her `<CommandPalette` için `panel=` var; klinik/hekim/istasyon masaüstü dalında `CommandPalette` mount; PatternsShell kutusu `openPalette` çağırıyor ve `onSearchSubmit` ölü yolu kalmadı; PillTabBar'da `<SearchAboveFab` yalnız `showSearch` ile render ediliyor; `app/(courier)/_layout.tsx` `showSearch` vermiyor.
- [ ] **Step 2:** Uygula. Kutu: aynı görünüm (180 px, "Ara...", ⌘K ipucu) — basınca/odaklanınca `openPalette(searchQ)`. `onSearchSubmit` prop'u imzada kalabilir (kullanan yok). Mobil düğme: FAB'ın üstünde, `searchActive` iken gizli. + düğmesi olmayan durumda (lab, `canCreate` false) giriş noktası mevcut `TopActionBar` arama düğmesidir (`core/ui/mobile/TopActionBar.tsx:70`, `openPalette`); o panelin mobil başlığında görünmüyorsa ledger'a Ruling yaz.
- [ ] **Step 3:** `check_t4.sh` PASS; `tsc` 0.
- [ ] **Step 4: Ekran (yerel, canlı veri, kaydetmeden):** admin masaüstünde üst kutu ve Ctrl+K paleti açar; hasta adının parçası, sipariş no, klinik adı, fatura no sonuç verir; sonuca tıklama doğru sayfaya gider; sayfa araması bugünkü gibi; koyu tema; telefon genişliğinde (375) admin'de + üstünde arama düğmesi paleti açar. Ağ panelinde yazma başına tek istek.
- [ ] **Step 5:** Ledger.

### Task 5: Sağlık Kurumları `?clinic=<id>`

**Files:**
- Modify: `modules/clinics/screens/ClinicsScreen.tsx` (:204 `expanded`, :215-224 `editClinic` deseni, :538 ScrollView, :779 satırlar)
- Test: `scratchpad/search/check_t5.sh` + ekran

**Interfaces:**
- Consumes: Task 2 `hrefFor` (`/(<p>)/clinics?clinic=<id>`).
- Produces: `?clinic=<id>` parametresi.

- [ ] **Step 1: `check_t5.sh` KIRMIZI:** `useLocalSearchParams` içinde `clinic`; ref korumalı tek seferlik işleme; `setActiveTab('all')`, arama/filtre temizleme, `setExpanded` ekleme ve kaydırma çağrısı var.
- [ ] **Step 2:** Uygula: `editClinic` ile aynı ref deseni; klinikler yüklenince sekme "Tümü", `search`/`categoryFilter`/`statusFilter` sıfır, kart açık; ScrollView ref + satır `onLayout` y-haritasıyla `scrollTo` (web'de `scrollIntoView` da olur). `editClinic` davranışı değişmez.
- [ ] **Step 3:** PASS; `tsc` 0. **Step 4: Ekran:** paletten klinik → kart açık ve görünür (masaüstü + 375 px). **Step 5:** Ledger.

### Task 6: Siparişler `?doctor=<id>` + klinik adıyla arama

**Files:**
- Modify: `modules/orders/lib/listParams.ts` (+ mevcut `listParams.test.mts`)
- Modify: `modules/orders/api.ts:274-292` (`fetchAllWorkOrders`), hook `useOrders`
- Modify: `modules/orders/screens/OrdersListScreenV2.tsx:369-383` (parametre uygulama), `:416-433` (süzgeç)
- Create: `modules/orders/lib/orderSearch.ts` + Test `orderSearch.test.mts`

**Interfaces:**
- Consumes: Task 2 `foldTR`.
- Produces:
  - `listStateFromParams` dönüşüne `doctorId: string | null`; `paramsKey` doktoru da içerir.
  - `matchesOrderSearch(o: { order_number?; patient_name?; work_type?; doctor?: { full_name?; clinic?: { name? } } }, q: string): boolean` — dört alan + klinik adı, `foldTR` ile.
  - `doctorOrderIds(doctorId: string): Promise<string[]>` — `[doctorId, ...profiles.where(doctor_id = doctorId).id]`.
  - `fetchAllWorkOrders(..., opts?: { doctorIds?: string[] })` — verilirse sunucu sorgusuna `.in('doctor_id', doctorIds)`.

- [ ] **Step 1: Test.** `listStateFromParams({ doctor: 'd1' }).doctorId === 'd1'`, yoksa `null`; `paramsKey` doktor değişince değişir; mevcut `status`/`filter` testleri aynen geçer. `matchesOrderSearch({doctor:{clinic:{name:'Gülüş Kliniği'}}}, 'gulus')` true; `({patient_name:'AYŞE K.'}, 'ayse')` true; `({order_number:'NEX-24871'}, '248')` true; eşleşmeyen false.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula: ekran `?doctor=` gelince `doctorOrderIds` ile sunucu sorgusu + liste üstünde kaldırılabilir "Hekim: <ad> ✕" çipi (`router.setParams({ doctor: undefined })`), ad `doctors`'tan; arama süzgeci `matchesOrderSearch`. Mevcut `status`/`filter` davranışı değişmez. Çip metni 4 dilde, koyu tema.
- [ ] **Step 4:** PASS (listParams + orderSearch + tüm suite); `tsc` 0. Lab personelinin bağlı hekim profillerini RLS ile okuyup okuyamadığını geri alınan işlemde ölç (müdür: `select count(*) from profiles where doctor_id = <bağlı doctors.id>`); okuyamıyorsa ledger'a Ruling (süzgeç yalnız `doctors.id` kapsar) yaz ve kullanıcıya bildir.
- [ ] **Step 5: Ekran:** paletten hekim → Siparişler o hekime süzülü, çip kaldırılınca liste tam; Siparişler aramasında klinik adı ve "ayse" çalışır. Ledger.
