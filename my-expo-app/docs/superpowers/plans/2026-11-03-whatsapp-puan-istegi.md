# WhatsApp'tan puan isteği — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teslimden N gün sonra hekime lab'ın WhatsApp numarasından üç düğmeli bir puan isteği gitsin. Düğme cevabı o işin değerlendirmesi olarak kaydedilsin. "Sorun var" lab yöneticisine hemen ulaşsın. Hesabı olan hekim ve klinik, isteği uygulamada da (mobil dahil) görsün.

**Architecture:**
- Her teslimde bir istek satırı oluşur (`review_requests`). Satırı, bugün hiç ateşlemeyen `notify_order_delivered` tetikleyicisi yazar.
- Saatlik `fn_review_request_tick()` şunları yapar: uygulama içi isteği gönderir, WhatsApp için uygunluğu ve sıklık sınırını uygular, gönderilecek satırı sahiplenir, gönderimi `send-review-request` edge fonksiyonuna devreder.
- Düğme cevabını `whatsapp-webhook` sohbet botu kontrolünden ÖNCE yakalar ve `review_wa_record_answer` RPC'sine verir. Puanı RPC yazar, lab'a haberi de RPC verir.
- İstemcide değerlendirme iş başına tek satırdır. Mobil sipariş ekranı ve mobil panolar masaüstündeki isteği alır.

**Tech Stack:** Supabase (Postgres, pg_cron, pg_net, RLS, SECURITY DEFINER RPC), Deno edge functions, Meta WhatsApp Cloud API (şablon + hızlı cevap düğmeleri), Expo + React Native + react-native-web, `node --test` (`.test.ts` / `.test.mts`), i18n (tr/en/de/fa).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md`. Kullanıcı onayı: "onaylıyorum, planı yaz".

Tüm yollar `my-expo-app/` köküne görelidir.

## Global Constraints

### Kurallar ve değerler

- **Düğme → puan:**
  - Sorunsuz = 5, Küçük düzeltme = 3, Sorun var = 1.
  - Düğme yükü birebir `review:<istek_id>:<5|3|1>`.
- **Zaman:**
  - `due_on` = teslimin lab günü + `review_wa_delay_days` (varsayılan 3, 1–14).
  - WhatsApp gönderim penceresi lab saatiyle Pzt–Cmt, 10:00 ≤ saat < 18:00.
- **Sıklık sınırı:** aynı `phone_to` numarasına lab gününde en fazla 1 istek gider, istek hangi lab'dan çıkarsa çıksın (bir hekim iki lab'la çalışabilir). Aynı numaranın işlerinden önce en eski teslim gider.
- **Süreler (hepsi 7 gün):**
  - Cevapsız gönderilmiş istek: `sent_at + 7 gün` sonra `expired`.
  - Kuyrukta kalan istek: `lab_today > due_on + 7` ise `skipped` (`stale`).
  - Süresi dolmuş isteğin düğmesi yine kaydedilir.
- **Not penceresi:** "Küçük düzeltme" ve "Sorun var" cevabından sonra `note_until = now() + 24 saat`. Pencerede gelen ilk düz metin yoruma eklenir ve pencere kapanır.
- **Alıcı sırası** (yalnız puan isteği için):
  1. Hesaplı hekimin `profiles.whatsapp_phone` alanı (`user_type='doctor'`, `doctor_id = doctors.id`, aktif).
  2. `doctors.phone`.
  3. `clinics.whatsapp_phone`.
  4. `clinics.phone`.
  - Hepsi `normalizePhoneTR` / `_review_phone_tr` ile normalleştirilir.
  - `phone_source` sırasıyla `doctor_account | doctor | clinic_whatsapp | clinic_phone` değerini alır.
- **Değerlendirme:**
  - İş başına tek değerlendirme: `UNIQUE (work_order_id)`.
  - WhatsApp kaydı: `source='whatsapp'`, `overall`=puan, boyutlar boş.
  - Hekim iki kez basarsa son basılan geçerlidir. Lab'a haber yalnız puan **düşerse** tekrar gider (ilk cevap da "düşüş" sayılır).
- **Kategoriler** (`trg_whatsapp_meta_notify`'ın müşteri kümesi `new_order/delivery/approval/payment/account` DIŞINDA):
  - `review_request`: hekim/klinik uygulama içi, `create_notification`, e-posta yok.
  - `review_problem`: lab yöneticisi; `_notify_channels` ile uygulama içi + e-posta + push, ayrıca lab WhatsApp şablonu.
  - `review_minor`: lab yöneticisi, yalnız uygulama içi (`create_notification`).
- **Lab yöneticisi kümesi:** `profiles.lab_id = X AND coalesce(is_active,true) AND (user_type='admin' OR (user_type='lab' AND role='manager'))`.
- **Ayar:**
  - `lab_settings.review_wa_enabled` (varsayılan false), `review_wa_enabled_at`, `review_wa_delay_days`.
  - WhatsApp adımı yalnız `enabled AND enabled_at IS NOT NULL AND delivered_at >= enabled_at` ise çalışır.
  - Kapatıp yeniden açmak `enabled_at`'i yeniden yazar.
- **Hekim bazında kapatma:** `doctors.review_wa_opt_out` (varsayılan false). Kart etiketi "WhatsApp puan isteği gönder" (açık = opt_out false).
- **Uygulama içi istek:** WhatsApp ayarından bağımsızdır. `due_on` gününde `_order_client_recipients(order)` alıcılarına gider. Yalnız istek satırı olan, yani bu yayından sonra teslim edilen işlere gider.
- **Bekleyen değerlendirmeler:** hiç değerlendirmesi olmayan ve `delivered_at` son 30 gün (`PENDING_REVIEW_DAYS = 30`) içinde olan `teslim_edildi` işler.
- **Metinler:** birebir Görev 1'de onaylanan metinler. Şablon değişken adları:
  - `is_degerlendirme`: `hasta_adi`, `siparis_no`, `is_turu`.
  - `is_sorunu_lab`: `hekim`, `siparis_no`, `is_turu`.

### Veritabanı

- **Beş adım** (her DB görevi):
  1. Canlı tanım + yetkiler `supabase/rollbacks/<ad>.before.txt`'ye.
  2. `supabase/rollbacks/<ad>.down.sql`.
  3. Rol rol deneme, `ROLLBACK` ya da `RAISE EXCEPTION 'PROBE …'` ile biter.
  4. Kullanıcıdan AskUserQuestion ile açık "Onaylıyorum, uygula".
  5. `cd my-expo-app && supabase db query --linked -f <mutlak yol>` ile uygula, hemen canlıda ölç.
- **Denemelerde gönderici ÇAĞRILMAZ:**
  - `_notify_channels`, `_review_dispatch`, `fn_review_request_tick` (içinde `_review_dispatch`), `fn_daily_order_watch`, `fn_prova_watch`, `fn_scan_schedule_digest`, e-posta göndericiler.
  - Gönderen yolu sınamak gerekirse `_notify_channels` ve `_review_dispatch` aynı işlem içinde `CREATE OR REPLACE` ile `RETURN NULL` gövdeli taslağa çevrilir. İşlem geri alındığı için canlı tanım değişmez.
- **Yeni tablo:** RLS AÇIK. `REVOKE INSERT, UPDATE, DELETE ON … FROM anon, authenticated` (Supabase varsayılanı ALL veriyor).
- **Yeni fonksiyon:**
  - `SET search_path TO 'public'`.
  - İç fonksiyonlarda `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`.
  - İstemci RPC'lerinde `GRANT EXECUTE … TO authenticated`.
  - Edge'den çağrılanlarda `GRANT EXECUTE … TO service_role`.
- **Canlı fonksiyonu değiştirirken** (`notify_order_delivered`, `trg_whatsapp_meta_notify`): tanım `.before.txt`'den alınır, yalnız planın söylediği satır değişir. `md5(pg_get_functiondef)` uygulama sonrası göç dosyasıyla karşılaştırılır.
- **Tetikleyiciler teslimi ASLA engellemez:** gövde `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING …; END`.

### Edge fonksiyonlar

- Yayın komutu: `supabase functions deploy <ad> --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api`.
- **`whatsapp-webhook`:**
  - Yayından önce kullanıcıdan onay alınır (canlı gelen mesaj yolu).
  - Puanla ilgisiz her mesaj bugünkü yoldan birebir geçer.
  - Bot kapalıyken puanla ilgisiz mesaja hiçbir yan etki yoktur.
- **`send-whatsapp-meta`** yalnız Meta `is_sorunu_lab` şablonunu onayladıktan sonra yayınlanır.
- Saf modüller Deno/esm.sh içe aktarmaz; `node --test` ile koşar.

### Arayüz

- **Dört dil AYNI ANDA:**
  - Düz Türkçe `<Text>` → `core/i18n/locales/auto.{en,de,fa}.json` (birebir `trim()` anahtar).
  - Şablon dizeler `autoT()` ile sarılır.
  - Veritabanından gelen bildirim başlıkları da auto sözlüğe eklenir.
  - Farsça için `persian-writing` skill'i kullanılır.
  - Üç sözlüğün anahtar kümesi eşit kalır.
- **Görünüm:**
  - Koyu tema token'la (`useInkUI` / `useMobileTokens`); açık tema bit-bit aynı kalır.
  - Popup `U.modalOverlay` / `U.modalCard`; her düğmede `GlassTooltip`; hata düğmenin yanında.
  - Mobilde eylemler tek satır; kenar `PAGE_PADDING`; ikonlar yalnız `core/ui/icons`.
- **Kapsam:** yalnız hekim/klinik oturumu ve lab Ayarlar/Hekim kartı değişir. Lab panellerinin sipariş ekranı değişmez; tek istisna kaynak etiketi.

### Kontroller, commit, yayın

- **Her görev sonunda:**
  - Test takımı: `cd my-expo-app && find modules core app supabase/functions -name "*.test.mts" -o -name "*.test.ts" | grep -v node_modules | xargs node --test` → `fail 0`.
  - `npx tsc --noEmit --incremental false` → 0 hata.
- **Commit:** main'de, mesaj sonunda `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Yayın:** push ve web deploy YALNIZ kullanıcı isteyince.

## Review Focus

1. **Geç ya da yabancı düğme:**
   - Süresi dolmuş, revizyona girmiş ya da iptal edilmiş işin düğmesine basılırsa cevap kaydedilir ve uygulama çökmez.
   - İstekteki numaradan başka bir numaradan ya da başka lab hattından gelen `review:` yükü sessizce yok sayılır.
   - → Görev 4 denemesi a, e.
2. **Bot açık lab:**
   - Bizim gönderdiğimiz şablon ve kısa yanıt echo olarak geri gelince bot "insan yazdı" sanıp susmamalı.
   - Wamid'ler `whatsapp_messages`'a yazılır.
   - → Görev 5 adım 5 (`send-review-request` bot açıkken şablonun wamid'ini yazar) ve Görev 6 `reviewCapture` testi "bot açıkken giden yanıt kaydedilir".
3. **Aynı gün aynı numaraya birden çok iş** (iki lab ya da iki teslim): tek istek gitmeli, diğeri ertesi güne kalmalı. → Görev 3 denemesi c.
4. **Teslim geri alınıp yeniden teslim:**
   - Tek satır kalmalı. Gönderilmemişse yeni teslim gününe göre kuyruğa dönmeli; gönderilmişse dokunulmamalı.
   - Teslimi hiçbir hata engellememeli.
   - → Görev 3 denemesi a.
5. **Klinik kullanıcısı WhatsApp değerlendirmesini düzenler:**
   - Puanı, yorumu ve boyutları değiştirebilir.
   - `source`, `rater_id`, `rater_doctor_id`, `work_order_id`, `lab_id` ve `lab_reply*` değişmez.
   - Başka bir işin değerlendirmesine dokunamaz.
   - → Görev 2 denemesi c.

---

### Task 1: Şablon ve yanıt metinleri — kullanıcı onayı

Meta onayı günler sürebilir. Metinler kodu belirler (değişken adları, düğme sırası), bu yüzden ilk iş budur.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md` — sona "§10 Onaylanan metinler" eklenir, durum satırına "metinler §10" eklenir.

**Interfaces:**
- Produces (birebir; sonraki görevler buradan kopyalar):

| Ad | Metin |
|---|---|
| Şablon `is_degerlendirme` (UTILITY, `tr`) gövde | `Merhaba, {{hasta_adi}} hastanızın {{siparis_no}} numaralı {{is_turu}} işi birkaç gün önce teslim edildi. Hastaya nasıl oturdu?` |
| `is_degerlendirme` düğmeleri (Hızlı cevap, sıra sabit) | `Sorunsuz` · `Küçük düzeltme` · `Sorun var` |
| Şablon `is_sorunu_lab` (UTILITY, `tr`) gövde | `Sorun bildirimi: {{hekim}}, {{siparis_no}} numaralı {{is_turu}} işinde sorun olduğunu bildirdi. Ayrıntılar Siman'da siparişin sayfasında.` |
| Hekime yanıt (5) | `Teşekkür ederiz. Cevabınızı {lab} ekibine ilettik.` |
| Hekime yanıt (3 / 1) | `Teşekkür ederiz, cevabınızı {lab} ekibine ilettik. Ekip sizinle iletişime geçecek. İsterseniz sorunu kısaca bu mesaja yazın; siparişe eklenir.` |
| Uygulama içi, hekim/klinik | başlık `İşinizi değerlendirin`, gövde `<hasta adı ya da sipariş no> · <iş türü>` |
| Uygulama içi, lab (1) | başlık `Hekim sorun bildirdi`, gövde `<sipariş no> · <hekim adı> · <iş türü>` |
| Uygulama içi, lab (3) | başlık `Hekim küçük düzeltme istedi`, gövde aynı biçim |
| E-posta kategori etiketi | `review_problem` → `Hekim Geri Bildirimi`, renk `#DC2626` |

- Meta kuralı: gövde değişkenle başlayamaz ve bitemez. Yukarıdaki metinler buna uyar.

- [ ] **Step 1: Metinleri kullanıcıya göster** — tabloyu AskUserQuestion ile sun. Seçenekler: "Onaylıyorum" / "Değiştir" (Diğer ile düzeltme). Düzeltme gelirse tabloyu güncelle; değişken adları ve düğme sırası sabit kalır.
- [ ] **Step 2: Spec'e yaz** — onaylanan tabloyu §10'a koy, durum satırını güncelle.
- [ ] **Step 3: Meta başvurusunu kullanıcıya bırak** — iki şablonun Meta'daki adı, kategorisi, dili, gövdesi ve düğmeleri tek blokta kullanıcıya verilir. Başvuruyu kullanıcı kendi Meta hesabından yapar; biz Meta hesabına giriş yapmayız.
- [ ] **Step 4: Commit** — `docs(puan): onaylanan WhatsApp şablon ve yanıt metinleri`

### Task 2: DB şeması — tek değerlendirme, istek tablosu, ayar sütunları

**Files:**
- Create: `supabase/migrations/20261103110000_puan_istegi_sema.sql`
- Create: `supabase/rollbacks/20261103110000_puan_istegi_sema.before.txt`
- Create: `supabase/rollbacks/20261103110000_puan_istegi_sema.down.sql`

**Interfaces:**
- **Produces — `order_reviews`:**
  - `source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','whatsapp'))`
  - `rater_doctor_id uuid NULL REFERENCES doctors(id) ON DELETE SET NULL`
  - `rater_id` NULL olabilir (varsayılan `auth.uid()` kalır).
  - `order_reviews_work_order_id_rater_id_key` düşer, yerine `order_reviews_work_order_id_key UNIQUE (work_order_id)`.
- **Produces — `_is_order_client_party(p_order uuid) RETURNS boolean`:**
  - STABLE SECURITY DEFINER.
  - `auth.uid() IN (SELECT _order_client_recipients(p_order))`.
  - `GRANT EXECUTE TO authenticated`. Gerekçe: `_order_client_recipients`'in authenticated yetkisi yok.
- **Produces — politika `order_reviews_update`:** USING ve WITH CHECK `(rater_id = auth.uid() OR public._is_order_client_party(work_order_id))`.
- **Produces — tetikleyici `trg_order_reviews_guard`** (BEFORE UPDATE, fonksiyon `_order_reviews_guard()` SECURITY DEFINER):
  - Koşul: `auth.uid() IS NOT NULL AND OLD.lab_id IS DISTINCT FROM get_my_lab_id()` (istemci tarafı; lab personeli ve servis rolü muaf).
  - Etki: `work_order_id, lab_id, rater_id, rater_doctor_id, source, lab_reply, lab_reply_at, lab_reply_by` OLD değerine döner.
- **Produces — `review_requests` tablosu:**
  - Kimlik ve bağlar:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `work_order_id uuid NOT NULL UNIQUE REFERENCES work_orders(id) ON DELETE CASCADE`
    - `lab_id uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE`
    - `doctor_id uuid NULL REFERENCES doctors(id) ON DELETE SET NULL`
  - Zaman: `delivered_at timestamptz NOT NULL`, `due_on date NOT NULL`
  - Alıcı: `phone_to text NULL`, `phone_source text NULL CHECK (phone_source IN ('doctor_account','doctor','clinic_whatsapp','clinic_phone'))`
  - Durum:
    - `status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','answered','failed','expired','skipped'))`
    - `skip_reason text NULL` — değerler: `wa_off`, `before_enabled`, `opted_out`, `no_phone`, `no_wa_cred`, `reviewed`, `not_delivered`, `stale`
  - Gönderim: `claimed_at`, `sent_at` (timestamptz NULL), `wamid text NULL`, `error text NULL`
  - Cevap: `answer smallint NULL CHECK (answer IN (1,3,5))`, `answered_at`, `note_until`, `app_notified_at` (timestamptz NULL)
  - `created_at`, `updated_at` (timestamptz NOT NULL DEFAULT now())
  - İndeksler: `(status, due_on)`, `(phone_to, sent_at)`, `(lab_id, created_at DESC)`.
  - RLS açık. Tek SELECT politikası: `lab_id = get_my_lab_id() AND (my_user_type() = 'admin' OR is_lab_manager())`.
  - `REVOKE INSERT, UPDATE, DELETE … FROM anon, authenticated`.
- **Produces — `lab_settings`:**
  - `review_wa_enabled boolean NOT NULL DEFAULT false`
  - `review_wa_enabled_at timestamptz NULL`
  - `review_wa_delay_days integer NOT NULL DEFAULT 3 CHECK (review_wa_delay_days BETWEEN 1 AND 14)`
- **Produces — `doctors`:** `review_wa_opt_out boolean NOT NULL DEFAULT false`.

- [ ] **Step 1: Canlı tanımı kaydet** — `.before.txt`'ye şunlar:
  - `order_reviews`: sütunlar, kısıtlar, politikalar, tetikleyiciler (`trg_set_order_review_lab_id`), satır sayısı ve `count(distinct work_order_id)` (beklenen 6/6). Tekil çakışma olmadığının kanıtı.
  - `lab_settings` ve `doctors` sütun listesi.
  - `_order_client_recipients` tanımı ve `proacl`'ı.
- [ ] **Step 2: Göç dosyasını yaz** — yukarıdaki Interfaces birebir. Sıra: sütunlar → tekillik (önce yeni UNIQUE, sonra eskisini düşür) → yardımcı → politika (DROP + CREATE) → guard tetikleyicisi → `review_requests` + indeks + RLS + REVOKE → `lab_settings` / `doctors` sütunları.
- [ ] **Step 3: `.down.sql`** — sırasıyla:
  - `review_requests`'i düşür.
  - Guard tetikleyicisini ve fonksiyonunu, politikayı geri al (`.before.txt`'deki ifade).
  - `_is_order_client_party`'yi düşür.
  - UNIQUE'i eskisine çevir, `rater_id SET NOT NULL`.
  - Not: geri alma, `rater_id` NULL bir WhatsApp satırı varsa durur. `.down.sql` başında `DELETE FROM order_reviews WHERE source='whatsapp' AND rater_id IS NULL` satırı ve bunu açıklayan yorum bulunur.
  - Sütunları düşür.
- [ ] **Step 4: Rol rol deneme** (tek işlem, `RAISE EXCEPTION 'PROBE …'` ile biter):
  - a) Servis rolüyle `rater_id NULL, source 'whatsapp'` satırı eklenir. Aynı işe ikinci satır `23505` verir.
  - b) Hekim hesabı (`_order_client_recipients`'te olan) bu satırın `overall` ve `comment` alanını günceller → başarılı.
  - c) Aynı kullanıcı `source`, `rater_id`, `lab_reply` ve `work_order_id`'yi değiştirmeye çalışır → satır eski değerlerini korur. Başka bir işin satırını güncelleyemez (0 satır).
  - d) Lab yöneticisi `set_review_lab_reply` ile yanıt yazar → `lab_reply` değişir (guard lab'ı engellemez).
  - e) Teknisyen `review_requests`'i okuyamaz; lab yöneticisi kendi lab'ını okur. Authenticated `INSERT INTO review_requests` → `42501`.
  - f) ÖNCE / SONRA: `order_reviews` politikaları ve kısıtları, `has_function_privilege('authenticated','_is_order_client_party(uuid)','EXECUTE')` = true.
  - g) Boş `rater_id` dayanıklılığı: lab yöneticisi olarak `order_history(<a'daki iş>)` hatasız döner ve `review` satırı (kişisi boş) gelir; `report_technician_ratings` aynı dönem için hatasız döner. (Canlıda kontrol edildi: `order_history` `rater_id`'yi yapan kişi olarak okur, arayüz boş kişiyi gizler; `report_technician_ratings` yalnız `work_order_id` ile birleşir. İkisi de değişmez.)
- [ ] **Step 5: Kullanıcı onayı** — ne değişir / nereyi etkiler / risk / geri alma, madde madde. AskUserQuestion: "Onaylıyorum, uygula".
- [ ] **Step 6: Uygula ve ölç** — kısıtlar, politika ifadesi, `review_requests` RLS = true, mevcut 6 satır `source='app'`.
- [ ] **Step 7: Commit** — `feat(puan): tek değerlendirme, istek tablosu ve ayar sütunları (DB)`

### Task 3: DB — teslimde istek satırı, saatlik görev, uygulama içi istek

**Files:**
- Create: `supabase/migrations/20261103120000_puan_istegi_gorev.sql`
- Create: `supabase/rollbacks/20261103120000_puan_istegi_gorev.before.txt`
- Create: `supabase/rollbacks/20261103120000_puan_istegi_gorev.down.sql`

**Interfaces:**
- Consumes: Görev 2'deki tablo ve sütunlar.
- **Produces — `_review_phone_tr(p text) RETURNS text`:**
  - IMMUTABLE. `send-whatsapp-meta`'daki `normalizePhoneTR` ile aynı kural:
    - Rakam dışını sil.
    - `90` + 12 hane → aynen.
    - `0` + 11 hane → `90` + kalan.
    - `5` ile başlayan 10 hane → `90` + aynısı.
    - Diğer → ham rakam.
  - Boş girdi → NULL.
- **Produces — `_review_pick_phone(p_doctor uuid) RETURNS TABLE(phone text, source text)`:** alıcı sırası (Global Constraints). En fazla 1 satır; numara yoksa 0 satır.
- **Produces — `notify_order_delivered()`** (aynı ad, aynı tetikleyici):
  - Teslime geçişte `review_requests`'e satır yazar:
    - `delivered_at = coalesce(NEW.delivered_at, now())`
    - `due_on = lab_today(NEW.lab_id, delivered_at) + review_wa_delay_days` (ayar satırı yoksa 3)
  - Çakışmada (`ON CONFLICT (work_order_id)`): yalnız `status IN ('queued','skipped') AND sent_at IS NULL` ise `delivered_at`, `due_on` güncellenir, `status='queued'`, `skip_reason=NULL`, `app_notified_at=NULL`.
  - Eski `create_notification(... 'delivery' ...)` çağrısı kaldırılır.
- **Produces — `_review_requests_housekeeping(p_now timestamptz DEFAULT now()) RETURNS void`:**
  - queued + iş artık `teslim_edildi` değil → `skipped/not_delivered`.
  - queued + işin değerlendirmesi var → `skipped/reviewed`.
  - sent + `sent_at < p_now - 7 gün` → `expired`.
  - sending + `claimed_at < p_now - 1 saat` → `failed`, `error='timeout'`.
- **Produces — `_review_requests_notify_app(p_now timestamptz DEFAULT now()) RETURNS integer`:**
  - Koşul: `due_on <= lab_today(lab, p_now)`, `due_on >= lab_today - 7`, `app_notified_at IS NULL`, iş `teslim_edildi`, değerlendirme yok.
  - Her `_order_client_recipients(order)` alıcısına `create_notification(uid, 'review_request', 'İşinizi değerlendirin', <gövde>, 'work_order', order, '/order/'||order, jsonb_build_object('lab_id', lab))`.
  - Sonra `app_notified_at = p_now` (alıcı yoksa da). Dönüş: bildirim sayısı.
- **Produces — `_review_requests_claim(p_now timestamptz DEFAULT now()) RETURNS SETOF uuid`:**
  1. `due_on <= today` olan queued satırlar için karar:
     - `today > due_on + 7` → `stale`.
     - Ayar kapalı ya da `enabled_at` boş → `wa_off`.
     - `delivered_at < enabled_at` → `before_enabled`.
     - Hekim `review_wa_opt_out` → `opted_out`.
     - Lab'da aktif `provider_credentials` (`type='messaging'`, `provider='whatsapp-cloud'`) yok → `no_wa_cred`.
     - `_review_pick_phone` boş → `no_phone`.
     - Aksi hâlde `phone_to` / `phone_source` yazılır, satır queued kalır.
  2. Pencere (lab saati Pzt–Cmt 10–18) içindeki lab'larda, numara başına en eski `delivered_at`'li satır seçilir. Seçim TÜM lab'lar üzerinden tek seferde yapılır (DISTINCT ON `phone_to`).
     - Aynı `phone_to` için, seçilen satırın lab gününde `coalesce(sent_at, claimed_at)` dolu bir satır varsa (lab fark etmez) numara atlanır.
     - Seçilenler `status='sending', claimed_at=p_now` olur, id'leri döner.
     - DISTINCT ON bir CTE'de seçilir; UPDATE `WHERE id IN (...) AND status='queued'`.
- **Produces — `_review_dispatch(p_request uuid) RETURNS void`:**
  - Tek gönderici.
  - `net.http_post` → `send-review-request`, gövde `{"requestId": "<id>"}`.
  - Başlıklar `_notify_channels`'daki gibi: anon Bearer + apikey + vault `notify_fn_secret` ile `x-notify-secret`.
- **Produces — `fn_review_request_tick() RETURNS integer`:** housekeeping → notify_app → claim → her id için `_review_dispatch`. Dönüş: sahiplenilen sayı.
- **Produces — cron:** `cron.schedule('review-request-tick', '7 * * * *', 'SELECT public.fn_review_request_tick()')`.
- Yeni fonksiyonların hepsi SECURITY DEFINER (`_review_phone_tr` hariç) ve hepsine `REVOKE ALL … FROM PUBLIC, anon, authenticated`.

- [ ] **Step 1: Canlı tanımı kaydet** — `.before.txt`'ye şunlar:
  - `notify_order_delivered` tanımı + md5 + `pg_get_triggerdef`.
  - `cron.job` listesi.
  - `_notify_channels` başlık deseni (yalnız referans).
  - `work_orders.delivered_at`'in teslim RPC'lerinde status ile AYNI UPDATE'te yazılıp yazılmadığı (`update_delivery_status` ve teslim yolları grep). Yazılmıyorsa `now()` yedeği yeterli; not düş.
- [ ] **Step 2: Göç dosyasını yaz** — Interfaces birebir. `notify_order_delivered` gövdesi `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING 'review_request: %', SQLERRM; END`. Cron, `cron.unschedule` korumalı (varsa önce kaldır) eklenir.
- [ ] **Step 3: `.down.sql`** — cron'u kaldır, yeni fonksiyonları düşür, `notify_order_delivered`'ı `.before.txt`'deki tanıma döndür.
- [ ] **Step 4: Deneme** (tek işlem; `_review_dispatch` ve `create_notification` işlem içinde taslağa çevrilir ve sayaç tablosuna yazar; `fn_review_request_tick` çağrılmaz, alt fonksiyonlar `p_now` ile çağrılır):
  - a) **Teslim:**
    - Canlı `teslim_edildi` olmayan bir siparişte `UPDATE work_orders SET status='teslim_edildi'` → 1 satır; `due_on` = lab günü + 3.
    - Geri al (`status='uretimde'`), yeniden teslim et → hâlâ 1 satır, `due_on` yeni güne göre.
    - Satırı `sent` yapıp yeniden teslim et → satır değişmez.
    - Tetikleyici içinde zorla hata (örn. geçersiz `lab_id`) → teslim UPDATE'i yine başarılı.
  - b) **Karar:** ayar kapalı → `wa_off`; açık ve `delivered_at < enabled_at` → `before_enabled`; opt-out → `opted_out`; numarasız hekim + kliniksiz → `no_phone`. Numara sırasının 4 basamağı ayrı ayrı doğrulanır.
  - c) **Sıklık:**
    - Aynı numaraya iki uygun satır (farklı teslim saatleri) → claim yalnız eskisini döndürür. Aynı `p_now` ile ikinci claim boş döner.
    - `p_now` + 1 gün → ikincisi döner.
    - Aynı numaraya İKİ FARKLI lab'dan uygun satır → claim yalnız birini döndürür; diğer lab'ın satırı ertesi güne kalır.
  - d) **Pencere:** Pazar 12:00, Pazartesi 09:59 ve Cumartesi 18:00 (lab saati) → boş. Pazartesi 10:00 → dolu.
  - e) **Bekleme:** `due_on + 8` gün `p_now` → `stale`. `sent_at` 8 gün önce → `expired`. `claimed_at` 2 saat önce → `failed/timeout`.
  - f) **Uygulama içi:**
    - `notify_app` hekim ve klinik alıcılarına `review_request` yazar (sayaç), ikinci çağrıda 0.
    - Değerlendirmesi olan işe 0.
  - g) **Yetki:** authenticated rol ile `SELECT fn_review_request_tick()` → `42501`.
- [ ] **Step 5: Kullanıcı onayı** (AskUserQuestion "Onaylıyorum, uygula"). Risk maddesinde belirt:
  - Teslim tetikleyicisi değişiyor (hata yutulur).
  - Saatlik görev ekleniyor; ayar kapalıyken WhatsApp göndermez, yalnız uygulama içi istek gider.
- [ ] **Step 6: Uygula ve ölç** — tanımlar, `cron.job` satırı, `notify_order_delivered` md5 = göç dosyası. Cron'un ilk çalışmasından sonra `cron.job_run_details` → `succeeded`.
- [ ] **Step 7: Commit** — `feat(puan): teslimde puan isteği ve saatlik görev (DB)`

### Task 4: DB — cevap yolu, lab'a haber, ayar RPC'leri

**Files:**
- Create: `supabase/migrations/20261103130000_puan_istegi_cevap.sql`
- Create: `supabase/rollbacks/20261103130000_puan_istegi_cevap.before.txt`
- Create: `supabase/rollbacks/20261103130000_puan_istegi_cevap.down.sql`

**Interfaces:**
- Consumes: `review_requests`, `_review_phone_tr`, Görev 1 metinleri.
- **Produces — `review_wa_record_answer(p_request uuid, p_score integer, p_from text, p_lab uuid) RETURNS jsonb`:**
  - Yalnız `service_role` EXECUTE.
  - Ret dönüşleri: istek yok → `{ok:false, reason:'unknown'}`; `p_lab <> lab_id` ya da `_review_phone_tr(p_from) <> phone_to` → `{ok:false, reason:'mismatch'}`; `p_score NOT IN (1,3,5)` → `{ok:false, reason:'score'}`.
  - **Puan yazımı:**
    - `INSERT … ON CONFLICT (work_order_id) DO UPDATE SET overall=EXCLUDED.overall WHERE order_reviews.source='whatsapp'`. Uygulamadan verilmiş değerlendirme EZİLMEZ.
    - `phone_source IN ('doctor_account','doctor')` ise `rater_role='doctor'`, `rater_id` = hekimin aktif profili (yoksa NULL).
    - Aksi hâlde `rater_role='clinic'`, `rater_id=NULL`.
    - `rater_doctor_id` her durumda `review_requests.doctor_id`.
  - **İstek güncellemesi:** `status='answered', answer, answered_at=now()`. `note_until` = `now()+24 saat` (puan < 5) ya da NULL.
  - **Lab'a haber:** önceki `answer` NULL ya da yeni puan daha düşükse `_review_alert_lab(p_request, CASE p_score WHEN 1 THEN 'problem' WHEN 3 THEN 'minor' END)`. 5'te haber yok.
  - Dönüş: `{ok:true, score, lab_name, alert:'problem'|'minor'|null}`.
- **Produces — `review_wa_add_note(p_from text, p_lab uuid, p_text text) RETURNS jsonb`:**
  - Yalnız `service_role`.
  - Satır seçimi: `phone_to = _review_phone_tr(p_from) AND lab_id = p_lab AND note_until > now()`, en yeni `answered_at`.
  - Yoksa `{ok:false}`.
  - Varsa yoruma ekle (`coalesce(comment || E'\n', '') || left(btrim(p_text), 1000)`), `note_until=NULL`, `{ok:true, work_order_id}`.
- **Produces — `_review_alert_lab(p_request uuid, p_kind text) RETURNS integer`:**
  - Lab yöneticisi kümesine gönderir.
  - `problem` → `_notify_channels(uid, 'review_problem', 'Hekim sorun bildirdi', …)`.
  - `minor` → `create_notification(uid, 'review_minor', 'Hekim küçük düzeltme istedi', …)`.
  - Ortak alanlar:
    - `resource_type='work_order'`, `action_url='/order/'||order`.
    - payload `{orderNumber, doctor, workType}` (`send-whatsapp-meta` `LAB_TEMPLATES.review_problem` bunu okur).
    - Gövde: Görev 1 biçimi.
  - Dönüş: alıcı sayısı.
- **Produces — `trg_whatsapp_meta_notify()`:** tek değişiklik kategori listesine `'review_problem'` eklemek. Lab yöneticisine giden `review_problem` satırı mevcut yoldan `send-whatsapp-meta`'ya gider.
- **Produces — `get_review_wa_settings() RETURNS jsonb`:**
  - `{enabled, enabled_at, delay_days, has_whatsapp}`.
  - `has_whatsapp` = aktif whatsapp-cloud kimliği var.
  - Yetkisiz çağrıda hata metni `Bu ayarı yalnız lab yöneticisi görebilir`.
- **Produces — `set_review_wa_settings(p_enabled boolean, p_delay_days integer) RETURNS jsonb`:**
  - Yetki: lab yöneticisi ya da admin (`get_my_lab_id()` lab'ı).
  - Ret metinleri (birebir):
    - `Gün sayısı 1 ile 14 arasında olmalı`
    - `Önce WhatsApp bağlantısını kurun` (açarken kimlik yoksa)
    - `Bu ayarı yalnız lab yöneticisi değiştirebilir`
  - Kapalıdan açığa geçişte `review_wa_enabled_at = now()`, kapatınca NULL.
  - `INSERT … ON CONFLICT (lab_id) DO UPDATE`.
  - Dönüş: `get_review_wa_settings()` biçimi.
- **Yetkiler:** `get_` / `set_` → `GRANT EXECUTE TO authenticated`. Diğer yeni fonksiyonlar → `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role` (yalnız `review_wa_*`).

- [ ] **Step 1: Canlı tanımı kaydet** — `trg_whatsapp_meta_notify` tanımı + md5 + yetkiler; `set_review_lab_reply` (yalnız referans).
- [ ] **Step 2: Göç dosyasını yaz** — Interfaces birebir. `trg_whatsapp_meta_notify` `.before.txt`'den kopyalanır, yalnız IN listesi değişir.
- [ ] **Step 3: `.down.sql`** — yeni fonksiyonları düşür, `trg_whatsapp_meta_notify`'ı geri yaz.
- [ ] **Step 4: Deneme** (tek işlem; `_notify_channels` ve `create_notification` taslağa çevrilip sayaç tablosuna yazar; servis rolü için `set local role service_role`):
  - a) Bilinmeyen istek → `unknown`. Başka numara → `mismatch`. Başka `p_lab` → `mismatch`. Puan 4 → `score`.
  - b) **İlk cevap 1:**
    - Satır `source='whatsapp'`, `overall=1`, `rater_role` / `rater_id` `phone_source`'a göre (`doctor_account`, `clinic_phone` iki vaka).
    - `note_until` dolu.
    - `_notify_channels` yönetici sayısı kadar, kategori `review_problem`.
  - c) **Sıralı basışlar:**
    - Sonra 3 → `overall=3`, haber YOK (iyileşme).
    - Sonra 1 → haber VAR.
    - İlk cevap 5 → haber yok, `note_until` NULL.
    - İlk cevap 3 → `create_notification` `review_minor`.
  - d) Uygulamadan verilmiş (`source='app'`) değerlendirmesi olan işte cevap → `overall` DEĞİŞMEZ, istek `answered`.
  - e) `status='expired'` istekte cevap → kaydedilir. İş `iptal`'e çekilmiş istekte cevap → kaydedilir, hata yok.
  - f) **Not:**
    - Pencere içinde → yorum eklenir, ikinci not `{ok:false}`.
    - Pencere geçmiş → `{ok:false}`.
    - 1200 karakterlik metin → 1000'e kırpılır.
  - g) **Ayar:**
    - Lab yöneticisi `set(true, 3)` → `enabled_at` dolu.
    - `set(true, 15)` → gün hatası.
    - Kimliksiz lab'da `set(true, 3)` → bağlantı hatası.
    - Teknisyen ve klinik → yetki hatası.
    - `set(false, 3)` → `enabled_at` NULL.
  - h) **Tetikleyici:** `review_problem` satırı eklenince `trg_whatsapp_meta_notify` `net.http_post` dalına girer. Bunu ölçmek için kategoriler IN listesini `pg_get_functiondef` metninde doğrula; tetikleyiciyi deneme içinde ATEŞLEME (gönderici).
  - i) authenticated rol ile `review_wa_record_answer` → `42501`.
- [ ] **Step 5: Kullanıcı onayı** — risk: `trg_whatsapp_meta_notify` değişiyor. Etkisi yalnız yeni kategori; mevcut beş kategori aynı.
- [ ] **Step 6: Uygula ve ölç** — md5'ler, yetkiler (`has_function_privilege` anon/authenticated/service_role).
- [ ] **Step 7: Commit** — `feat(puan): WhatsApp cevabı, lab'a haber ve ayar RPC'leri (DB)`

### Task 5: Edge — saf yardımcılar ve `send-review-request`

**Files:**
- Create: `supabase/functions/_shared/reviewRequest.ts`
- Create: `supabase/functions/_shared/reviewRequest.test.ts`
- Create: `supabase/functions/send-review-request/index.ts`

**Interfaces:**
- Produces (`_shared/reviewRequest.ts`, içe aktarma yok):
  - `type ReviewScore = 5 | 3 | 1`
  - `reviewButtonPayload(requestId: string, score: ReviewScore): string` → `review:<id>:<score>`
  - `parseReviewPayload(p: unknown): { requestId: string; score: ReviewScore } | null` — id UUID biçiminde değilse ya da puan {5,3,1} dışındaysa null
  - `classifyInbound(msg: any): { kind: 'review_button'; requestId: string; score: ReviewScore } | { kind: 'review_invalid' } | { kind: 'text'; text: string } | { kind: 'other' }`
    - Düğme yükü kaynağı: `msg.type==='button'` → `msg.button.payload`; `msg.interactive.button_reply.id` de denenir.
    - `review:` ile başlayıp geçersizse `review_invalid` döner.
    - `type==='text'` ve boş olmayan gövde → `text` (trim).
  - `doctorReplyFor(score: ReviewScore, labName: string): string` — Görev 1 metinleri; `labName` boşsa `laboratuvar`.
  - `workTypeLabel(raw: string | null): string` — virgülle ayrılmış parçaları tekilleştirip `, ` ile birleştirir, 60 karakterde `…` ile keser, boşsa `—`.
  - `normalizePhoneTR(raw: unknown): string` — `send-whatsapp-meta` ile aynı kural (o dosya değişmez).
  - `buildReviewTemplateMessage(o: { to: string; requestId: string; patient: string | null; orderNumber: string; workType: string | null }): Record<string, unknown>`
    - Graph API gövdesi: `messaging_product:'whatsapp'`, `type:'template'`, `template.name='is_degerlendirme'`, `language.code='tr'`.
    - Gövde parametreleri `parameter_name` ile `hasta_adi`, `siparis_no`, `is_turu` (Meta temizliği: sekme/yeni satır yok, 200 karakter, boş → `—`).
    - Üç `{type:'button', sub_type:'quick_reply', index:'0'|'1'|'2', parameters:[{type:'payload', payload: reviewButtonPayload(id, 5|3|1)}]}` bileşeni, sıra 5, 3, 1.
- Produces (`send-review-request`):
  - POST `{requestId}`. `x-notify-secret` ZORUNLU (`timingSafeEqualStr`, `NOTIFY_FN_SECRET` yoksa 503).
  - Satır `status='sending'` değilse no-op (`{ok:true, skipped}`).
  - Yeniden doğrulama: iş hâlâ `teslim_edildi` ve değerlendirmesiz değilse `skipped/reviewed|not_delivered`. Lab'ın aktif whatsapp-cloud kimliği yoksa `skipped/no_wa_cred`.
  - Graph API'ye gönderir. Başarıda `status='sent', sent_at, wamid`; hatada `status='failed', error` (500 karaktere kırpılmış).
  - Kimlikte `chat_bot === 'on'` ise `whatsapp_messages`'a `{lab_id, peer_phone: phone_to, direction:'out', body: 'Puan isteği: <sipariş no>', wamid, source:'bot'}` yazar (echo ayrımı).

- [ ] **Step 1: Testleri yaz** — `reviewRequest.test.ts`:
  - `reviewButtonPayload` ve `parseReviewPayload` gidiş-dönüş, üç puan için.
  - `parseReviewPayload('review:abc:5')` → null; `'review:<uuid>:4'` → null; `null`, `42` → null.
  - `classifyInbound`:
    - `{type:'button', button:{payload:'review:<uuid>:1'}}` → `review_button` (score 1).
    - `{type:'button', button:{payload:'review:x'}}` → `review_invalid`.
    - `{type:'button', button:{payload:'menu'}}` → `other`.
    - `{type:'text', text:{body:'  diş uymadı '}}` → `text` (`'diş uymadı'`).
    - `{type:'text', text:{body:'  '}}` → `other`.
    - `{type:'image'}` → `other`.
  - `doctorReplyFor(5,'Nexadent')` ve `doctorReplyFor(1,'Nexadent')` birebir Görev 1 metni (`{lab}` yerine ad). `doctorReplyFor(3,'')` içinde `laboratuvar`.
  - `workTypeLabel('Zirkonya Kron, Zirkonya Kron, Zirkonya Kron')` → `'Zirkonya Kron'`. 80 karakterlik girdi → 60 + `…`. `null` → `'—'`.
  - `normalizePhoneTR`: `'0535 524 48 59'` → `'905355244859'`, `'5355244859'` → `'905355244859'`, `'+90 535 524 48 59'` → `'905355244859'`, `''` → `''`.
  - `buildReviewTemplateMessage` → `template.name === 'is_degerlendirme'`. Gövde parametre adları sırasıyla `hasta_adi`, `siparis_no`, `is_turu`. `patient: null` → `'—'`. Düğme yükleri index sırasıyla `…:5`, `…:3`, `…:1`.
- [ ] **Step 2: Kırmızıyı gör** — `node --test supabase/functions/_shared/reviewRequest.test.ts` → `ERR_MODULE_NOT_FOUND`.
- [ ] **Step 3: `reviewRequest.ts`'i yaz** — Interfaces birebir.
- [ ] **Step 4: Yeşili gör** — aynı komut → `fail 0`.
- [ ] **Step 5: `send-review-request/index.ts`'i yaz** — iskelet `send-whatsapp-meta`'dan (CORS, secret, admin istemci, `GRAPH_VERSION='v20.0'`). Meta çağrısı `buildReviewTemplateMessage` ile. Sözdizimi kontrolü: `typescript.transpileModule` tanı sayısı 0.
- [ ] **Step 6: Yayınla ve doğrula** (gerçek gönderim YOK):
  - `OPTIONS` → 200.
  - Secret'sız POST → 401.
  - Doğru secret + var olmayan `requestId` → `{ok:true, skipped}`. Secret istemci tarafına çıkmaz; bu kontrol sunucu günlüğünden ya da yalnız 401 ile yapılır, `NOTIFY_FN_SECRET` değeri hiçbir yerde yazdırılmaz.
- [ ] **Step 7: Commit** — `feat(puan): WhatsApp puan isteği gönderen edge fonksiyonu`

### Task 6: Edge — webhook'ta cevabı yakalama

**Files:**
- Create: `supabase/functions/whatsapp-webhook/reviewCapture.ts`
- Create: `supabase/functions/whatsapp-webhook/reviewCapture.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/index.ts` — `processIncoming`, kimlik bulunduktan sonra ve `chat_bot` kapısından ÖNCE (bugün ~1789. satır)

**Interfaces:**
- Consumes: `classifyInbound`, `doctorReplyFor` (Görev 5); `review_wa_record_answer`, `review_wa_add_note` (Görev 4).
- Produces:
  ```ts
  export interface ReviewCaptureCtx {
    labId: string;
    botOn: boolean;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;   // PostgREST /rpc, servis rolü
    sendText: (to: string, body: string) => Promise<string | null>;     // wamid
    logMessage: (row: { peer: string; direction: 'in' | 'out'; body: string | null; wamid: string | null; source: 'customer' | 'bot' }) => Promise<void>;
  }
  export async function captureReviewMessages(messages: any[], ctx: ReviewCaptureCtx): Promise<Set<any>>  // yakalanan mesajlar
  ```
  - **`review_button`:**
    - `rpc('review_wa_record_answer', {p_request, p_score, p_from: msg.from, p_lab: labId})`.
    - `ok` ise `sendText(from, doctorReplyFor(score, lab_name))`.
    - `botOn` ise gelen ve giden için `logMessage` çağrılır (giden satır wamid'li, `source:'bot'`).
    - `ok:false` olsa da mesaj yakalanmış sayılır, yanıt gitmez.
  - **`review_invalid`:** yakalanır, başka bir şey olmaz.
  - **`text`:** `rpc('review_wa_add_note', {p_from, p_lab, p_text})` `ok` ise yakalanır (yanıt yok; `botOn` ise gelen kaydı). Değilse yakalanmaz.
  - **`other`:** dokunulmaz.
  - Her mesaj kendi `try/catch`'inde. Hata → yakalanmamış sayılır, akış bugünkü yoldan devam eder.
- index.ts değişikliği:
  - `botOn` hesaplanır, `captureReviewMessages(messages, ctx)` çağrılır, `rest = messages.filter(m => !captured.has(m))`.
  - Mevcut `if (chat_bot !== 'on') continue;` aynen kalır, altındaki `for (const msg of messages)` → `rest`.
  - `ctx.logMessage`, `logMessage` ile aynı REST çağrısıdır (kapı öncesinde `cx` yok; `lab_id`, `HJmin` başlıkları burada kurulur).

- [ ] **Step 1: Testleri yaz** — sahte `ctx` (çağrıları dizide toplayan), `reviewCapture.test.ts`:
  - **Düğme:**
    - `rpc` bir kez, doğru adlı ve argümanlı çağrılır.
    - `sendText` metni `doctorReplyFor` ile aynıdır.
    - Mesaj yakalananlar kümesindedir.
  - **Bot kapalıyken** düğme: `logMessage` hiç çağrılmaz.
  - **Bot açıkken giden yanıt kaydedilir:** düğme → `logMessage` iki kez (in + out); out satırında `sendText`'in döndürdüğü wamid ve `source:'bot'`.
  - **Eşleşmeyen yanıt:** `rpc` `{ok:false}` → yanıt yok, mesaj yine yakalandı.
  - **Not:** `text` + `rpc` `{ok:true}` → yakalandı, `sendText` yok. `{ok:false}` → yakalanmadı.
  - **`other`:** resim ve `menu` yüklü düğme → `rpc` çağrılmaz, yakalanmaz.
  - **Hata:** `rpc` fırlatır → mesaj yakalanmaz, diğer mesajlar işlenir.
- [ ] **Step 2: Kırmızıyı gör** — `node --test supabase/functions/whatsapp-webhook/reviewCapture.test.ts` → modül yok.
- [ ] **Step 3: `reviewCapture.ts`'i yaz.**
- [ ] **Step 4: Yeşili gör.**
- [ ] **Step 5: index.ts'e bağla.** Diff yalnız kapı öncesi blok ve döngü değişkeni olmalı (`git diff --stat` ~20 satır). Sözdizimi kontrolü `transpileModule`.
- [ ] **Step 6: Kullanıcı onayı ve yayın** — AskUserQuestion: "whatsapp-webhook yayınlansın mı?". Gerekçe: puanla ilgisiz mesajlar aynı yoldan geçer, bot kapalı davranış aynı. Onaydan sonra yayınla.
  - Doğrulama: GET doğrulaması (yanlış token → 403) ve `supabase functions logs` (ya da `query_logs`) ilk saatte `handleMessage err` / yeni hata yok.
- [ ] **Step 7: Commit** — `feat(puan): webhook WhatsApp puan cevabını ve notu yakalar`

### Task 7: Edge — lab şablonu ve e-posta etiketi

**Files:**
- Modify: `supabase/functions/send-whatsapp-meta/index.ts`
- Modify: `supabase/functions/send-email-notification/index.ts` — `CATEGORY_LABEL`, accent haritası

**Interfaces:**
- Produces:
  - `LAB_TEMPLATES.review_problem = { name: 'is_sorunu_lab', lang: 'tr', params: p => [{name:'hekim', text: clean(p.doctor)}, {name:'siparis_no', text: clean(p.orderNumber)}, {name:'is_turu', text: clean(p.workType)}] }`
  - Kapı:
    - `const tpl = TEMPLATES[category] ?? null; if (!tpl && !LAB_TEMPLATES[category]) return skipped`.
    - `params` yalnız `tpl` varken hesaplanır.
    - Müşteri alıcı + `tpl` yok → `results.push({id, skip:'no-client-tpl'})`.
    - Mevcut beş kategori için davranış birebir aynı.
  - E-posta: `review_problem: 'Hekim Geri Bildirimi'`, accent `'#DC2626'`.

- [ ] **Step 1: Değişiklikleri yaz**, `transpileModule` 0 tanı.
- [ ] **Step 2: E-postayı yayınla** — `send-email-notification` (bugün yayınlanan sürümün üstüne; yalnız etiket). `OPTIONS` 200, gövdesiz POST 400.
- [ ] **Step 3: `send-whatsapp-meta`'yı BEKLET** — Meta `is_sorunu_lab`'ı onaylayınca yayınlanır. Bu, Görev 11'deki açılış kontrol listesine madde olarak yazılır. O zamana kadar canlı sürüm `review_problem`'i `no-template-for-category` ile atlar; lab'a haber uygulama içi ve e-posta ile gider (spec §5.4).
- [ ] **Step 4: Commit** — `feat(puan): lab sorun şablonu ve e-posta etiketi`

### Task 8: İstemci — değerlendirme API'si, kural modülü, kaynak etiketi

**Files:**
- Create: `modules/reviews/reviewRules.ts`
- Create: `modules/reviews/reviewRules.test.mts`
- Modify: `modules/reviews/types.ts` — `OrderReview`
- Modify: `modules/reviews/api.ts`
- Modify: `modules/reviews/components/OrderReviewsSection.tsx:68` — etiket
- Modify: `modules/reviews/components/ReviewModal.tsx` — `23505` hatası düğmenin yanında
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Produces (`reviewRules.ts`, içe aktarma yok):
  - `PENDING_REVIEW_DAYS = 30`
  - `pendingReviewSince(now: Date): string` — `now − 30 gün`, ISO
  - `reviewSourceLabel(r: { source?: string | null; rater_role?: string | null }): 'WhatsApp · hekim' | 'WhatsApp · klinik hattı' | 'Klinik' | 'Hekim'`
- Produces (`types.ts`): `OrderReview.rater_id: string | null`, `source: 'app' | 'whatsapp'`, `rater_doctor_id: string | null`.
- Produces (`api.ts`):
  - `COLS` + `source, rater_doctor_id`.
  - `getOrderReview(workOrderId: string): Promise<{ data: OrderReview | null; error: any }>` — işin tek değerlendirmesi. `getMyReviewForOrder`'ın yerini alır; tek çağıranı Görev 9'da güncellenir.
  - `listMyPendingReviews(limit = 50)`:
    - `status='teslim_edildi'`, `.gte('delivered_at', pendingReviewSince(new Date()))`, `delivered_at` azalan.
    - HERHANGİ bir değerlendirmesi olan işler çıkarılır (`rater_id` süzgeci kalkar).
    - `PendingReviewOrder` aynı.
  - `submitReview`: `error.code === '23505'` → `{ data: null, error: { message: 'Bu iş az önce değerlendirildi. Sayfayı yenileyip düzenleyebilirsiniz.' } }`.
  - `getReviewWaSettings(): Promise<{ data: { enabled: boolean; enabled_at: string | null; delay_days: number; has_whatsapp: boolean } | null; error: any }>` (RPC `get_review_wa_settings`).
  - `setReviewWaSettings(enabled: boolean, delayDays: number)` (RPC `set_review_wa_settings`), aynı dönüş.

- [ ] **Step 1: Testleri yaz** — `reviewRules.test.mts`:
  - `pendingReviewSince(new Date('2026-11-03T09:00:00Z'))` → `'2026-10-04T09:00:00.000Z'`.
  - `reviewSourceLabel`:
    - `{source:'whatsapp', rater_role:'doctor'}` → `'WhatsApp · hekim'`.
    - `{source:'whatsapp', rater_role:'clinic'}` → `'WhatsApp · klinik hattı'`.
    - `{source:'app', rater_role:'clinic'}` → `'Klinik'`.
    - `{source:'app', rater_role:null}` → `'Hekim'`.
    - `{}` → `'Hekim'` (eski satırlar).
- [ ] **Step 2: Kırmızıyı gör** — `node --test modules/reviews/reviewRules.test.mts` → modül yok.
- [ ] **Step 3: `reviewRules.ts`, `types.ts`, `api.ts`'i yaz.**
- [ ] **Step 4: Yeşili gör.**
- [ ] **Step 5: Etiket ve hata** — `OrderReviewsSection` satır 68 `{reviewSourceLabel(r)} · {fmtWhen(r.created_at)}` (ayrı çocuklar, auto sözlük eşleşir). `ReviewModal` kayıt hatasını gönder düğmesinin hemen üstünde, kırmızı (`U.chipTones.danger`) satırda gösterir; mevcut hata gösterimi varsa onu kullan.
- [ ] **Step 6: Sözlük** — `WhatsApp · hekim`, `WhatsApp · klinik hattı`, hata metni ve (yoksa) `Klinik`, `Hekim` üç auto sözlüğe; anahtar kümesi eşit.
- [ ] **Step 7: Kontroller** — test takımı + `tsc` 0.
- [ ] **Step 8: Commit** — `feat(puan): iş başına tek değerlendirme ve WhatsApp kaynak etiketi (istemci)`

### Task 9: İstemci — sipariş ekranı, masaüstü ve mobil

**Files:**
- Create: `modules/reviews/components/ReviewPromptCard.tsx`
- Modify: `modules/orders/screens/OrderDetailScreenV2.tsx`:
  - import (106)
  - effect (815-830)
  - mobil dal (1436-1530'daki `<>` parçası)
- Modify: `modules/orders/screens/OrderDetailMobileHandoff.tsx` — props (≈100), lojistik kartından önce render (≈1039)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Consumes: `getOrderReview` (Görev 8), mevcut `ReviewModal`.
- **Produces — `ReviewPromptCard({ review, accent, onPress }: { review: OrderReview | null; accent: string; onPress: () => void })`:**
  - Masaüstündeki değerlendirme kartının (V2 ≈2037-2090) mobil karşılığı: panel accent gradyanı, yıldız ikonu (`Star`).
  - Başlık: `Bu işi değerlendir` ya da (`review` varsa) `Değerlendirmeyi gör / düzenle`. Varsa 5 yıldız dolu/boş.
  - Kart `Pressable`, `GlassTooltip` (`İşi değerlendir`). Koyu temada `useHeroSurface(accent)`.
- **Produces — `OrderDetailMobileHandoff` prop:** `reviewNode?: React.ReactNode`. Lojistik kartından önce, `paddingHorizontal: PAGE_PADDING`, `marginBottom: 12`.
- **V2:**
  - `getMyReviewForOrder` → `getOrderReview` (state adı `myReview` kalabilir).
  - Mobil dalda `reviewNode` yalnız `_isDoctorOrClinic && order.status === 'teslim_edildi'`.
  - Mobil `<>` parçasına masaüstündekiyle aynı props'la `<ReviewModal …/>` eklenir.
  - Kendiliğinden açma effect'i değişmez (artık mobilde de görünür).
  - Masaüstü kart metni `Değerlendirmeni gör / düzenle` aynı kalır.

- [ ] **Step 1: Bileşeni yaz**, V2 ve handoff'u bağla.
- [ ] **Step 2: Sözlük** — `Bu işi değerlendir`, `Değerlendirmeyi gör / düzenle`, `İşi değerlendir` üç dilde (varsa atla).
- [ ] **Step 3: Kontroller** — `tsc` 0, test takımı.
- [ ] **Step 4: Önizleme** (yalnız okur; kayıt düğmesine basılmaz):
  - Hekim/klinik oturumu yoksa, sahte Supabase tarayıcı düzeniyle (`project_mocked_supabase_browser_harness`) teslim edilmiş bir siparişte 375 px genişlikte kart görünür, dokununca modal açılır.
  - Koyu tema: kart okunur, beyaz patlama yok.
  - Lab oturumunda mobil sipariş ekranı değişmemiş.
  - Tema anahtarı `dental_app_theme_mode_v1` sonda `light`'a döndürülür.
- [ ] **Step 5: Commit** — `feat(puan): mobil sipariş ekranında değerlendirme kartı ve penceresi`

### Task 10: İstemci — mobil panolarda bekleyen değerlendirmeler

**Files:**
- Modify: `modules/dashboard/components/ClinicMobileDashboard.tsx`
- Modify: `modules/dashboard/components/DoctorMobileDashboard.tsx`
- Modify (gerekirse): `modules/reviews/components/PendingReviewsCard.tsx` — koyu tema

**Interfaces:**
- Consumes: `PendingReviewsCard` (`raterRole`, `compact`, `onCount`), Görev 8'deki yeni `listMyPendingReviews`.
- Produces:
  - İki mobil panoya `<PendingReviewsCard raterRole="clinic" | "doctor" compact />`, yan kenar `PAGE_PADDING`.
  - Yeri: ilk KPI / hero bloğunun hemen altı.
  - Liste boşken kart `null` döner; boşluk bırakmaz (`onCount` ile kap).

- [ ] **Step 1: Yerleştir.** Masaüstü panolar (`ClinicDashboardScreen` 1350, `DoctorDashboardScreen` 1030) değişmez.
- [ ] **Step 2: Koyu tema kontrolü** — `PendingReviewsCard` compact dalı sabit beyaz/pastel kullanıyorsa `useInkUI` / `useHeroSurface` ile koyu varyant ekle; açık değerler aynı kalır.
- [ ] **Step 3: Kontroller** — `tsc` 0, test takımı.
- [ ] **Step 4: Önizleme** — Görev 9 adım 4 ile aynı yöntem. 375 px, açık + koyu; kart görünür, dokununca `ReviewModal` açılır, boş listede boşluk yok.
- [ ] **Step 5: Commit** — `feat(puan): mobil klinik ve hekim panosunda bekleyen değerlendirmeler`

### Task 11: İstemci — lab ayarı, hekim anahtarı, bildirim kategorileri

**Files:**
- Create: `modules/reviews/components/ReviewRequestSettingsCard.tsx`
- Modify: `modules/integrations/screens/IntegrationsScreen.tsx` — `type === 'messaging' && providerKey === 'whatsapp-cloud'` bloklarının yanına (≈665, test mesajı bloğundan sonra)
- Modify: `modules/clinics/api.ts:130-155` — `createDoctor` / `updateDoctor` veri tipine `review_wa_opt_out?: boolean`
- Modify: `modules/clinics/types.ts:24` — `Doctor.review_wa_opt_out?: boolean`
- Modify: `modules/clinics/screens/ClinicsScreen.tsx`:
  - `DoctorForm` (98) ve `EMPTY_DOCTOR`
  - `DoctorModal` form doldurma (≈2532) ve payload (≈2562)
  - "Aktif" anahtarının altı (≈2745)
- Modify: `core/store/notificationPrefsStore.ts` (24, 73-75), `core/ui/mobile/NotificationsSheet.tsx` (479), `modules/settings/sections/NotificationsSection.tsx` (61-64, 96-118)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`
- Create: `docs/superpowers/plans/2026-11-03-whatsapp-puan-istegi-acilis.md` — açılış kontrol listesi

**Interfaces:**
- Consumes: `getReviewWaSettings`, `setReviewWaSettings` (Görev 8).
- **Produces — `ReviewRequestSettingsCard()`:**
  - Başlık `WhatsApp'tan puan iste`.
  - Açıklama: `Teslimden birkaç gün sonra hekime tek dokunuşla cevaplanan bir mesaj gider. Cevap işin değerlendirmesi olur.`
  - `AppSwitch` (açık/kapalı) ve gün seçici (1–14, varsayılan 3; `−` / `+` kapsül, `U.plainBtn`).
  - `has_whatsapp=false` → anahtar devre dışı ve altında `Önce WhatsApp bağlantısını kurun.`
  - Açıkken `enabled_at` gösterilir: `Açıldığı gün: <GG.AA.YYYY>. Bu tarihten önceki teslimlere istek gitmez.`
  - Kaydet düğmesi; hata düğmenin yanında. `GlassTooltip` her düğmede.
  - Koyu tema `useInkUI`.
- **Produces — hekim kartı:**
  - `AppSwitch` etiketi `WhatsApp puan isteği gönder`, `value={!form.review_wa_opt_out}`.
  - Alt yazı `Kapalıysa bu hekime WhatsApp'tan puan isteği gitmez.`
  - Payload'a `review_wa_opt_out`.
- **Produces — bildirim kategorileri:**
  - `NotificationCategory` += `'review_request' | 'review_problem' | 'review_minor'`.
  - `DEFAULT_PREFS`:
    - `review_request` `{in_app:true, browser_push:true, email:false, whatsapp:false}`
    - `review_problem` `{in_app:true, browser_push:true, email:true, whatsapp:false}`
    - `review_minor` `{in_app:true, browser_push:true, email:false, whatsapp:false}`
  - `CATEGORY_CFG`:
    - `review_request` `{icon: Star, color:'#E89B2A', label:'Değerlendirme'}`
    - `review_problem` `{icon: AlertTriangle, color:'#DC2626', label:'Hekim Sorunu'}`
    - `review_minor` `{icon: Wrench, color:'#E89B2A', label:'Küçük Düzeltme'}`
  - `NotificationsSection` satırları:
    - `review_problem` → `Hekim sorun bildirdi` / `Hekim WhatsApp'tan "Sorun var" dediğinde`
    - `review_minor` → `Hekim küçük düzeltme istedi` / `Hekim WhatsApp'tan "Küçük düzeltme" dediğinde`
    - `review_request` → `İşinizi değerlendirin` / `Teslimden birkaç gün sonra`
  - Görünürlük:
    - `review_problem` ve `review_minor` → `hideForClient` + `hideForTechnician`.
    - `review_request` → `hideForTechnician` ve yeni `hideForLab` (lab yöneticisi/admin için; `isClient` / `isTechnician` dışındaki dal).

- [ ] **Step 1: Bileşeni ve bağlantıları yaz.**
- [ ] **Step 2: Sözlük** — bu görevdeki tüm görünür metinler ve DB bildirim başlıkları (`İşinizi değerlendirin`, `Hekim sorun bildirdi`, `Hekim küçük düzeltme istedi`) üç auto sözlüğe. `Açıldığı gün:` önek eşleşmesi için `autoT('Açıldığı gün')` + tarih. Üç sözlük eşit.
- [ ] **Step 3: Kontroller** — `tsc` 0, test takımı.
- [ ] **Step 4: Önizleme** (canlı hesap salt okunur; Kaydet'e BASILMAZ):
  - Ayarlar → Entegrasyonlar → WhatsApp'ta kart görünür, `get_review_wa_settings` sonucu doğru çizilir.
  - Hekim kartında anahtar görünür.
  - Bildirim ayarlarında yeni satırlar doğru rollerde çıkar.
  - Açık + koyu tema.
- [ ] **Step 5: Açılış kontrol listesi** (`…-acilis.md`):
  1. Meta `is_degerlendirme` ve `is_sorunu_lab` onaylandı mı (Meta panelinde "Approved").
  2. `send-whatsapp-meta` yayını (Görev 7 adım 3).
  3. Web deploy (kullanıcı "deploy" deyince).
  4. Lab yöneticisi Ayarlar'dan özelliği açar.
  5. İlk gerçek gönderimden sonra `review_requests` durumları ve `whatsapp_delivery_log` kontrolü.
  6. İlk "Sorun var" cevabından sonra lab bildirimi, e-postası ve WhatsApp'ı kontrolü.
- [ ] **Step 6: Commit** — `feat(puan): lab ayarı, hekim anahtarı ve bildirim kategorileri`

### Task 12: Bitiş — yol haritası, hafıza, özet

**Files:**
- Modify: `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` — 3. dalga madde 2'nin ön koşulu: "WhatsApp puan isteği: DB + edge CANLI, istemci deploy bekliyor, Meta onayı bekliyor".
- Create: hafıza `project_whatsapp_review_request.md` + `MEMORY.md` satırı. İçerik:
  - Tablo ve fonksiyon adları, cron adı, kategoriler.
  - "İş başına tek değerlendirme".
  - Webhook'ta kapı-öncesi yakalama.
  - `send-whatsapp-meta` Meta onayına kadar bekletildi.

- [ ] **Step 1: Tam test takımı + `tsc` + sözlük eşitliği** — `bash $SP/tools/verify.sh` arka planda (≈10 dk). Çıktının sonu okunur.
- [ ] **Step 2: Yol haritası ve hafıza.**
- [ ] **Step 3: Commit** — `docs(puan): yol haritası — WhatsApp puan isteği`
- [ ] **Step 4: Kullanıcıya özet** — ne canlı, ne bekliyor (Meta onayı, web deploy, ayarın açılması), açılış listesinin yolu. Kişi adı ve tutar yazılmaz.
