# Kurye teslim kanıtı (2. dalga 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kendi kuryenin her teslimi fotoğraflı olur. Kliniğe teslimde ayrıca teslim alanın adı ve imzası alınır; alınamazsa nedeni kaydedilir. Yönetici gerekçeli olarak kanıtsız kapatabilir. BanaBiKurye'nin verdiği teslim alan adı ve varış saati siparişte görünür. Kliniğe giden teslim bildiriminde teslim alan yazar. "Tara" doğru teslimatı açar.

**Architecture:**
- **Veri:** `deliveries`'e kanıt sütunları eklenir. Dosyalar yeni, herkese kapalı `delivery-proofs` alanında `<lab_id>/<delivery_id>/<tür>-<zaman>.<uzantı>` yolunda durur.
- **Yazma yolu:** Bütün kanıt yazmaları DEFINER RPC'lerden geçer. İstemcinin yeni kanıt sütunlarına doğrudan yazması bir koruma tetikleyicisiyle reddedilir.
- **Kanıt kapısı:** Kanıtsız `teslim_edildi`'yi reddeden tetikleyici ayrı bir migration'dır (Task 8). Web yayını ve kuryelerin kullandığı uygulamanın kontrolünden sonra, kullanıcı onayıyla açılır.
- **İstemci:** `modules/delivery/proof/` saf modeli (test edilir), API sarmalayıcılarını, kurye kanıt penceresini, imza alanını, kanıt görüntüleyiciyi ve "Kanıtsız kapat" penceresini tutar.
- **BanaBiKurye:** Saf bir çıkarıcı (`supabase/functions/_shared/bbkProof.ts`) callback'te ve "Durumu Güncelle" takibinde kullanılır.

**Tech Stack:** Supabase Postgres (plpgsql, storage politikaları), Supabase Edge Functions (Deno), Expo + react-native-web, react-native-svg, expo-image-picker, `node --test` (`.test.mts` / `.test.ts`).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-27-kurye-teslim-kaniti-design.md`. Onaylı prototip: `docs/superpowers/specs/2026-10-27-kurye-teslim-kaniti-prototip.html`. Görsel ve hareket kaynağı odur; spec bölüm 6'yı birebir izler.

## Global Constraints

- **Veritabanı adımı beş aşamalıdır:**
  1. Canlı tanım `supabase/rollbacks/<ts>.before.txt` dosyasına kaydedilir.
  2. `.down.sql` yazılır.
  3. Geri alınan işlemde ölçülür: ÖNCE → migration → SONRA → down → GERİ ALMA, sonra RAISE.
     - Üretici: `python3 scratchpad/gecmis/gen_probe.py S mig down out measure`.
     - Senaryolar `begin … raise exception using errcode='P0099' … exception when sqlstate 'P0099'` bloklarında çalışır; desen `scratchpad/prova/fx_measure.sql`.
     - Her metin birleştirmesi `coalesce`'lidir.
  4. **Kullanıcı onayı** AskUserQuestion ile alınır.
  5. `supabase db query --linked -f <mutlak yol>` (my-expo-app'ten) ile uygulanır, canlıda ölçülür.
- **Deneme kimlikleri:**
  - lab `243ef1db-9853-424b-8292-0025abfca436`
  - sahip `f6817e96-2aab-443f-8cb3-02b7718f18e4`
  - kurye `baad4b1e-093c-4ae9-9009-689c0e5b5bc7`
  - klinik yöneticisi `560e1377-3b52-437e-8bf8-65147750e8fb`
  - hekim `747ae960-25da-4eb4-97f6-a54c477ee11b`
  - Denemelerde teslimat `insert into deliveries(...)` ile, `mode='internal'`, `courier_id = kurye` olarak oluşturulur.
- **Yasaklar (denemelerde):**
  - Gönderen fonksiyonlar çağrılmaz: `_notify_channels`, `fn_daily_order_watch`, `fn_prova_watch`, e-posta gönderen her şey.
  - Bildirim yalnız `_delivery_proof_notice` dönüşü ve uygulama içi satırlar üzerinden ölçülür.
  - Dosya alanı denemesi `storage.objects`'e işlem içinde satır ekler ve geri alır. Gerçek dosya yüklenmez.
- **Yetki:**
  - Kurye: `deliveries.courier_id = auth.uid()`.
  - Yönetici: `update_delivery_status`'un kuralıyla aynı. `is_platform_admin()` ya da (`lab_id = get_my_lab_id()` ve (`user_type='admin'` ya da (`user_type='lab'` ve `role in ('manager','admin')`))).
  - Okuma: `deliveries` satırını okuyabilen herkes. Dosyalarda bu, INVOKER `exists(select 1 from deliveries where id = …)` ile sağlanır.
- **Kanıt kuralları (spec 4.1–4.4):**
  - Yalnız `mode='internal'`.
  - Fotoğraf her yönde zorunlu.
  - Ad ve imza ya da "İmza alınamadı" nedeni yalnız `coalesce(direction,'lab_to_clinic')='lab_to_clinic'` için zorunlu.
  - Kanıtsız kapatma nedeni en az 6 karakter (`length(btrim(reason)) >= 6`).
- **"İmza alınamadı" nedenleri** (bu sırayla, Türkçe kaynak): "Resepsiyonda kimse yoktu", "İmzalamak istemedi", "Paket kapıya bırakıldı", "Diğer". "Diğer" için not en az 3 karakter. Kaydedilen neden "Diğer" değil, notun kendisidir.
- **Sunucu hata metinleri** (Türkçe; autoT sözlüğüne dört dilde girer):
  - 'Teslimat bulunamadı'
  - 'Bu teslimat size atanmamış'
  - 'Teslimat kapanmış ya da iptal edilmiş'
  - 'Teslim için fotoğraf gerekli'
  - 'Teslim için teslim alanın adı ve imzası gerekli'
  - 'Kanıt dosyası bulunamadı'
  - 'Kanıtsız kapatma yalnız yöneticiye açık'
  - 'Nedeni en az 6 karakter yazın'
  - 'Yalnız kendi kurye teslimatları kanıtsız kapatılır'
  - 'Teslim kanıtı yalnız teslim akışıyla yazılır'
- **Ekran:**
  - Dört dil aynı anda; `auto.{en,de,fa}.json` eşit.
  - Koyu tema token'larla (`useInkUI`, `useMobileTokens`).
  - Popup `useInkUI().modalOverlay/modalCard`, mobilde de ortada, dar ekranda dolgu 12.
  - Her yeni düğmede GlassTooltip; ikonlar `core/ui/icons`; emoji yok.
- **Hareket (spec 6):**
  - Tetikleyiciden açılan, aynı yoldan kapanan, yarıda kesilebilen yay: `Animated.spring` stiffness 320, damping 36, mass 1 (ProvaModal kalıbı).
  - Hareketi azaltma açıksa yalnız solma.
  - Titreşim yalnız fotoğraf, teslim ve eksikle basışta: native `Vibration.vibrate(10)`, web `navigator.vibrate?.(10)`.
  - Yeni native modül yok.
- **Doğrulama:**
  - `npx tsc --noEmit --incremental false` → 0.
  - Paket: `bash /private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/92fed326-e9be-452e-a41e-d705e960980b/scratchpad/search/suite.sh` yeşil.
  - Edge testi: `node --test supabase/functions/_shared/bbkProof.test.ts`.
- **Commit ve yayın:**
  - Commit yok, ledger tutulur.
  - Web yayını yalnız kullanıcı "deploy" deyince.
  - Edge function yayını (`banabikurye-callback --no-verify-jwt`, `banabikurye-dispatch`) yalnız kullanıcı onayıyla.
- **Canlı hesap salt okunur:** Önizlemede teslim, kapatma ya da kaydetme düğmesine basılmaz. Görsel kontrol `app/dev/delivery-proof.tsx` demo sayfasında yapılır.
- **KVKK:** Çıktılarda kişi adı, imza, fotoğraf bağlantısı ve tutar yazılmaz.

## Review Focus

1. **Kardeş teslimatlar ve yarış.** "Birlikte kapat"ta seçilen teslimatlardan biri arada kapanır ya da iptal edilir. Toplu kapatma atomik reddedilir, hiçbiri kapanmaz. Pencere hatayı düğmenin yanında gösterir. Test: T2 probu "K".
2. **Yabancı dosya.** Kurye başka bir teslimatın klasörüne yükler ya da RPC'ye başka teslimatın dosya yolunu verir. İkisi de reddedilir. Test: T1 probu "D" + T2 probu "Y".
3. **Siparişsiz gönderi.** Kendi kuryeyle yapılan siparişsiz gönderi kanıtla kapanır; "delivery not found" hatası vermez. Test: T2 probu "S".
4. **Yeniden açılan teslim.** Yönetici teslimi yeniden açar, kurye yeniden kapatırken kanıtı yeniler. Kapalı bir teslimde istemcinin kanıt sütununa yazması reddedilir. Test: T1 probu "G" + T2 probu "R".
5. **Eski istemci.** Kapı açılmadan önce eski istemci teslimi doğrudan kapatır ve `recipient_name` yazar; bu çalışmaya devam eder. Kapı açılınca reddedilir. Test: T1 probu "E" + T8 probu.

---

### Task 1: Şema, dosya alanı, koruma (SQL)

**Files:**
- Create: `supabase/migrations/20261028100000_kanit_sema.sql`
- Create: `supabase/rollbacks/20261028100000_kanit_sema.{down.sql,before.txt}`
- Probe: `scratchpad/kanit/t1_measure.sql`

**Interfaces — Produces:**
- **`deliveries` yeni sütunları** (hepsi NULL olabilir):
  - `proof_photo_path text`
  - `signature_skipped_reason text`
  - `proof_source text check (proof_source in ('courier','provider','manager_override'))`
  - `proof_captured_at timestamptz`
  - `recipient_title text`
  - `proof_override_reason text`
  - `proof_override_by uuid constraint deliveries_proof_override_by_fkey references profiles(id) on delete set null`
  - `proof_override_by_name text`
  - `proof_override_at timestamptz`
  - `provider_proof_checked_at timestamptz`
- **Dosya alanı:** `delivery-proofs`. Herkese kapalı, `file_size_limit 8388608`, `allowed_mime_types {image/jpeg,image/png,image/webp,image/heic}`.
- **`_delivery_proof_can_upload(p_lab uuid, p_delivery uuid) returns boolean`:** STABLE DEFINER. Teslimat `p_lab`'a ait, `courier_id = auth.uid()`, `mode='internal'` ve durumu `teslim_edildi`/`iptal` değil.
- **`_delivery_visible(p_delivery uuid) returns boolean`:** STABLE **INVOKER**, `exists(select 1 from public.deliveries where id = p_delivery)`.
- **Storage politikaları** (`storage.objects`, `bucket_id='delivery-proofs'`):
  - `dp_insert` (insert, authenticated): `_delivery_proof_can_upload(try_uuid(split_part(name,'/',1)), try_uuid(split_part(name,'/',2)))`.
  - `dp_select` (select, authenticated): `_delivery_visible(try_uuid(split_part(name,'/',2)))`.
  - UPDATE ve DELETE politikası yok.
- **Tetikleyici `trg_deliveries_proof_guard`:** BEFORE UPDATE ON deliveries. `current_user in ('authenticated','anon')` iken yukarıdaki on sütundan biri değişirse 42501 döner: 'Teslim kanıtı yalnız teslim akışıyla yazılır'. `recipient_name` ve `signature_path` bu aşamada korunmaz; eski istemci yazmaya devam eder (Task 8 ekler).
- Yardımcıların hepsi: `revoke all … from public, anon, authenticated`. Yalnız `_delivery_visible` ve `_delivery_proof_can_upload` storage politikası için `authenticated`'a `grant execute` alır.

- [ ] **Step 1:** `.before.txt`'ye yazılır:
  - `deliveries` sütunları,
  - tetikleyici listesi,
  - `storage.buckets` listesi,
  - `delivery-proofs` yokluğu.

  `.down.sql`: politikalar, tetikleyici, fonksiyonlar ve sütunlar düşer; alan boşsa silinir.
- [ ] **Step 2: Probe yaz** (`t1_measure.sql`). Teslimat: sahip lab'ında, kuryeye atanmış, `yolda`, `lab_to_clinic`. Senaryolar:
  - **D: dosya.** Kurye kimliğiyle:
    - kendi teslimatının klasörüne `storage.objects` INSERT → geçer;
    - başka teslimatın klasörüne → reddedilir;
    - teslimat `teslim_edildi` iken → reddedilir.

    Klinik yöneticisi o teslimatın dosyasını SELECT eder → görür. Başka lab'dan bir kullanıcı → görmez.
  - **G: koruma.** Kurye kimliğiyle `update deliveries set proof_photo_path='x'` → 42501. `update deliveries set recipient_name='x'` → geçer.
  - **E: eski istemci.** Kurye kimliğiyle `update deliveries set status='teslim_edildi'` → geçer (kapı yok).
  - Kurye `_delivery_proof_can_upload` = t; sahip = f.
- [ ] **Step 3: Probe çalıştır.** Beklenen:
  - ÖNCE: sütun, alan ve fonksiyon yok (senaryolar "yok" yazar).
  - SONRA: yukarıdaki sonuçlar.
  - GERİ ALMA = ÖNCE.
- [ ] **Step 4: Kullanıcı onayı** (AskUserQuestion: ne eklenir, neyi etkilemez, geri alma).
- [ ] **Step 5:** Uygula ve canlıda ölç:
  - sütunlar,
  - alan (`public=false`),
  - iki politika,
  - koruma tetikleyicisi,
  - `deliveries` satır sayısı değişmemiş.

  Ledger satırı yazılır.

### Task 2: Teslim RPC'leri ve bildirim metni (SQL)

**Files:**
- Create: `supabase/migrations/20261028101000_kanit_rpc.sql` + down/before
- Probe: `scratchpad/kanit/t2_measure.sql`

**Interfaces:**
- **Consumes (Task 1):** sütunlar, `delivery-proofs`, koruma tetikleyicisi.
- **Produces — RPC'ler:**
  - **`deliver_with_proof(p_items jsonb, p_recipient_name text default null, p_skip_reason text default null) returns int`**
    - Grant: `authenticated`. Dönen değer kapanan teslimat sayısıdır.
    - `p_items`: `[{delivery_id uuid, photo_path text, signature_path text|null}]`, 1 ile 10 öğe.
    - Her öğede denetlenir:
      - teslimat var ('Teslimat bulunamadı');
      - `courier_id = auth.uid()` ('Bu teslimat size atanmamış', 42501);
      - `mode='internal'`, durum açık ('Teslimat kapanmış ya da iptal edilmiş');
      - `photo_path` dolu ('Teslim için fotoğraf gerekli');
      - `photo_path` `<lab_id>/<delivery_id>/` ile başlıyor ve `storage.objects`'te var ('Kanıt dosyası bulunamadı');
      - `lab_to_clinic` ise (`btrim(p_recipient_name)` ≥ 2 karakter ve geçerli `signature_path`) ya da `btrim(p_skip_reason)` ≥ 3 karakter ('Teslim için teslim alanın adı ve imzası gerekli').
    - Herhangi bir öğe geçmezse hiçbir teslimat kapanmaz (tek işlem).
    - Her öğe için önce kanıt sütunları yazılır: `proof_source='courier'`, `proof_captured_at=now()`, `recipient_name`, `signature_path`, `signature_skipped_reason`. Sonra kapanır:
      - `work_order_id` doluysa `perform public.update_delivery_status(id,'teslim_edildi',null)`;
      - boşsa `status='teslim_edildi', delivered_at=coalesce(delivered_at, now())` doğrudan.
    - Durum açıksa ve kapanmamışsa eski kanıt sütunları üzerine yazılır. Yeniden açılan teslimde kanıt böyle yenilenir.
  - **`close_delivery_without_proof(p_delivery uuid, p_reason text) returns void`**
    - Grant: `authenticated`.
    - Denetimler: yönetici kuralı ('Kanıtsız kapatma yalnız yöneticiye açık', 42501); `mode='internal'` ('Yalnız kendi kurye teslimatları kanıtsız kapatılır'); durum açık; neden ≥ 6 karakter ('Nedeni en az 6 karakter yazın').
    - Yazılanlar: `proof_source='manager_override'`, `proof_override_reason`, `proof_override_by=auth.uid()`, `proof_override_by_name` (profiles.full_name), `proof_override_at=now()`.
    - Kapanış `deliver_with_proof` ile aynı yoldandır.
  - **`delivery_proof_siblings(p_delivery uuid) returns table(delivery_id uuid, order_number text)`**
    - Grant: `authenticated`. Yalnız o teslimatın kuryesi çağırır; değilse boş döner.
    - Aynı kurye, `mode='internal'`, durumu açık, `coalesce(direction,'lab_to_clinic')='lab_to_clinic'`, `_resolve_wo_clinic_id(work_order_id)` aynı ve boş değil, `p_delivery` hariç. `created_at`'e göre sıralı.
  - **`bbk_apply_delivery_proof(p_tracking_no text, p_recipient_name text, p_recipient_title text, p_visit_at timestamptz, p_place_photo_path text, p_sign_photo_path text) returns jsonb`**
    - Grant yalnız `service_role`.
    - Eşleşen BanaBiKurye teslimatında (`btrim(external_tracking_no)=btrim(p_tracking_no)`, sağlayıcı ilike '%banabikurye%', `status='teslim_edildi'`) şunları yazar: `provider_proof_checked_at=now()`; boş olmayan alanlar `recipient_name`, `recipient_title`, `proof_photo_path`, `signature_path`. Herhangi biri doluysa `proof_source='provider'`, `proof_captured_at=coalesce(p_visit_at, now())`.
    - Mevcut dolu alanın üzerine yazmaz. Bunun tek istisnası `provider_proof_checked_at`'tir.
    - `{ok, rows}` döner.
- **Produces — bildirim:**
  - **`_delivery_proof_notice(p_order uuid) returns text`:** STABLE DEFINER, istemciye kapalı.
    - Siparişin `purpose='teslimat'`, `lab_to_clinic` ve `teslim_edildi` olan en son teslimatına bakar. Saat `to_char(delivered_at at time zone lab_tz(lab),'HH24:MI')`.
    - Dönüşler:
      - override → 'Kanıtsız kapatıldı · HH:MI';
      - `recipient_name` dolu → 'Teslim alan: <ad> · HH:MI';
      - `signature_skipped_reason` dolu → 'İmza alınamadı · HH:MI';
      - teslimat var ama kanıt yok → 'Teslim saati: HH:MI';
      - teslimat yok → NULL.
  - **`trg_work_order_notify_status` değişikliği:**
    - Yalnız "DİĞER STATÜLER"deki `clinic_admin` döngüsünde ve `NEW.status='teslim_edildi'` iken gövde `coalesce(_delivery_proof_notice(NEW.id) || ' · ', '') || '#' || coalesce(NEW.order_number,'?')` olur.
    - Gövdenin geri kalanı canlı tanımdan birebir kalır.
    - Canlı tanım bir betikle alınır. İçindeki anahtar ekrana basılmaz; `scratchpad/kanit/def_*.sql` kalıbı.

- [ ] **Step 1:** `.before.txt` ve `.down.sql` yazılır. Bunlar `trg_work_order_notify_status`'un canlı tanımını ve yeni fonksiyonların yokluğunu içerir. Migration ve down'daki tanım bir betikle üretilir (`fx_gen.py` kalıbı, `sub()` tek eşleşme denetimiyle).
- [ ] **Step 2: Probe yaz** (`t2_measure.sql`). Dosya varlığı için `storage.objects`'e işlem içi satır eklenir. Senaryolar:
  - **A: kliniğe teslim.**
    - Fotoğraf, ad ve imza → `deliver_with_proof` = 1; teslimat `teslim_edildi`; sipariş `kuryede`'ydiyse `teslim_edildi`.
    - `_delivery_proof_notice` 'Teslim alan: … · HH:MI' ile başlar.
  - **N: nedenle.** İmzasız, `p_skip_reason='Resepsiyonda kimse yoktu'` → geçer; bildirim 'İmza alınamadı · …'.
  - **F: eksik.**
    - Fotoğrafsız → 'Teslim için fotoğraf gerekli'.
    - Adsız ve nedensiz → 'Teslim için teslim alanın adı ve imzası gerekli'.
    - Lab'a teslimde (`clinic_to_lab`) yalnız fotoğraf → geçer.
  - **Y: yabancı yol.** Başka teslimatın klasöründeki yol → 'Kanıt dosyası bulunamadı'. Sahip kimliğiyle çağrı → 42501.
  - **K: kardeş yarış.** İki teslimat; ikincisi önceden `iptal` → çağrı hata verir, birincisi de açık kalır.
  - **S: siparişsiz.** `work_order_id` boş iç teslimat → kanıtla kapanır.
  - **R: yeniden aç.** Kapanmış teslimat postgres ile `yolda`'ya çekilir; yeni fotoğraf yoluyla yeniden kapanır; `proof_photo_path` yeni yol olur.
  - **O: kanıtsız.**
    - Kurye çağırır → 42501.
    - Sahip 'kısa' nedenle → 'Nedeni en az 6 karakter yazın'.
    - Geçerli nedenle → kapanır; `proof_override_by_name` dolu; bildirim 'Kanıtsız kapatıldı · …'.
  - **B: sağlayıcı.**
    - Dış teslimat `teslim_edildi`. `bbk_apply_delivery_proof` ad ve saatle → `proof_source='provider'`, `recipient_name` yazılır.
    - Hepsi boş → yalnız `provider_proof_checked_at` dolar.
    - `authenticated` ile çağrı → yetki hatası.
  - **Kardeş listesi:** Aynı klinikteki iki açık teslimattan birinde `delivery_proof_siblings` diğerini döner; sahip kimliğiyle boş döner.
- [ ] **Step 3: Probe çalıştır.** Beklenen:
  - ÖNCE: fonksiyonlar yok.
  - SONRA: yukarıdaki sonuçlar.
  - GERİ ALMA = ÖNCE; bildirim fonksiyonu eski gövdeye döner (md5 eşit).
- [ ] **Step 4: Kullanıcı onayı.**
- [ ] **Step 5:** Uygula ve canlıda ölç:
  - fonksiyonlar var,
  - grant'lar doğru (`bbk_apply_delivery_proof` yalnız service_role),
  - bildirim fonksiyonunun md5'i migration'daki gövdeyle eşit.

  Hata metinleri `scratchpad/kanit/i18n_errs.json`'a yazılır; Task 3'te sözlüğe eklenir. Ledger.

### Task 3: Saf model, API ve sunucu hata çevirileri (istemci)

**Files:**
- Create: `modules/delivery/proof/proofModel.ts`, `modules/delivery/proof/proofModel.test.mts`
- Create: `modules/delivery/proof/api.ts`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces — Produces** (`proofModel.ts`, React ve Supabase bağımlılığı yok):
- **Tipler ve sabitler:**
  - `export type ProofDirection = 'lab_to_clinic' | 'clinic_to_lab' | 'lab_to_other' | 'other_to_lab'`
  - `export const SKIP_REASONS = ['Resepsiyonda kimse yoktu','İmzalamak istemedi','Paket kapıya bırakıldı','Diğer'] as const`
  - `export const OTHER_REASON = 'Diğer'`
  - `export const OVERRIDE_MIN_LEN = 6`
  - `export interface ProofDraft { hasPhoto: boolean; recipientName: string; hasSignature: boolean; skip: boolean; reason: string | null; otherText: string }`
  - `export interface ProofEval { ok: boolean; hint: string | null; steps: boolean[]; recipientName: string | null; skipReason: string | null }`
  - `export type ProofKind = 'courier' | 'nosig' | 'override' | 'provider' | 'provider_empty' | 'none'`
  - `export interface ProofLegFields { status?: string | null; mode?: string | null; direction?: string | null; proof_source?: string | null; signature_skipped_reason?: string | null; provider_proof_checked_at?: string | null }`
- **Fonksiyonlar:**
  - `export function needsSignature(direction: string | null | undefined): boolean`: `null`/`undefined` → true (DB `coalesce` kuralı).
  - `export function evaluateProof(d: ProofDraft, direction: string | null | undefined): ProofEval`
  - `export function pickOpenDelivery(rows: { id: string; status: string; created_at: string }[]): string | null`
  - `export function proofKindOf(leg: ProofLegFields): ProofKind`
  - `export function overrideReasonOk(s: string): boolean`

**`api.ts`:**
- `export const PROOF_BUCKET = 'delivery-proofs'`
- `export const PROOF_SELECT = 'recipient_name, recipient_title, signature_path, proof_photo_path, signature_skipped_reason, proof_source, proof_captured_at, proof_override_reason, proof_override_by_name, proof_override_at, provider_proof_checked_at'`
- `export type ProofAsset = { uri: string; mimeType?: string | null; blob?: Blob | null }`
- `export function proofPath(labId: string, deliveryId: string, kind: 'photo' | 'signature', ext: string, now = Date.now()): string` → `${labId}/${deliveryId}/${kind}-${now}.${ext}`
- `export async function uploadProofFile(labId: string, deliveryId: string, kind: 'photo' | 'signature', asset: ProofAsset): Promise<{ path: string | null; error: string | null }>`: `modules/reviews/api.ts` kalıbı (web blob / native FormData), `upsert: false`.
- `export async function deliverWithProof(items: { delivery_id: string; photo_path: string; signature_path: string | null }[], recipientName: string | null, skipReason: string | null): Promise<{ ok: boolean; closed?: number; error?: string }>`
- `export async function closeWithoutProof(deliveryId: string, reason: string): Promise<{ ok: boolean; error?: string }>`
- `export async function fetchProofSiblings(deliveryId: string): Promise<{ delivery_id: string; order_number: string | null }[]>`
- `export async function signProofUrls(paths: string[]): Promise<Record<string, string>>`: 1 saatlik.
- `export async function findOpenDeliveryForOrder(orderId: string, courierId: string): Promise<string | null>`: `pickOpenDelivery`'yi kullanır.
- `export async function fetchDeliveryForProof(deliveryId: string): Promise<{ id: string; lab_id: string; direction: string | null; destination_name: string | null; order_number: string | null } | null>`

- [ ] **Step 1: Failing test yaz** (`proofModel.test.mts`):
  - `evaluateProof` boş taslak, `lab_to_clinic` → `{ok:false, hint:'Önce fotoğraf çekin', steps:[false,false,false]}`.
  - Fotoğraf + ad 'Ay' + imzasız → hint `'İmza alın ya da "İmza alınamadı"yı açın'`. Ad 'A' (1 harf) → hint 'Teslim alanın adını yazın'.
  - Fotoğraf + ad 'Ayşe Y.' + imza → `ok`, `recipientName:'Ayşe Y.'`, `skipReason:null`, `steps:[true,true,true]`.
  - `skip:true`, `reason:null` → hint 'İmzanın neden alınamadığını seçin'. `reason:'Diğer', otherText:'ab'` → ok değil. `otherText:'kapı kilitli'` → `ok`, `skipReason:'kapı kilitli'`, ad boşsa `recipientName:null`.
  - `clinic_to_lab` / `lab_to_other` / `other_to_lab`: yalnız fotoğrafla `ok`, `steps.length===1`.
  - `needsSignature(null)===true`, `needsSignature('lab_to_other')===false`.
  - `pickOpenDelivery`:
    - `[atandi(eski), yolda(yeni), teslim_edildi]` → yolda'nın id'si.
    - İki `atandi` → `created_at` en eski olan.
    - Hepsi kapalı → `null`.
  - `proofKindOf`:
    - `{status:'yolda'}` → 'none'
    - `{status:'teslim_edildi', proof_source:'manager_override'}` → 'override'
    - `{status:'teslim_edildi', proof_source:'courier', signature_skipped_reason:'x'}` → 'nosig'
    - `{status:'teslim_edildi', proof_source:'courier'}` → 'courier'
    - `{status:'teslim_edildi', proof_source:'provider'}` → 'provider'
    - `{status:'teslim_edildi', mode:'external', provider_proof_checked_at:'…'}` → 'provider_empty'
    - `{status:'teslim_edildi', mode:'external'}` → 'none'
  - `overrideReasonOk('  12345 ')===false`, `overrideReasonOk('123456')===true`.
  - `proofPath('L','D','photo','jpg',5)==='L/D/photo-5.jpg'`. Bu test `api.ts`'i içe aktarmaz; `proofPath` `proofModel.ts`'e konur ve `api.ts` onu yeniden dışa aktarır.
- [ ] **Step 2:** `node --test modules/delivery/proof/proofModel.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** `proofModel.ts` ve `api.ts`'i yaz. Sunucu hata metinlerini (Task 2 listesi) ve modelin dört ipucunu `auto.{en,de,fa}.json`'a ekle. `scratchpad/prova/i18n_add.mjs` kalıbı.
- [ ] **Step 4:** Test → PASS. `npx tsc --noEmit --incremental false` → 0. Paket yeşil. Üç sözlükte anahtar sayısı eşit.

### Task 4: Kurye kanıt penceresi (istemci)

**Files:**
- Create: `modules/delivery/proof/useAnchoredSpring.ts`
- Create: `modules/delivery/proof/SignaturePad.tsx` (native: react-native-svg + PanResponder), `modules/delivery/proof/SignaturePad.web.tsx` (canvas + Pointer Events)
- Create: `modules/delivery/proof/ProofPhotoField.tsx`
- Create: `modules/delivery/proof/DeliveryProofSheet.tsx`
- Create: `app/dev/delivery-proof.tsx` (demo; API çağırmaz)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes (Task 3):** `evaluateProof`, `needsSignature`, `SKIP_REASONS`, `OTHER_REASON`, `uploadProofFile`, `deliverWithProof`, `fetchProofSiblings`, `fetchDeliveryForProof`, `ProofAsset`.
- **Produces:**
  - **`useAnchoredSpring(visible: boolean, origin: OriginRect | null): { mounted: boolean; cardStyle: any; scrimStyle: any }`**
    - `OriginRect = { x: number; y: number; w: number; h: number }`; ProvaModal'daki tip yeniden kullanılır.
    - Yay ProvaModal'daki gibidir. Kapanırken yeniden açılırsa o anki değerden döner. Hareketi azaltmada yalnız opaklık.
  - **`SignaturePad`:** `forwardRef<SignaturePadHandle, { disabled?: boolean; onChange: (hasInk: boolean) => void; height?: number }>`
    - `SignaturePadHandle = { clear(): void; restore(): boolean; toAsset(): Promise<ProofAsset | null> }`.
    - `clear` son çizimi saklar; `restore` onu geri getirir.
    - Çizgi kalınlığı hıza göre 1.3–3.2 arası değişir. Web'de `getCoalescedEvents` kullanılır; dönüşü boşsa olayın kendisi alınır.
    - `toAsset`: web'de PNG Blob, native'de Svg `toDataURL` → `data:image/png;base64` uri.
  - **`ProofPhotoField`:** `{ value: ProofAsset | null; onChange: (a: ProofAsset | null) => void; disabled?: boolean }`
    - Native: izin + `ImagePicker.launchCameraAsync({ quality: 0.6 })`; yalnız kamera.
    - Web: `<input type="file" accept="image/*" capture="environment">`. Seçilen dosya tuvalle uzun kenar 1600 px'e, JPEG 0.82'ye indirilir.
    - Çekim anı: deklanşör ışığı, yerine oturma yayı, titreşim.
  - **`DeliveryProofSheet`:** `{ visible: boolean; deliveryId: string | null; origin?: OriginRect | null; onClose: () => void; onDelivered: (closed: number) => void; demo?: DemoDelivery }`
    - `DemoDelivery = { direction: string; destination_name: string; order_number: string; siblings: number }`. `demo` verilirse ağ çağrısı yapılmaz; gönderim başarılı sayılır.
    - Bölümler: Fotoğraf → Teslim alan → İmza → "İmza alınamadı" Switch'i ve neden çipleri ("Diğer" → not alanı). Kardeş teslimat varsa "Bu klinikteki N teslimatı birlikte kapat" Switch'i, varsayılan açık.
    - Durum etiketleri: "Zorunlu" / "Tamam" / "Alınamadı" / "İsteğe bağlı". Adım çizgisi; "Teslimi tamamla".
    - Eksikle basılırsa ipucu sallanır ve titreşir.
    - Gönderim: seçili her teslimat için fotoğraf ve imza o teslimatın klasörüne yüklenir, sonra tek `deliverWithProof` çağrılır. Hata düğmenin altında görünür. Çekilen fotoğraf ve imza korunur, yeniden denenebilir.
    - "Temizle"den sonra 4 sn "Geri al" bildirimi çıkar.
    - Üst ve alt kenarda kaydırma solması vardır.
- **`app/dev/delivery-proof.tsx`:** Üç demo düğmesi: "Kliniğe teslim", "Lab'a teslim", "Kliniğe teslim · 2 paket". Her biri pencereyi düğmenin konumundan açar.

- [ ] **Step 1:** `useAnchoredSpring`, `SignaturePad(.web)` ve `ProofPhotoField`'ı yaz. `npx tsc --noEmit --incremental false` → 0.
- [ ] **Step 2:** `DeliveryProofSheet` ve demo sayfasını yaz; yeni metinleri dört dile ekle. tsc → 0.
- [ ] **Step 3: Önizleme kontrolü** (`/dev/delivery-proof`, preview "Expo Web"; salt okunur, demo):
  - **Kliniğe teslim:** Boşken düğme soluk, ipucu 'Önce fotoğraf çekin'. Ad yazılınca ipucu imzaya geçer. İmza çizilince düğme etkinleşir; "Temizle" → "Geri al" → imza geri gelir. Switch → nedenler açılır, imza alanı soluklaşır.
  - **Lab'a teslim:** Yalnız fotoğraf bölümü.
  - **2 paket:** "Bu klinikteki 1 teslimatı birlikte kapat" Switch'i görünür.
  - Koyu ve açık temada ekran görüntüsü; mobil (375) ve masaüstü genişlik.
  - Konsolda hata yok.
- [ ] **Step 4:** Paket yeşil; üç sözlük eşit. Ledger.

### Task 5: Kurye entegrasyonları ve "Tara" (istemci)

**Files:**
- Modify: `modules/courier/screens/CourierDeliveryDetailScreen.tsx` (`ActionBar`, `yolda` dalı)
- Modify: `modules/courier/screens/CourierDashboardScreen.tsx` (`doAdvance` ve 438 civarındaki odak kartı)
- Modify: `modules/delivery/screens/CourierDeliveryScreen.tsx` (`handleAdvance`, teslim adımı)
- Modify: `app/(courier)/_layout.tsx` (`onOpenOrder`)

**Interfaces — Consumes:** `DeliveryProofSheet` (Task 4), `findOpenDeliveryForOrder` (Task 3).

- [ ] **Step 1: Detay ekranı.**
  - `yolda` dalındaki üç düğme (ölü "Fotoğraf çek", ölü "İmza al", "Teslim et") yerine tek "Teslim et" düğmesi gelir: yeşil, tam genişlik, GlassTooltip 'Teslim kanıtını al ve teslimi kapat'.
  - Düğme `measureInWindow` ile konumunu verip `DeliveryProofSheet`'i açar. `onDelivered` → mevcut yenileme.
  - Diğer durum düğmeleri (`teslim_alindi`, `yola çıktım`) değişmez.
- [ ] **Step 2: Pano.** `doAdvance`'te `next === 'teslim_edildi'` ise durum değiştirilmez, pencere açılır. "Paketi aldım" (`teslim_alindi`) tek dokunuşla kalır.
- [ ] **Step 3: Eski kurye ekranı.** `handleAdvance`'te `nextFlow.to === 'teslim_edildi'` ise eski ad sorusu yerine pencere açılır. Diğer adımlar aynen kalır.
- [ ] **Step 4: "Tara".** Kurye düzeninde `onOpenOrder(orderId)` şöyle çalışır:
  - `findOpenDeliveryForOrder(orderId, profile.id)` → id varsa tarayıcı kapanır, `/(courier)/delivery/${id}` açılır.
  - Yoksa tarayıcı açık kalır ve `toast` ile 'Bu siparişte size atanmış açık teslimat yok' gösterilir.

  İstasyon düzeni değişmez.
- [ ] **Step 5:**
  - tsc → 0; paket yeşil; yeni metinler dört dilde.
  - Statik kontrol (`scratchpad/kanit/t5_check.sh`):
    - courier ekranlarında `updateDeliveryStatus(…, 'teslim_edildi')` kalmamış (`grep` sayısı 0);
    - `courier.action.takePhoto` ve `getSignature` artık kullanılmıyor.

  Ledger.

### Task 6: Siparişte kanıt, görüntüleyici, kanıtsız kapatma (istemci)

**Files:**
- Create: `modules/delivery/proof/ProofRow.tsx`, `modules/delivery/proof/ProofViewerModal.tsx`, `modules/delivery/proof/CloseWithoutProofModal.tsx`
- Modify: `modules/orders/components/OrderLogisticsCard.tsx` (`DeliveryLeg` tipine `ProofLegFields` + kanıt alanları; satır altına `ProofRow`; görüntüleyici kartın içinde)
- Modify: `modules/orders/screens/OrderDetailScreenV2.tsx` (deliveries `select`'ine `PROOF_SELECT`; yöneticinin iki "teslim edildi" eylemi; `CloseWithoutProofModal` `stageModals` ortak sabitine)
- Modify: `modules/orders/components/StageWorkflowTimeline.tsx` (~435)
- Modify: `modules/delivery/screens/DeliveryDetailScreen.tsx` (yönetici teslim adımı + siparişsiz gönderide kanıt satırı)

**Interfaces:**
- **Consumes:** `proofKindOf`, `PROOF_SELECT`, `signProofUrls`, `closeWithoutProof`, `overrideReasonOk`, `useAnchoredSpring`.
- **Produces:**
  - **`ProofRow`:** `{ leg: ProofLegFields & { id: string; recipient_name?: string | null; recipient_title?: string | null; proof_photo_path?: string | null; signature_path?: string | null; proof_override_reason?: string | null; proof_override_by_name?: string | null; delivered_at?: string | null }; onOpen: (origin: OriginRect) => void }`. `proofKindOf`'a göre:
    - **courier:** küçük fotoğraf + imza; 'Teslim alan: <ad>' / 'Fotoğraf · imza'.
    - **nosig:** küçük fotoğraf; 'İmza alınamadı' (amber) / '<neden> · fotoğraf var'.
    - **provider:** varsa küçük resimler; 'Teslim alan: <ad>' / "BanaBiKurye'den · varış HH:MI".
    - **provider_empty:** basılamaz satır 'BanaBiKurye bu teslim için kanıt göndermedi.'
    - **override:** amber kutu 'Kanıtsız kapatıldı · Yönetici: <ad>' + 'Neden: <metin>'.
    - **none:** hiçbir şey çizilmez.
    - Lab'a teslim: 'Lab'a teslim edildi' / 'Fotoğraf'.
  - **`ProofViewerModal`:** `{ visible: boolean; onClose: () => void; leg: …; origin: OriginRect | null; orderNumber?: string | null }`
    - İçerik: büyük fotoğraf, imza ya da 'İmza alınamadı' + neden, Teslim alan / Saat / Kurye satırları. BanaBiKurye kanıtında "Kanıt BanaBiKurye'den geldi" etiketi; fotoğraf yoksa açıklama satırı.
    - Dosyalar `signProofUrls` ile açılır.
  - **`CloseWithoutProofModal`:** `{ visible: boolean; onClose: () => void; deliveryId: string; subtitle: string; origin: OriginRect | null; onClosed: () => void }`
    - İçerik: açıklama paragrafı (spec 4.4 metni), neden alanı (çok satırlı), "Kanıtsız kapat" (amber).
    - Neden 6 karakterden kısayken düğme soluk durur, ipucu 'Nedeni yazın; klinik de görür'. Hata düğmenin altında görünür.
- **Ekrandaki davranış:**
  - `OrderLogisticsCard`, `isManager` iken `mode='internal'` ve açık bacakta "Kanıtsız kapat" düğmesi gösterir (GlassTooltip 'Kurye kanıt alamadıysa nedeniyle kapat').
  - V2, StageWorkflowTimeline ve lab teslimat detayındaki yönetici "teslim edildi" eylemleri: `mode='internal'` ise doğrudan `updateDeliveryStatus` yerine `CloseWithoutProofModal`'ı açar; dış teslimatta bugünkü davranış aynen kalır.
  - `OrderDetailScreenV2.tsx` ~2405'teki "Durumu Güncelle" değişmez.

- [ ] **Step 1:** `ProofRow`, `ProofViewerModal` ve `CloseWithoutProofModal`'ı yaz; demo sayfasına (`app/dev/delivery-proof.tsx`) altı durumla "Siparişte" bölümünü ekle: kendi kurye, imza alınamadı, BanaBiKurye adlı, BanaBiKurye boş, yolda (yönetici), kanıtsız kapatıldı. tsc → 0.
- [ ] **Step 2:** `OrderLogisticsCard`, V2, StageWorkflowTimeline ve lab teslimat detayı entegrasyonlarını yap. tsc → 0.
- [ ] **Step 3: Önizleme kontrolü** (salt okunur):
  - Demo sayfada altı durum.
  - Kanıt satırına basınca görüntüleyici küçük resimden açılır, kapanınca oraya döner.
  - "Kanıtsız kapat"ta 6 karakterden kısa neden → düğme soluk.
  - Canlı bir siparişin Lojistik kartı açılır ve bozulmamıştır (eski teslimatlarda kanıt satırı çizilmez, `none`).
  - Koyu ve açık tema, mobil ve masaüstü. Konsolda hata yok.
- [ ] **Step 4:** Paket yeşil, sözlükler eşit. Statik kontrol: V2'de `stageModals` içinde `CloseWithoutProofModal` var. Ledger.

### Task 7: BanaBiKurye kanıtı (edge function)

**Files:**
- Create: `supabase/functions/_shared/bbkProof.ts`, `supabase/functions/_shared/bbkProof.test.ts`
- Modify: `supabase/functions/banabikurye-callback/index.ts`, `supabase/functions/banabikurye-dispatch/index.ts` (`track`)

**Interfaces:**
- **Consumes (Task 2):** `bbk_apply_delivery_proof`.
- **Produces:**
  - **`bbkProof.ts`** (içe aktarma yok; saf):
    - `export interface BbkProof { recipientName: string | null; recipientTitle: string | null; visitAt: string | null; placePhotoUrl: string | null; signPhotoUrl: string | null }`
    - `export function extractBbkProof(order: unknown): BbkProof | null`: teslim noktası, `is_return_point !== true` olan son noktadır. Boş ya da salt boşluk dizeler `null` olur. Nokta yoksa `null` döner.
    - `export function hasAnyProof(p: BbkProof | null): boolean`
  - **`applyBbkProof(admin, labId, deliveryId, trackingNo, proof)`:** callback ve dispatch içinde tekrar etmesin diye `_shared/bbkProofApply.ts`'e konur (Deno; supabase istemcisini parametre alır).
    - Fotoğraf bağlantısı varsa indirir ve `delivery-proofs/<lab>/<delivery>/provider-place.jpg` ile `provider-sign.jpg`'ye service role ile yükler (`upsert: true`).
    - Sonra `bbk_apply_delivery_proof`'u çağırır.
    - Hata yutulur ve loglanır; teslimi asla bozmaz.
- **Callback:**
  - Eşleşme `ok` ve eşlenen durum `teslim_edildi` ise gövdeden `order` alınır.
  - `extractBbkProof` `null` dönerse teslimatın lab'ının `provider_credentials` anahtarıyla `/orders?order_id=` tek kez okunur.
  - Sonra `applyBbkProof` çağrılır.
- **Dispatch `track`:** `found?.status === 'completed'` ise `found` ile `applyBbkProof` çağrılır.

- [ ] **Step 1: Failing test yaz** (`bbkProof.test.ts`, `node:test`; fixture'lar uydurma, gerçek kişi yok):
  - İki noktalı sipariş, son noktada `checkin.recipient_full_name:'Test Alıcı'`, `courier_visit_datetime` dolu, fotoğraflar `''` → `{recipientName:'Test Alıcı', visitAt:<değer>, placePhotoUrl:null, signPhotoUrl:null, recipientTitle:null}`; `hasAnyProof` true.
  - Son nokta `is_return_point:true` ise ondan önceki nokta kullanılır.
  - `checkin:null` ve boş alanlar → `hasAnyProof` false.
  - `points` yok ya da `order` `null` → `extractBbkProof` `null`.
  - `'  '` → `null`.
- [ ] **Step 2:** `node --test supabase/functions/_shared/bbkProof.test.ts` → FAIL.
- [ ] **Step 3:** `bbkProof.ts`, `bbkProofApply.ts`, callback ve dispatch değişikliklerini yaz.
- [ ] **Step 4:** Test → PASS. Paket yeşil.
- [ ] **Step 5: Yayın, kullanıcı onayıyla** (AskUserQuestion: iki fonksiyon, ne değişir, geri alma = önceki sürümü yeniden yayınlamak):
  - `supabase functions deploy banabikurye-callback --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api --no-verify-jwt`
  - `supabase functions deploy banabikurye-dispatch --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api`

  Yayından sonra yalnız callback'in GET sağlık yanıtı (200) denetlenir. Ledger.

### Task 8: Kanıt kapısı (SQL — yazılır ve denenir, uygulaması ertelenir)

**Files:**
- Create: `supabase/migrations/20261028109000_kanit_kapi.sql` + down/before
- Probe: `scratchpad/kanit/t8_measure.sql`

**Interfaces — Produces:**
- **`trg_deliveries_proof_gate`:** BEFORE UPDATE OF status ON deliveries. Koşul: `NEW.status='teslim_edildi' AND OLD.status IS DISTINCT FROM 'teslim_edildi' AND NEW.mode='internal'`. Reddedilen durumlar:
  - `proof_photo_path` ve `proof_override_reason` ikisi de boş → 'Teslim için fotoğraf gerekli';
  - `lab_to_clinic` iken override yok ve (ad + `signature_path`) ile `signature_skipped_reason` ikisi de yok → 'Teslim için teslim alanın adı ve imzası gerekli'.
- **`trg_deliveries_proof_guard` genişler:** İstemcinin doğrudan yazamayacağı sütunlara `recipient_name` ve `signature_path` eklenir.

- [ ] **Step 1:** before/down ve migration'ı yaz.
- [ ] **Step 2: Probe:**
  - Kurye kimliğiyle doğrudan `status='teslim_edildi'` → reddedilir.
  - Kurye `recipient_name` doğrudan → 42501.
  - `deliver_with_proof` → geçer; `close_delivery_without_proof` → geçer.
  - Dış teslimatta (`bbk_apply_delivery_status`) kapanış → geçer.
  - Yönetici `update_delivery_status(...,'teslim_edildi')` kanıtsız iç teslimatta → reddedilir.
- [ ] **Step 3:** Probe çalıştır: ÖNCE geçer, SONRA reddeder, GERİ ALMA = ÖNCE. Ledger'a "kapı hazır, uygulanmadı" yazılır.
- [ ] **Step 4: Uygulama, bu planın dışında bekler.** Şartlar:
  - Web yayını yapılmış olmalı ("deploy").
  - Kuryelerin kullandığı uygulama ve sürüm kullanıcıyla kontrol edilmiş olmalı. Kaynak: son 14 günde kurye `activity_logs` giriş kayıtlarının platform bilgisi ya da kullanıcının söylediği.
  - AskUserQuestion onayı alınmış olmalı.

  Telefon uygulaması kullanan kurye varsa kapı, yeni sürüm yayınlanana kadar bekler.

---

## Self-review notları

- **Spec kapsamı:**

  | Spec | Görev |
  |---|---|
  | 4.1, 4.2, 4.3 | T1, T2, T3, T8 |
  | 4.4 | T2, T6 |
  | 4.5 | T2, T7 |
  | 4.5b | T2, T4 |
  | 4.6 | T3, T5 |
  | 4.7 | T2, T6 |
  | 5.1 | T4, T5 |
  | 5.2 | T6 |
  | 6 | T4, T6 |
  | 7.1–7.3 | T1, T2 |
  | 7.5 | T8 |

  - 7.4 (KVKK aydınlatma metni) bilerek dışarıda; hukukçu işi.
- **Ad tutarlılığı:** `deliver_with_proof`, `close_delivery_without_proof`, `delivery_proof_siblings`, `bbk_apply_delivery_proof`, `_delivery_proof_notice`, `PROOF_SELECT` ve `proofKindOf` T2 ile T3–T7 arasında aynı.
