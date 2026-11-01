# Tarama randevuları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab'ın kliniklerde yaptığı ağız içi tarama ve fotogrametri ziyaretleri kayda girer. Sistem uygun saat önerir; çakışma ve yol riskinde uyarır. Ziyarette taranan her hasta için admin ya da yönetici karar verir: siparişe bağla, yeni sipariş aç ya da yalnız tarama. Ücret, lab'ın kuralına ve kliniğin faturalama düzenine göre doğru faturaya girer. Admin ve yönetici sabah bugünün, akşam yarının programını alır.

**Architecture:**
- **Veri:** dört yeni tablo.
  - `scan_appointments`: ziyaret.
  - `scan_appointment_services`: ziyaretin hizmetleri ve cihazları.
  - `scan_patients`: hasta satırı ve karar.
  - `scan_patient_charges`: hasta × hizmet ücreti; fatura satırına bağ.

  Ayrıca `lab_services`, `equipment`, `clinics` ve `lab_settings`'e eklemeli sütunlar gelir.
- **Yazma yolu:** bütün yazmalar DEFINER RPC'lerden geçer. Yeni tablolarda istemcinin yazma yetkisi yoktur (REVOKE), okuma RLS ile.
- **Özellik bayrağı:** özellik lab bazında `scan_appointments` bayrağıyla açılır. Varsayılan kapalı, Nexadent'te açık.
- **Zamanlama zekâsı istemcide, saf modelde:** çakışma, yol uyarısı ve öneri `modules/scans/scanModel.ts`'te test edilir. Yol süresi web'de Google Maps JS ile hesaplanır. Yedek kaba tahmindir; koordinat yedeği mevcut `geocodeTR` (Nominatim).
- **Faturalama mevcut fonksiyonlara eklenir:**
  - Ortak bir yardımcı (`_scan_bill_charges`) tarama satırlarını faturaya yazar.
  - `create_invoice_from_order`, `create_bulk_invoice` ve `fn_generate_monthly_invoices` bu yardımcıyı çağırır.
- **Bildirim:** saat başı cron, lab'ın yerel saatine göre gönderir. İçerik, göndermeyen saf bir fonksiyondan (`_scan_digest_payload`) gelir, böylece probe edilebilir.
- **Arayüz:** görünüş, Task 10'daki tasarım oturumunda onaylanan prototipten gelir. Task 1–9 arayüz tasarımına bağlı değildir.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, storage politikaları, pg_cron, pg_net), Expo + react-native-web, Google Maps JS SDK (web), `node --test` (`.test.mts`).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md`. Bölüm numaraları ("spec 4.8") ona göredir.

## Global Constraints

- **Veritabanı adımı beş aşamalıdır:**
  1. Canlı tanım `supabase/rollbacks/<ts>.before.txt`'ye kaydedilir. Değiştirilen her mevcut fonksiyon `pg_get_functiondef` ile **canlıdan** alınır; migration dosyaları eski olabilir.
  2. `.down.sql` yazılır. Down, değiştirilen fonksiyonların **canlı** eski tanımını geri yükler.
  3. Geri alınan işlemde ölçülür: ÖNCE → migration → SONRA → down → GERİ ALMA.
     - Üretici: `python3 scratchpad/gecmis/gen_probe.py S mig down out measure`.
     - Senaryolar `begin … raise exception using errcode='P0099' … exception when sqlstate 'P0099'` bloklarında. Desen: `scratchpad/prova/fx_measure.sql`.
     - Metin birleştirmeleri `coalesce`'li.
  4. **Kullanıcı onayı** AskUserQuestion ile alınır: ne eklenir, neyi etkiler, geri alma.
  5. `supabase db query --linked -f <mutlak yol>` (my-expo-app'ten) ile uygulanır, canlıda ölçülür.
- **Deneme kimlikleri:**
  - Lab (Nexadent): `243ef1db-9853-424b-8292-0025abfca436`.
  - Sahip: `f6817e96-2aab-443f-8cb3-02b7718f18e4`.
  - Klinik yöneticisi: `560e1377-3b52-437e-8bf8-65147750e8fb`.
  - Hekim: `747ae960-25da-4eb4-97f6-a54c477ee11b`.
  - Teknisyen probe içinde seçilir: `(select id from profiles where lab_id=<lab> and role ilike '%tech%' order by created_at limit 1)`.
  - Klinik: o lab'ın ilk aktif kliniği.
  - Çıktıda ad yazılmaz.
- **Denemelerde yasak:**
  - Gönderen fonksiyonlar çağrılmaz: `_notify_channels`, `fn_daily_order_watch`, `fn_prova_watch`, `fn_scan_schedule_digest`, e-posta gönderen her şey.
  - `fn_generate_monthly_invoices` probe'da çağrılmaz; bütün kliniklere fatura yazar. Onun yerine Task 6'daki yardımcılar doğrudan denenir.
- **Yetki (SQL yardımcıları, Task 1):**
  - `_scan_enabled(p_lab uuid)` = `lab_feature_enabled(p_lab,'scan_appointments')`.
  - `_scan_can_manage()` = bayrak açık **ve** (`my_user_type()='admin'` ya da (`user_type='lab'` ve `role in ('manager','admin')`) ya da `has_permission('manage_scan_appointments')`).
  - `_scan_can_view()` = `_scan_can_manage()` ya da `has_permission('view_scan_appointments')`.
  - Atanmış teknisyen: `scan_appointments.technician_id = auth.uid()`.
  - Karar ve karar geri alma yalnız `_scan_can_manage()`.
- **Sabit değerler (spec):**
  - Süre varsayılanı 90, sınır 15–600 dk.
  - Yol payı varsayılanı 10 dk.
  - Tarama saatleri varsayılanı 09:00–20:00, Pzt–Cmt (`{1,2,3,4,5,6}`, 1=Pazartesi).
  - Bildirim saatleri 08:00 ve 18:00.
  - Öneri adımı 15 dk, en fazla 5 öneri.
  - Tahmin: kuş uçuşu km × 1,4 ÷ 30 km/sa, en az 10 dk.
  - Tercih aralıkları: sabah 09:00–12:00, öğle 12:00–15:00, akşam 15:00–20:00.
- **Sabit listeler (Türkçe kaynak; autoT sözlüğüne dört dilde girer):**
  - Kaynak: `telefon` "Telefon", `whatsapp` "WhatsApp", `yuz_yuze` "Yüz yüze", `diger` "Diğer".
  - İptal nedenleri: "Hasta gelmedi", "Klinik iptal etti", "Lab iptal etti", "Diğer". "Diğer"de not en az 3 karakterdir ve kaydedilen neden notun kendisidir.
- **Sunucu hata metinleri** (Türkçe; dört dilde sözlüğe girer):
  - 'Tarama randevuları bu lab için kapalı'
  - 'Tarama randevusu bulunamadı'
  - 'Bu işlem için yetkiniz yok'
  - 'Karar yalnız admin ya da yöneticiye açık'
  - 'Klinik bu lab'a ait değil'
  - 'Teknisyen bu lab'a ait değil'
  - 'Tarama hizmeti seçin'
  - 'Cihaz bu hizmetin türüne uymuyor'
  - 'Süre 15 ile 600 dakika arasında olmalı'
  - 'Yalnız planlanmış randevu değiştirilebilir'
  - 'Randevu kapanmış ya da iptal edilmiş'
  - 'Tarama yapıldı demek için en az bir hasta ekleyin'
  - 'Her hastanın adını yazın'
  - 'Karar verilmiş tarama varken geri alınamaz'
  - 'İptal nedenini yazın'
  - 'Hastanın hizmeti randevunun hizmetlerinden seçilmeli'
  - 'Sipariş bu kliniğe ait değil'
  - 'En az bir hasta kalmalı'
  - 'Bu tarama zaten karara bağlanmış'
  - 'Bu tarama kesilmiş bir faturada; önce faturayı iptal edin'
- **DB'ye yazılan metinler** "Sabit · değişken" biçimindedir (autoT önek eşleşmesi). Bildirimlerde ve etkinlik kaydının `entity_label`'ında hasta adı yer almaz.
- **Ekran:**
  - Dört dil aynı anda; `auto.{en,de,fa}.json` anahtar sayısı eşit. Araç: `scratchpad/prova/i18n_add.mjs <map.json>`.
  - Koyu tema token'larla (`useInkUI`, `useMobileTokens`).
  - Popup `useInkUI().modalOverlay/modalCard`, mobilde de ortada, dar ekranda dolgu 12.
  - Her yeni düğmede GlassTooltip; ikonlar `core/ui/icons`; emoji yok.
  - Düğme satırı tek satır; sığmazsa "•••".
  - Eylem hatası düğmenin yanında görünür.
- **Lazy rota:** `lazyRoute` ile yüklenen bir modül, ana paketteki bir ekrandan (Özet panoları, `_layout`'lar) statik import edilmez. Gerekirse `React.lazy`.
- **Paylaşılan çalışan kod:** yalnız bu planın adlandırdığı yerlerde değişir.
  - `NewOrderScreen` (Task 12), `create_invoice_from_order` / `create_bulk_invoice` / `fn_generate_monthly_invoices` / `maintain_urgent_surcharge` (Task 6), `order_history` (Task 7).
  - Her biri o görevin onay adımında kullanıcıya ayrıca söylenir.
  - `modules/courier/*` dosyalarına dokunulmaz; yalnız içe aktarılır.
- **Doğrulama:**
  - `npx tsc --noEmit --incremental false` → 0.
  - Paket: `bash /private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/92fed326-e9be-452e-a41e-d705e960980b/scratchpad/search/suite.sh` yeşil. `*.test.mts` dosyalarını kendisi bulur.
- **Commit ve yayın:**
  - Commit yok; ledger tutulur.
  - Web yayını yalnız kullanıcı "deploy" deyince.
  - Edge function yayını (`send-email-notification`) yalnız kullanıcı onayıyla.
- **Canlı hesap salt okunur:** önizlemede kaydet, karar, iptal ya da gönder düğmelerine basılmaz. Görsel kontrol `app/dev/scan-appointments.tsx` demo sayfasında, ağ olmadan yapılır.
- **KVKK:** çıktılarda kişi adı ve tutar yazılmaz.

## Review Focus

1. **Acil siparişe bağlı ücretli tarama.** `maintain_urgent_surcharge` faturadaki satırlar değişince acil ek ücreti yeniden hesaplar. Tarama satırı bu hesaba **girmemeli** (spec 4.8). Test: T6 probe "A".
2. **Para birimi farkı.** Hizmet EUR, siparişin faturası TRY. Tarama siparişin faturasına girmez, sessiz kur çevrimi olmaz; ayrı yoldan faturalanır. Test: T6 probe "P".
3. **Karar değişikliği ve iki kez faturalama.**
   - Kararı geri alınan taramanın taslaktaki satırı silinir.
   - Kesilmiş faturadaki satır varken geri alma reddedilir.
   - Sipariş sonra faturalanınca aynı ücret ikinci kez yazılmaz.

   Test: T6 probe "U" ve "D".
4. **Saat dilimi ve gün sınırı.**
   - Saat dilimi `Europe/Berlin` olan bir lab'da, yaz saati geçiş günü (2026-10-25) ve 23:30 randevusu doğru gün ve dakikaya düşer.
   - Sabah programı yerel tarihe göre toplanır.

   Test: T3 `labLocalParts`/`labLocalToIso` testleri + T8 probe "Z".
5. **Siparişi olmayan aylık klinik.** `monthly_bulk` bir klinikte faturalanmamış iş emri yoktur ama "yalnız tarama" ücreti vardır. Aylık fatura bu kliniği atlamaz. Test: T6 probe "M", aylık döngünün kullandığı yardımcıyla.

---

### Task 1: Şema, bayrak, RLS (SQL)

**Files:**
- Create: `supabase/migrations/20261028130000_tarama_sema.sql` + `supabase/rollbacks/20261028130000_tarama_sema.{down.sql,before.txt}`
- Probe: `scratchpad/tarama/t1_measure.sql`

**Interfaces — Produces:**
- **Bayrak:**
  - `platform_feature_flags`: `('scan_appointments','Tarama randevuları','Ağız içi tarama ve fotogrametri ziyaretleri: randevu, karar, faturalama, program bildirimi', false)`.
  - `lab_feature_flags`: Nexadent → `true`.
- **`scan_appointments`:**
  - `id uuid pk default gen_random_uuid()`
  - `lab_id uuid not null references labs(id) on delete cascade`
  - `clinic_id uuid not null references clinics(id)`
  - `doctor_id uuid null` (doctors.id; FK yok, polimorfizm kuralı)
  - `starts_at timestamptz not null`
  - `duration_min int not null check (duration_min between 15 and 600)`
  - `technician_id uuid not null references profiles(id)`
  - `status text not null default 'planlandi' check (status in ('planlandi','yapildi','kapandi','iptal'))`
  - `source text not null default 'telefon' check (source in ('telefon','whatsapp','yuz_yuze','diger'))`
  - `note text`, `cancel_reason text`
  - `done_at timestamptz`, `done_by uuid references profiles(id)`, `done_note text`
  - `created_by uuid references profiles(id)`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`
  - Index: `(lab_id, starts_at)`, `(technician_id, starts_at)`.
- **`scan_appointment_services`:** `id`, `lab_id`, `appointment_id uuid not null references scan_appointments(id) on delete cascade`, `service_id uuid not null references lab_services(id)`, `equipment_id uuid null references equipment(id) on delete set null`, `unique(appointment_id, service_id)`.
- **`scan_patients`:**
  - `id`, `lab_id`, `appointment_id … on delete cascade`
  - `patient_name text`, `note text`
  - `work_order_id uuid null references work_orders(id) on delete set null`
  - `status text not null default 'karar_bekliyor' check (status in ('karar_bekliyor','kapandi'))`
  - `decision text null check (decision in ('siparise_baglandi','yeni_siparis','yalniz_tarama'))`
  - `decided_by uuid references profiles(id)`, `decided_at timestamptz`, `created_at`
- **`scan_patient_charges`:**
  - `id`, `lab_id`, `scan_patient_id … on delete cascade`, `service_id uuid not null references lab_services(id)`
  - `status text not null default 'beklemede' check (status in ('beklemede','ucretsiz','ucretli'))`
  - `bill_with_order boolean`
  - `price numeric`, `currency text`, `price_source text`
  - `invoice_item_id uuid null references invoice_items(id) on delete set null`
  - `unique(scan_patient_id, service_id)`
  - **Faturalanmış** demek: `status='ucretli' and invoice_item_id is not null`. **Havuz** demek: `status='ucretli' and invoice_item_id is null`. Taslak fatura silinirse satır kendiliğinden havuza döner.
- **Eklemeli sütunlar:**
  - `lab_services.scan_kind text null check (scan_kind in ('intraoral','photogrammetry'))`, `lab_services.scan_free_if_order boolean not null default true`.
  - `equipment.scan_kind text null` (aynı check).
  - `clinics.geo_lat numeric`, `clinics.geo_lng numeric`, `clinics.geo_addr_hash text`, `clinics.geo_at timestamptz`.
  - `lab_settings.scan_hours_start time default '09:00'`, `scan_hours_end time default '20:00'`, `scan_workdays int[] default '{1,2,3,4,5,6}'`, `scan_default_minutes int default 90`, `scan_buffer_minutes int default 10`, `scan_morning_at time default '08:00'`, `scan_evening_at time default '18:00'`, `scan_technician_ids uuid[] default '{}'` (boş = tüm teknisyenler).
- **Nexadent tohum verisi:**
  - "Intraoral Tarama hizmeti" → `scan_kind='intraoral'`.
  - "Photogrammetri Hizmeti" (iki satır) → `scan_kind='photogrammetry'`.
  - `scan_free_if_order` varsayılanda kalır; kullanıcı ayarlardan seçer.
- **Yardımcılar** (STABLE DEFINER; `revoke all from public, anon`, `grant execute to authenticated`): `_scan_enabled(uuid)`, `_scan_can_manage()`, `_scan_can_view()`. Tanımlar Global Constraints'te.
- **RLS:** dört tabloda açık.
  - `scan_appointments` SELECT: `lab_id = get_my_lab_id() and _scan_enabled(lab_id) and (_scan_can_view() or technician_id = auth.uid())`.
  - Çocuk tablolar SELECT: `exists(select 1 from scan_appointments a where a.id = <appointment_id>)`. INVOKER alt sorgu olduğu için üst RLS uygulanır. `scan_patient_charges` → `scan_patients` → `scan_appointments` zinciriyle.
  - `revoke insert, update, delete on <4 tablo> from authenticated, anon`.

- [ ] **Step 1:** `.before.txt` yazılır: dört eklemeli tablonun sütunları, `platform_feature_flags` satırları, yeni tabloların yokluğu. `.down.sql`: tablolar, yardımcılar, sütunlar ve bayrak satırları düşer.
- [ ] **Step 2: Probe yaz** (`t1_measure.sql`). Senaryolar:
  - **B: bayrak.** Sahip kimliğiyle `_scan_enabled(lab)` = t.
  - **R: RLS.** Sahip lab'ında bir randevu `insert` edilir (DEFINER değil, postgres olarak). Görme durumu:
    - sahip → görür;
    - atanmış teknisyen → görür;
    - aynı lab'dan atanmamış teknisyen → görmez;
    - klinik yöneticisi → görmez;
    - hekim → görmez.
  - **W: yazma.** Sahip kimliğiyle `insert into scan_appointments` → 42501.
  - **N:** `lab_services` tohumu: intraoral 1 ve photogrammetry 2 satır.
- [ ] **Step 3: Probe çalıştır.** Beklenen:
  - ÖNCE: tablolar yok ("yok").
  - SONRA: yukarıdaki sonuçlar.
  - GERİ ALMA = ÖNCE.
- [ ] **Step 4: Kullanıcı onayı.** Söylenecek: yeni tablolar, eklemeli sütunlar, bayrak yalnız Nexadent'te açık; mevcut ekranlar etkilenmez.
- [ ] **Step 5:** Uygula ve canlıda ölç. Bakılacaklar: tablolar ve RLS açık; bayrak; tohum sayıları; `clinics`/`lab_services`/`equipment` satır sayıları değişmemiş. Ledger satırı yazılır.

### Task 2: Kayıt RPC'leri (SQL)

**Files:**
- Create: `supabase/migrations/20261028131000_tarama_kayit_rpc.sql` + down/before
- Probe: `scratchpad/tarama/t2_measure.sql`

**Interfaces:**
- **Consumes (Task 1):** tablolar, yardımcılar.
- **Produces:** hepsi `SECURITY DEFINER`, `search_path public`, `revoke from public, anon`, `grant execute to authenticated`. Hatalar `raise exception '<Global Constraints metni>' using errcode='P0001'`.
  - **`scan_appt_save(p_id uuid, p_clinic uuid, p_doctor uuid, p_starts_at timestamptz, p_minutes int, p_technician uuid, p_source text, p_note text, p_services jsonb) returns uuid`**
    - `p_services` biçimi: `[{"service_id":uuid,"equipment_id":uuid|null}]`.
    - `p_id` null ise oluşturur; değilse günceller. Güncelleme yalnız `planlandi`'de.
    - Yetki: `_scan_can_manage()`.
    - Doğrular: klinik ve teknisyen aynı lab'da; hizmetler aynı lab'da ve `scan_kind` dolu; cihaz verildiyse `equipment.scan_kind` = hizmetin `scan_kind`'ı; süre 15–600.
    - Hizmetler değişince eklenen ve çıkarılan satırlar eşitlenir. Çıkarılan hizmet hasta satırlarında kullanılıyorsa o `scan_patient_charges` satırları da silinir.
    - Teknisyene uygulama içi bildirim yazar. Koşullar: oluşturma, saat değişikliği, teknisyen değişikliği.
      - Satır: `notifications(user_id, lab_id, category='scan_schedule', title, body, resource_type='scan_appointment', action_url, payload)`.
      - Başlık: 'Yeni tarama randevusu · <klinik>' ya da 'Tarama randevusu değişti · <klinik>'.
      - Gövde: yerel 'GG.AA SS:DD'.
      - pg_net çağrısı yok.
  - **`scan_patient_save(p_id uuid, p_appointment uuid, p_patient_name text, p_service_ids uuid[], p_note text, p_work_order uuid) returns uuid`**
    - Randevu `planlandi` ya da `yapildi`, satır `karar_bekliyor` olmalı.
    - `p_service_ids` boş olamaz ve randevunun hizmetlerinin alt kümesidir.
    - `p_work_order` verildiyse aynı lab'da ve aynı klinikte olmalı. Siparişin kliniği sipariş ekranlarının yolundan çözülür (`doctor_id` → `doctors.clinic_id`, ya da `profiles.clinic_id`).
    - `scan_patient_charges` satırlarını `beklemede` olarak eşitler.
    - Yetki: `_scan_can_manage()` ya da atanmış teknisyen.
  - **`scan_patient_delete(p_id uuid) returns void`**: yalnız karar verilmemiş satır. Randevu `yapildi` iken son satır silinemez ('En az bir hasta kalmalı').
  - **`scan_appt_mark_done(p_id uuid, p_note text) returns void`**: `planlandi` → `yapildi`.
    - En az bir hasta satırı olmalı.
    - Her satırda `length(btrim(coalesce(patient_name,''))) >= 2`.
    - `done_at`, `done_by` ve `done_note` yazılır.
    - Yetki: manage ya da atanmış teknisyen.
  - **`scan_appt_undo_done(p_id uuid) returns void`**: `yapildi` → `planlandi`. Hiçbir satırda karar yoksa yapılabilir.
  - **`scan_appt_cancel(p_id uuid, p_reason text) returns void`**: `planlandi` → `iptal`, neden en az 3 karakter. Teknisyene 'Tarama randevusu iptal edildi · <klinik>' bildirimi gider.
  - **`scan_set_clinic_geo(p_clinic uuid, p_lat numeric, p_lng numeric, p_addr_hash text) returns void`**: klinik aynı lab'da olmalı; `_scan_can_view()` ya da teknisyen. `geo_at=now()` yazılır.
  - **Etkinlik kaydı:** her yazma `log_activity(p_action, 'scan_appointment', <randevu id>, '<klinik> · <GG.AA SS:DD>', p_metadata)` çağırır. Değişiklikte `p_metadata`, `starts_at` ve `technician_id`'nin eski ve yeni değerlerini taşır; ertelemenin eski tarihi böyle kalır (spec 4.1). Eylemler: 'Tarama randevusu oluşturdu', 'Tarama randevusunu değiştirdi', 'Tarama randevusunu iptal etti', 'Tarama yapıldı olarak işaretledi', 'Tarama işaretini geri aldı', 'Taramaya hasta ekledi', 'Tarama hastasını düzeltti', 'Tarama hastasını sildi'.
  - **Eş zamanlılık:** değişen randevu satırı `for update` ile kilitlenir.

- [ ] **Step 1:** `.before.txt` (fonksiyonların yokluğu). `.down.sql` fonksiyonları düşer.
- [ ] **Step 2: Probe yaz** (`t2_measure.sql`; kimlik sahip, teknisyen ya da klinik yöneticisi). Senaryolar:
  - **C: oluştur.** Sahip `scan_appt_save` → id döner, `status='planlandi'`. Teknisyene bir `scan_schedule` bildirimi düşer. `activity_logs`'a 'Tarama randevusu oluşturdu' satırı yazılır.
  - **V: doğrulama.** Şunların her biri beklenen metinle reddedilir:
    - başka lab'ın kliniği;
    - `scan_kind` boş hizmet;
    - fotogrametri hizmetine intraoral cihaz;
    - 10 dk süre.
  - **T: teknisyen.**
    - Atanmış teknisyen `scan_patient_save` → geçer.
    - Atanmamış teknisyen → 'Bu işlem için yetkiniz yok'.
    - Teknisyen `scan_appt_save` → 'Bu işlem için yetkiniz yok'.
  - **D: yapıldı.**
    - Hastasız `mark_done` → 'Tarama yapıldı demek için en az bir hasta ekleyin'.
    - Adı 'A' olan hastayla → 'Her hastanın adını yazın'.
    - Doğru hastayla → `yapildi`.
    - `undo_done` → `planlandi`.
  - **X: iptal.**
    - `yapildi` iken iptal → 'Yalnız planlanmış randevu değiştirilebilir'.
    - Neden 'ab' → 'İptal nedenini yazın'.
  - **K: klinik yöneticisi.** Her RPC → 'Bu işlem için yetkiniz yok'.
  - **H: hizmet alt kümesi.** Randevuda olmayan hizmet → 'Hastanın hizmeti randevunun hizmetlerinden seçilmeli'.
- [ ] **Step 3: Probe çalıştır.** Beklenen: ÖNCE "fonksiyon yok"; SONRA yukarıdaki sonuçlar; GERİ ALMA = ÖNCE.
- [ ] **Step 4: Kullanıcı onayı.**
- [ ] **Step 5:** Uygula, canlıda ölç (fonksiyon listesi, yetki, `has_function_privilege`). Ledger.

### Task 3: Saf model I — saat, doğrulama, çakışma (istemci)

**Files:**
- Create: `modules/scans/scanModel.ts`, `modules/scans/scanModel.test.mts`

**Interfaces — Produces** (`scanModel.ts`; React ve Supabase bağımlılığı yok):
- **Tipler ve sabitler:**
  - `export type ScanKind = 'intraoral' | 'photogrammetry'`
  - `export type ApptStatus = 'planlandi' | 'yapildi' | 'kapandi' | 'iptal'`
  - `export type Decision = 'siparise_baglandi' | 'yeni_siparis' | 'yalniz_tarama'`
  - `export const SOURCES = ['telefon','whatsapp','yuz_yuze','diger'] as const`
  - `export const SOURCE_LABEL: Record<typeof SOURCES[number], string>`
  - `export const CANCEL_REASONS = ['Hasta gelmedi','Klinik iptal etti','Lab iptal etti','Diğer'] as const`
  - `export const WINDOWS = { sabah: [540, 720], ogle: [720, 900], aksam: [900, 1200] } as const` (yerel dakika)
  - `export interface ScanSettings { hoursStart: number; hoursEnd: number; workdays: number[]; defaultMinutes: number; bufferMinutes: number }` (dakika cinsinden; `parseScanSettings(row)` `lab_settings` satırından üretir, NULL'da Global Constraints varsayılanları)
  - `export interface ApptBlock { id: string; clinicId: string; technicianId: string; equipmentIds: string[]; startMin: number; minutes: number; status: ApptStatus }` (`startMin` lab-yerel, günün dakikası)
  - `export type Travel = { minutes: number; estimated: boolean } | null`
  - `export type TravelFn = (from: string /*clinicId ya da 'LAB'*/, to: string, atMin: number) => Travel`
  - `export type Warning = { kind: 'tech_overlap' | 'device_overlap' | 'outside_hours' | 'no_location'; otherId?: string } | { kind: 'late_from_prev' | 'late_to_next' | 'late_from_lab'; otherId?: string; needMin: number; haveMin: number; estimated: boolean }`
- **Fonksiyonlar:**
  - `export function labLocalParts(iso: string, tz: string): { date: string; weekday: number; minutes: number }` (`Intl.DateTimeFormat`; weekday 1=Pzt…7=Paz)
  - `export function labLocalToIso(date: string, minutes: number, tz: string): string` (o yerel an için UTC ISO; dilim farkı `Intl` ile, yaz saati geçişini doğru ele alır)
  - `export function parseScanSettings(row: Record<string, any> | null): ScanSettings`
  - `export function overlaps(a: { startMin: number; minutes: number }, b: { startMin: number; minutes: number }): boolean` (yarı açık aralık; uç uca değmek çakışma değildir)
  - `export function apptWarnings(c: ApptBlock, sameDay: ApptBlock[], travel: TravelFn, s: ScanSettings, weekday: number): Warning[]`
    - Spec 4.4: kontroller 1–6.
    - Yalnız `status='planlandi'` olan diğerleri ve `id !== c.id` sayılır.
    - Önceki: aynı teknisyenin bitişi adayın başlangıcından önce ya da ona eşit olan en geç randevusu. Sonraki: başlangıcı adayın bitişinden sonra ya da ona eşit olan en erken randevusu. Adayla kesişenler önceki ya da sonraki sayılmaz, yalnız çakışma üretir.
    - `need = travel + bufferMinutes`, `have = boşluk`. `need > have` ise uyarı.
    - Aynı klinik → `need = 0`; yol da yol payı da uygulanmaz.
    - Günün ilki için `from='LAB'`, `have = c.startMin - s.hoursStart`.
    - Yol bilinmiyorsa (`null`) yol uyarısı yerine bir kez `no_location`.
    - Gün `workdays`'te değilse ya da aralık saatlerin dışına taşıyorsa `outside_hours`.
  - `export function warningText(w: Warning, t: (s: string) => string): string`. Parçalar:
    - `tech_overlap` → t('Teknisyenin bu saatte başka randevusu var')
    - `device_overlap` → t('Cihaz bu saatte başka randevuda')
    - `late_from_prev` → `${t('Önceki randevudan yola')} ${need} ${t('dk gerekiyor')}, ${have} ${t('dk açık')}`
    - `late_to_next` → `${t('Sonraki randevuya yola')} …` (aynı devam)
    - `late_from_lab` → `${t("Lab'dan yola")} …`
    - `estimated` ise sonuna ` · ${t('tahmini')}`
    - `outside_hours` → t('Tarama saatleri dışında')
    - `no_location` → t('Klinik konumu bilinmiyor, yol süresi hesaplanmadı')
  - `export function canMarkDone(patients: { patient_name: string | null }[]): string | null`: hata metni ya da null; sunucu metinleriyle aynı.

- [ ] **Step 1: Failing test yaz** (`scanModel.test.mts`):
  - `labLocalParts('2026-10-28T06:00:00Z','Europe/Istanbul')` → `{date:'2026-10-28', weekday:3, minutes:540}`.
  - `labLocalParts('2026-10-25T21:30:00Z','Europe/Berlin')` → `{date:'2026-10-25', weekday:7, minutes:1350}` (yaz saati bitti, UTC+1).
  - `labLocalToIso('2026-10-25', 1410, 'Europe/Berlin')` → `'2026-10-25T22:30:00.000Z'`.
  - `labLocalToIso('2026-10-24', 600, 'Europe/Berlin')` → `'2026-10-24T08:00:00.000Z'` (UTC+2).
  - `parseScanSettings(null)` → `{hoursStart:540, hoursEnd:1200, workdays:[1,2,3,4,5,6], defaultMinutes:90, bufferMinutes:10}`. `parseScanSettings({scan_hours_start:'08:30:00'})`.hoursStart === 510.
  - `overlaps({startMin:600,minutes:90},{startMin:690,minutes:30})` === false. 600+90 ile 680 → true.
  - **apptWarnings** (`s` = varsayılan, weekday 3; travel = A↔B 30 dk tahmini değil, LAB→A 20 dk, aynı klinik 0):
    - Teknisyen T1'de A klinik 600–690 var. Aday B 700/90 → `late_from_prev` `{needMin:40, haveMin:10, estimated:false}`.
    - Aday A 690/60 (aynı klinik) → uyarı yok.
    - Aday B 740/60 → uyarı yok (40 ≤ 50).
    - Aday 650/60, aynı teknisyen → `tech_overlap`. Başka teknisyen ama aynı cihaz `E1` → yalnız `device_overlap`.
    - Günün ilki A 545/45 → yalnız `late_from_lab` `{needMin:30, haveMin:5}`. Sonraki A 600, aynı klinik, uyarı yok.
    - Aday 1170/60 → `outside_hours`. weekday 7 → `outside_hours`.
    - travel `null` döndüren fn → `[{kind:'no_location'}]` (bir kez).
    - İptal edilmiş çakışan randevu sayılmaz.
  - **warningText** (kimlik çevirmenle): `{kind:'late_from_prev',needMin:35,haveMin:20,estimated:true}` → `'Önceki randevudan yola 35 dk gerekiyor, 20 dk açık · tahmini'`.
  - **canMarkDone:** `[]` → 'Tarama yapıldı demek için en az bir hasta ekleyin'; `[{patient_name:' A '}]` → 'Her hastanın adını yazın'; `[{patient_name:'Ay'}]` → null.
- [ ] **Step 2:** `node --test modules/scans/scanModel.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** `scanModel.ts`'i yaz.
- [ ] **Step 4:** Test → PASS. `tsc` → 0. Paket yeşil.

### Task 4: Saf model II — öneri, yol tahmini, adres (istemci)

**Files:**
- Modify: `modules/scans/scanModel.ts`, `modules/scans/scanModel.test.mts`

**Interfaces:**
- **Consumes (Task 3):** `ApptBlock`, `TravelFn`, `ScanSettings`, `overlaps`, `apptWarnings`.
- **Produces:**
  - `export function estimateMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number`: haversine km × 1,4 ÷ 30 × 60, yukarı yuvarlanır, en az 10.
  - `export function slotOfDay(min: number): 'sabah' | 'ogle' | 'aksam'` (`WINDOWS`'a göre; 540'tan önce 'sabah', 1200'den sonra 'aksam'; önbellek anahtarı için)
  - `export function addrHash(line: string): string`: küçük harf, boşluk sıkıştırılmış, FNV-1a 32 bit hex. Senkron ve kripto gerektirmez.
  - `export interface SuggestInput { clinicId: string; minutes: number; weekday: number; window: [number, number] | null; requiredKinds: ScanKind[]; technicians: { id: string }[]; devices: { id: string; kind: ScanKind }[]; dayAppts: ApptBlock[]; travel: TravelFn; settings: ScanSettings; stepMin?: number; limit?: number }`
  - `export interface Slot { startMin: number; technicianId: string; equipmentIds: string[]; prev: Travel; next: Travel; idleMin: number; inWindow: boolean }`
  - `export function suggestSlots(i: SuggestInput): Slot[]`
    - `hoursStart`'tan `hoursEnd - minutes`'a kadar `stepMin` (15) adımla taranır.
    - Gün `workdays`'te değilse `[]`.
    - Her teknisyen için: kendi randevularıyla çakışmayan ve `apptWarnings` yol uyarısı (`late_*`) ile `tech_overlap` üretmeyen saatler alınır.
    - Her `requiredKinds` türü için o aralıkta boş bir cihaz atanır, ilk boş olan. Tür için hiç cihaz tanımlı değilse cihazsız geçer. Tanımlı ama hepsi doluysa saat elenir.
    - `idleMin` iki terimin toplamıdır:
      - Önceki terim: `startMin − (öncekinin bitişi + yol + yol payı)`. Önceki yoksa `hoursStart + LAB yolu + yol payı` kullanılır.
      - Sonraki terim: `sonrakinin başı − (bitiş + yol + yol payı)`. Sonraki yoksa 0.
      - Aynı klinikte yol ve yol payı 0'dır.
    - `inWindow`: `window[0] ≤ startMin < window[1]`.
    - Sıralama: `inWindow` önce → `idleMin` artan → teknisyenin o günkü randevu sayısı artan → `startMin` artan.
    - Aynı `startMin` için yalnız en iyi teknisyen kalır.
    - `limit` (5) kadar döner.
    - `null` yol, `no_location` kabul edilip saat **elenmez**.
  - `export function clinicAddressLine(address: string | null, countryLabel: (c: string) => string): string | null`: `core/util/formatAddressCore.ts` `formatAddressWith` sarmalanır; boş ya da yalnız boşluk → `null`.

- [ ] **Step 1: Failing test ekle:**
  - `estimateMinutes` iki aynı nokta → 10.
  - `(41.0,29.0)` → `(41.0,29.1)` (~8,4 km) → `Math.ceil(8.4*1.4/30*60)` aralığında 23–24.
  - `slotOfDay(500)==='sabah'`, `slotOfDay(800)==='ogle'`, `slotOfDay(1300)==='aksam'`.
  - `addrHash('  Ataşehir  İstanbul ') === addrHash('ataşehir istanbul')`. Farklı metin → farklı.
  - **suggestSlots.** Ortak yol: `LAB→her klinik 20`, `A↔B 30`, aynı klinik 0. Ayarlar varsayılan, weekday 3.
    - Tek teknisyen T1, gün boş, `minutes:90`, window null → `startMin`'ler `[570,585,600,615,630]` (540+20+10 = 570; `idleMin` 0,15,30…).
    - T1'de A 600–690 var, aday klinik A → ilk öneri 690, `idleMin` 0. 600'den önce saat yok, çünkü 570+90 > 600.
    - Aday klinik B → 690 ve 705 yok. İlk öneri 735: 690+30+10 = 730, 15 dk adımla 735, `idleMin` 5.
    - `window: WINDOWS.aksam` → ilk öneri `inWindow:true` ve `startMin ≥ 900`.
    - **Teknisyen eşitliği:** T1'de A 1110–1200 var, T2 boş, aday klinik A, `window:[1020,1035]`. 1020'de iki teknisyenin `idleMin`'i eşit (450). Sonuçta `startMin 1020` için `technicianId:'T2'` (randevu sayısı 0 < 1).
    - `requiredKinds:['photogrammetry']`, tek cihaz E2 başka teknisyenin 600–690 randevusunda → sonuçların hiçbiri `overlaps` ile 600–690'a değmez. Tür için hiç cihaz yoksa (`devices: []`) öneriler cihazsız gelir (`equipmentIds: []`).
    - weekday 7 → `[]`.
  - `clinicAddressLine('{"il":"İstanbul","ilce":"Ataşehir"}', c=>c)` boş değil ve 'Ataşehir' içerir. `clinicAddressLine('   ', c=>c)` → null.
- [ ] **Step 2:** Test → FAIL (fonksiyonlar yok).
- [ ] **Step 3:** Fonksiyonları yaz.
- [ ] **Step 4:** Test → PASS. `tsc` → 0. Paket yeşil.

### Task 5: API, yol servisi ve sözlük (istemci)

**Files:**
- Create: `modules/scans/types.ts`, `modules/scans/api.ts`, `modules/scans/travel.ts`, `core/maps/googleMaps.ts`
- Modify: `core/store/permissionStore.ts` (FEATURES), `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** Task 2 RPC'leri, Task 3–4 model.
- **Produces:**
  - **`types.ts`:** `ScanAppointmentRow` (`scan_appointments` sütunları + `clinic: { id; name; address; geo_lat; geo_lng; geo_addr_hash }` + `services: { service_id; equipment_id; name; scan_kind }[]` + `patients: ScanPatientRow[]`). `ScanPatientRow` (`scan_patients` sütunları + `charges: { service_id; status; price; currency; invoice_item_id }[]`).
  - **`api.ts`:**
    - `fetchScanDay(labId: string, fromIso: string, toIso: string): Promise<ScanAppointmentRow[]>` (iptal hariç tek sorgu, iç içe select)
    - `fetchScanAppointment(id: string): Promise<ScanAppointmentRow | null>`
    - `fetchPendingDecisions(labId: string): Promise<ScanAppointmentRow[]>`: `status='yapildi'` olanlar ile saati geçmiş `planlandi` olanlar.
    - `fetchScanSettings(labId: string): Promise<ScanSettings>`
    - `fetchScanServices(labId: string): Promise<{ id: string; name: string; scan_kind: ScanKind; scan_free_if_order: boolean; currency: string | null }[]>`
    - `fetchScanDevices(labId: string): Promise<{ id: string; name: string; kind: ScanKind }[]>`
    - `fetchScanTechnicians(labId: string, poolIds: string[]): Promise<{ id: string; name: string }[]>`
    - RPC sarmalayıcıları; her biri `Promise<{ ok: boolean; id?: string; error?: string }>`, hata `autoT`'lenmiş: `saveAppointment(input)`, `savePatient(input)`, `deletePatient(id)`, `markDone(id, note)`, `undoDone(id)`, `cancelAppointment(id, reason)`.
    - Task 6'nınkiler aynı dosyaya Task 6'da eklenir.
  - **`core/maps/googleMaps.ts`:**
    - `export function loadGoogleMapsOnce(key: string): Promise<any>`: `window.google?.maps` varsa onu döner. Yoksa kendi `<script>`'ini ekler; dil `localeTag()`'den. Kurye dosyasına dokunulmaz.
    - `export async function googleDriveMinutes(g: any, from: GeoCoord, to: GeoCoord, departAt: Date): Promise<number | null>`: DistanceMatrixService, `drivingOptions.departureTime`, `duration_in_traffic` yoksa `duration`.
    - `export async function googleGeocode(g: any, line: string): Promise<GeoCoord | null>`
  - **`travel.ts`:**
    - `export async function ensureClinicGeo(clinic): Promise<GeoCoord | null>`
      - Önce `clinicAddressLine` + `addrHash` hesaplanır. Saklı hash tutuyorsa saklı koordinat kullanılır.
      - Tutmuyorsa koordinat çıkarılır: web'de anahtar varsa `googleGeocode`, olmazsa `geocodeTR` (`modules/courier/geocoder.ts`, içe aktarılır).
      - Sonra `scan_set_clinic_geo` çağrılır.
    - `export async function ensureLabGeo(labId): Promise<GeoCoord | null>`: `labs.location_lat/lng`; boşsa lab adresinden aynı yolla çıkarılır, saklanmaz.
    - `export async function buildTravelFn(points: Record<string, GeoCoord | null>, date: string, tz: string): Promise<TravelFn>`
      - Gereken bütün çiftler için web+anahtar varsa Google'dan önceden çekilir (her çift için `slotOfDay` saatleri: 10:00, 13:00, 17:00 yerel).
      - Sonuç senkron `TravelFn`'dir. Google başarısızsa ya da native ise `estimateMinutes` kullanılır, `estimated:true`.
      - Bellek önbelleği anahtarı `from|to|slot`, oturum boyunca.
      - Anahtar `get_maps_browser_key` RPC'sinden okunur.
  - **FEATURES:** `{ key: 'scan_appointments', category: 'orders', label: 'Tarama Randevuları', hasView: true, hasManage: true, desc: 'Klinikteki tarama ziyaretlerini görür; yönetme randevu, iptal ve karar vermeyi kapsar.' }`.

- [ ] **Step 1:** `travel.ts` için saf olmayan kısımlar test edilmez. Ancak `buildTravelFn`'in yedek yolu bir test alır: `modules/scans/travel.test.mts`.
  - `buildTravelFn({A:{lat:41,lng:29},B:null},'2026-10-28','Europe/Istanbul')` (Google yok, `globalThis.window` yok).
  - `fn('A','A',600)` → `{minutes:0, estimated:false}`.
  - `fn('LAB','B',600)` → `null`.
  - `fn('A','B',600)` → `null`.

  Test, `travel.ts`'in Supabase'i yalnız fonksiyon içinde dinamik içe aktarmasını şart koşar.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Dosyaları yaz.
  - Sözlüğe dört dilde girenler: Global Constraints'teki sunucu hata metinleri, `warningText` parçaları, kaynak ve iptal etiketleri, 'Bu gün için uygun saat bulunamadı', FEATURES etiketi ve açıklaması.
  - Farsça için persian-writing kuralları geçerlidir: ZWNJ, Persian rakam yok (sayılar değişken).
- [ ] **Step 4:** Test → PASS. `tsc` → 0. Paket yeşil. Üç sözlükte anahtar sayısı eşit.

### Task 6: Karar ve faturalama (SQL)

**Files:**
- Create: `supabase/migrations/20261028132000_tarama_karar_fatura.sql` + down/before
- Probe: `scratchpad/tarama/t6_measure.sql`
- Modify (istemci): `modules/scans/api.ts` (`decide`, `undoDecision`)

**Interfaces:**
- **Consumes:** Task 1–2. Mevcut fonksiyonlar: `resolve_item_price(p_lab_id, p_service_id, p_clinic_id, p_order_date) → (price, currency, source, source_id)`, `create_invoice_from_order(uuid)`, `create_bulk_invoice(uuid, uuid[], int, text)`, `fn_generate_monthly_invoices()`, tetikleyici fonksiyonu `maintain_urgent_surcharge`, `clinics.billing_mode`.
- **Produces:**
  - **`scan_decide(p_patient_ids uuid[], p_decision text, p_work_order uuid) returns jsonb`**
    - Yetki: `_scan_can_manage()`, değilse 'Karar yalnız admin ya da yöneticiye açık'.
    - Satırlar `for update` ile kilitlenir. Kararlı satır varsa → 'Bu tarama zaten karara bağlanmış'.
    - `siparise_baglandi` ve `yeni_siparis` yalnız tek satırla ve `p_work_order` ile çağrılır. Sipariş aynı klinikte olmalı.
    - Toplu çağrı yalnız `yalniz_tarama` içindir.
    - Her ücret satırı için fiyat `resolve_item_price(lab, service, clinic, tarama tarihi)` ile çözülür ve yazılır.
    - Ücret yönlendirmesi `_scan_route_charge` ile yapılır (spec 4.8 tablosu):
      1. Bağlı karar ve hizmetin `scan_free_if_order` açık → `status='ucretsiz'`.
      2. Bağlı ve ücretli. Siparişin fatura para birimi tarama para birimine eşit olmalı; para birimi `create_invoice_from_order`'ın kuralıyla bulunur (en büyük kalem tutarının para birimi, yoksa lab varsayılanı).
         - Siparişin `taslak` faturası varsa → `_scan_bill_charges(o taslak, [id])`.
         - Siparişin faturası yoksa → `status='ucretli', bill_with_order=true`.
         - Siparişin faturası kesilmişse ya da para birimi farklıysa → 3. yola düşer.
      3. Ayrı faturalanır: `status='ucretli', bill_with_order=false`.
         - Klinik `per_order` ise aynı çağrıdaki ayrı satırlar para birimine göre gruplanır. Her grup için `_scan_new_draft(clinic, currency)` ile tek taslak açılır ve satırlar ona yazılır.
         - `monthly_bulk` ise satır havuzda kalır.
    - Satır `status='kapandi'` olur; `decision`, `work_order_id`, `decided_by` ve `decided_at` yazılır.
    - Randevunun bütün satırları kapandıysa randevu `kapandi` olur.
    - `log_activity('Tarama kararı verdi', 'scan_appointment', appt, label, jsonb_build_object('work_order_id', p_work_order, 'decision', p_decision, 'patients', n))` çağrılır.
    - Dönüş: `{"invoices":[uuid…], "pooled":n, "free":n}`.
  - **`scan_undo_decision(p_patient uuid) returns void`**
    - Satırın faturalanmış bir ücreti `taslak` olmayan bir faturadaysa → 'Bu tarama kesilmiş bir faturada; önce faturayı iptal edin'.
    - Taslaktaki satırlar silinir. Satırı kalmayan ve `work_order_id`'si boş taslak fatura da silinir.
    - Ücretler `beklemede`'ye döner; `price`, `currency` ve `bill_with_order` NULL olur. Satır `karar_bekliyor` olur, `decision` NULL. Randevu `yapildi` olur.
    - Kaydedilen eylem: 'Tarama kararını geri aldı'.
  - **`_scan_bill_charges(p_invoice uuid, p_charge_ids uuid[]) returns int`**
    - Her ücret için `invoice_items(invoice_id, description, quantity, unit_price, sort_order)` satırı yazılır.
    - `description = '<hizmet adı> · <GG.AA.YYYY>'`, `quantity=1`, `unit_price=price`; `sort_order` mevcut en büyüğün bir fazlası.
    - Ücrete `invoice_item_id` yazılır.
    - Fatura para birimi farklı olan ücret atlanır. Dönüş: yazılan satır sayısı.
  - **`_scan_new_draft(p_clinic uuid, p_currency text) returns uuid`**: `invoices`'a `create_bulk_invoice`'ın taslak kuralıyla satır ekler (`status='taslak'`, vade kliniğin `default_payment_terms_days`'i ya da 30, `work_order_id` NULL).
  - **`_scan_pool_charge_ids(p_clinic uuid, p_currency text) returns uuid[]`**: `status='ucretli' and invoice_item_id is null and bill_with_order=false`.
  - **Mevcut fonksiyon değişiklikleri** (canlı tanım üzerine, en küçük ekleme):
    - **`create_invoice_from_order`:** acil ek ücret bloğundan **sonra** `_scan_bill_charges(v_invoice_id, <bu siparişin bill_with_order=true havuzdaki ücretleri>)`.
    - **`create_bulk_invoice`:** faturaya bağlanan siparişlerin `bill_with_order=true` ücretleri ve kliniğin `_scan_pool_charge_ids(clinic, fatura para birimi)` ücretleri eklenir.
      - Canlı tanım boş dizi ile çağrıda hata veriyorsa dokunulmaz. O durumda aylık döngü 3. maddedeki yolu kullanır.
    - **`fn_generate_monthly_invoices`:** döngü, `v_unbilled_work_orders`'ı olmayan ama `monthly_bulk` olup havuzda ücreti bulunan klinikleri de dolaşır.
      - Bu klinikler için her para birimine bir `_scan_new_draft` + `_scan_bill_charges` yapılır.
      - Bu iş `_scan_monthly_pool_invoices(p_clinic uuid) returns uuid[]` yardımcısına konur. Probe bu yardımcıyı doğrudan çağırır.
    - **`maintain_urgent_surcharge`:** canlı tanım okunur. Ara toplam hesabından tarama satırları dışlanır: `id not in (select invoice_item_id from scan_patient_charges where invoice_item_id is not null)`. Acil ek ücret böylece eski değerinde kalır.
  - **İstemci (`api.ts`):** `decide(patientIds: string[], decision: Decision, workOrderId: string | null): Promise<{ ok: boolean; invoices?: string[]; error?: string }>`, `undoDecision(patientId: string): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1:** `.before.txt`'ye dört mevcut fonksiyonun canlı `pg_get_functiondef` çıktısı yazılır. `.down.sql` onları birebir geri yükler ve yeni fonksiyonları düşer.
- [ ] **Step 2: Probe yaz** (`t6_measure.sql`). Hazırlık:
  - Randevu, iki hasta ve ücret satırları postgres olarak eklenir.
  - Hizmet fiyatı katalogda bilinen bir değere `update` edilir; geri alınır.
  - Kliniğin `billing_mode` ve gerekirse `clinic_price_overrides` değeri senaryoya göre ayarlanır.

  Senaryolar (kimlik sahip):
  - **F: ücretsiz.** `scan_free_if_order=true`, mevcut siparişe bağla → ücret `ucretsiz`, fatura satırı yok.
  - **O: siparişle.** `scan_free_if_order=false`, faturası olmayan sipariş → `ucretli, bill_with_order=true`, satır yok.
    - Ardından `create_invoice_from_order(sipariş)` → taslakta tarama satırı **bir** kez var, `invoice_item_id` dolu.
    - İkinci `create_bulk_invoice` çağrısında yeniden yazılmaz (**D**).
  - **A: acil.** Siparişin `is_urgent=true` ve lab `urgent_surcharge_rate>0`. Faturadaki acil ek ücret satırının tutarı, tarama satırı eklenmeden önceki tutarıyla aynıdır.
  - **P: para birimi.** Tarama EUR, siparişin kalemleri TRY → `bill_with_order=false`. `per_order` klinikte EUR'luk ayrı taslak fatura oluşur.
  - **S: yalnız tarama.**
    - `per_order` klinik, toplu iki satır → tek taslak fatura, iki satır.
    - `monthly_bulk` klinik → fatura yok, `_scan_pool_charge_ids` iki id döner.
  - **M: aylık.** `monthly_bulk` klinik, faturalanmamış iş emri yok, havuzda bir ücret → `_scan_monthly_pool_invoices(klinik)` bir taslak döner, havuz boşalır.
  - **C: klinik fiyatı.** `clinic_price_overrides` ile anlaşmalı fiyat → ücretin `price` değeri o fiyattır, `price_source='clinic_override'`.
  - **U: geri alma.**
    - S'deki taslağa bağlı satırda `scan_undo_decision` → taslak satırları silinir, boş taslak silinir, hasta `karar_bekliyor` olur.
    - Faturayı `status='kesildi'` (canlıdaki kesilmiş durum değeri `.before`'tan okunur) yapıp geri alma → 'Bu tarama kesilmiş bir faturada; önce faturayı iptal edin'.
  - **Y: yetki.** Teknisyen `scan_decide` → 'Karar yalnız admin ya da yöneticiye açık'.
  - **K: kararlı.** Aynı satıra ikinci `scan_decide` → 'Bu tarama zaten karara bağlanmış'.
- [ ] **Step 3: Probe çalıştır.** Beklenen: ÖNCE "fonksiyon yok"; SONRA senaryolar; GERİ ALMA'da dört mevcut fonksiyonun md5'i `.before` ile aynı.
- [ ] **Step 4: Kullanıcı onayı.** Dört mevcut fatura fonksiyonuna yapılan eklemeler tek tek söylenir. Tarama olmayan faturalar için davranış değişmez: probe'daki tarama-sız sipariş faturası, ÖNCE ve SONRA'da aynı satırları üretir.
- [ ] **Step 5:** Uygula, canlıda ölç: md5'ler, `has_function_privilege`, son 30 günün taslak fatura sayısı değişmemiş. Ledger.
- [ ] **Step 6 (istemci):** `decide`/`undoDecision` yazılır. `tsc` → 0.

### Task 7: Sipariş iptali, Sipariş Geçmişi, dosyalar (SQL)

**Files:**
- Create: `supabase/migrations/20261028133000_tarama_siparis_dosya.sql` + down/before
- Probe: `scratchpad/tarama/t7_measure.sql`
- Modify (istemci): `modules/scans/api.ts`

**Interfaces:**
- **Consumes:** Task 1, 6. Canlı `order_history(p_order uuid)` tanımı.
- **Produces:**
  - **Tetikleyici `trg_scan_order_cancelled`:** AFTER UPDATE OF status ON work_orders.
    - Koşul: `NEW.status='iptal'` ve OLD farklı.
    - Etki: bağlı (`siparise_baglandi`/`yeni_siparis`) her satıra `scan_undo_decision`'ın çekirdeği uygulanır. Bunun için çekirdek `_scan_undo_core(p_patient uuid, p_reason text)` olarak ayrılır; `scan_undo_decision` de onu çağırır.
    - Kesilmiş faturası olan satıra dokunulmaz; yalnız log yazılır.
    - `work_order_id` NULL'a çekilir.
    - Kaydedilen eylem: 'Tarama yeniden karar bekliyor · sipariş iptal edildi'.
    - Bütün gövde `begin … exception when others then raise warning` içindedir; **siparişin iptali asla engellenmez**.
  - **`order_history`:** canlı tanıma, yalnız `v_lab` iken eklenen bir dal gelir.
    - `activity_logs` içinde `entity_type='scan_appointment'` ve `metadata->>'work_order_id' = p_order` olan satırlar okunur.
    - Bunlar `kind='scan'`, `group='diger'` ile döner (canlı tanımdaki grup adlarından en yakını; `.before`'tan okunur).
    - Klinik ve hekim bu satırları görmez.
  - **Dosya alanı:** `scan-files` (herkese kapalı, 50 MB, MIME sınırı yok: STL, PLY, OBJ, ZIP, görsel). Yol `<lab_id>/<appointment_id>/<scan_patient_id>/<dosya>`.
    - `_scan_patient_order(p uuid) returns uuid`: DEFINER, satırın `work_order_id`'si.
    - `_scan_file_can_write(p_lab uuid, p_patient uuid) returns boolean`: DEFINER. Bayrak açık, aynı lab, `_scan_can_manage()` ya da atanmış teknisyen.
    - Politika `sf_insert` (authenticated): `_scan_file_can_write(try_uuid(split_part(name,'/',1)), try_uuid(split_part(name,'/',3)))`.
    - Politika `sf_select` (authenticated): iki koşuldan biri yeter.
      - `exists(select 1 from scan_patients p where p.id = try_uuid(split_part(name,'/',3)))` (INVOKER, RLS uygulanır).
      - `exists(select 1 from work_orders w where w.id = _scan_patient_order(try_uuid(split_part(name,'/',3))))` (work_orders RLS'si uygulanır; siparişi gören klinik ve hekim görür).
    - Politika `sf_delete`: yalnız `_scan_can_manage()` ve hasta karar verilmemiş.
  - **İstemci (`api.ts`):**
    - `uploadScanFile(labId, apptId, patientId, asset): Promise<{ path: string | null; error: string | null }>` (`modules/delivery/proof/api.ts` `uploadProofFile` kalıbı)
    - `listScanFiles(labId, apptId, patientId): Promise<{ path: string; name: string; size: number }[]>`
    - `fetchScanFilesForOrder(workOrderId: string): Promise<{ storage_path: string; name: string; url: string; __scan: true }[]>`: sohbet eklerinin `fetchChatAttachmentFiles` kalıbı; önek `scan/`, imzalı URL `scan-files`'tan.

- [ ] **Step 1:** `.before.txt`'ye `order_history`'nin canlı tanımı ve `work_orders` tetikleyici listesi yazılır. `.down.sql` bunları geri yükler ve alanı (boşsa) düşer.
- [ ] **Step 2: Probe yaz.** Senaryolar:
  - **I: iptal.** Bağlı ve ücretsiz satırın siparişi `iptal` yapılır → satır `karar_bekliyor`, `work_order_id` NULL, randevu `yapildi`.
    - Kesilmiş faturalı satırda sipariş iptali **geçer**, satır değişmez.
    - Tetikleyicinin içine hata zorlandığında (geçersiz bir satır) sipariş iptali yine geçer.
  - **H: geçmiş.** Sahip `order_history(sipariş)` → `kind='scan'` satırı var. Klinik yöneticisi ve hekim → yok.
  - **F: dosya.**
    - Atanmış teknisyen kendi hastasının yoluna `storage.objects` INSERT → geçer; başka lab yoluna → reddedilir.
    - Bağlıyken klinik yöneticisi SELECT → görür; bağlı değilken → görmez.
- [ ] **Step 3: Probe çalıştır.** Beklenen: ÖNCE yok; SONRA senaryolar; GERİ ALMA'da `order_history` md5 = `.before`.
- [ ] **Step 4: Kullanıcı onayı.** `order_history`'ye eklenen dal ve sipariş iptaline bağlanan tetikleyici ayrıca söylenir.
- [ ] **Step 5:** Uygula, ölç. Ledger. İstemci fonksiyonlarını yaz. `tsc` → 0.

### Task 8: Program bildirimi ve cron (SQL)

**Files:**
- Create: `supabase/migrations/20261028134000_tarama_bildirim.sql` + down/before
- Probe: `scratchpad/tarama/t8_measure.sql`

**Interfaces:**
- **Consumes:** Task 1. `fn_daily_order_watch`'ın canlı gövdesi kalıp olarak kopyalanır: Vault `notify_fn_secret`, başlıklar, kanal listesi.
- **Produces:**
  - **`_scan_digest_payload(p_lab uuid, p_kind text, p_local_date date, p_user uuid) returns jsonb`**: STABLE DEFINER, **göndermez**.
    - `p_kind`: `'morning'` ya da `'evening'`.
    - Kullanıcı admin/yönetici ise lab'ın, teknisyen ise yalnız kendi `planlandi` randevularını o yerel günde toplar.
    - `items`: `[{"time":"SS:DD","clinic":…,"services":"Ad, Ad","technician":…,"device":…,"patients":n}]`, saat sırasıyla. Hasta adı **yok**.
    - Admin/yönetici ve `morning` için ek alanlar: `pending` (karar bekleyen hasta satırı sayısı) ve `unmarked` (dünden ve öncesinden `planlandi` kalan randevu sayısı).
    - Boşsa (`items` boş ve `pending`/`unmarked` 0) `null` döner.
    - `title`: 'Bugünün tarama programı · N randevu' ya da 'Yarının tarama programı · N randevu'.
    - `body`: satırlar '\n' ile ayrılır, 'SS:DD · Klinik · Hizmetler · Teknisyen'. Ardından gerekiyorsa 'Karar bekleyen tarama · N' ve 'İşaretlenmemiş randevu · N'.
  - **`fn_scan_schedule_digest() returns int`:** DEFINER.
    - Bayrağı açık her lab için `now() at time zone coalesce(labs.timezone,'Europe/Istanbul')` hesaplanır.
    - Yerel saatin saat kısmı `scan_morning_at`'in saatine eşitse `morning` (bugün), `scan_evening_at`'in saatine eşitse `evening` (yarın) çalışır.
    - Alıcılar: admin ve yöneticiler (`fn_daily_order_watch` tanımı) ile `scan_technician_ids` havuzundaki (boşsa tüm) teknisyenler.
    - Aynı kullanıcıya aynı `payload->>'kind'` ve `payload->>'date'` ile `scan_schedule` bildirimi varsa atlanır.
    - `notifications` satırı yazılır: `category='scan_schedule'`, `resource_type='scan_schedule'`, `action_url` admin için `'/(admin)/scans'`, lab için `'/(lab)/scans'`, teknisyen için `'/(station)/scans'`.
    - Ardından `send-email-notification`, `send-expo-push` ve `send-web-push` kanal fonksiyonlarına `pg_net` ile istek gider. WhatsApp **yok**.
    - Dönüş: gönderilen kişi sayısı.
  - **Cron:** `select cron.schedule('scan-schedule-digest', '0 * * * *', 'select public.fn_scan_schedule_digest()')`. Down: `cron.unschedule`.

- [ ] **Step 1:** `.before.txt` yazılır: `cron.job` listesi, `fn_daily_order_watch` kalıp bölümü.
- [ ] **Step 2: Probe yaz.** Yalnız `_scan_digest_payload` çağrılır; `fn_scan_schedule_digest` **çağrılmaz**. Senaryolar:
  - **S: sahip, morning.** Yarına ve bugüne birer randevu eklenir. `morning` → yalnız bugünkü, `items[0].patients` doğru, metinde hasta adı yok. `pending` = karar bekleyen satır sayısı.
  - **T: teknisyen.** Yalnız kendi randevusu.
  - **E: boş.** Randevusuz gün → `null`.
  - **Z: saat dilimi.** Lab'ın `timezone`'u `'Europe/Berlin'` yapılır (geri alınır); randevu `2026-10-25T22:30:00Z` → `p_local_date='2026-10-25'`'te görünür, `'2026-10-26'`'da görünmez.
  - **C:** statik kontrol. `pg_get_functiondef(fn_scan_schedule_digest)` 'send-whatsapp' içermez, 'scan_schedule' içerir.
- [ ] **Step 3: Probe çalıştır.** Beklenen: ÖNCE yok; SONRA senaryolar; GERİ ALMA = ÖNCE.
- [ ] **Step 4: Kullanıcı onayı.** Söylenecek: saat başı yeni cron, kimlere ne zaman ne gider, WhatsApp yok.
- [ ] **Step 5:** Uygula. `cron.job`'da `scan-schedule-digest@0 * * * *` olduğu ölçülür. İlk gerçek gönderim kendi saatinde gözlenir: ertesi sabah `notifications`'ta `scan_schedule` satır sayısı. Ledger.

### Task 9: Bildirim tercihleri ve e-posta etiketi (istemci + edge)

**Files:**
- Modify: `core/store/notificationPrefsStore.ts` (tür birliği + varsayılan `scan_schedule: { in_app: true, browser_push: true, email: true, whatsapp: false }`)
- Modify: `modules/settings/sections/NotificationsSection.tsx`
  - Satır: `{ key: 'scan_schedule', icon: Calendar, label: 'Tarama Programı', sub: 'Sabah bugünün, akşam yarının tarama randevuları' }`.
  - Görünür olduğu kişiler: admin, lab yöneticisi ve teknisyen. Lab'da bayrak açık değilse gizli (`useFeature('scan_appointments')`).
- Modify: `core/ui/mobile/NotificationsSheet.tsx` (`scan_schedule: { icon: Calendar, color: '#0891B2', label: 'Tarama' }`)
- Modify: `supabase/functions/send-email-notification/index.ts` (`scan_schedule: 'Tarama Programı'` etiketi ve `'#0891B2'` rengi)
- Modify: `core/ui/icons.tsx` (`Calendar` yoksa `Calendar01Icon` alt yoldan eklenir)
- Modify: `auto.{en,de,fa}.json`

- [ ] **Step 1:** Değişiklikleri yap. Yeni metinleri dört dile ekle.
- [ ] **Step 2:** `tsc` → 0. Paket yeşil. Üç sözlükte anahtar sayısı eşit.
- [ ] **Step 3:** Edge yayını için kullanıcı onayı alınır. Komut: `supabase functions deploy send-email-notification --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api`. Onay yoksa ledger'a "e-posta etiketi bekliyor" yazılır; fonksiyonun bilinmeyen kategori yedeği kontrol edilip not edilir.

### Task 10: Tasarım oturumu (kullanıcıyla) — KAPI

**Files:**
- Create: `docs/superpowers/specs/2026-10-28-tarama-randevulari-prototip.html` (etkileşimli, ağsız; önceki prototiplerin kalıbı)

Bu görev kod yazmaz. Task 11–14'ün görünüşünü belirler. Kullanıcı "önce planlamayı yap sonra tasarım tarafını konuşalım" dedi.

- [ ] **Step 1:** /apple-design ve görsel yardımcı ile şu yüzeyler konuşulur:
  - Özet takvim kartı (gün/hafta),
  - randevu formu (öneri listesi ve uyarı satırları),
  - randevu detayı ve hasta satırları,
  - karar penceresi ve karar bekleyenler,
  - teknisyen "Randevularım",
  - ayarlar.

  Kullanıcıya her seferinde tek soru sorulur.
- [ ] **Step 2:** Prototip dosyası yazılır. Açık ve koyu temada, mobil ve masaüstünde denenir.
- [ ] **Step 3:** Kullanıcı prototipi onaylar. Onay ve kararlar ledger'a yazılır. Onay olmadan Task 11–14 başlamaz.

### Task 11: Randevular ekranı, form, detay, ayarlar (istemci)

**Files:**
- Create: `modules/scans/screens/ScanAppointmentsScreen.tsx`, `modules/scans/components/{AppointmentForm,AppointmentDetail,PatientRows,SuggestList,WarningLines,CancelDialog}.tsx`, `modules/scans/hooks/useScanDay.ts`
- Create: `app/(lab)/scans.tsx`, `app/(admin)/scans.tsx` (`lazyRoute`)
- Create: `app/dev/scan-appointments.tsx` (ağsız demo; sahte veriyle form, öneri ve uyarı durumları)
- Modify: `app/(lab)/_layout.tsx` ve `app/(admin)/_layout.tsx` nav. Öğe: `{ …, requiresFeature: 'scan_appointments' }`, `view_scan_appointments` yetkisiyle süzülür.
- Modify: `modules/settings/sections/EquipmentSection.tsx` (tarama cihazı türü seçici)
- Modify: `modules/finance/screens/PriceListScreen.tsx` (tarama türü + "Siparişe dönerse ücretsiz")
- Create: `modules/settings/sections/ScanSettingsSection.tsx` (tarama saatleri, günler, varsayılan süre, yol payı, bildirim saatleri yalnız tam saat, teknisyen havuzu). `lab_settings` mevcut güncelleme yolundan yazılır.

**Interfaces:**
- **Consumes:** Task 3–5 model ve API, Task 7 dosya fonksiyonları, Task 10 prototipi.
- **Davranış:**
  - **Form:** 4.1'deki alanlar. Klinik, hizmet ve tarih seçilince:
    - `ensureClinicGeo` + `buildTravelFn` + `suggestSlots` çalışır;
    - öneriye dokununca saat, teknisyen ve cihaz dolar;
    - `apptWarnings` her değişiklikte yeniden hesaplanır ve kaydet düğmesinin yanında `warningText` satırları görünür. Uyarı kaydı engellemez.
    - Öneri boşsa 'Bu gün için uygun saat bulunamadı' yazar.
  - **Detay:**
    - Hasta satırları eklenir, düzeltilir ve silinir.
    - Her satırda dosya yükleme vardır.
    - Eylemler: "Tarama yapıldı" (`canMarkDone` istemcide önce), "Ertele" (formu saat alanına odaklı açar), "İptal" (`CancelDialog`, nedenler `CANCEL_REASONS`).
  - **Gerçek zamanlı:** ekran, `useRealtimeRefresh` ile `scan_appointments` değişince tazelenir. Realtime publication'a ekleme Task 1 migration'ına **eklenmez**; gerekiyorsa ayrı onaylı bir küçük migration olur.

- [ ] **Step 1:** Ekranları prototipe göre yaz. Dört dil, koyu tema, tooltip.
- [ ] **Step 2:** `tsc` → 0. Paket yeşil. Sözlükler eşit.
- [ ] **Step 3:** `/dev/scan-appointments` önizlemede açılır. Açık ve koyu, 375 px ve masaüstünde ekran görüntüsü alınır. Canlı ekranda kaydet ya da iptal'e basılmaz.

### Task 12: Karar akışı ve sipariş bağlantısı (istemci)

**Files:**
- Create: `modules/scans/components/{DecisionDialog,PendingDecisionsList,OrderScanRow}.tsx`
- Modify: `modules/orders/screens/NewOrderScreen.tsx`
  - Yeni isteğe bağlı prop `scanPrefill?: { clinic_id: string; doctor_id: string | null; patient_name: string }`. Doluysa klinik, hekim, hasta adı ve `measurement_type='digital'` başlangıç değeri olur.
  - `onSaved?: (orderId?: string) => void`: oluşturulan siparişin id'si ile çağrılır. Mevcut çağıranlar argümansız çalışmaya devam eder.
- Modify: `modules/orders/screens/OrderDetailScreenV2.tsx` (bağlı taramalar satırı, `OrderScanRow`) ve Ekler listesi (`fetchScanFilesForOrder`; `__scan` öğesi silinemez, ScanLine işaretli)
- Modify: `auto.{en,de,fa}.json`

**Davranış:**
- **Karar penceresi:** hasta başına üç yol (spec 4.7).
  - "Mevcut siparişe bağla": kliniğin iptal edilmemiş siparişleri listelenir; hasta adı eşleşenler başta, sonra en yeni.
  - "Yeni sipariş aç": `NewOrderScreen` popup'ta `scanPrefill` ile açılır. `onSaved(orderId)` gelince `decide([id],'yeni_siparis',orderId)` çağrılır. Kaydetmeden kapanırsa karar verilmez.
  - **Toplu:** seçilen satırlara "Yalnız tarama olarak kapat".
  - Sonuç olarak oluşan taslak faturalar bağlantıyla gösterilir.
- **Karar bekleyenler:** önce "İşaretlenmemiş" grubu, sonra randevuya göre gruplanmış hasta satırları.
- **Sipariş detayı:** "Tarama · GG.AA · hizmetler" satırı; dokununca randevu detayı açılır. Yalnız lab panellerinde görünür (`view_scan_appointments`).
- `NewOrderScreen` lazy rotadır. Karar penceresi ondan `React.lazy` ile yükler (Global Constraints, lazy rota).

- [ ] **Step 1:** Yaz.
- [ ] **Step 2:** `tsc` → 0. Paket yeşil. Sözlükler eşit.
- [ ] **Step 3:** Mevcut "Yeni sipariş" akışının değişmediğini doğrula. Önizlemede sihirbaz `scanPrefill`'siz açılır; demo sayfasında `scanPrefill`'li açılır. Canlıda kaydetme yok.

### Task 13: Özet takvim kartı (istemci)

**Files:**
- Create: `modules/scans/components/ScanCalendarCard.tsx` (bağımsız; ekran modüllerini statik import etmez)
- Modify: `app/(admin)/index.tsx`, `modules/dashboard/screens/LabDashboardScreen.tsx`, `modules/dashboard/components/LabMobileDashboard.tsx`

**Davranış:**
- Kart, bayrak açık ve `view_scan_appointments` olan kullanıcıya görünür.
- Gün ve hafta görünümü prototipe göredir.
- Karar bekleyen sayısına dokununca Randevular ekranının karar sekmesi açılır.
- Boş gün yer kaplamaz.
- Veri `fetchScanDay` ile gelir. Kart ana pakette olduğu için `modules/scans/api.ts` ve `scanModel.ts` dışında bir şey içe aktarmaz.

- [ ] **Step 1:** Yaz.
- [ ] **Step 2:** `tsc` → 0. Paket yeşil. Ana paket kontrolü: `app/(admin)/index.tsx` içinden `modules/scans/screens` içe aktarılmıyor (`grep`).
- [ ] **Step 3:** Demo sayfasında kartın ekran görüntüsü, açık ve koyu temada.

### Task 14: Teknisyen "Randevularım" (istemci)

**Files:**
- Create: `modules/scans/screens/MyScanAppointmentsScreen.tsx`, `app/(station)/scans.tsx` (`lazyRoute`)
- Modify: `app/(station)/_layout.tsx` (sekme ya da menü öğesi prototipe göre; `requiresFeature: 'scan_appointments'`)

**Davranış:**
- Ekranda bugün ve yaklaşan kendi randevuları listelenir.
- Her randevuda kliniğin adresi ve harita bağlantısı bulunur: Google Maps arama URL'si, `encodeURIComponent(clinicAddressLine)`.
- Hasta satırları eklenebilir ve dosya yüklenebilir.
- "Tarama yapıldı" düğmesi vardır.
- Karar eylemi bu ekranda yoktur.

- [ ] **Step 1:** Yaz.
- [ ] **Step 2:** `tsc` → 0. Paket yeşil. Sözlükler eşit.
- [ ] **Step 3:** Demo sayfasında mobil (375 px) görüntü, açık ve koyu temada.

### Son: Bütün dalın incelemesi

- [ ] Yürütme becerisinin son inceleme adımı uygulanır. İnceleyiciye Review Focus listesi ve ledger'daki `Ruling:` satırları verilir.
- [ ] Hafıza kaydı yazılır: `project_scan_appointments.md` ve MEMORY.md satırı. İçerik: tablolar, bayrak, RPC'ler, faturalama yolu, cron, kalanlar.
