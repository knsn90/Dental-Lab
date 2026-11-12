# Klinik Müşteri Kartı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab tarafında her klinik için üye/ciro/borç/son sipariş özetini liste kartlarında, sipariş içi popup'ta ve Özet sayfasındaki "En çok iş gönderenler" widget'ında göstermek.

**Architecture:** Yeni modül `modules/clinicSummary/`. Veri istemcide toplanır (İş İstatistikleri gibi), DB değişikliği YOK: siparişler + referanslar `modules/admin/workStats/api.ts`'den, ciro `profitability_by_clinic` RPC'sinden, borç `v_clinic_balance_ccy`'den, puan `order_reviews`'tan. Saf toplama `summary.ts`'te (node testleri), tek bir oturum-önbellekli hook tüm ekranlara servis eder; UI parçaları (şerit, popup, widget) bu hook'u okur.

**Tech Stack:** Expo + React Native Web, TypeScript, Supabase JS, zustand, node:test (`.test.mts`).

**Spec:** `docs/superpowers/specs/2026-11-12-klinik-musteri-karti-design.md`

## Global Constraints

- Üye/çene/adet sayımı = `countOrders` (modules/admin/workStats/aggregate.ts) — iptal + dişsiz hariç, yerel ay, `created_at`. Kendi sayacını YAZMA, onu çağır.
- Ciro = `profitability_by_clinic(p_lab_id, p_from, p_to)` satırları, `row_kind` dahil hepsi (ekstre indirimleri negatif → NET). Döviz başına `revenue`; sıralama puanı için `revenue_base`. Dövizler EKRANDA toplanmaz.
- Borç = `fetchClinicBalancesByCurrency()` (modules/invoices/api.ts) → `balance`, `overdue_net`, `aging_*`, `oldest_overdue_date`, döviz başına.
- Birleşik puan = `round(100 × (0.5 × uye/maxUye + 0.5 × revBase/maxRevBase))`; max 0 ise o terim 0.
- Ödeme durumu sıralamayı etkilemez; `overdue_net > 0` ise yalnız uyarı işareti.
- Görünürlük: yalnız `(lab)` ve `(admin)` panelleri. Ciro yalnız `can('view_profit')`, borç yalnız `can('view_clinic_balance')` (usePermissionStore) — yetki yoksa alan HİÇ çizilmez.
- Liste şeridi = TÜM ZAMANLAR; popup ve widget = Bu ay / Tüm zamanlar geçişi. Ay miladi (`monthLabel`/`gregorianLocale`).
- Çok döviz: şeritte en büyük tutarlı döviz + "+N" rozeti (GlassTooltip tüm dövizler); popup'ta her döviz ayrı satır.
- Popup: `useInkUI().modalOverlay` + `modalCard`, mobilde de ortada; ikon yalnız `core/ui/icons`; tooltip `GlassTooltip`; beyaz buton `U.plainBtn`; renkli sol kenarlı kart YOK; `PAGE_PADDING`.
- Her yeni metin 4 dilde: düz Türkçe JSX + `core/i18n/locales/auto.{en,de,fa}.json` (üç dosya aynı anahtarlar). Diş "üye" = en unit / de Einheit / fa واحد. `${n} X` kalıbında `autoT()`.
- Koyu tema aynı anda (`useInkUI`/`useMobileTokens`, `isDark` dalı).
- KVKK: yeni hasta alanı gösterme.
- Dokunma: `modules/ar-scanner/**`, `modules/viewer-3d/**`, `FaceScanQuickAction.tsx`.
- Test komutu (tümü): `node --test $(find modules core -name '*.test.mts')`; tip: `npx tsc --noEmit -p .` → 0 hata.
- Commit main'e, açık yol ile `git add`, mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Hiç siparişi olmayan klinik (yeni eklenmiş) → şerit "0 üye · — · son sipariş yok", çökme yok. → Task 1 testi `summaries: siparişsiz klinik sıfır özet`.
2. Yalnız EUR faturalı ama TRY borcu olan klinik (karışık döviz) → şeritte en büyük + "+1", popup'ta iki satır, toplam yok. → Task 1 testi `pickMain: en büyük döviz + kalan sayısı`.
3. Bu ay hiç işi olmayan lab (ayın 1'i) → widget "Bu ay" sekmesinde boş durum, "Tüm zamanlar" dolu. → Task 1 testi `rankTop: boş dönem boş liste`.
4. Hekim/klinik panelinde aynı sipariş detayı → klinik adı tıklanamaz düz metin. → Task 5 adımı (panel koşulu) + elle doğrulama.
5. Veri yüklenirken liste sayfası → şerit iskelet/"…" gösterir, liste beklemez; RPC hatasında şerit gizlenir, sayfa çalışır. → Task 3 adımı.

---

### Task 1: Saf toplama — `summary.ts`

**Files:**
- Create: `modules/clinicSummary/summary.ts`
- Test: `modules/clinicSummary/summary.test.mts`

**Interfaces:**
- Consumes: `countOrders`, `RawOrder`, `Qty`, `UNKNOWN_CLINIC_ID` (aggregate.ts); `monthKeyOfIso`, `MonthKey` (months.ts).
- Produces:
  ```ts
  export type Money = { currency: string; amount: number };
  export interface RevenueRow { clinic_id: string | null; currency: string; revenue: number; revenue_base: number; row_kind?: string | null }
  export interface BalanceRow { clinic_id: string; currency: string; balance: number; overdue_net: number; aging_current: number; aging_30: number; aging_60: number; aging_90: number; oldest_overdue_date: string | null }
  export interface ReviewRow { clinic_id: string; overall: number | null }
  export interface PeriodFigures { orders: number; qty: Qty; revenue: Money[]; revenueBase: number }
  export interface ClinicSummary {
    clinicId: string; name: string;
    all: PeriodFigures; month: PeriodFigures;
    lastOrderAt: string | null;           // ISO, iptal+dişsiz hariç sayılan en son sipariş
    balance: Money[]; overdue: Money[];   // overdue = overdue_net > 0 olanlar
    aging: { current: number; d30: number; d60: number; d90: number } | null; // yalnız TEK döviz varsa, yoksa null
    oldestOverdueDays: number | null;     // today - oldest_overdue_date (gün)
    rating: { avg: number; count: number } | null;
  }
  export function buildClinicSummaries(input: {
    orders: RawOrder[]; clinicByDoctor: Map<string,string>; clinicName: Map<string,string>;
    unitByServiceName: Map<string,string|null>;
    revenueAll: RevenueRow[]; revenueMonth: RevenueRow[];
    balances: BalanceRow[]; reviews: ReviewRow[];
    currentMonth: MonthKey; today: string /* YYYY-MM-DD lab-yerel */;
  }): Map<string, ClinicSummary>;
  export function pickMain(list: Money[]): { main: Money | null; rest: number };
  export type RankMode = 'uye' | 'score';
  export interface RankedClinic { clinicId: string; name: string; uye: number; revenueBase: number; score: number; overdue: boolean }
  export function rankTop(s: Map<string, ClinicSummary>, period: 'month' | 'all', mode: RankMode, n?: number /* 5 */): RankedClinic[];
  ```

- [ ] **Step 1: Write the failing tests** (`summary.test.mts`, `import … from './summary.ts'`)
  - `summaries: üye countOrders ile birebir` — 3 sipariş (biri `iptal`, biri `tooth_numbers: []`) → `all.qty.uye` = yalnız geçerli siparişin diş sayısı; `all.orders` = 1. Ayrıca aynı girdiyle `countOrders(...)` toplamına eşit (parite).
  - `summaries: bu ay yalnız currentMonth` — biri bu ay biri geçen ay → `month.orders 1`, `all.orders 2`.
  - `summaries: ciro net, döviz başına` — EUR 100 + EUR −20 (`row_kind:'statement_discount'`) + TRY 500 → `all.revenue` = `[{EUR,80},{TRY,500}]` (tutara göre azalan), `revenueBase` = üç satırın `revenue_base` toplamı.
  - `summaries: siparişsiz klinik sıfır özet` — clinicName'de olup siparişi olmayan klinik → `all.orders 0`, `lastOrderAt null`, `rating null`.
  - `summaries: borç ve gecikme` — BalanceRow `overdue_net 30`, `oldest_overdue_date` today−12 → `overdue [{..,30}]`, `oldestOverdueDays 12`; `overdue_net 0` → `overdue []`.
  - `summaries: puan ortalaması` — overall 5,4,null → `{avg:4.5,count:2}`.
  - `summaries: UNKNOWN_CLINIC_ID haritada yok` — eşleşmeyen hekimin siparişi hiçbir özete girmez.
  - `pickMain: en büyük döviz + kalan sayısı` — `[{TRY,500},{EUR,80}]` → `{main:{TRY,500}, rest:1}`; `[]` → `{main:null, rest:0}`.
  - `rankTop: üye sırası, eşitlikte ad` ve `rankTop: puan formülü` — A(uye 10, base 0), B(uye 5, base 100) → score A 50, B 75; mode 'score' sırası B,A.
  - `rankTop: boş dönem boş liste` — bu ay siparişi olmayan klinikler `month` modunda listelenmez (`uye 0` ve `revenueBase 0` olanlar atlanır).
  - `rankTop: overdue işareti sırayı değiştirmez` — overdue olan klinik aynı sırada kalır, `overdue:true`.
- [ ] **Step 2:** Run `node --test modules/clinicSummary/summary.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** Implement `summary.ts`. Üye için `countOrders({orders, clinicByDoctor, unitByServiceName, clinicName})` çıktısını klinik+ay'a göre topla; `lastOrderAt` için sayılan siparişlerin `created_at` en büyüğü (CountedOrder'da yoksa `orders`tan id ile bul). Özet haritası `clinicName`'deki HER klinik için girdi üretir. Gün farkı UTC gece yarısı tarihleriyle (`Date.UTC`) hesaplanır.
- [ ] **Step 4:** Run aynı komut → PASS.
- [ ] **Step 5:** Commit `feat(klinik-ozet): saf toplama + sıralama`.

### Task 2: Veri katmanı — `api.ts` + `useClinicSummaries`

**Files:**
- Create: `modules/clinicSummary/api.ts`, `modules/clinicSummary/useClinicSummaries.ts`
- Test: `modules/clinicSummary/api.test.mts` (yalnız saf eşleyiciler)

**Interfaces:**
- Consumes: Task 1 tipleri ve `buildClinicSummaries`; `fetchWorkStatsRefs(labId)` (workStats/api.ts → `clinicByDoctor, clinicName, unitByServiceName`); `fetchAllPages`; `fetchClinicBalancesByCurrency`; `labTodayOf(cachedLabTz())` (core/metrics).
- Produces:
  ```ts
  export function mapReviewRows(rows: { overall: number|null; work_order_id: string }[], orderDoctor: Map<string,string>, clinicByDoctor: Map<string,string>): ReviewRow[];
  export function mapRevenueRows(rows: any[]): RevenueRow[];          // sayıları Number()'a çevirir, null clinic_id'yi atar
  export async function fetchClinicSummaryData(labId: string): Promise<Map<string, ClinicSummary>>; // hata fırlatır
  export function useClinicSummaries(): { status: 'loading'|'ready'|'error'; map: Map<string, ClinicSummary>; reload(): void };
  export function useClinicSummary(clinicId: string | null | undefined): { status: 'loading'|'ready'|'error'; summary: ClinicSummary | null };
  export async function fetchClinicRecentMessages(clinicId: string, labId: string, limit?: number /* 3 */): Promise<{ id: string; workOrderId: string; orderNumber: string; content: string; createdAt: string }[]>;
  ```
- [ ] **Step 1: Failing tests** — `mapRevenueRows: string sayılar Number, clinic_id null atılır`; `mapReviewRows: sipariş→hekim→klinik zinciri, eşleşmeyen atlanır`.
- [ ] **Step 2:** `node --test modules/clinicSummary/api.test.mts` → FAIL.
- [ ] **Step 3:** Implement.
  - `fetchClinicSummaryData`: `Promise.all` → tüm siparişler (`work_orders` `id, order_number, work_type, status, created_at, tooth_numbers, doctor_id`, `.eq('lab_id')`, `fetchAllPages`, `order('created_at').order('id')`), `fetchWorkStatsRefs`, `profitability_by_clinic` iki kez (`p_from:'2000-01-01'`, `p_to: today` ve bu ayın 1'i → today), `fetchClinicBalancesByCurrency()` (`lab_id` ile süz), `order_reviews` (`overall, work_order_id`, `.eq('lab_id')`). Herhangi biri `error` dönerse fırlat; profitability/bakiye yetkisizlikten hata verirse (RLS) o kaynağı BOŞ say ve devam et (şerit yetkiye göre zaten gizler).
  - Hook: modül düzeyinde tek önbellek `{ labId, at, promise, map }`; 5 dk taze sayılır; aynı anda çağıranlar tek promise'i paylaşır. `labId` = `useAuthStore` profilinin `lab_id`'si. `reload()` önbelleği düşürür.
  - `fetchClinicRecentMessages`: o kliniğin hekimlerinin siparişlerinden (`work_orders` id'leri, `clinicByDoctor` ters eşleme) `order_messages` `id, work_order_id, content, created_at, approval_status, message_type`, `in('work_order_id', ids)`, `approval_status` null veya `'approved'`, `content` boş olmayan, `created_at desc`, `limit`. (Sohbet kutusunun `approval_status` kuralıyla aynı — chatApi.ts:524.)
- [ ] **Step 4:** testler PASS + `npx tsc --noEmit -p .` 0 hata.
- [ ] **Step 5:** Commit `feat(klinik-ozet): veri katmanı ve oturum önbelleği`.

### Task 3: UI — şerit + popup

**Files:**
- Create: `modules/clinicSummary/components/ClinicSummaryStrip.tsx`, `modules/clinicSummary/components/ClinicSummaryModal.tsx`, `modules/clinicSummary/components/MoneyText.tsx`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`
- Create (geçici değil, kalıcı dev demo): `app/dev/clinic-summary.tsx` — sahte `ClinicSummary` ile şerit + popup (açık/koyu, `?lang=fa`).

**Interfaces:**
- Consumes: Task 2 `useClinicSummary`, `fetchClinicRecentMessages`; Task 1 `pickMain`, `ClinicSummary`.
- Produces:
  ```tsx
  export function ClinicSummaryStrip(props: { clinicId: string; onOpen?: () => void; summary?: ClinicSummary | null /* dev demo için */ }): JSX.Element | null;
  export function ClinicSummaryModal(props: { clinicId: string | null; onClose: () => void; summary?: ClinicSummary | null }): JSX.Element | null;
  export function useClinicSummaryModal(): { open(clinicId: string): void; element: JSX.Element | null };
  ```
- [ ] **Step 1:** `ClinicSummaryStrip` — tek satır, sarılabilir (`flexWrap`), 4 öğe: "{n} üye" (+ çene/adet varsa "· 4 çene"), ciro `pickMain(all.revenue)` + "+N" rozeti, borç `pickMain(balance)` (overdue varsa `U.chipTones.danger` tonunda + "Vadesi geçmiş · N gün" GlassTooltip), "Son sipariş: 12 Kas" (yoksa "Son sipariş yok"). Yüklenirken "…", hata/`null` → `null` döner. Yetki: ciro `view_profit`, borç `view_clinic_balance`. Tıklanınca `onOpen`.
- [ ] **Step 2:** `ClinicSummaryModal` — `Modal transparent` + `U.modalOverlay`/`U.modalCard` (maxWidth 520), başlık + `U.modalCloseBtn`; "Bu ay / Tüm zamanlar" segmenti (aktif pill geniş kuralı: pasif `paddingHorizontal 12`, aktif 18); bölümler: İş (sipariş, üye/çene/adet), Ciro (döviz satırları + "Ciro fatura tarihine göre" notu), Borç (bakiye, vadesi geçen, en eski gecikme günü, 30/60/90 yalnız `aging` varsa), Son sipariş, Puan (`avg.toFixed(1)` + "(n değerlendirme)" / "—"), Son yazışmalar (açılışta `fetchClinicRecentMessages`, sipariş no + 80 karakter önizleme + tarih; hata metni kendi bölümünde), alt bağlantılar: "Ekstre" → `/${panel}/statement/${clinicId}`, "İş İstatistikleri" → `/(admin)/work-stats?clinic=${clinicId}` (yalnız admin panelinde). `panel` = `useSegments()[0]` (`(lab)`/`(admin)`). Koyu tema.
- [ ] **Step 3:** `useClinicSummaryModal()` — state + `element` (çağıran ekran `element`'i render eder).
- [ ] **Step 4:** Tüm yeni Türkçe dizeleri `auto.{en,de,fa}.json`'a ekle (üye→unit/Einheit/واحد); `node -e` ile üç dosyanın anahtar kümesi eşit mi kontrol et → eşit.
- [ ] **Step 5:** `app/dev/clinic-summary.tsx` demo (sahte özet: TRY+EUR ciro, overdue 12 gün, puan 4.5; ikinci kart: siparişsiz klinik). Tarayıcıda `/dev/clinic-summary` açık + koyu + `?lang=fa` ekran görüntüsü; beyaz patlama/görünmez metin yok.
- [ ] **Step 6:** `npx tsc --noEmit -p .` 0 hata; commit `feat(klinik-ozet): şerit ve popup`.

### Task 4: Sağlık Kurumları + Kullanıcılar entegrasyonu

**Files:**
- Modify: `modules/clinics/screens/ClinicsScreen.tsx` (`ClinicRow` ~:1136, hekim satırından sonra ~:1190)
- Modify: `modules/admin/users/LabUsersManagement.tsx` (klinik grup başlığı ~:952-985)
- Modify: `app/(admin)/users.tsx` (`AdminUsersScreen` kart ~:368-420)

**Interfaces:** Consumes Task 3 `ClinicSummaryStrip`, `useClinicSummaryModal`.

- [ ] **Step 1:** `ClinicRow`: hekim satırının altına `<ClinicSummaryStrip clinicId={clinic.id} onOpen={() => open(clinic.id)} />`; ekran düzeyinde bir `useClinicSummaryModal()` ve `element` render. Satırın mevcut aç/kapa davranışı değişmez (şerit kendi Pressable'ı, tıklama satıra yayılmaz).
- [ ] **Step 2:** `LabUsersManagement`: Klinik sekmesindeki klinik grup başlığının altına şerit (her kullanıcı kartında TEKRARLAMA); `clinic_id`'si olan kullanıcı kartındaki klinik adı (:625-637) tıklanınca popup.
- [ ] **Step 3:** `AdminUsersScreen`: klinik adı gösterilen kartlarda (`clinic_id` var) aynı: klinik adı tıklanınca popup; kartta klinik başına gruplama yoksa şerit kart içinde klinik adının altında.
- [ ] **Step 4:** `npx tsc --noEmit -p .` 0 hata; dev sunucuda lab/admin klinikler sayfası giriş gerektirdiği için `/dev/clinic-summary` + kod okuması ile doğrula; commit `feat(klinik-ozet): klinikler ve kullanıcılar sayfası`.

### Task 5: Sipariş içi popup

**Files:**
- Modify: `modules/orders/screens/OrderDetailScreenV2.tsx` (hero :2147, kart :3715/:3748, handoff prop :1538)
- Modify: `modules/orders/components/OrderDetailMobileHandoff.tsx` (:356) — yolu `grep -rn "function OrderDetailMobileHandoff\|OrderDetailMobileHandoff =" modules` ile doğrula

**Interfaces:** Consumes Task 3 `useClinicSummaryModal`. Produces: handoff prop'u `onClinicPress?: () => void`.

- [ ] **Step 1:** V2'de `const canClinicSummary = panelGroup === '(lab)' || panelGroup === '(admin)'` (mevcut `useSegments()[0]`), `clinicId = (order as any)?.doctor?.clinic?.id`. Yalnız ikisi doluysa klinik adı Pressable (altı çizgi yok, hover'da `U.rowHover`, `accessibilityRole="button"`), aksi halde bugünkü düz metin AYNEN.
- [ ] **Step 2:** Handoff'a `onClinicPress` geçir; :356'daki ad, prop varsa Pressable.
- [ ] **Step 3:** tsc 0 hata; kod okumasıyla `(doctor)`/`(clinic)`/`(station)`/`(courier)` yollarında Pressable olmadığını doğrula (Review Focus 4); commit `feat(klinik-ozet): sipariş içi klinik popup'ı`.

### Task 6: "En çok iş gönderenler" widget'ı

**Files:**
- Create: `modules/clinicSummary/components/TopClinicsCard.tsx`
- Modify: `app/(admin)/index.tsx` (Finans/Statü ızgarasının altına yeni `DashRow`, ~:2500-2515)
- Modify: `modules/admin/components/AdminMobileDashboard.tsx` (Üye Trendi kartının altına kompakt hali)
- Modify: `auto.{en,de,fa}.json`

**Interfaces:** Consumes Task 1 `rankTop`, Task 2 `useClinicSummaries`, Task 3 `useClinicSummaryModal`. Produces `export function TopClinicsCard(props: { compact?: boolean }): JSX.Element`.

- [ ] **Step 1:** Kart: başlık "En çok iş gönderenler"; iki segment — dönem (Bu ay / Tüm zamanlar), sıralama (Üye / Puan); 5 satır: sıra no, klinik adı (+ overdue ise küçük uyarı ikonu + GlassTooltip "Vadesi geçmiş borç"), değer (Üye modunda "{n} üye", Puan modunda "{score}" + altında "{n} üye · ciro" — ciro `view_profit` yoksa Puan segmenti gizlenir), oransal ince çubuk (`value/max`, `WORKTYPE_RAMP[0]` lacivert / koyuda `#7FA8D9`). Satıra tıklama → popup. Boş dönem → "Bu ay henüz iş yok". `compact` → segmentler tek satır, çubuk yok.
- [ ] **Step 2:** Masaüstü özette ve mobil özette yerleştir; mevcut kartların sırası/boyu değişmez.
- [ ] **Step 3:** dev demo'ya (`/dev/clinic-summary`) `TopClinicsCard` sahte haritayla ekle; açık/koyu/fa ekran görüntüsü.
- [ ] **Step 4:** tsc 0 hata + tüm testler (`node --test $(find modules core -name '*.test.mts')`) PASS; commit `feat(klinik-ozet): en çok iş gönderenler widget'ı`.
