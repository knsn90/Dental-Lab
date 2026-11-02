# Bekleme: geriye dönük başlangıç/bitiş + pano hatırlatması — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unutulan bekleme başlangıcı ve bitişi sonradan, gününe göre girilebilsin; teslim tarihi gerçek bekleme kadar kaysın; "Geciken"deki işe tek dokunuşla "Hekimi bekliyor" denebilsin; lab ve yönetici panoları bekleyen işleri göstersin ve hatırlatsın.

**Architecture:** Gün hesabı saf bir modelde (`holdDates.ts`, test edilir). Kural ve sınırlar sunucuda: `hold_order` / `resume_order` tek imzayla tarih parametresi alır, teslimde açık bekleme kaydını bir tetikleyici kapatır, `order_metrics` "beklemede" sayısını, `order_history` "sonradan girildi" bilgisini verir. İstemcide iki ortak pencere (`HoldOrderModal`, `ResumeOrderModal`) sipariş detayı (masaüstü + mobil), sipariş listesi ve iki pano tarafından kullanılır.

**Tech Stack:** Expo + React Native + react-native-web, Supabase (Postgres RPC, SECURITY DEFINER), `node --test` (.test.mts), i18n (tr/en/de/fa).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-01-bekleme-geriye-donuk-design.md` (kullanıcı onayı: "onaylıyorum, planı yaz").

Tüm yollar `my-expo-app/` köküne görelidir.

## Global Constraints

- "En erken 5 iş günü" kuralına DOKUNULMAZ (spec §3 Hedef dışı).
- Prova akışı (`_prova_hold_sync`, `prova_undo`, `client_prova` kategorisi) değişmez; prova beklemesinde devam ettirme reddedilmeye devam eder.
- Lab kaynaklı (`responsible='lab'`) bekleme teslim tarihini kaydırmaz.
- Uzatma = bitiş günü − başlangıç günü, **lab saat diliminde takvim günü** (iş günü yok).
- Uzun bekleme eşiği: `LONG_HOLD_DAYS = 3`; "3 günü aşan" = `yaşGün > 3`.
- Tarih verilmeden çağrılan `hold_order` / `resume_order` "bugün" varsayar (geriye uyum).
- **Veritabanı beş adım (her DB görevi):** (1) canlı tanım + yetkiler `supabase/rollbacks/<ad>.before.txt` (2) `supabase/rollbacks/<ad>.down.sql` (3) rol rol, `ROLLBACK` ile biten deneme (ÖNCE / SONRA / GERİ ALMA ölçümü) (4) kullanıcıdan AskUserQuestion ile açık "Onaylıyorum, uygula" (5) `cd my-expo-app && supabase db query --linked -f <mutlak yol>` ile uygula, hemen canlıda ölç.
- Denemelerde gönderici fonksiyon ÇAĞRILMAZ: `_notify_channels`, `fn_daily_order_watch`, `fn_prova_watch`, `fn_scan_schedule_digest`, e-posta göndericiler. Canlı hesapta kayıt/gönder/onayla düğmesine basılmaz (önizleme yalnız okur).
- Fonksiyon imzası değişince eski imza `DROP FUNCTION` ile kaldırılır (aşırı yükleme yok); `GRANT EXECUTE` yetkileri `.before.txt`'deki gibi yeniden verilir.
- Yetki: `get_my_lab_id()` (bugünkü gibi). Yeni tablo yok; yeni sütunlar mevcut RLS'e girer.
- Dört dil AYNI ANDA: düz Türkçe `<Text>` → `core/i18n/locales/auto.{en,de,fa}.json` (birebir `trim()` anahtar); şablon dizeler `autoT()`; anahtarlı metin → `core/i18n/locales/{tr,en,de,fa}.json`. Farsça için `persian-writing` skill'i. Üç auto sözlüğün anahtar kümesi eşit kalır.
- Sunucu hata metinleri `"<sabit Türkçe>: <GG.AA.YYYY>"` biçimindedir (autoT önek eşleşmesi çevirebilsin).
- Arayüz: popup ortada + `U.modalOverlay`/`U.modalCard` (blur); her düğmede `GlassTooltip`; hata düğmenin yanında (footer'da); koyu tema token'la (`useInkUI`/`useMobileTokens`), açık tema bit-bit aynı; beyaz düğme koyu temada `U.plainBtn`; mobilde eylemler tek satır, taşan "•••"; ikonlar yalnız `core/ui/icons`; kenar `PAGE_PADDING`.
- Paylaşılan ekran (sipariş listesi) hekim/klinik/istasyon panelinde DEĞİŞMEZ; "Hekimi bekliyor" yalnız `(lab)` ve `(admin)` panelinde.
- Kontroller (her görev sonu): test takımı `cd my-expo-app && find modules core app -name "*.test.mts" -not -path "*/node_modules/*" -print0 | xargs -0 node --test` → `fail 0`; `npx tsc --noEmit --incremental false` → 0 hata.
- Commit main'de (kullanıcı pratiği), mesaj sonunda `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push ve deploy YALNIZ kullanıcı isteyince.

## Review Focus

1. **Gece yarısı / saat dilimi:** TR 00:30'da (UTC dünü) açılmış sipariş veya başlatılmış bekleme — "siparişin açıldığı gün", "bugün" ve uzatma lab günüyle hesaplanmalı, cihaz saat dilimiyle değil. → T2 denemesine `created_at = '…T21:30:00Z'` vakası; T4 pencerelerinde gün dönüşümü `labTodayOf(cachedLabTz(), …)`.
2. **Zaten beklemede / teslim edilmiş işe bekletme:** pencere açıkken iş teslim edilir ya da prova beklemesine girer; `hold_order` bunu sessizce ezmemeli. → T2 denemesi: teslim edilmiş ve zaten beklemede siparişte `hold_order` hata verir.
3. **Çift dokunuş / tekrar devam ettirme:** `resume_order` beklemede olmayan işte hata verir; pencere düğmesi meşgulken kapalı. → T2 denemesi + T4 `busy` kilidi.
4. **Başlangıcı devam ettirirken ileri çekme veya önceki beklemenin içine çekme:** reddedilmeli, sınır günü söylenmeli. → T1 `validateResumeStart` testleri + T2 denemesi.
5. **Paylaşılan liste başka panelde:** `(clinic)`, `(doctor)`, `(station)` listesinde "Hekimi bekliyor" ve "Beklemede" çipi görünmemeli. → T6 `holdActionsAllowed(panelGroup)` testi.

---

### Task 1: Saf gün modeli + "beklemede" tanımı

**Files:**
- Create: `modules/orders/holdDates.ts`
- Create: `modules/orders/holdDates.test.mts`
- Modify: `core/metrics/orderDefs.ts` (OrderLike'a `hold_category?`, yeni `isHeldOrder`)
- Modify: `core/metrics/orderDefs.test.mts`
- Modify: `core/metrics/metricHints.ts` (`onHold` ipucu)

**Interfaces:**
- Produces (holdDates.ts — import YOK, yalnız `YYYY-MM-DD` günleri):
  - `export const LONG_HOLD_DAYS = 3`
  - `daysBetween(a: string, b: string): number` — b − a takvim günü (negatif olabilir)
  - `holdExtensionDays(startDay: string, endDay: string): number` — `max(0, daysBetween)`
  - `shiftedDelivery(deliveryDay: string, ext: number, responsible: 'client' | 'lab'): string`
  - `holdStartFloor(o: { createdDay: string; prevEndDay?: string | null }): string` — ikisinin büyüğü
  - `type DayErr = { code: 'future' | 'before_floor' | 'before_start' | 'later_than_current'; boundary?: string }`
  - `validateHoldStart(day: string, o: { floor: string; today: string }): DayErr | null`
  - `validateResumeStart(day: string, o: { currentStart: string; floor: string; today: string }): DayErr | null`
  - `validateHoldEnd(day: string, o: { startDay: string; today: string }): DayErr | null`
  - `isLongHold(ageDays: number): boolean` — `ageDays > LONG_HOLD_DAYS`
- Produces (orderDefs.ts): `isHeldOrder(o: OrderLike): boolean` — açık iş + `hold_status==='on_hold'` + `hold_category !== 'client_prova'`.
- Produces (metricHints.ts): `METRIC_HINTS.onHold = 'Beklemeye alınmış, teslim edilmemiş işler. Prova beklemesi sayılmaz; gecikme sayacı beklerken durur.'`

- [ ] **Step 1: Testleri yaz** — `holdDates.test.mts` (`import … from './holdDates.ts'`):
  - `daysBetween('2026-10-18','2026-10-25') === 7`; ay geçişi `daysBetween('2026-10-30','2026-11-02') === 3`
  - `holdExtensionDays('2026-10-18','2026-10-25') === 7`; aynı gün `0`; ters sıra `0`
  - `shiftedDelivery('2026-10-20', 7, 'client') === '2026-10-27'`; `'lab'` → `'2026-10-20'` (spec §4.2 örneği)
  - `holdStartFloor({ createdDay:'2026-10-10', prevEndDay:'2026-10-15' }) === '2026-10-15'`; `prevEndDay:null` → `'2026-10-10'`
  - `validateHoldStart('2026-11-03', { floor:'2026-10-10', today:'2026-11-02' })` → `{ code:'future' }`; `'2026-10-09'` → `{ code:'before_floor', boundary:'2026-10-10' }`; `'2026-10-10'` ve `'2026-11-02'` → `null`
  - `validateResumeStart('2026-10-20', { currentStart:'2026-10-18', floor:'2026-10-01', today:'2026-11-02' })` → `{ code:'later_than_current', boundary:'2026-10-18' }`; `'2026-09-30'` → `{ code:'before_floor', boundary:'2026-10-01' }`; `'2026-10-18'` ve `'2026-10-05'` → `null`
  - `validateHoldEnd('2026-10-17', { startDay:'2026-10-18', today:'2026-11-02' })` → `{ code:'before_start', boundary:'2026-10-18' }`; `'2026-11-03'` → `{ code:'future' }`; `'2026-10-18'` → `null`
  - `isLongHold(3) === false`, `isLongHold(4) === true`, `LONG_HOLD_DAYS === 3`
  - `orderDefs.test.mts`: `isHeldOrder({status:'uretimde', hold_status:'on_hold', hold_category:'material'}) === true`; `hold_category:'client_prova'` → false; `status:'teslim_edildi'` → false; `is_archived:true` → false; `hold_status:null` → false
- [ ] **Step 2: Çalıştır, düştüğünü gör** — `cd my-expo-app && node --test modules/orders/holdDates.test.mts core/metrics/orderDefs.test.mts` → FAIL (modül/fonksiyon yok).
- [ ] **Step 3: Uygula** — gün aritmetiği `Date.UTC(y, m-1, d)` farkı / 86 400 000 (orderDefs `addDays` ile aynı yaklaşım; saat dilimi yok). `METRIC_HINTS.onHold` ekle ve metnin en/de/fa karşılığını auto sözlüklerine yaz.
- [ ] **Step 4: Çalıştır, geçtiğini gör** — aynı komut → PASS; ardından tam takım + tsc (Global Constraints).
- [ ] **Step 5: Commit** — `feat(bekleme): gün modeli ve beklemede tanımı`

### Task 2: DB yazma yolu — `hold_order`, `resume_order`, teslimde kapanış

**Files:**
- Create: `supabase/migrations/20261102100000_bekleme_geriye_donuk.sql`
- Create: `supabase/rollbacks/20261102100000_bekleme_geriye_donuk.before.txt`
- Create: `supabase/rollbacks/20261102100000_bekleme_geriye_donuk.down.sql`

**Interfaces:**
- Produces (SQL):
  - `work_order_holds.end_recorded_at timestamptz NULL` — bitişin GİRİLDİĞİ an
  - `work_order_holds.end_source text NULL` — `'delivered'` = teslimde otomatik kapandı; yoksa NULL
  - `hold_order(p_order uuid, p_reason text, p_category text DEFAULT 'client_other', p_responsible text DEFAULT 'client', p_started_on date DEFAULT NULL)` — dönüş tipi canlıdakiyle aynı
  - `resume_order(p_order uuid, p_started_on date DEFAULT NULL, p_ended_on date DEFAULT NULL) RETURNS integer` — uzatılan gün
  - Tetikleyici `trg_wo_close_hold_on_delivery` (AFTER UPDATE OF status, hold_status ON work_orders, `WHEN (NEW.status = 'teslim_edildi' AND NEW.hold_status IS NULL)`), fonksiyonu `_close_open_holds_on_delivery()` SECURITY DEFINER, `search_path` sabit, `REVOKE ALL … FROM PUBLIC, anon, authenticated`.
- Sabit hata metinleri (birebir; `%` = `to_char(gün,'DD.MM.YYYY')`):
  - `Bekleme başlangıcı gelecekte olamaz`
  - `Bekleme başlangıcı siparişin açıldığı günden önce olamaz: %`
  - `Bekleme başlangıcı önceki beklemenin bittiği günden önce olamaz: %`
  - `Başlangıç yalnız daha erken bir güne çekilebilir: %`
  - `Bitiş günü başlangıçtan önce olamaz: %`
  - `Bitiş günü gelecekte olamaz`

- [ ] **Step 1: Canlı tanımı kaydet** — `pg_get_functiondef` (`hold_order`, `resume_order`, `update_delivery_status`, `trg_bbk_sync_order_status`, `_prova_hold_sync`), `proacl` / `has_function_privilege` (anon, authenticated, service_role), `work_order_holds` sütunları ve politikaları → `.before.txt`. Hold alanlarını temizleyen fonksiyonların status'u AYNI `UPDATE`'te mi sonra mı yazdığını not et (tetikleyici koşulu buna göre doğrulanır).
- [ ] **Step 2: Göç dosyasını yaz** — kurallar:
  - Lab günü: `lab_today(lab, ts)`; günün başı `(gün::timestamp AT TIME ZONE lab_tz(lab))`.
  - `hold_order`: `p_started_on` NULL veya bugün → `started_at = now()` (bugünkü davranış). Geçmiş gün → sınırlar (gelecek / siparişin `created_at` lab günü / aynı siparişin önceki kayıtlarının en büyük `ended_at` lab günü, prova dahil) → `started_at` = o günün başı; `work_orders.hold_started_at` ve `work_order_holds.started_at` aynı değer. Canlı tanım zaten beklemede veya kapanmış (teslim/iptal) işi reddetmiyorsa ret ekle: `İş zaten beklemede` / `Teslim edilmiş veya iptal edilmiş iş bekletilemez`.
  - `resume_order`: prova reddi aynen. Başlangıç: `p_started_on` NULL → mevcut başlangıç günü; mevcut günden ilerisi → ret; geriye çekilirse `hold_order` sınırları + yeni `started_at` iki tabloya yazılır. Bitiş: NULL veya bugün → `now()`; geçmiş gün → sınırlar, `ended_at = greatest(started_at, ertesi günün başı − 1 saniye)`. Uzatma = `bitiş günü − başlangıç günü`; `delivery_date` yalnız `responsible='client'` ise kayar. Açık kayıt: `ended_at`, `extended_days`, `resumed_by = auth.uid()`, `end_recorded_at = now()`.
  - Teslim tetikleyicisi: o siparişin `ended_at IS NULL` kayıtlarını `ended_at = now(), extended_days = 0, end_recorded_at = now(), end_source = 'delivered'` ile kapatır; `delivery_date`'e dokunmaz.
  - `DROP FUNCTION public.hold_order(uuid,text,text,text); DROP FUNCTION public.resume_order(uuid);` sonra `CREATE`, sonra `.before.txt`'deki `GRANT`'ler.
- [ ] **Step 3: `.down.sql`** — tetikleyici + fonksiyonu düşür, yeni imzaları düşür, `.before.txt`'deki tanımları ve yetkileri geri kur, iki sütunu düşür.
- [ ] **Step 4: Rol rol deneme (tek işlem, sonda `ROLLBACK`)** — lab personeli rolüyle (`set local role authenticated` + `request.jwt.claims`), canlı Nexadent'te açık bir siparişin kopyası yerine mevcut kayıt üzerinde, ölçümler `probe.out`'a:
  - a) tarih yok → `started_at ≈ now()`, eski çağrı biçimi çalışır
  - b) 7 gün önce başlat, bugün bitir, `client` → dönüş 7, `delivery_date` +7; `lab` kategorisi → dönüş 7, tarih aynı
  - c) gelecek gün, sipariş öncesi gün, önceki beklemenin bitişinden önceki gün → üç ayrı hata (metinler yukarıdaki gibi)
  - d) devam ettirirken başlangıcı ileri çekme → hata; geri çekme → `started_at` iki tabloda güncel
  - e) bitiş başlangıçtan önce / gelecekte → hata
  - f) `created_at` TR gece yarısı sonrası (`…T21:30:00Z`) siparişte "açıldığı gün" ertesi lab günü sayılır
  - g) zaten beklemede ve teslim edilmiş işe `hold_order` → hata; beklemede olmayan işe `resume_order` → hata; `client_prova` beklemesinde `resume_order` → hata
  - h) teslim kapanışı: zaten `teslim_edildi` bir siparişe sahte açık kayıt ekle, `UPDATE work_orders SET hold_status = NULL` (yalnız bu alan; status/bildirim tetikleyicileri çalışmasın) → kayıt `end_source='delivered'`, `extended_days=0`, `delivery_date` değişmedi
  - i) başka lab'ın siparişinde `hold_order` → yetki hatası
  - ÖNCE / SONRA / GERİ ALMA'da imza listesi ve `has_function_privilege` aynı rollerde.
- [ ] **Step 5: Kullanıcı onayı** — ne değişir / nereyi etkiler / risk / geri alma, madde madde; AskUserQuestion "Onaylıyorum, uygula".
- [ ] **Step 6: Uygula ve ölç** — `supabase db query --linked -f <mutlak yol>`; canlıda tek imza (`pg_proc` sayısı 1/1), yetkiler, tetikleyici var.
- [ ] **Step 7: Commit** — `feat(bekleme): geriye dönük başlangıç/bitiş ve teslimde kapanış (DB)`

### Task 3: DB okuma yolu — `order_metrics.on_hold`, `order_history` işaretleri

**Files:**
- Create: `supabase/migrations/20261102110000_bekleme_okuma.sql`
- Create: `supabase/rollbacks/20261102110000_bekleme_okuma.before.txt`
- Create: `supabase/rollbacks/20261102110000_bekleme_okuma.down.sql`

**Interfaces:**
- Consumes: Task 2 sütunları `end_recorded_at`, `end_source`.
- Produces:
  - `order_metrics()` sonucuna `on_hold` (sayı): `isHeldOrder` ile aynı kural — açık, arşivde değil, `hold_status='on_hold'`, `hold_category IS DISTINCT FROM 'client_prova'`; çağıranın kapsamıyla (teknisyen yalnız kendi işleri — mevcut kapsam neyse).
  - `order_history()` `hold_started` detayına `recorded_at` (yalnız `lab_today(created_at) > lab_today(started_at)` ise); `hold_ended` detayına `recorded_at` (yalnız `lab_today(end_recorded_at) > lab_today(ended_at)` ise) ve `on_delivery: true` (`end_source='delivered'` ise). Lab kaynaklı beklemenin klinikten gizlenen ayrıntısı gizli kalır.

- [ ] **Step 1: Canlı tanımları kaydet** — `pg_get_functiondef(order_metrics)`, `order_history`, yetkiler → `.before.txt` (göç dosyasından değil, CANLIDAN).
- [ ] **Step 2: Göç + `.down.sql` yaz** — imza ve dönüş tipi aynı kalır (`CREATE OR REPLACE`); yalnız alan eklenir.
- [ ] **Step 3: Rol rol deneme (ROLLBACK)** — lab yöneticisi, teknisyen, klinik rolleriyle ÖNCE/SONRA: mevcut alanların değerleri birebir aynı; `on_hold` = elle sayım (prova hariç); Task 2'deki gibi geriye dönük girilmiş bir kayıtta `recorded_at` dolu, bugünkü kayıtta yok; klinik rolü lab kaynaklı beklemenin ayrıntısını görmez.
- [ ] **Step 4: Kullanıcı onayı** (AskUserQuestion).
- [ ] **Step 5: Uygula ve ölç** — canlıda `select order_metrics()` içinde `on_hold` var, diğer alanlar değişmedi.
- [ ] **Step 6: Commit** — `feat(bekleme): beklemede sayısı ve sonradan girildi işareti (DB)`

### Task 4: İstemci API + iki ortak pencere

**Files:**
- Modify: `modules/orders/holdApi.ts`
- Modify: `core/metrics/useOrderMetrics.ts` (`on_hold` alanı + normalize)
- Create: `modules/orders/components/HoldOrderModal.tsx`
- Create: `modules/orders/components/ResumeOrderModal.tsx`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Consumes: Task 1 `holdDates.*`; Task 2 RPC imzaları; `labTodayOf` (orderDefs), `cachedLabTz` / `useLabToday` (core/metrics/useLabToday.ts), `DatePicker` (core/ui/DatePicker.tsx: `value`, `minDate`, `maxDate`).
- Produces:
  - `holdOrder(opts: { orderId; reason; category; startedOn?: string | null; orderNumber?; doctorId?; clinicId? })` — `startedOn` → `p_started_on`; bildirim davranışı aynı (geriye dönükte de gider).
  - `resumeOrder(orderId: string, opts?: { startedOn?: string | null; endedOn?: string | null }): Promise<{ ok; extendedDays?; error? }>`
  - `fetchPrevHoldEndDay(orderId: string, tz: string | null): Promise<string | null>` — `work_order_holds` en büyük `ended_at`'in lab günü; okunamazsa `null` (sunucu yine denetler).
  - `OrderMetrics.on_hold: number`
  - `HoldOrderModal` props: `{ visible: boolean; order: { id: string; order_number?: string | null; created_at: string; doctor_id?: string | null; clinicId?: string | null }; mode?: 'full' | 'awaitDoctor'; onClose(): void; onDone(): void }`
  - `ResumeOrderModal` props: `{ visible: boolean; order: { id: string; order_number?: string | null; created_at: string; delivery_date: string; hold_started_at: string; hold_responsible?: string | null; hold_category?: string | null; hold_reason?: string | null }; onClose(): void; onDone(extendedDays: number): void }`

- [ ] **Step 1: holdApi + useOrderMetrics** — imzalar yukarıdaki gibi; mevcut çağıranlar (OrderDetailScreenV2) derlenmeye devam eder.
- [ ] **Step 2: HoldOrderModal** — tüm günler lab gününde: bugün = `useLabToday()`, sipariş/bekleme günü = `labTodayOf(cachedLabTz(), new Date(ts))` (cihaz saat dilimi KULLANILMAZ). Mevcut detay penceresinin (OrderDetailScreenV2 ~3947) içeriğini taşı: kategori çipleri, açıklama (zorunlu, bugünkü gibi), **"Ne zamandan beri bekliyor?"** DatePicker (varsayılan bugün, `minDate = holdStartFloor`, `maxDate = bugün`; seçim `validateHoldStart` ile denetlenir). `mode='awaitDoctor'`: başlık "Hekimi bekliyor", yalnız `responsible==='client'` kategoriler, varsayılan `client_approval`, tarih alanı en üstte. Zemin `U.modalOverlay` / `U.modalCard`; hata ve meşgul durumu footer'da düğmenin yanında; düğmelerde GlassTooltip; çift gönderim `busy` ile kilitli.
- [ ] **Step 3: ResumeOrderModal** — iki gün: Başlangıç (açık beklemenin lab günüyle dolu; `validateResumeStart`, `floor = holdStartFloor`) ve "Parça / onay ne zaman geldi?" (varsayılan bugün; `validateHoldEnd`). Önizleme satırı: `+N gün` ve hekim/klinik kaynaklıysa "Yeni teslim: <gün>" (`shiftedDelivery`), lab kaynaklıysa "Teslim tarihi değişmez". Tek "Devam ettir" onayı; tarih değiştirilmezse RPC'ye tarih GÖNDERİLMEZ. Prova beklemesinde pencere açılmaz (çağıran gizler).
- [ ] **Step 4: Hata metinleri** — `DayErr` kodu → Türkçe metin (`autoT`) + `fmtDay`; sunucu metni (Task 2 sabitleri) gelirse `autoT(error)` ile gösterilir. Yeni dizelerin en/de/fa karşılıklarını auto sözlüklerine ekle; anahtar kümeleri eşit.
- [ ] **Step 5: Doğrula** — tam takım + tsc 0.
- [ ] **Step 6: Commit** — `feat(bekleme): bekletme ve devam ettirme pencereleri`

### Task 5: Sipariş detayı — masaüstü ve mobil

**Files:**
- Modify: `modules/orders/screens/OrderDetailScreenV2.tsx` (~319 durum, ~901 `heldDays`, ~1741–1766 submit fonksiyonları, ~1979 menü, ~2391 hero düğmeleri, ~1477 mobil devretme, ~3947 eski pencere)
- Modify: `modules/orders/screens/OrderDetailMobileHandoff.tsx` (~114 props, ~558 eylem satırı)

**Interfaces:**
- Consumes: Task 4 `HoldOrderModal`, `ResumeOrderModal`; Task 1 `daysBetween`.
- Produces (MobileHandoff props): `onPause?: () => void` (mevcut, artık bağlı) · `onResume?: () => void` · `holdLabel?: string | null` (ör. "Beklemede · 5 gün"; prova için "Provada").

- [ ] **Step 1: Masaüstü** — satır içi `<Modal visible={holdOpen}>` bloğunu ve `holdCat`/`holdReason` durumlarını kaldır, yerine `HoldOrderModal` (`mode='full'`); "Devam ettir" artık `ResumeOrderModal`'ı açar (tek dokunuşla RPC çağrısı yok). `heldDays` = `daysBetween(labTodayOf(tz, new Date(hold_started_at)), today)`; hero/rozet metni "N gündür" gösterir.
- [ ] **Step 2: Mobil** — devretme dalına `onPause` (bekletme penceresi) ve `onResume` (devam penceresi) bağla; yalnız `(lab)`/`(admin)` paneli, iş teslim/iptal değilken; prova beklemesinde ikisi de yok. Handoff'ta "Duraklat" düğmesi yalnız `onPause` verilince çizilir; beklemedeyse yerine "Devam ettir" (`onResume`) ve hero'da `holdLabel`. Satır tek satırda kalır (dar ekranda `flexWrap` yok; sığmazsa "Aşama tamam" önde, diğeri "•••"). İki pencere mobil dalda da render edilir (masaüstü dalındaki modal mobilde görünmez — bkz. `project_mobile_order_detail_modals`).
- [ ] **Step 3: i18n + doğrula** — yeni dizeler dört dilde; tam takım + tsc 0.
- [ ] **Step 4: Commit** — `feat(bekleme): sipariş detayında geriye dönük bekletme (masaüstü + mobil)`

### Task 6: Sipariş listesi — "Hekimi bekliyor" ve "Beklemede" süzgeci

**Files:**
- Modify: `modules/orders/lib/listParams.ts` + `modules/orders/lib/listParams.test.mts`
- Modify: `modules/orders/screens/OrdersListScreenV2.tsx` (`rowActions` ~130, `deliveryText` ~202, süzgeç ~465, `pickChip` ~531, mobil props ~670, `MobileOrderCard` ~1564, `DesktopRow` ~1876)
- Modify: `modules/orders/screens/OrdersKanbanB2Mobile.tsx` (çip satırı ~207, satır `overdue` ~548)

**Interfaces:**
- Consumes: Task 1 `isHeldOrder`, `daysBetween`; Task 4 `HoldOrderModal`; Task 3/4 `OrderMetrics.on_hold`.
- Produces (listParams.ts):
  - `listStateFromParams(...)` sonucuna `hold: boolean` (`?filter=hold`); `provaChip` ile birbirini dışlar.
  - `holdActionsAllowed(panelGroup: string): boolean` — yalnız `'(lab)'` ve `'(admin)'`.

- [ ] **Step 1: Testleri yaz** — `listStateFromParams({ filter:'hold' }, ['alindi']).hold === true` ve `.provaChip === null`; `{ filter:'prova' }` → `hold === false`; `{}` → `hold === false`; `holdActionsAllowed('(lab)') === true`, `'(admin)'` true, `'(clinic)'`, `'(doctor)'`, `'(station)'`, `''` false.
- [ ] **Step 2: Düştüğünü gör** — `node --test modules/orders/lib/listParams.test.mts` → FAIL.
- [ ] **Step 3: listParams uygula** → aynı komut PASS.
- [ ] **Step 4: Liste ekranı** — (a) "Beklemede" çipi (masaüstü + mobil `FilterChip`), sayısı `serverCounts.on_hold` (yoksa `isHeldOrder` ile istemci sayımı), süzgeç `isHeldOrder`; yalnız `holdActionsAllowed`. (b) `rowActions`'a 5. parametre `onAwaitDoctor?: (o) => void`; gecikmiş satırda (`orderDefs.isOverdueOrder(o, today)`) "Hekimi bekliyor" eylemi (`Pause` ikonu) — "Geciken" çipi açıkken de karışık listede de. ••• menüsü, eylem listesi boş değilse çizilir (artık yalnız `isAdmin` değil); "Ata" düğmesi kalır. Mobilde `rowActionsFor` lab/admin panelinde her zaman verilir. (c) `HoldOrderModal mode='awaitDoctor'`; kaydedilince `refetch` → satır "Geciken"den çıkar. (d) `deliveryText`: beklemede satır "Beklemede · N gün" (prova "Provada" aynen). (e) Mobil satırın kırmızı zemini beklemedeki işte yanmaz (`isPastDue` yerine hold'a duyarlı tanım).
- [ ] **Step 5: i18n + doğrula** — tam takım + tsc 0.
- [ ] **Step 6: Commit** — `feat(bekleme): listede Hekimi bekliyor ve Beklemede süzgeci`

### Task 7: Panolar — lab ve yönetici, masaüstü ve mobil

**Files:**
- Create: `modules/orders/hooks/useHeldOrders.ts`
- Modify: `modules/dashboard/screens/LabDashboardScreen.tsx` (`TasksCard` ~804, `taskItems` ~1385, mobil devretme ~1459–1590, rozet satırı ~1634)
- Modify: `app/(admin)/index.tsx` (`TasksCard` ~1007, `taskItems` ~1629, mobil ~1735–1830, rozet satırı ~1888)
- Modify: `modules/dashboard/components/LabMobileDashboard.tsx` (`LabDelayedCase.kind` + `'hold'`, `heldCount` prop)
- Modify: `modules/admin/components/AdminMobileDashboard.tsx` (`heldCount` prop)
- Modify: `core/ui/mobile/NotificationsSheet.tsx` (isteğe bağlı `held` grubu)

**Interfaces:**
- Consumes: Task 1 `isLongHold`, `daysBetween`, `METRIC_HINTS.onHold`; Task 4 `ResumeOrderModal`, `HoldOrderModal`, `OrderMetrics.on_hold`.
- Produces:
  - `useHeldOrders(): { rows: HeldOrder[]; refetch(): void }` — `work_orders` (RLS kapsamı) `hold_status='on_hold'`, `hold_category <> 'client_prova'`, status kapalı değil, arşivde değil; alanlar `id, order_number, patient_name, created_at, delivery_date, hold_category, hold_reason, hold_responsible, hold_started_at`; `hold_started_at` artan. Gerçek zamanlı yenileme `subscribeShared('work_orders_realtime:${userId}', …)` — YENİ kanal açılmaz (useOrderMetrics ile aynı anahtar ve bağlamalar).
  - Masaüstü `TasksCard` öğe tipine `action?: { label: string; tip: string; onPress: () => void }` (her iki dosyadaki YEREL TasksCard; ortak bileşen yok).
  - `NotificationsSheet` prop `held?: { id: string; _id: string; patient: string; days: number }[]` — verilmezse bugünkü görünüm birebir.
  - `LabMobileDashboardProps.heldCount?: number`, `AdminMobileDashboardProps.heldCount?: number`.

- [ ] **Step 1: useHeldOrders** — yukarıdaki sözleşme.
- [ ] **Step 2: Masaüstü rozet** — iki panoda "Geciken"in yanına aynı ölçüde `AlertPillX` "Beklemede" (`Pause` ikonu, amber ton `#E89B2A` / koyu temada açık ton), sayı `metrics.on_hold ?? rows.length`, 0 ise gizli; GlassTooltip `autoT(METRIC_HINTS.onHold)`; dokununca `/(lab)/orders?filter=hold` / `/(admin)/orders?filter=hold`.
- [ ] **Step 3: Dikkat listesi** — `isLongHold(yaşGün)` olan ilk 2 iş: etiket `"<kategori> · <sipariş no>"`, alt satır `"N gündür"` (+ neden varsa); `action` "Devam ettir" → `ResumeOrderModal`. Kalan uzun bekleme varsa `"+n bekleyen iş daha"` satırı → `?filter=hold`. Gecikmiş iş satırlarına `action` "Hekimi bekliyor" → `HoldOrderModal mode='awaitDoctor'`. `.slice(0, 7)` sınırı korunur; sıra: planlama, gecikmiş, uzun bekleyen, bugün teslim…
- [ ] **Step 4: Mobil** — Lab: "Geciken" KPI'sının yanına `heldCount`; `delayed` listesine `kind:'hold'` satırları (Pause ikonu, sağda "N gündür", dokununca sipariş detayı — orada Devam ettir var). Yönetici: aktif sipariş KPI alt satırına `heldCount`; NotificationsSheet'e `held` grubu (başlık "Uzun bekleyen"). NotificationsSheet değişikliği başka panelleri ETKİLEMEZ (prop isteğe bağlı) — uygularken kullanıcıya tek satırla söyle.
- [ ] **Step 5: i18n + doğrula** — anahtarlı metin varsa `{tr,en,de,fa}.json` dördü birden; auto sözlükler eşit; tam takım + tsc 0.
- [ ] **Step 6: Commit** — `feat(bekleme): panolarda Beklemede rozeti ve uzun bekleme hatırlatması`

### Task 8: Sipariş Geçmişi — "Sonradan girildi" ve "teslimde kapandı"

**Files:**
- Modify: `modules/orders/history/historyModel.ts` (`historyTitle` ~189, `historyParts` ~353–363)
- Modify: `modules/orders/history/historyModel.test.mts`

**Interfaces:**
- Consumes: Task 3 detay alanları `recorded_at`, `on_delivery`.

- [ ] **Step 1: Testleri yaz** (dosyadaki `row()` yardımcısıyla):
  - `historyParts(row('hold_started', { responsible:'client', category:'client_approval', recorded_at:'2026-10-25T09:00:00Z' }))` içinde `{ t:'text', v:'Sonradan girildi' }` ve `{ t:'date', v:'2026-10-25T09:00:00Z' }` var
  - `recorded_at` yoksa `'Sonradan girildi'` yok (mevcut testler aynen geçer)
  - `historyParts(row('hold_ended', { extended_days: 7, recorded_at:'2026-10-26T08:00:00Z' }))` uzatma parçalarını ve "Sonradan girildi" + tarihi içerir
  - `historyTitle(row('hold_ended', { on_delivery: true }))` → `'Bekleme teslimde kapandı'`; `on_delivery` yoksa `'Devam ettirildi'`
- [ ] **Step 2: Düştüğünü gör** — `node --test modules/orders/history/historyModel.test.mts` → FAIL.
- [ ] **Step 3: Uygula** — not, satırın kendi `actor_name`'iyle birlikte okunur (kimin girdiği satırda zaten yazıyor). Yeni dizeler dört dilde.
- [ ] **Step 4: Geçtiğini gör** → PASS; tam takım + tsc 0.
- [ ] **Step 5: Commit** — `feat(bekleme): Sipariş Geçmişi'nde sonradan girilen bekleme tarihleri`

### Task 9: Önizleme doğrulaması, yol haritası ve hafıza

**Files:**
- Modify: `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` (madde 13 satırı)
- Modify: hafıza dosyası (yeni `project_hold_backdate.md` + `MEMORY.md` satırı)

- [ ] **Step 1: Önizleme ("Expo Web")** — lab ve yönetici panosu (masaüstü + 390px mobil, açık + koyu tema): "Beklemede" rozeti, dikkat listesi satırları; sipariş listesi "Beklemede" çipi ve gecikmiş satırın ••• menüsünde "Hekimi bekliyor"; sipariş detayında iki pencere AÇILIR, tarih seçici sınırları doğru, hata footer'da. **Hiçbir pencerede kaydet/onayla düğmesine basılmaz** (canlı hesap); yazma yolu Task 2 denemesinde kanıtlandı. Klinik panelinde listede yeni eylem/çip yok. Konsolda yeni hata yok.
- [ ] **Step 2: Sözlük eşitliği** — `node -e "const k=['en','de','fa'].map(l=>Object.keys(require('./core/i18n/locales/auto.'+l+'.json')).sort().join('|'));process.exit(k[0]===k[1]&&k[1]===k[2]?0:1)"` → çıkış 0.
- [ ] **Step 3: Yol haritası** — madde 13'ü yeni kapsamla yaz: "Bekleme: geriye dönük başlangıç/bitiş, Hekimi bekliyor, panoda Beklemede (5 iş günü kuralı aynen) — DB 20261102100000 + 20261102110000 CANLI, web deploy bekliyor".
- [ ] **Step 4: Hafıza** — kural özeti (takvim günü, teslimde kapanış `end_source`, tek imza, `LONG_HOLD_DAYS`), deploy durumu.
- [ ] **Step 5: Son doğrulama + commit** — tam takım + tsc 0; `docs(bekleme): yol haritası madde 13`.
