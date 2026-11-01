# Rol bazlı görünürlük (güvenlik paketi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her rol veritabanında da yalnız işinin gerektirdiğini görsün: lab finans tabloları finans yetkisine, klinik finansı `billing_view` kuralına, teknisyen kendi işine, kurye kendi teslimatına bağlansın; kâr fonksiyonu korunsun.

**Architecture:** RLS kuralları daraltılır; kural mantığı küçük SECURITY DEFINER yardımcılarda (`lab_can_view_finance()`, `lab_can_manage_invoices()`, `can_view_clinic_billing(uuid)`, `can_see_work_order(uuid)`) toplanır, böylece politika döngüsü olmaz ve istemci aynı kararı RPC ile sorar. Her paket ayrı geçiş + geri alma + rol rol denemedir. İstemci yalnız yetkisi olmayana ölü kart/menü göstermemek için değişir.

**Tech Stack:** Supabase Postgres (RLS, plpgsql, storage policies), Expo/react-native-web, `node --test`.

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-25-rol-gorunurlugu-design.md`

## Global Constraints

- **Veritabanı adımı beş aşamalı:** canlı tanım `.before.txt` → geri alma `supabase/rollbacks/<ts>.down.sql` → rol rol geri alınan işlemde KIRMIZI sonra YEŞİL (geçiş → ölçüm → geri alma → ölçüm) → **kullanıcı onayı** → `supabase db query --linked -f <mutlak>` + canlı ölçüm.
- Denemelerde geçici atama/teslimat/kayıt yalnız işlem içinde yapılır; işlem RAISE ile geri alınır. Çıktıya ad ve tutar yazılmaz, yalnız sayı (KVKK).
- Kimlikler: lab `243ef1db-9853-424b-8292-0025abfca436`; sahip `f6817e96-2aab-443f-8cb3-02b7718f18e4`; müdür `8ce19a0e-445d-4167-87e6-9fc192875169`; teknisyen `5ab98f51-dbef-4916-aa61-76a82bbdf219`; klinik yöneticisi `560e1377-3b52-437e-8bf8-65147750e8fb`; hekim `747ae960-25da-4eb4-97f6-a54c477ee11b`; kurye ve yöneticisiz klinikteki hekim sorguyla bulunur.
- Lab finans okuma = `has_permission('view_financials') or has_permission('view_finance') or has_permission('manage_finance')`; yazma = `has_permission('manage_invoices') or has_permission('manage_finance')`; platform yöneticisi (`is_platform_admin()`) her yerde geçer.
- RESTRICTIVE `tenant_guard` kurallarına dokunulmaz. DEFINER fonksiyonlar (taslak fatura, toplu fatura, aşama RPC'leri, `update_delivery_status`, e-fatura/ödeme edge'leri) bozulmamalı.
- Yayın yalnız kullanıcı "deploy" deyince; commit yok. Yeni metin dört dilde; koyu tema token'la; `tsc --noEmit --incremental false` 0.
- Test paketi: `bash /private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/92fed326-e9be-452e-a41e-d705e960980b/scratchpad/search/suite.sh`.

## Review Focus

1. Teknisyen/kurye siparişi teslim eder ya da aşama tamamlar → DEFINER yoldan taslak fatura yine oluşur (Task 1 YEŞİL satırı).
2. Klinik yöneticisi ödeme bildirimi açar ve görür; yöneticili klinikteki hekim göremez/açamaz (Task 3 YEŞİL).
3. Teknisyen kendi işinin eklerini, kalemlerini, mesajlarını açar; başka siparişinkileri açamaz (Task 5 YEŞİL).
4. Kurye kendi teslimatının durumunu günceller, sipariş no/hasta embed'i gelir (Task 6 YEŞİL).
5. Finans yetkisi olmayan lab müdürü özet ekranı hatasız, finans kartı olmadan açılır; Siparişler ve Üretim aynen (Task 4 ekran).

---

### Task 1: Lab tarafı finans tabloları (paket A)

**Files:**
- Create: `supabase/migrations/20261025160000_lab_finance_rls.sql`, `supabase/rollbacks/20261025160000_lab_finance_rls.down.sql`, `supabase/rollbacks/20261025160000_lab_finance_rls.before.txt`
- Probe: `scratchpad/visibility/a_probe.sql`, `scratchpad/visibility/check_a.sh`

**Interfaces:**
- Produces: `public.lab_can_view_finance() returns boolean` ve `public.lab_can_manage_invoices() returns boolean` (SECURITY DEFINER, STABLE, `search_path=public`; Global Constraints'teki anahtarlar + `is_platform_admin()`).
- Kurallar (lab tarafı dalları; klinik/hekim dalları Task 3'ün): `invoices` SELECT `lab_id = get_my_lab_id() and lab_can_view_finance()`, INSERT/UPDATE/DELETE `… and lab_can_manage_invoices()`; `invoice_items_lab_all`, `invoice_orders_lab_all`, `payment_reminders_lab_all` → okuma finans, yazma fatura yönetimi; `payments_lab_select`, `payment_submissions_lab_select/update`, `payment_intents_lab_select/insert`, `payment_attempts_lab_select` → finans okuma (yazanlar mevcut `manage_finance` şartını korur).

- [ ] **Step 1:** Bu 8 tablonun canlı kurallarını + `trg_auto_draft_invoice_on_delivery`, `create_invoice_from_order`, `create_bulk_invoice` güvenlik modunu `.before.txt`'e kaydet. Kurye kimliğini bul (`profiles user_type='lab' and role='courier'`).
- [ ] **Step 2: KIRMIZI:** müdür/teknisyen/kurye `invoices`, `invoice_items`, `payments` okur → >0; teknisyen bir faturayı `update … set notes = notes` → 1 satır.
- [ ] **Step 3:** Geçiş + geri alma yaz.
- [ ] **Step 4: YEŞİL** (geçiş → ölçüm → geri alma → ölçüm): sahip okur (önceki sayılar) ve günceller (1); müdür/teknisyen/kurye okuma 0, güncelleme/silme 0 ya da 42501, ekleme 42501; teknisyen bir siparişi DEFINER yoldan `teslim_edildi` yapar (siparişi geçici seç, `update_work_order_status` ya da canlıdaki teslim RPC'si) → taslak fatura oluşur (sahip olarak sayılır); geri alma = KIRMIZI.
- [ ] **Step 5:** `check_a.sh` (canlı geri alınan ölçüm beklenen satırları) → kullanıcı **onayı** → uygula → `check_a.sh` PASS. Ledger.

### Task 2: `calculate_order_profit` (paket B)

**Files:** Create `supabase/migrations/20261025161000_order_profit_guard.sql` + `.down.sql` + `.before.txt`; probe `scratchpad/visibility/b_probe.sql`.

**Interfaces:** Consumes: `can_view_lab_profit(uuid)` (0c). Produces: aynı imza; gövde başında siparişin `lab_id` ≠ `get_my_lab_id()` ya da `not can_view_lab_profit(lab)` → 0c'deki `calculate_*` reddiyle aynı biçim (canlı 0c tanımından alınır).

- [ ] **Step 1:** Canlı tanım + istemci çağrısı (`OrderDetailScreenV2.tsx:730`) hata yolunu oku: ret sessiz mi karşılanıyor?
- [ ] **Step 2: KIRMIZI:** teknisyen/müdür bir sipariş için çağırır → sonuç döner.
- [ ] **Step 3-4: YEŞİL:** teknisyen/müdür → ret; sahip → önceki sonuçla aynı; başka lab'ın siparişi (sahip) → ret; geri alma = KIRMIZI. İstemci ret yolunda kâr bölümü gizli değilse `OrderDetailScreenV2` çağrı yerinde hatayı yut/gizle (tek satır) — ledger'a Ruling.
- [ ] **Step 5:** Onay → uygula → canlı ölçüm. Ledger.

### Task 3: Klinik finansı ve hatırlatma alıcıları (paket C, veritabanı)

**Files:** Create `supabase/migrations/20261025162000_clinic_billing_view.sql` + `.down.sql` + `.before.txt`; probe `scratchpad/visibility/c_probe.sql`, `check_c.sh`.

**Interfaces:**
- Produces:
  - `public.can_view_clinic_billing(p_clinic uuid) returns boolean` — SECURITY DEFINER STABLE. Arayan `clinic_admin` ve `clinic_id = p_clinic` (ya da çoklu-lab üyeliği `my_clinic_ids()`) → true; `clinic_secretary` aynı klinikte → `coalesce((clinic_permissions->>'billing_view')::boolean, true)`; `doctor` aynı klinikte → `coalesce((clinic_permissions->>'billing_view')::boolean, false)` **veya** o klinikte faturayı görebilen aktif kimse yok (aktif `clinic_admin` ya da `billing_view` true/boş aktif `clinic_secretary`). Diğer herkes false.
  - `public.my_clinic_billing_access() returns boolean` — istemci için: `can_view_clinic_billing(<arayanın klinik kimliği>)`.
  - Klinik/hekim dalları: `invoices` (`clinic_view_clinic_invoices`, `clinic_view_multilab_invoices`, `doctor_view_own_clinic_invoices`), `payments` (3 klinik kuralı), `invoice_items` (3), `payment_submissions` klinik select/insert (admin/sekreter/hekim), `payment_reminders_clinic_select` → mevcut koşul **ve** `can_view_clinic_billing(<satırın kliniği>)`.
  - `_send_payment_reminder_core`: klinik alıcıları `can_view_clinic_billing` eşdeğeriyle (DEFINER içinde alıcı kimliğiyle — yardımcının `p_user` alan iç sürümü `_user_can_view_clinic_billing(p_user uuid, p_clinic uuid)` gerekebilir; `can_view_clinic_billing` onu `auth.uid()` ile çağırır), lab "yönetici kopyası" alıcıları finans yetkisiyle (`role_permissions` üzerinden alıcının rolü) süzülür. Gönderim kanalları ve metin değişmez.

- [ ] **Step 1:** Canlı tanımlar: bu kurallar, `_send_payment_reminder_core`, `my_payment_reminder`, `get_my_clinic_id`, `my_clinic_ids`. Yöneticisiz klinikteki hekimi bul.
- [ ] **Step 2: KIRMIZI:** yöneticili klinikteki hekim kendi kliniğinin `invoices`/`payments` okur → >0.
- [ ] **Step 3:** Geçiş + geri alma.
- [ ] **Step 4: YEŞİL:** klinik yöneticisi görür (önceki sayılar) ve ödeme bildirimi ekler (geri alınır); yöneticili klinikteki hekim 0 ve bildirim 42501; yöneticisiz klinikteki hekim görür; sekreter (işlem içinde geçici profil ya da `billing_view=false` güncellemesi) 0; hatırlatma alıcı listesi (gönderim yapmadan, fonksiyonun alıcı seçen sorgusu ya da `p_dry_run` yoksa alıcı CTE'si ayrı ölçülür) yalnız yetkililer; `my_clinic_billing_access()` klinik yöneticisi true, hekim false; geri alma = KIRMIZI.
- [ ] **Step 5:** `check_c.sh` → onay → uygula → PASS. Ledger.

### Task 4: İstemci — yetkisiz kişiye finans yüzeyleri gösterilmez (paket A+C ekranları)

**Files:**
- Create: `modules/clinic/useClinicBillingAccess.ts` (`useClinicBillingAccess(): boolean | null` — `my_clinic_billing_access` RPC; null = yükleniyor)
- Modify: `app/(clinic)/_layout.tsx:139`, `app/(doctor)/_layout.tsx:142` (Finans menü öğesi yalnız erişim true iken), `modules/clinic/...ClinicDashboardScreen.tsx:1013,1511` (bakiye kartı), `core/finance/PaymentReminderGate.tsx` (erişim yoksa hiç sorgulamaz), `modules/denty/tools.ts:723` (`cariDurum` erişim yoksa "Bu bilgiyi görme yetkiniz yok."), `modules/lab/...LabDashboardScreen.tsx:1318-1330` (geciken fatura/faturalanmamış iş kartı yalnız lab finans yetkisiyle — `has_permission('view_financials')` RPC, `feedback_permission_alias_expansion`)
- Test: `scratchpad/visibility/check_t4.sh` (grep tabanlı bağlantı kontrolü) + ekran

- [ ] **Step 1:** `check_t4.sh` KIRMIZI (kanca yok; menü/kart/gate/araç koşulsuz).
- [ ] **Step 2:** Uygula; yeni metinler dört dilde; koyu tema dokunulan kartlarda token.
- [ ] **Step 3:** PASS; `tsc` 0; suite yeşil.
- [ ] **Step 4: Ekran** (yerel, canlı veri, kaydetmeden): sahip oturumunda admin özet + Finans aynen; klinik/hekim/müdür oturumu yoksa ledger'a "ekran yalnız sahip bakışıyla; diğer roller DB + kod" yaz.
- [ ] **Step 5:** Ledger.

### Task 5: Teknisyen görünürlüğü (paket D)

**Files:** Create `supabase/migrations/20261025163000_technician_visibility.sql` + `.down.sql` + `.before.txt`; probe `scratchpad/visibility/d_probe.sql`, `check_d.sh`; Modify `modules/orders/screens/OrdersListScreenV2.tsx:372` (teknisyen istemci süzgeci kaldırılır — RLS tek kaynak; ledger Ruling), `global_search` (teknisyen koşulu `20261025150000` kaldırılır: invoker + yeni RLS aynı kuralı uygular, aşama ataması da dahil olur).

**Interfaces:**
- Produces: `public.can_see_work_order(p_wo uuid) returns boolean` — SECURITY DEFINER STABLE: siparişin `lab_id = get_my_lab_id()` ve (rol `technician` değil ve `courier` değil **veya** teknisyen için: `assigned_to = auth.uid()` veya o siparişte `order_stages.technician_id = auth.uid()` veya siparişi açan arayan (canlı sütun adı: `created_by` ya da eşdeğeri — Step 1'de doğrula) veya `start_stage_simple`'ın teknisyene başlatma izni verdiği atanmamış aşama (koşul canlı tanımdan birebir) **veya** kurye için (Task 6) false; Task 6 bu fonksiyona kurye dalını ekler).
- Kurallar: `wo_select_consolidated` lab dalı → `… and can_see_work_order(id)` (doktor/klinik dalları aynen); `order_stages_select_consolidated` lab dalı → `can_see_work_order(work_order_id)`; `_order_party_role` 'lab' dönüşü `can_see_work_order` şartına; siparişe bağlı tablolar (`order_items`, ekler + depo kovası kuralları, sipariş mesajları, `order_implant_parts`, `order_scan_annotations`) lab-üyeliği dalları `can_see_work_order(<work_order_id>)` — Step 1'de canlı kurallardan tam liste çıkar, `.before.txt`'e yaz.

- [ ] **Step 1:** Canlı tanımlar (yukarıdaki tablolar + depo kuralları + `_order_party_role` + `start_stage_simple` iki aşırı yüklemesi + `work_orders` oluşturan sütunu). İstasyon ekranlarının okuduğu yolları (`OperatorScreen`, stats, history, TV istasyon, sipariş detayı ilgili siparişler, tarama) listeye işaretle.
- [ ] **Step 2: KIRMIZI:** teknisyen başka (atanmamış, aşaması başkasına atanmış) siparişi, aşamalarını, kalemlerini, eklerini okur → >0.
- [ ] **Step 3:** Geçiş + geri alma.
- [ ] **Step 4: YEŞİL** (işlem içinde geçici: bir siparişin aşaması teknisyene; bir siparişte atanmamış sırası gelmiş aşama; teknisyen bir sipariş açar): kendi (aşama) siparişi + tüm aşamaları + kalem/ek/mesaj görür; atanmamış sırası gelmiş aşamalı sipariş görünür ve `start_stage_simple` ile başlar; açtığı sipariş geri okunur; başkasına atanmış sipariş/aşama/kalem/ek 0; müdür ve sahip önceki sayılar; `global_search` teknisyen = görünür kümeyle aynı; geri alma = KIRMIZI.
- [ ] **Step 5:** `check_d.sh` → onay → uygula → PASS. İstemci (Siparişler süzgeci) + `tsc` + suite; ekran: sahip Siparişler/Üretim aynen. Ledger.

### Task 6: Kurye görünürlüğü (paket E)

**Files:** Create `supabase/migrations/20261025164000_courier_visibility.sql` + `.down.sql` + `.before.txt`; probe `scratchpad/visibility/e_probe.sql`, `check_e.sh`.

**Interfaces:**
- Consumes: Task 5 `can_see_work_order`.
- Produces: `can_see_work_order` kurye dalı: `exists(select 1 from deliveries d where d.work_order_id = p_wo and d.courier_id = auth.uid())`. `deliveries_select` lab dalı: kurye için `courier_id = auth.uid()`, diğer lab rolleri aynen.

- [ ] **Step 1:** Canlı tanımlar (`deliveries_*`, `update_delivery_status`, kurye ekranlarının okumaları: `fetchMyDeliveries`, detay, harita, tarama).
- [ ] **Step 2: KIRMIZI:** kurye başka teslimatı ve onun siparişini okur → >0.
- [ ] **Step 3:** Geçiş + geri alma.
- [ ] **Step 4: YEŞİL** (işlem içinde kuryeye geçici teslimat): kendi teslimatı + siparişi (no, hasta) görünür, `update_delivery_status` geçer; başka teslimat/sipariş 0; müdür/sahip teslimat sayıları önceki; geri alma = KIRMIZI.
- [ ] **Step 5:** `check_e.sh` → onay → uygula → PASS. Ledger.
