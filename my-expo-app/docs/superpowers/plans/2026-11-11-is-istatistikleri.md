# İş İstatistikleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetim paneline, Üye Trendi kartından açılan; aylık iş tipi / klinik kırılımı, önceki ay + geçen yıl kıyası, 12 aylık trend, ısı haritası ve Excel/PDF dışa aktarması olan bir "İş İstatistikleri" sayfası eklemek.

**Architecture:** İstemci, lab'ın `work_orders` + `doctors` + `clinics` + `lab_services` satırlarını RLS altında ve `lab_id` ile açıkça süzerek okur. Tüm sayım saf TS modülünde (`aggregate.ts`) yapılır ve Üye Trendi kartıyla aynı `serviceUnits` fonksiyonlarını kullanır. Ekran bu modülün çıktısını çizer; dışa aktarma aynı çıktıdan HTML üretir (PDF: `exportHtmlPdf`, Excel: HTML→`.xls`).

**Tech Stack:** Expo + React Native + react-native-web, NativeWind, `react-native-reanimated` 4.2.1, `react-native-svg`, Supabase JS, `expo-file-system` + `expo-sharing` (native Excel), `node --test` (saf modüller).

**Spec:** `docs/superpowers/specs/2026-11-11-is-istatistikleri-design.md` (onaylı 2026-11-11). Plan ile çelişirse spec geçerlidir.

## Global Constraints

- Tüm yeni dosyalar `modules/admin/workStats/` altında; rota `app/(admin)/work-stats.tsx`.
- Sayım kuralı (spec §5): `status !== 'iptal'` **ve** `tooth_numbers` en az 1 eleman; ay = `created_at`'ın tarayıcı yerel `getFullYear()/getMonth()`'u; kova `memberBucketOf(resolveUnitForWorkType(work_type, unitByServiceName))`; miktar `uye`→diş sayısı, `cene`→`serviceUnitQty`, `adet`→1; etiket `workTypeGroupLabel`.
- "Toplam üye" yalnız `uye` kovası; çene/adet toplama eklenmez.
- Çözülemeyen klinik → tek satır, id `'__unknown__'`, ad `'Kliniği bilinmeyen'`.
- Kayıt dönemi lab genelidir: lab'ın ilk sipariş ayından önce = `null` ("kayıt yok"); dönem içinde boş = `0`.
- Geçen yıl verisi yoksa fark `null` → ekranda "—"; hiçbir yerde sıfıra bölüp yüzde üretilmez.
- Yeni npm bağımlılığı yok. DB değişikliği yok. `serviceUnits.ts` mevcut fonksiyonlarının sonucu değişmez.
- Admin Özet'te değişen yalnız: Üye Trendi kartının tıklama hedefi (masaüstü + mobil) ve İş Tipi Dağılımı'nın iptalleri dışlaması (bu ikincisi plan öncesi yapıldı ve ayrı commit'lendi).
- Dört dil: her yeni düz Türkçe metin `core/i18n/locales/auto.{en,de,fa}.json`'a aynı anda; birleşik metinler `autoT()`; ay adları `Intl.DateTimeFormat(printLocale(), …)`.
- Koyu tema aynı anda (CLAUDE.md "Koyu Tema Kuralı"); sayfa zemini admin `bgPage` `#F7F9FC`, accent `usePanelTheme().primary`; koyu tema lacivert üçlü `#001F3F → #002A5C → #004B87`; düz butonlar `U.plainBtn`; modal `U.modalOverlay`/`U.modalCard`.
- İkonlar yalnız `core/ui/icons`; renkli sol-kenarlı kart yok; tooltip `GlassTooltip`; hata metni düğmenin yanında.
- Sayfa kenarı `PAGE_PADDING` (16); kart arası `CARD_GAP` (12).
- Hareket: basınca `scale 0.97` anında; değer değişimleri kritik sönümlü yay (`withSpring`, `dampingRatio: 1`, `duration ≈ 350ms`), mevcut değerden başlar ve kesilebilir; `prefers-reduced-motion` → solma/doğrudan değer.
- Commit'ler main üzerinde, açık yol ile stage; mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. i18n dosyalarında "Tam kafa" satırları/hunk'ları stage EDİLMEZ (başka işe ait).
- Dokunma: `modules/ar-scanner/**`, `modules/viewer-3d/**`, `FaceScanQuickAction.tsx`.
- Test komutu (tümü): `cd my-expo-app && find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test`. tsc: `npx tsc --noEmit --incremental false` → 0 hata.
- Deploy yok (yalnız kullanıcı "deploy" deyince).

## Review Focus

1. **1000 satır sınırı:** PostgREST varsayılan olarak 1000 satırda keser; büyük lab'da 24 aylık pencere sessizce eksik okunursa toplamlar karttan sapar. → Task 3 `fetchAllPages` testi.
2. **Yıl sınırı:** Ocak seçilince önceki ay = geçen yılın Aralık'ı, geçen yıl = iki yıl önce değil bir yıl önceki Ocak; 12 aylık pencere yıl geçer. → Task 1 `shiftMonth` / `windowMonths` testleri.
3. **Boş / bozuk alanlar:** `work_type` null, `tooth_numbers` null veya `[]`, `doctor_id` null, `created_at` geçersiz → satır sayılmaz ya da "Kliniği bilinmeyen"e düşer, çökmez. → Task 2 `aggregate: bozuk satırlar` testi.
4. **Kayıt dönemi vs 0:** klinik süzgeciyle o kliniğin hiç göndermediği ama lab'ın kayıt döneminde olan ay `0`, lab'ın ilk ayından önceki ay `null`; 6 ay ortalaması `null` ayları saymaz. → Task 2 `aggregate: kayıt dönemi` testi.
5. **Excel'de sayı hücresi + HTML kaçışı:** klinik adında `<`, `&`, `"` varsa tablo bozulmaz; sayılar `mso-number-format` ile sayı kalır. → Task 4 `xls: kaçış ve sayı` testi.

---

### Task 1: Ay yardımcıları

**Files:**
- Create: `modules/admin/workStats/months.ts`
- Test: `modules/admin/workStats/months.test.mts`

**Interfaces:**
- Produces:
  - `type MonthKey = string` (`'YYYY-MM'`, ay 01–12)
  - `monthKeyOf(d: Date): MonthKey` (yerel `getFullYear/getMonth`)
  - `monthKeyOfIso(iso: string | null | undefined): MonthKey | null` (geçersizse `null`)
  - `shiftMonth(k: MonthKey, delta: number): MonthKey`
  - `windowMonths(selected: MonthKey, n: number): MonthKey[]` (seçili ay dahil, eskiden yeniye, uzunluk n)
  - `compareMonth(selected: MonthKey, mode: CompareMode): MonthKey` — `type CompareMode = 'prev' | 'lastYear'`
  - `monthLabel(k: MonthKey, locale: string, style: 'short' | 'long'): string` (`Intl.DateTimeFormat`, `long` yıl içerir)
  - `fetchFromIso(selected: MonthKey): string` — `shiftMonth(selected, -23)`'ün ayın 1'i 00:00 yerel saatinin ISO'su

- [ ] **Step 1: Failing test yaz** — `months.test.mts`:
  - `shiftMonth('2026-01', -1) === '2025-12'`, `shiftMonth('2026-11', 1) === '2026-12'`, `shiftMonth('2026-12', 1) === '2027-01'`
  - `windowMonths('2026-03', 12)` → ilk `'2025-04'`, son `'2026-03'`, uzunluk 12
  - `compareMonth('2026-01','prev') === '2025-12'`, `compareMonth('2026-11','lastYear') === '2025-11'`
  - `monthKeyOfIso('not-a-date') === null`, `monthKeyOfIso(null) === null`
  - `monthLabel('2026-11','tr-TR','long')` `/Kasım/` ve `/2026/` içerir
  - `new Date(fetchFromIso('2026-11')).getMonth() === 11` (Aralık 2024) ve `getDate() === 1`
- [ ] **Step 2: Çalıştır, düşsün** — `node --test modules/admin/workStats/months.test.mts` → FAIL (modül yok).
- [ ] **Step 3: `months.ts`'i yaz.** Saf; React/Supabase import yok.
- [ ] **Step 4: Çalıştır, geçsin** — aynı komut → PASS.
- [ ] **Step 5: Commit** — `git add modules/admin/workStats/months.ts modules/admin/workStats/months.test.mts && git commit -m "feat(is-istatistik): ay yardımcıları"`

### Task 2: Toplayıcı (aggregate)

**Files:**
- Create: `modules/admin/workStats/aggregate.ts`
- Test: `modules/admin/workStats/aggregate.test.mts`

**Interfaces:**
- Consumes: Task 1 (`MonthKey`, `monthKeyOfIso`, `windowMonths`, `compareMonth`, `shiftMonth`, `CompareMode`); `core/util/serviceUnits.ts` (`resolveUnitForWorkType`, `memberBucketOf`, `serviceUnitQty`, `workTypeGroupLabel`, `serviceUnitLabel`, `type MemberBucket`). `.mts` testleri için `serviceUnits.ts` içe aktarımı `.ts` uzantılıdır (projede mevcut test kalıbı).
- Produces:
  ```ts
  export const UNKNOWN_CLINIC_ID = '__unknown__';
  export const UNKNOWN_CLINIC_NAME = 'Kliniği bilinmeyen';
  export type Qty = { uye: number; cene: number; adet: number };
  export interface RawOrder { id: string; order_number: string | null; work_type: string | null; status: string | null;
    created_at: string | null; tooth_numbers: number[] | null; doctor_id: string | null }
  export interface AggInput {
    orders: RawOrder[];
    clinicByDoctor: Map<string, string>;      // doctors.id → clinics.id
    clinicName: Map<string, string>;          // clinics.id → name
    unitByServiceName: Map<string, string | null>; // kartla aynı: trim + toLocaleLowerCase('tr-TR')
    firstMonth: MonthKey | null;              // lab'ın ilk sipariş ayı (kayıt dönemi başı)
    selected: MonthKey;
    compare: CompareMode;
    clinicId: string | null;                  // üst süzgeç: tüm sayfa
    chipWorkType: string | null;              // trend süzgeci (etiket)
    focusWorkType: string | null;             // klinik listesini o tipe süzer
  }
  export interface CountedOrder { id: string; orderNumber: string; month: MonthKey; workType: string;
    unit: string | null; bucket: MemberBucket; qty: number; clinicId: string }
  export interface TrendPoint { month: MonthKey; value: number | null; lastYear: number | null; bucket: MemberBucket }
  export interface WorkTypeRow { label: string; unit: string | null; unitLabel: string; bucket: MemberBucket;
    qty: number; compare: number | null; series: (number | null)[] }
  export interface ClinicRow { id: string; name: string; qty: Qty; compare: Qty | null }
  export interface WorkStats {
    months: MonthKey[];                        // windowMonths(selected, 12)
    trend: TrendPoint[];
    selectedQty: Qty | null;                   // null = seçili ay kayıt dönemi dışında
    compareQty: Qty | null;
    avg6Uye: number | null;                    // son 6 ayın (seçili dahil) kayıt dönemi içindekilerinin uye ortalaması, 1 ondalık
    workTypes: WorkTypeRow[];                  // seçili ay; qty desc, eşitlikte label asc (tr)
    clinics: ClinicRow[];                      // seçili ay; uye desc; kıyas ayında gönderip bu ay 0 olanlar en sonda
  }
  export function countOrders(input: Pick<AggInput,'orders'|'clinicByDoctor'|'unitByServiceName'>): CountedOrder[];
  export function aggregateWorkStats(input: AggInput): WorkStats;
  export type HeatAxis = 'workType' | 'clinic';
  export interface HeatRow { key: string; label: string; unitLabel: string; cells: (number | null)[]; max: number }
  export function heatmapRows(input: AggInput, axis: HeatAxis): HeatRow[];   // sütunlar = months; clinicId süzgeci uygulanır
  export function ordersInCell(input: AggInput, month: MonthKey, axis: HeatAxis, key: string): CountedOrder[];
  export function inRecord(month: MonthKey, firstMonth: MonthKey | null): boolean; // firstMonth null → false
  ```
  Klinik satırında `qty` üç kovayı birlikte taşır; iş tipi satırında `qty` tek sayıdır (satırın kendi kovası). Heat satırında klinik ekseni hücre değeri `uye`'dir; `unitLabel` iş tipi ekseninde `serviceUnitLabel(unit)`, klinik ekseninde `'üye'`. `clinicByDoctor`'da olmayan veya clinicName'i bulunmayan doctor_id → `UNKNOWN_CLINIC_ID`.

- [ ] **Step 1: Failing test yaz** — `aggregate.test.mts`, fikstür: 2 klinik (A, B), 3 hekim, `unitByServiceName` = `{'zirkon':'Üye','gece plağı':'Çene','model baskısı':'Adet'}`, `firstMonth '2026-06'`, `selected '2026-11'`. Testler:
  - `countOrders: iptal ve dişsiz sayılmaz` — `status 'iptal'` olan ve `tooth_numbers: []` olan siparişler sonuçta yok.
  - `countOrders: kova ve miktar` — Zirkon `[11,12,13]` → `uye` 3; Gece Plağı `[11,…,48]` (üst+alt) → `cene` 2; Model Baskısı `[11]` → `adet` 1; "Zirkon, Zirkon" etiketi `'Zirkon'`.
  - `aggregate: bozuk satırlar` — `work_type null` → sayılır, etiket `'—'`, bucket `uye` (kartla aynı: aylık toplama girer); `created_at 'x'` → atılır; `doctor_id null` → klinik `UNKNOWN_CLINIC_ID`.
  - `aggregate: toplam yalnız üye` — Kasım'da 3 üye + 2 çene + 1 adet → `selectedQty = {uye:3,cene:2,adet:1}`; trend Kasım `value === 3`.
  - `aggregate: kayıt dönemi` — `firstMonth '2026-06'`: trend'de `2026-05` ve öncesi `value === null`; klinik B süzgeciyle B'nin göndermediği `2026-07` `value === 0`; `avg6Uye` yalnız `2026-06..11` ayları (6 ay) üzerinden; `firstMonth '2026-09'` iken `2026-06..08` sayılmaz.
  - `aggregate: geçen yıl yok` — `compare 'lastYear'` → `compareQty === null`, her `workTypes[i].compare === null`, her `trend[i].lastYear === null`.
  - `aggregate: önceki ay farkı` — Ekim'de Zirkon 5, Kasım'da 3 → Zirkon satırı `qty 3`, `compare 5`.
  - `aggregate: sessizleşen klinik` — B Ekim'de gönderdi, Kasım'da göndermedi → `clinics` son eleman B, `qty.uye 0`, `compare.uye > 0`.
  - `aggregate: klinik toplamı = genel toplam` — `sum(clinics.qty.uye) === selectedQty.uye` (UNKNOWN dahil).
  - `aggregate: chip ve focus` — `chipWorkType 'Gece Plağı'` → trend `bucket 'cene'` ve değerler çene miktarı; `focusWorkType 'Zirkon'` → `clinics` yalnız Zirkon gönderenler (sessizleşen dahil değil, yalnız o tipte kıyas ayında gönderenler).
  - `aggregate: kart eşliği` — test içinde kartın döngüsü (`app/(admin)/index.tsx` ≈1560–1587: `teeth>0`, `status!=='iptal'`, `memberBucketOf`/`serviceUnitQty`) aynı fikstürde yeniden yazılır; 6 ayın `uye/cene/adet` toplamları `trend`/`selectedQty` ile birebir eşit.
  - `heatmapRows: iş tipi ve klinik ekseni` — `cells.length === 12`, kayıt öncesi hücre `null`, `max` satırın en büyük değeri; `ordersInCell(…, '2026-11','clinic', A)` A'nın Kasım siparişleri.
  - `aggregate: yıl sınırı` — `selected '2026-01'`, `compare 'prev'` → `compareQty` Aralık 2025'ten.
- [ ] **Step 2: Çalıştır, düşsün** — `node --test modules/admin/workStats/aggregate.test.mts` → FAIL.
- [ ] **Step 3: `aggregate.ts`'i yaz.** Saf; önce `countOrders`, diğerleri onun üstünde. Sıralama karşılaştırmaları `localeCompare(…, 'tr')`.
- [ ] **Step 4: Çalıştır, geçsin** → PASS (Task 1 testleri de yeşil kalır).
- [ ] **Step 5: Commit** — `git commit -m "feat(is-istatistik): saf toplayıcı + kart eşlik testi"` (yalnız bu iki dosya).

### Task 3: Veri okuma + önbellek

**Files:**
- Create: `modules/admin/workStats/api.ts`, `modules/admin/workStats/useWorkStatsData.ts`, `modules/admin/workStats/fetchAllPages.ts`
- Test: `modules/admin/workStats/fetchAllPages.test.mts`

**Interfaces:**
- Consumes: Task 1 `fetchFromIso`, `MonthKey`; Task 2 `RawOrder`.
- Produces:
  - `fetchAllPages<T>(page: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>, size?: number /*=1000*/): Promise<T[]>` — `data.length < size` olunca durur; `error` varsa fırlatır (yutmaz).
  - `api.ts`: `fetchWorkStatsWindow(labId: string, selected: MonthKey): Promise<RawOrder[]>` (`work_orders` `id, order_number, work_type, status, created_at, tooth_numbers, doctor_id`, `.eq('lab_id', labId)`, `.gte('created_at', fetchFromIso(selected))`, `.order('created_at')`, `fetchAllPages` ile); `fetchWorkStatsRefs(labId: string): Promise<{ clinicByDoctor; clinicName; unitByServiceName; firstMonth: MonthKey | null }>` (`doctors(id, clinic_id)`, `clinics(id, name)`, `lab_services(name, unit)` hepsi `.eq('lab_id', labId)`; `firstMonth` = `work_orders` `created_at` artan `.limit(1)`; `unitByServiceName` anahtarı kartla aynı: `trim().toLocaleLowerCase('tr-TR')`).
  - `useWorkStatsData(selected: MonthKey): { status: 'loading' | 'ready' | 'error'; error: string | null; orders: RawOrder[]; refs: Refs | null; reload(): void }` — `labId` `useAuthStore` profilinden (`profile.lab_id`); pencere sonuçları modül içi `Map<string /*labId|month*/, RawOrder[]>` önbelleğinde; aynı aya dönüşte sorgu yok; yarış koruması (son istek kazanır, `useRef` sayaç). Hata metni Türkçe düz metin (`'İstatistik yüklenemedi'`), UI `autoT` ile gösterir.
- [ ] **Step 1: Failing test** — `fetchAllPages.test.mts`: 2500 öğeli sahte kaynak, `size 1000` → 2500 öğe, 3 çağrı; tam 2000 öğe → 3 çağrı (son boş sayfa), sonuç 2000; ikinci sayfada `error` → reject.
- [ ] **Step 2: Çalıştır, düşsün.**
- [ ] **Step 3: Üç dosyayı yaz.** `api.ts` ve hook test edilmez (Supabase); yalnız `fetchAllPages` saf.
- [ ] **Step 4: Çalıştır, geçsin** + `npx tsc --noEmit --incremental false` → 0 hata.
- [ ] **Step 5: Commit** — `git commit -m "feat(is-istatistik): veri okuma, sayfalama, önbellek"`.

### Task 4: Dışa aktarma (Excel + PDF)

**Files:**
- Create: `modules/admin/workStats/exportDoc.ts` (saf HTML üreticiler), `modules/admin/workStats/exportWorkStats.ts` (platform dağıtımı)
- Test: `modules/admin/workStats/exportDoc.test.mts`

**Interfaces:**
- Consumes: Task 2 `WorkStats`, `HeatRow`; `LabLetterhead` (`modules/receipt/buildReceiptHtml.ts`); `fetchLabLetterhead` (`modules/invoices/labLetterheadApi.ts`); `exportHtmlPdf` (`core/print/exportHtmlPdf.ts`).
- Produces:
  ```ts
  export interface ExportDocInput { stats: WorkStats; heat: HeatRow[]; lab: LabLetterhead; clinicLabel: string;
    monthLabel: string; compareLabel: string; generatedAt: Date; t: (s: string) => string; locale: string; monthLabels: string[] }
  export const WORK_STATS_TEXTS: Record<string, string>;   // tüm PDF/Excel Türkçe metinleri (çağıran autoT verir)
  export function buildWorkStatsPdfHtml(i: ExportDocInput): string;
  export function buildWorkStatsXlsHtml(i: ExportDocInput): string;
  export function workStatsFileBase(month: MonthKey, clinicName: string | null): string; // 'is-istatistikleri-2026-11[-klinik-adi]', ASCII'ye indirgenmiş, [a-z0-9-]
  // exportWorkStats.ts
  export async function exportWorkStatsPdf(build: Promise<string>, fileBase: string): Promise<void>; // exportHtmlPdf(build, fileBase + '.pdf'); build await edilmeden geçirilir (tıklama jesti)
  export async function exportWorkStatsXls(html: string, fileBase: string): Promise<void>;
  // web: BOM + Blob 'application/vnd.ms-excel;charset=utf-8' + a[download] (finance-clinic/export.ts kalıbı)
  // native: FileSystem.cacheDirectory + fileBase + '.xls' yaz → Sharing.shareAsync(uri, { mimeType: 'application/vnd.ms-excel', UTI: 'com.microsoft.excel.xls' }); Sharing yoksa Error('SHARE_UNAVAILABLE')
  ```
  İçerik sırası spec §8: başlık · özet · iş tipi tablosu (iş tipi, birim, bu ay, kıyas ayı, fark) · klinik tablosu (klinik, üye, çene, adet, kıyas üye, fark) · 12 ay × iş tipi tablosu. `null` değer "—". PDF görsel dili `core/util/buildCariStatementHtml.ts` başlık kartı (açık gri yuvarlatılmış başlık, sağda logo/lab adı) ile uyumlu; renkli sol kenar YOK; `htmlAttrs()` ile `lang/dir`. Excel'de sayı hücreleri `style="mso-number-format:'0'"` (ortalama `'0.0'`).
- [ ] **Step 1: Failing test** — `exportDoc.test.mts` (fikstür: Task 2 test fikstürü kopyası küçültülmüş; `t = s => s`):
  - `pdf: bölümler` — HTML `İş İstatistikleri`, klinik etiketi, ay etiketi, `Kliniği bilinmeyen` (varsa), 12 ay başlığı içerir; `selectedQty.uye` değeri görünür.
  - `pdf: geçen yıl yok` — `compareQty null` iken fark hücreleri `—`; `%` karakteri fark hücrelerinde yok.
  - `xls: kaçış ve sayı` — klinik adı `A&B <Diş> "Klinik"` → çıktıda `A&amp;B &lt;Diş&gt; &quot;Klinik&quot;`; sayı hücreleri `mso-number-format` taşır.
  - `fileBase` — `workStatsFileBase('2026-11', 'Şirin Diş Kliniği')` → `'is-istatistikleri-2026-11-sirin-dis-klinigi'`; `null` → `'is-istatistikleri-2026-11'`.
- [ ] **Step 2: Çalıştır, düşsün.**
- [ ] **Step 3: İki dosyayı yaz.** `exportDoc.ts` saf (yalnız `import type`); `autoT` ve `printLocale` çağıran taraftan `t`/`locale` olarak gelir.
- [ ] **Step 4: Çalıştır, geçsin** + tsc 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(is-istatistik): Excel ve PDF dışa aktarma"`.

### Task 5: Ekran iskeleti, rota ve araç çubuğu

**Files:**
- Create: `app/(admin)/work-stats.tsx` (yalnız `export default WorkStatsScreen`), `modules/admin/workStats/WorkStatsScreen.tsx`, `modules/admin/workStats/components/WorkStatsToolbar.tsx`, `modules/admin/workStats/components/ClinicPicker.tsx`, `modules/admin/workStats/useWorkStatsState.ts`
- Modify: `modules/admin/users/useStickyFollow.ts` — gerekirse yalnız opsiyonel bir parametre eklenir (mevcut çağrılar aynı davranır); tercihen dokunulmaz, aynı yöntem `components/useStickyToolbar.ts` olarak uyarlanır.

**Interfaces:**
- Consumes: Task 1, 2, 3, 4.
- Produces:
  - `useWorkStatsState(): { selected: MonthKey; setSelected; compare: CompareMode; setCompare; clinicId: string | null; setClinicId; chipWorkType; setChipWorkType; focusWorkType; setFocusWorkType; tab: 'overview' | 'heat'; setTab; heatAxis: HeatAxis; setHeatAxis }` — `selected` başlangıcı `monthKeyOf(new Date())`; `setSelected` `[firstMonth, bugünün ayı]` aralığına kıstırır.
  - `WorkStatsScreen` — `ResponsiveCanvas size="xl"`, zemin panel `bgPage`; `useWorkStatsData(selected)` + `aggregateWorkStats(...)` `useMemo`; yükleniyor / hata (yeniden dene düğmesi yanında) / boş durumlar; sekme çubuğu "Genel bakış" / "Isı haritası" (CLAUDE.md §1c pill ölçüleri); içerik Task 6/7 bileşenlerine yer tutucu.
  - `WorkStatsToolbar` props: `{ monthText: string; canPrev: boolean; canNext: boolean; onPrev(); onNext(); onOpenMonthList(); clinicLabel: string; onOpenClinicPicker(anchor); compare: CompareMode; onCompare(m); onExportXls(); onExportPdf(); exportError: string | null; busy: 'xls' | 'pdf' | null; narrow: boolean }`. Dar ekranda (<768) iki dışa aktarma tek "Dışa aktar" menüsünde. Yapışkan + yarı saydam (`backdropFilter: blur(20px) saturate(180%)`, koyu temada lacivert alfa zemin; `prefers-reduced-transparency` → düz zemin); alt kenarda sert çizgi yerine yumuşak solma.
  - `ClinicPicker` — arama kutulu liste, en çok gönderenden aza (pencere toplamı), ilk satır "Tüm klinikler"; tetikleyicinin altından açılır.
  - Ay listesi: kayıt dönemindeki aylar (yeniden eskiye) `U.modalOverlay` içinde ya da tetikleyiciye bağlı açılır liste.
- [ ] **Step 1: Ekranı ve araç çubuğunu yaz**; dışa aktarma düğmeleri Task 4 fonksiyonlarını çağırır (PDF: `exportWorkStatsPdf` çağrısında HTML üretimi `fetchLabLetterhead()` ile birlikte promise olarak geçer, ilk await'ten önce). Hata metni düğmenin yanında (`POPUP_BLOCKED` → "Açılır pencere engellendi. Tarayıcı ayarından izin ver.", `SHARE_UNAVAILABLE` → "Paylaşım bu cihazda kullanılamıyor", diğer → "Dışa aktarılamadı").
- [ ] **Step 2: Doğrula** — tsc 0; tüm testler yeşil; tarayıcıda `/(admin)/work-stats` açılır, ‹ › ay değiştirir (ileri ok bu ayda pasif değil ama sınırda tepki vermez; görsel olarak soluk), klinik seçici süzer, kıyas segmenti değişir, PDF ve Excel dosyası iner. (Browser pane'de oturum yoksa: sahte Supabase tarayıcı test düzeni — bellek `project_mocked_supabase_browser_harness` — ile.)
- [ ] **Step 3: Commit** — `git commit -m "feat(is-istatistik): ekran, rota, araç çubuğu, dışa aktarma bağlantısı"`.

### Task 6: Genel bakış — trend + seçili ay

**Files:**
- Create: `modules/admin/workStats/components/TrendChart.tsx`, `MonthKpis.tsx`, `WorkTypeList.tsx`, `ClinicList.tsx`, `MiniSeries.tsx`, `modules/admin/workStats/useSpringValue.ts`
- Modify: `modules/admin/workStats/WorkStatsScreen.tsx` (yer tutucuyu bağla)

**Interfaces:**
- Consumes: Task 2 `WorkStats`, `TrendPoint`, `WorkTypeRow`, `ClinicRow`; Task 5 state.
- Produces:
  - `useSpringValue(target: number): SharedValue<number>` — `withSpring(target, { dampingRatio: 1, duration: 350 })`, mevcut değerden; `useReducedMotion()` (reanimated) true → doğrudan atama.
  - `TrendChart` props `{ points: TrendPoint[]; selected: MonthKey; onSelect(m); showLastYear: boolean; chips: string[]; chip: string | null; onChip(c) ; unitLabel: string }` — 12 sütun, taranmış hap sütun dili (Üye Trendi kartından); seçili dolu accent, diğerleri soluk; `null` = kesik çizgili boş sütun + "kayıt yok"; `lastYear` işaretleri `showLastYear` iken, `null` olanlar çizilmez; çipler: "Tümü" + en çok gelen 6 iş tipi (pencere toplamı), fazlası "Diğer…" menüsü. Dar ekranda yatay kaydırma, seçili ay görünür alana kaydırılır.
  - `MonthKpis` props `{ qty: Qty | null; compare: Qty | null; compareMode: CompareMode; compareMonthText: string; avg6: number | null }` — 4 kutu (Toplam üye · Çene · Adet · 6 ay ort.); fark metni `−21 · Eki 84`; kıyas `null` → `— · geçen yılın bu ayına ait kayıt yok` (`prev` modunda: `— · önceki aya ait kayıt yok`); fark yönü erişilebilirlik etiketi "artış"/"azalış"; rakamlar `tabular-nums`, Inter Tight 300, sayaç `useSpringValue`.
  - `WorkTypeList` props `{ rows: WorkTypeRow[]; focus: string | null; onFocus(label | null); expanded: string | null; onExpand(label | null) }` — çubuk uzunluğu aynı kova içinde en büyüğe göre; çene/adet satırları ikinci ton + birim etiketi; açık satırda `MiniSeries` (12 ay).
  - `ClinicList` props `{ rows: ClinicRow[]; onPick(clinicId) }` — sessizleşenler soluk + "bu ay 0".
  - Basınca `scale 0.97` (Pressable `onPressIn`), web'de hover.
- [ ] **Step 1: Bileşenleri yaz ve ekrana bağla**; genişlik ≥1024'te iş tipi ve klinik listeleri yan yana, altında alt alta; KPI 4'lü / dar ekranda 2×2.
- [ ] **Step 2: Doğrula** — tsc 0; tarayıcıda: sütuna basınca ay değişir ve rakamlar yayla akar; hızlı art arda 3 ay seçiminde sıçrama yok; iş tipine basınca klinik listesi süzülür, tekrar basınca kalkar; kliniğe basınca üst seçici o kliniğe geçer; "Geçen yıl" seçilince Haziran 2027 öncesi tüm farklar "—"; işletim sisteminde hareket azaltma açıkken yay yok; koyu temada beyaz yüzey/görünmez metin yok. Ana lab Haz–Kas üye değerleri: 36 · 19 · 75 · 32 · 84 · 63 (Kasım artmış olabilir; Admin Özet kartıyla aynı olmalı).
- [ ] **Step 3: Commit** — `git commit -m "feat(is-istatistik): trend grafiği ve seçili ay bölümü"`.

### Task 7: Isı haritası + hücre siparişleri

**Files:**
- Create: `modules/admin/workStats/components/HeatmapTab.tsx`, `CellOrdersModal.tsx`
- Modify: `modules/admin/workStats/WorkStatsScreen.tsx`

**Interfaces:**
- Consumes: Task 2 `heatmapRows`, `ordersInCell`, `HeatRow`, `HeatAxis`; Task 5 state.
- Produces:
  - `HeatmapTab` props `{ rows: HeatRow[]; months: MonthKey[]; monthLabels: string[]; axis: HeatAxis; onAxis(a); onCell(month, key) }` — eksen segmenti "İş tipi" / "Klinik"; hücre opaklığı `value / row.max` (her satır kendi ölçeğinde; 0 → zemin, `null` → kesik çerçeve "—"); koyu temada mavi tonu açık varyant; satır adı sütunu yatay kaydırmada sabit; birim etiketi satır adının yanında.
  - `CellOrdersModal` props `{ visible; title: string; orders: CountedOrder[]; clinicName: Map<string,string>; onClose(); onOpenOrder(id) }` — `U.modalOverlay`/`U.modalCard`, ortada; satır: sipariş no, klinik, iş tipi, miktar+birim; satıra basınca `router.push` sipariş detayına (panel-agnostik rota kuralı: mevcut admin sipariş detay rotası `/(admin)/order/[id]`).
- [ ] **Step 1: Yaz ve bağla.**
- [ ] **Step 2: Doğrula** — tsc 0; tarayıcıda iki eksen, klinik süzgeci, hücre → pencere → sipariş detayı; koyu tema.
- [ ] **Step 3: Commit** — `git commit -m "feat(is-istatistik): ısı haritası ve hücre siparişleri"`.

### Task 8: Giriş noktaları, çeviriler, son doğrulama

**Files:**
- Modify: `app/(admin)/index.tsx` (Üye Trendi kartının ok düğmesi ≈ satır 2118: `'/(admin)/orders'` → `'/(admin)/work-stats'`; yalnız bu çağrı)
- Modify: `modules/admin/components/AdminMobileDashboard.tsx` (Üye Trendi kartına `onPress` → `'/(admin)/work-stats'`; varsa mevcut hedef değişir)
- Modify: `core/i18n/locales/auto.en.json`, `auto.de.json`, `auto.fa.json`

**Interfaces:**
- Consumes: Task 5–7 metinleri; Task 4 `WORK_STATS_TEXTS`.
- [ ] **Step 1: İki giriş noktasını değiştir.**
- [ ] **Step 2: Çevirileri ekle** — Task 4–7'de eklenen her düz Türkçe `<Text>`/`placeholder`/`autoT` anahtarı ve `WORK_STATS_TEXTS` değerleri üç sözlüğe. Kontrol: `node -e` ile üç dosyanın yeni anahtar kümelerinin eşit olduğunu ve her ekran metninin üçünde de bulunduğunu doğrula (kaynak dosyalarda `<Text>` içindeki düz metinleri ve `autoT('…')` argümanlarını çıkaran kısa betik; eksik → 0 olmalı).
- [ ] **Step 3: Tam doğrulama** — tüm testler yeşil; tsc 0; tarayıcıda Admin Özet → Üye Trendi oku → İş İstatistikleri açılır (masaüstü) ve mobil genişlikte karta dokunma aynı sayfayı açar; İş Tipi Dağılımı kartı iptalleri saymaz; en/de/fa dillerinde ekran ve PDF/Excel metinleri çevrili (fa'da RTL düzen, grafik zaman ekseni soldan sağa).
- [ ] **Step 4: Commit** — açık yollarla; i18n dosyalarını "Tam kafa" hunk'larını hariç tutarak `git diff core/i18n/locales/ > patch` → "Tam kafa" satırlarını ve boş hunk'ları at → `git apply --cached`. Mesaj: `feat(is-istatistik): Üye Trendi kartından giriş, çeviriler`.
