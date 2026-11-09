# Ön Ekstre PDF, Onay Bağlantısı ve Ay Sonu Gönderimi — Implementation Plan (4/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ön ekstrenin özet ve ayrıntılı PDF'i alınabilsin. Klinik yöneticisi girişsiz bir bağlantıdan ya da PDF'teki karekoddan onay verebilsin. Lab "Onay iste" ile bağlantıyı gönderebilsin; ay sonunda bağlantı kendiliğinden gitsin.

**Architecture:**
- **PDF tamamen istemcide üretilir.** Saf HTML üreticiler `modules/invoices/buildPreStatementHtml.ts` içindedir. Ortak bir PDF çıkış yardımcısı vardır: masaüstü web'de yeni sekmede yazdır; dar ekran ve PWA'da iframe + html2canvas + jsPDF ile dosya; native'de expo-print + paylaşım. PDF bölümü ilk iki görevle kendi başına yayına alınabilir.
- **Onay bağlantısı:**
  - `statement_approval_links` tablosunda yalnız jetonun sha256 karması saklanır.
  - Bağlantı tek bir kliniğe ve oluşturulduğu andaki taslak anlık görüntüsüne (`[{id, updated_at}]`) bağlıdır. Anti-hedef 4 gereği başka klinik ya da dönem açılamaz.
  - Girişsiz sayfa `app/s/[token].tsx` adresindedir. Mevcut `pay` ve `doctor-approval` gibi public route'tur.
  - Sayfa SECURITY DEFINER jeton RPC'lerini çağırır. Onay plan 3'ün `_ps_finalize`'ını `via='link'` ile çalıştırır.
- **Gönderim:**
  - Mesaj bağlantıyı taşır. PDF bağlantı sayfasından indirilir (Ruling R1 aşağıda).
  - E-posta mevcut Resend yolundan, WhatsApp mevcut Meta yolundan gider.
  - Ay sonu bir pg_cron işiyle yapılır; ayarı açık lab'ları ve taslağı olan klinikleri dolaşır.

**Tech Stack:** Supabase Postgres (plpgsql, pg_cron), Expo/RNW TS, `qrcode` (`modules/orders/lib/qrSvg.ts::localQrSvg`), html2canvas + jsPDF (dinamik import), expo-print/expo-sharing, `node --test` (.test.mts), i18n `core/i18n/locales/auto.{en,de,fa}.json`.

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-06-on-ekstre-onay-design.md`
- Bu planın kapsamı: §2.4 (bağlantı ve karekod yolu), §2.7, §2.14 (PDF), §2.15, §4 anti-hedef 4, §5 KVKK ve "onay bağlantısı yönetici hekime gider" ile "gönderim zamanı: ay sonunda" kullanıcı kararları.
- Plan 5'e kalan: e-fatura birleşik satır ve "F-xxxx iş dökümü" bağı.

**Plan 3'ten gelen canlı arayüz** (değiştirilmez, tüketilir):
- `get_pre_statement(p_clinic_id)` → `PreStatement` (`modules/invoices/types.ts`)
- `_ps_finalize(p_clinic_id, p_invoices jsonb, p_mode, p_via, p_reason)`, `_ps_actor`, `_ps_can_manage`
- Tablolar `statement_item_notes`, `statement_item_disputes`, `statement_approvals` (`via` içinde `'link'` zaten var)
- İstemci: `modules/invoices/lib/preStatement.ts`, `modules/invoices/preStatementApi.ts`, `modules/invoices/components/LabPreStatementSection.tsx`, `modules/finance-clinic/screens/PreStatementScreen.tsx`

## Rulings (plan yazarının kararları; kullanıcıya sunulur)

- **R1 — PDF ekte değil, bağlantıda.** Mesaja PDF eklenmez; mesajda bağlantı olur, PDF bağlantı sayfasından indirilir.
  - Neden: ay sonu işi sunucuda çalışır ve PDF üretimi istemcide. Sunucuda PDF üretmek ayrı bir altyapı ister (headless tarayıcı).
  - Bedeli: hekim PDF'i bir dokunuşla açar, ekte görmez.
- **R2 — Bağlantı biçimi.**
  - Jeton 32 rastgele bayttır, base64url ile kodlanır; yalnız karması saklanır.
  - Süre 45 gündür. Aynı klinik için yeni bağlantı oluşunca eskisi iptal olur.
  - Görüntüleme süre boyunca serbesttir. Onaydan sonra bağlantı "kullanıldı" olur ve ikinci onayı kabul etmez.
  - Not yazmaya süre boyunca izin verilir.
- **R3 — Bağlantı kimin adına onaylar.** Bağlantı oluşturulurken alıcı seçilir (`recipient_profile_id`): kliniğin `clinic_admin`'i, kliniksiz bağımsız hekimde hekimin kendisi. `approved_by` bu kişidir. Alıcı yoksa bağlantı oluşturulamaz (`PS_NO_RECIPIENT`).
- **R4 — PDF varsayılanı.** `lab_settings.pre_statement_pdf_format` (`'ozet'|'ayrintili'`, varsayılan `'ozet'`) eklenir. PDF düğmesi seçiciyi bu değerle açar.
- **R5 — Klinik panelinden alınan PDF'te karekod yoktur.** Kullanıcı zaten giriş yapmıştır. Karekod yalnız lab'ın ürettiği ve bağlantı içeren PDF'te bulunur.
- **R6 — WhatsApp şablonu.** Meta, ilk mesaj için onaylı şablon ister. Görev 5'te uygulayıcı mevcut şablonları listeler. Uygun şablon yoksa WhatsApp kanalı "şablon onayı bekliyor" diye kapalı kalır ve e-posta çalışır. Şablon başvurusu kullanıcıya bırakılır.
- **R7 — Yetkisiz hekim (kullanıcı kararı).** Fatura görme yetkisi (billing_view) olmayan hekime yeni menü ya da sekme açılmaz; onay veremez. Bu hekim PDF'i yalnız lab'dan alır. Lab'ın PDF düğmesinde isteğe bağlı "Hekim" seçici bulunur. Hekim seçilince PDF yalnız o hekimin kalemlerini içerir ve kliniğin geneline ait rakamlar (kesinleşmiş bakiye, vadesi geçen) gösterilmez. Hekimli PDF'te karekod yoktur, çünkü onay yetkisi kliniğin yöneticisindedir.

## Global Constraints

- **Komutlar:**
  - DB: `cd my-expo-app && supabase db query --linked -f <abs> [-o csv]`
  - Test: `find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test` (taban 611/611)
  - Tip kontrolü: `npx tsc --noEmit --incremental false`. ÖN PLANDA çalıştır, tek seferde bir tane; sonuç 0 hata olmalı.
- **Her DB değişikliği beş adımla gider:**
  1. `supabase/rollbacks/<ad>.before.txt` yakalanır.
  2. Migration `supabase/migrations/<ad>.sql` ve `supabase/rollbacks/<ad>.down.sql` yazılır.
  3. `BEGIN … ROLLBACK` içinde probe çalıştırılır.
  4. **DUR:** kontrolör kullanıcıdan "Onaylıyorum, uygula" alır.
  5. Uygula, ölç, commit et.
- **Göndericiler probe'larda çağrılmaz:**
  - `notifications` tablosuna INSERT yapılmaz (`trg_whatsapp_meta_notify` gönderir); `siman.skip_notify='on'` kullanılır.
  - `net.http_post` / edge çağrısı yapılmaz.
  - Cron işinin gövdesi probe'da gönderici dalı kapalıyken çalıştırılır.
  - `cron.job.command` okunmaz.
- **Yayın:** edge ve web yayını ayrı kullanıcı onayıyla yapılır; aynı anda iki build/deploy açılmaz.
- **Yetki ve kişisel veri:**
  - Kimlik taklidi yalnız `set_config('request.jwt.claims', …, true)` ile yapılır; parola girilmez.
  - KVKK: PDF'te ve bağlantı sayfasında hasta adı yalnız baş harfle yer alır. Bağlantı sayfası telefon ya da e-posta göstermez. Çıktılarda kişi adı veya tutar yazılmaz, yalnız sayım.
- **Tablo ve fonksiyon kuralları:**
  - Yeni tablo RLS'siz olmaz.
  - SECURITY DEFINER + `SET search_path = public`; anon'a yalnız jeton RPC'leri açılır.
  - Jeton hiçbir tabloda düz metin saklanmaz ve hiçbir log'a yazılmaz.
- **İstemci kuralları:**
  - node ile test edilen lib dosyalarında yerel içe aktarma yalnız `import type` olur.
  - Testlerde `setLanguage` çağrılmaz.
  - `updated_at` string olarak taşınır, `Date`'e çevrilmez.
- **Arayüz kuralları (CLAUDE.md):**
  - tr/en/de/fa ve koyu tema birlikte yapılır.
  - Kenar boşluğu `PAGE_PADDING`; popup'lar `U.modalOverlay` ile ortalanır.
  - İkon butonlarında `GlassTooltip`.
  - Hata mesajı butonun yanında gösterilir.
  - Sol kenarı renkli kart kullanılmaz; yalnız HugeIcons.
  - Gönder butonlarında useRef ile çift gönderim kilidi bulunur.
  - Metin giren popup'larda KeyboardAvoidingView kullanılır.
- **Mobil PDF:** `feedback_mobile_pdf_generation` hafızasındaki yol izlenir:
  - html2pdf kullanılmaz.
  - iframe içine `-webkit-text-size-adjust:100%` eklenir.
  - Logoya px boyut verilir.
  - Native'de `margins: {top:45,bottom:45,left:40,right:40}`.
- **Sözlük ve dokunulmaz dosyalar:**
  - Sözlükler yalnız hunk bazında stage edilir ("Tam kafa" satırları başka oturumundur).
  - Dokunulmaz: `modules/ar-scanner/**`, `modules/viewer-3d/**`, `modules/orders/components/FaceScanQuickAction.tsx`.
  - `PriceListScreen.tsx` ve mevcut `buildStatementHtml.ts` davranışı değiştirilmez.
- **Commit:** main üzerinde, push yok. Mesaj `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` satırıyla biter.

## Review Focus

1. **Bağlantıyla başka veri açılması (anti-hedef 4).**
   - Bir jeton yalnız kendi kliniğinin, kendi anlık görüntüsündeki taslaklarını gösterir ve onaylar.
   - Bağlantıdan sonra eklenen yeni taslak görünmez.
   - Süresi geçmiş, iptal edilmiş ya da kullanılmış jeton `PS_LINK_INVALID` döner. Bu hata hangisinin olduğunu açıklamaz.
2. **Bağlantı açıldıktan sonra taslak değişirse (K6).** Anlık görüntüden sonra lab'ın düzenlediği taslak, bağlantıdan onaylanmaz. "Değişti" olarak döner ve sayfada "Bazı faturalar değişti; lab'dan yeni bağlantı isteyin" yazar.
3. **Çok işli klinik PDF'i.**
   - 300 kalemli ayrıntılı PDF'te tablo başlığı her sayfada tekrarlanır.
   - Bir satır iki sayfaya bölünmez.
   - Hekim ara toplamları ve genel toplam, ekrandaki onay bekleyen toplamla kuruşuna kadar aynıdır (anti-hedef: bakiye farkı).
4. **Ay sonu işinin ikinci kez çalışması.** Cron aynı ay için iki kez tetiklenirse aynı kliniğe ikinci mesaj gitmez (ay + klinik başına tek gönderim kaydı).
5. **Alıcısı olmayan klinik.** `clinic_admin`'i olmayan, e-postası ya da telefonu olmayan klinik için "Onay iste" hatayı butonun yanında açık metinle verir. Ay sonu işi bu kliniği atlar ve sayar; işin geri kalanı durmaz.

---

### Task 1: Ön ekstre PDF HTML üreticileri (saf)

**Files:**
- Create: `modules/invoices/buildPreStatementHtml.ts`, `modules/invoices/buildPreStatementHtml.test.mts`
- Create: `modules/invoices/lib/preStatementPdf.ts`, `modules/invoices/lib/preStatementPdf.test.mts` (gruplama ve toplam hesapları)

**Interfaces — Produces:**
- `lib/preStatementPdf.ts`:
  - `groupByDoctor(inv: PreStatementInvoice[]): { doctor: string; items: (PreStatementItem & {invoice_id: string; invoice_date: string|null; currency: string})[]; subtotal: Record<string, number> }[]`
    - Hekim adı boşsa `'—'`. Gruplar hekim adına göre `localeCompare('tr')` ile sıralanır. Toplam para birimi başına ayrı tutulur.
  - `workTypeTotals(inv: PreStatementInvoice[]): { work: string; currency: string; quantity: number; total: number }[]`
    - `description` ve para birimi başına toplar. Tutara göre azalan sıralanır.
  - `pendingTotal(inv: PreStatementInvoice[]): Record<string, number>`
    - Fatura `total`'larının para birimi başına toplamı. 2 ondalığa yuvarlanır ve `get_pre_statement.summary.pending` ile aynı olmalıdır.
  - `scopeToDoctor(data: PreStatement, doctor: string): PreStatement` (R7)
    - Yalnız o hekimin kalemlerini bırakır ve kalemi kalmayan faturayı düşürür.
    - Kalan faturalarda `subtotal`, `tax` ve `total`, bırakılan kalemlerin `total` ve `gross_total` toplamlarından yeniden hesaplanır.
    - `summary` alanında `finalized_balance` ve `overdue` `null` olur; `pending`, bırakılan kalemlerin `gross_total` toplamıdır (para birimi başına, 2 ondalık).
    - `scope` `'own'` yapılır.
- `buildPreStatementHtml.ts`:
  - `buildPreStatementSummaryHtml(input: PreStatementPdfInput): string`
  - `buildPreStatementDetailHtml(input: PreStatementPdfInput): string`
  - `type PreStatementPdfInput = { clinicName: string; lab: LabLetterhead; data: PreStatement; generatedAt: string; approve?: { url: string; qrSvg?: string; expiresAt: string } }`
  - `LabLetterhead` tipi `buildStatementHtml.ts`'ten `import type` ile alınır.
- **İki PDF'in ortak öğeleri:**
  - Sayfa başında lab antetli başlığı.
  - Belirgin bant: "Ön ekstre — onay bekliyor".
  - Üç rakam para birimi başına yer alır: kesinleşmiş bakiye, vadesi geçen, onay bekleyen. `null` değerler (own scope) satırda gösterilmez.
  - `approve` varsa sağ üstte karekod (`qrSvg`; yoksa yalnız URL metni), altında "Onaylamak için karekodu okutun · Son geçerlilik: <tarih>".
  - Hasta yalnız `patient_initials` ile yazılır. Kod yeni bir alan eklemez.
- **Özet PDF:** hekim toplamları tablosu, iş türü toplamları tablosu, fatura listesi (fatura başına tek satır: tarih, kalem sayısı, ara toplam, KDV, toplam, itiraz sayısı). Hedef 1–2 sayfadır.
- **Ayrıntılı PDF:**
  - İlk sayfada genel özet bulunur (üç rakam ve hekim toplamları).
  - Ardından hekim bölümleri gelir. Her bölümde tablo vardır: tarih, sipariş no, hasta, iş, adet, birim fiyat, tutar, durum. Durum itiraz/yanıtlandı rozeti ve not sayısıdır.
  - Hekim ara toplamı bölüm sonunda yer alır.
  - CSS kuralları: `thead { display: table-header-group }`, `tr { break-inside: avoid; page-break-inside: avoid }`, `@page { size: A4; margin: 16mm 14mm }`.
- Tüm metinler `esc()` ile kaçırılır. Para `fmtMoney` deseniyle biçimlenir (`Number(n)||0`) ve faturanın para birimini kullanır.

- [ ] **Step 1: Failing testler (`preStatementPdf.test.mts`)**
  - `groupByDoctor` iki hekim ve üç faturayı doğru gruplar, hekim adı boş olanı `'—'` altına koyar, ara toplamlar para birimi başına doğrudur.
  - `workTypeTotals` aynı iş ve aynı para birimini birleştirir, farklı para birimini ayırır.
  - `pendingTotal`: `[{currency:'TRY', total: 100.005}, {currency:'TRY', total: 0.01}]` → `{TRY: 100.02}`.
  - `scopeToDoctor`: başka hekimin kalemi sonuçta yer almaz; kalemi kalmayan fatura düşer; `summary[0].finalized_balance === null`; `pending` bırakılan kalemlerin `gross_total` toplamına eşittir.
- [ ] **Step 2: Failing testler (`buildPreStatementHtml.test.mts`)**
  - İki çıktı da `'Ön ekstre — onay bekliyor'` içerir.
  - `approve` verilince `qrSvg` ve URL HTML'de geçer; verilmeyince `'karekodu okutun'` geçmez.
  - Hasta tam adı fixture'da `patient_initials` dışında yoktur ve HTML'de geçmez.
  - `<script>` içeren açıklama kaçırılır (`&lt;script&gt;`).
  - Ayrıntılı çıktıda `table-header-group` ve `break-inside: avoid` geçer.
  - Ayrıntılı çıktıdaki hekim ara toplamlarının sayısı, hekim grubu sayısına eşittir.
  - `scope:'own'` fixture'ında "Kesinleşmiş bakiye" etiketi geçmez.
  - 300 kalemli fixture 300 `<tr data-item>` üretir.
- [ ] **Step 3:** `node --test modules/invoices/buildPreStatementHtml.test.mts modules/invoices/lib/preStatementPdf.test.mts` → FAIL.
- [ ] **Step 4: Uygula.** Görsel dil `buildStatementHtml.ts` ile aynı ailededir (yazı, renk, antet). Örnek tasarım `.superpowers/brainstorm/68108-1793949820/content/pdf-ayrintili.html` dosyasına bakılarak yapılır; yoksa `buildStatementHtml.ts`'e uyulur.
- [ ] **Step 5:** Testler PASS, tam suite yeşil, tsc 0 hata.
- [ ] **Step 6: Commit:** `feat(on-ekstre): özet ve ayrıntılı PDF üreticileri`

---

### Task 2: PDF çıkışı ve PDF düğmeleri (lab + klinik)

**Files:**
- Create: `core/print/exportHtmlPdf.ts`
- Create: `modules/invoices/components/PreStatementPdfButton.tsx` (biçim seçici: Özet / Ayrıntılı)
- Modify: `modules/invoices/components/LabPreStatementSection.tsx` (düğme)
- Modify: `modules/finance-clinic/screens/PreStatementScreen.tsx` (düğme)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** Task 1'in `buildPreStatementSummaryHtml`, `buildPreStatementDetailHtml` ve `PreStatementPdfInput` arayüzleri.
- **Produces:** `exportHtmlPdf(html: string, fileName: string, opts?: { winW?: number }): Promise<void>`
  - Native: `Print.printToFileAsync({ html, margins: {top:45,bottom:45,left:40,right:40} })`, ardından anlamlı adla `Sharing.shareAsync`.
  - Web ve `winW >= 1024`: yeni sekmede yazdır. Bu, mevcut ekstre davranışıyla aynıdır.
  - Web ve dar ekran/PWA:
    - Belge gizli bir iframe'e yazılır ve html2canvas ile çizilir.
    - jsPDF ile A4'e bölünür; sayfa kenarı `tr`/bölüm başına denk getirilir.
    - Sonuç `a[download]` ile indirilir.
    - Yöntem `PriceListScreen.tsx` içindeki `buildWebPdfFile` ile aynıdır. Kod oraya dokunmadan yeni dosyaya taşınır.
  - Hata `Error` olarak fırlatılır. Çağıran, hatayı butonun yanında gösterir.
- **`PreStatementPdfButton` props:** `{ clinicName: string; data: PreStatement; lab: LabLetterhead; defaultFormat: 'ozet'|'ayrintili'; approve?: PreStatementPdfInput['approve'] }`
  - Bu görevde `defaultFormat` sabit `'ozet'`tir; Task 3 ayarı gelince ayardan okunur.
  - Yalnız lab tarafında `doctors?: string[]` prop'u verilir ve seçicide "Tüm hekimler" ile hekim adları listelenir (R7). Hekim seçilince `scopeToDoctor` uygulanır, `approve` verilmez ve dosya adı `On-Ekstre-<klinik>-<hekim>-<YYYY-MM>.pdf` olur.
  - Lab tarafında letterhead mevcut `fetchLab` deseniyle alınır. Klinik tarafında ekstre ekranındaki self-view deseni kullanılır (`fetchSelfViewLab`).
- Dosya adları: `On-Ekstre-<klinik>-<YYYY-MM>.pdf` ve `On-Ekstre-Ayrintili-<klinik>-<YYYY-MM>.pdf`.
- Ayar kapalıyken ya da taslak yokken düğme görünmez.

- [ ] **Step 1:** `exportHtmlPdf`'in karar verici saf kısmı `pdfExportMode(platform: string, winW: number): 'native'|'tab'|'file'` olarak test edilerek yazılır.
  - `('ios',400)` → `'native'`
  - `('web',1280)` → `'tab'`
  - `('web',390)` → `'file'`
- [ ] **Step 2: Uygula.**
- [ ] **Step 3: Doğrula.**
  - Tam suite ve tsc temiz.
  - Geçici dev route ve sahte veriyle (fixture) Puppeteer'da iki biçim üretilir (Task 4/5 plan 3 deseni). Biri 300 kalemli fixture'dır. Dar ekranda `file` yolu Playwright WebKit'te denenir.
  - PDF `pdftoppm` ile PNG'ye çevrilip bakılır: başlığın tekrarı, satır bölünmemesi, toplamlar.
  - Geçici route commit'ten önce silinir. Canlıya istek gitmez.
- [ ] **Step 4: Commit:** `feat(on-ekstre): ön ekstre PDF indirme (lab ve klinik)`. Sözlükler `git add -p` ile.

> Bu noktada PDF tek başına yayına alınabilir (web deploy, kullanıcı onayıyla).

---

### Task 3: Onay bağlantısı şeması ve jeton RPC'leri (DB)

**Files:**
- Create: `supabase/migrations/20261110100000_on_ekstre_baglanti.sql`, `supabase/rollbacks/20261110100000_on_ekstre_baglanti.{before.txt,down.sql}`
- Probe: scratchpad `p4t3/probe.sql`

**Interfaces — Produces:**
- **Ayar sütunu:** `lab_settings.pre_statement_pdf_format text not null default 'ozet' check (in ('ozet','ayrintili'))` (R4).
- **Tablo `statement_approval_links`:**
  - Sütunlar: `id uuid pk`, `lab_id uuid not null references labs`, `clinic_id uuid not null`, `token_hash text not null unique`, `recipient_profile_id uuid not null`, `snapshot jsonb not null`, `created_by uuid`, `created_at timestamptz default now()`, `expires_at timestamptz not null`, `revoked_at timestamptz`, `used_at timestamptz`, `approval_id uuid references statement_approvals`.
  - RLS: lab finans kullanıcıları SELECT yapabilir (`token_hash` dahil, düz jeton yok). Yazma yalnız RPC ile.
- **`public.create_statement_link(p_clinic_id uuid) returns jsonb`** (SECURITY DEFINER)
  - Yetki: `_ps_actor='lab'` ve `_ps_can_manage`, değilse `PS_SCOPE`. Ayar kapalıysa `PS_DISABLED`. Taslak yoksa `PS_EMPTY`.
  - Alıcı (R3): kliniğin aktif `clinic_admin` profili, birden çoksa en eski. Kliniksiz bağımsız hekimde hekimin profili. Yoksa `PS_NO_RECIPIENT`.
  - Aynı klinikteki iptal edilmemiş ve kullanılmamış bağlantıları `revoked_at=now()` yapar.
  - Jeton: `encode(gen_random_bytes(32),'base64')` → base64url'e çevrilir (`+`→`-`, `/`→`_`, `=` atılır). `token_hash = encode(digest(token,'sha256'),'hex')`.
  - Süre: `expires_at = now() + interval '45 days'`.
  - Dönüş: `{token, link_id, expires_at, recipient_name}`.
- **İç fonksiyon `_ps_link_resolve(p_token text) returns statement_approval_links`**
  - Karma ile bulur. Yoksa, süresi geçmişse, iptal edilmişse ya da kullanılmışsa `PS_LINK_INVALID` (ERRCODE 22023) döner; hangisi olduğu ayırt edilmez.
- **`public.get_pre_statement_by_link(p_token text) returns jsonb`** (anon + authenticated)
  - `get_pre_statement`'ın `full` biçimini döner, ama yalnız anlık görüntüdeki ve hâlâ `taslak` olan faturaları içerir.
  - `actor='link'`, `can_approve=true`, `expires_at`, `changed_invoice_ids` (anlık görüntüden sonra `updated_at` değişenler) ekler.
  - `summary` alanı aynı hesapla döner. Klinik adı ve lab adı eklenir; telefon ve e-posta eklenmez.
- **`public.approve_pre_statement_by_link(p_token text, p_mode text) returns jsonb`** (anon + authenticated)
  - Anlık görüntüyü `p_invoices` olarak `_ps_finalize`'a verir. Parametreler: `p_via='link'`; `approved_by` için `recipient_profile_id`. `_ps_finalize`'ın approver alanını nasıl doldurduğunu okuyun; gerekirse çekirdeğe opsiyonel `p_approved_by` eklenir ve eski çağrılar aynı kalır.
  - Başarıda `used_at=now()` ve `approval_id` yazılır. Dönüş `_ps_finalize` sonucudur.
- **`public.add_statement_note_by_link(p_token text, p_invoice_item_id uuid, p_body text) returns jsonb`** (anon + authenticated)
  - Kalem anlık görüntüdeki bir faturaya ait değilse `PS_SCOPE`.
  - Yazar `recipient_profile_id`, `author_side='clinic'`. Kurallar `add_statement_note` ile aynıdır (itiraz açar, lab'a bildirim, `skip_notify` bayrağına uyar).
- **Hata kodları:** `PS_LINK_INVALID`, `PS_NO_RECIPIENT` (yeni); diğerleri plan 3'teki gibi.

- [ ] **Step 1: Yakala.** `_ps_finalize`, `add_statement_note` ve `lab_settings` politikaları; `pgcrypto` (`gen_random_bytes`, `digest`) şeması ve kullanılabilirliği.
- [ ] **Step 2: Migration ve down yaz.**
- [ ] **Step 3: Probe (BEGIN … ROLLBACK, `siman.skip_notify='on'`, demo lab)**
  - Kontroller:
    - `create_scope`: viewer ve approver `PS_SCOPE` alır; lab görüntüleyici (can_manage=false) `PS_SCOPE` alır.
    - `create_no_recipient`: `clinic_admin`'i olmayan klinik `PS_NO_RECIPIENT` alır.
    - `token_not_stored`: tabloda düz jeton geçmez (`snapshot`/`token_hash` içinde aranır).
    - `revoke_previous`: ikinci bağlantı birinciyi iptal eder; birinci `PS_LINK_INVALID` alır.
    - `read_snapshot_only`: bağlantıdan sonra eklenen taslak görünmez; başka kliniğin faturası görünmez.
    - `changed_flag`: taslak düzenlenince `changed_invoice_ids` onu içerir; onayda `skipped(changed)` olur.
    - `approve_once`: onay kesinleştirir, `statement_approvals.via='link'` ve `approved_by=recipient` yazar; ikinci onay `PS_LINK_INVALID` alır.
    - `expired`: `expires_at` geçmişe çekilince `PS_LINK_INVALID`.
    - `note_by_link`: anlık görüntü dışı kalem `PS_SCOPE` alır; içerideki kalem itiraz açar.
    - `anon_acl`: anon yalnız üç jeton RPC'sini çalıştırabilir; tabloya doğrudan erişemez.
    - `no_notification_rows`: bildirim satırı yazılmaz.
  - Beklenen: tümü PASS.
- [ ] **Step 4: DUR.** Kontrolör onay alır.
- [ ] **Step 5: Uygula, ölç.** Nesneler ve ACL'ler doğrulanır; canlıda bağlantı sayısı 0.
- [ ] **Step 6: Commit:** `feat(on-ekstre): onay bağlantısı ve jeton RPC'leri`

---

### Task 4: Girişsiz onay sayfası ve karekodlu PDF

**Files:**
- Create: `app/s/[token].tsx` (lazyRoute, `app/doctor-approval/[token].tsx` deseni)
- Create: `modules/finance-clinic/screens/LinkPreStatementScreen.tsx`
- Modify: `app/_layout.tsx` (`isPublicRoute`'a `'s'` eklenir; yalnız bu)
- Modify: `modules/invoices/lib/preStatement.ts` + test (`preStatementErrorText` yeni kodlar, `buildStatementLinkUrl`)
- Modify: `modules/invoices/preStatementApi.ts` (bağlantı çağrıları)
- Modify: `modules/invoices/components/LabPreStatementSection.tsx`. "Bağlantı oluştur" eklenir: link kopyala, karekodlu PDF al.
- Modify: `modules/invoices/components/PreStatementPdfButton.tsx` (`defaultFormat` ayardan, `approve` desteği)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** Task 3 RPC'leri; Task 1 ve Task 2 PDF arayüzleri.
- **Produces (preStatement.ts):**
  - `buildStatementLinkUrl(token: string, origin: string): string` → `${origin}/s/${token}`. `origin` web'de `window.location.origin`, native'de `https://siman.app`.
  - `preStatementErrorText` eşlemeleri:
    - `PS_LINK_INVALID` → 'Bu bağlantı artık geçerli değil. Lab'dan yeni bağlantı isteyin.'
    - `PS_NO_RECIPIENT` → 'Kliniğin onay verecek yönetici hesabı yok'
- **Produces (preStatementApi.ts):** `createStatementLink(clinicId)`, `fetchPreStatementByLink(token)`, `approvePreStatementByLink(token, mode)`, `addStatementNoteByLink(token, itemId, body)`.
- **Sayfa:**
  - Lab adı, klinik adı ve son geçerlilik tarihi gösterilir.
  - Plan 3 klinik ekranının kalem görünümü ve not penceresi yeniden kullanılır. Gerekirse görünüm bileşeni `PreStatementScreen`'den ayrılır; davranışı değişmez.
  - "İtirazsız kalemleri onayla" / "Tümünü onayla" düğmeleri bulunur.
  - PDF indir düğmesi vardır; karekod yoktur (R5).
  - Onay sonrası "N fatura kesinleşti" yazar ve sayfa salt okunur olur.
  - `changed` > 0 ise "Bazı faturalar değişti; lab'dan yeni bağlantı isteyin" yazar.
  - Geçersiz jetonda tek bir sade ekran gösterilir.
  - Giriş istemez, gezinme çubuğu yoktur.
- **Lab bölümü:**
  - "Onay bağlantısı oluştur" düğmesi `createStatementLink` çağırır.
  - Sonuç: bağlantıyı kopyala, karekodlu PDF al (`localQrSvg(url)` → `approve.qrSvg`), son geçerlilik tarihi.
  - Yeni bağlantının eskisini iptal ettiği metinle söylenir: "Yeni bağlantı öncekini geçersiz kılar".

- [ ] **Step 1:** `buildStatementLinkUrl` ve yeni hata metinleri için failing test → uygula → PASS.
- [ ] **Step 2: Sayfa, route ve lab düğmesi.**
- [ ] **Step 3: Doğrula.**
  - Tam suite ve tsc temiz.
  - Sahte veriyle sayfa ve karekodlu PDF görüntülenir.
  - Karekodun bağlantıyı çözdüğü `jsqr` ya da zbar ile denetlenir. Araç yoksa URL metni HTML'de doğrulanır ve bu raporda belirtilir.
  - Canlıda bağlantı oluşturulmaz.
- [ ] **Step 4: Commit:** `feat(on-ekstre): girişsiz onay sayfası ve karekodlu PDF`

---

### Task 5: "Onay iste" gönderimi (e-posta + WhatsApp) (DB + istemci)

**Files:**
- Create: `supabase/migrations/20261110101000_on_ekstre_gonderim.sql` + rollbacks
- Modify: `modules/invoices/components/LabPreStatementSection.tsx` ("Onay iste" düğmesi, kanal seçimi)
- Modify: `modules/invoices/preStatementApi.ts`, `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** `create_statement_link`; mevcut e-posta yolu `send-email-notification` (Resend, `profiles.email`) ve WhatsApp yolu `send-whatsapp-meta` / `trg_whatsapp_meta_notify`. Uygulayıcı bu ikisinin bugün nasıl tetiklendiğini (notifications kategorisi, pg_net çağrısı) Step 1'de raporlar ve aynı yolu kullanır.
- **Produces:**
  - **Tablo `statement_link_sends`:** `id`, `link_id references statement_approval_links`, `lab_id`, `clinic_id`, `period text` (YYYY-MM), `channel text check in ('email','whatsapp')`, `trigger text check in ('manual','month_end')`, `status text`, `error text`, `created_at`. Kısıt: `unique (clinic_id, period, channel) where trigger='month_end'`. RLS: lab finans SELECT.
  - **`public.request_pre_statement_approval(p_clinic_id uuid, p_channels text[]) returns jsonb`:**
    - `create_statement_link` çağrılır. Her kanal için alıcıya mesaj kuyruklanır; bir send satırı yazılır.
    - Mesaj içeriği: lab adı, dönem, onay bekleyen toplam, bağlantı URL'i. Hasta ya da kalem bilgisi yer almaz.
    - Kanal için alıcı bilgisi (e-posta/telefon) yoksa o kanal `status='skipped', error='NO_CONTACT'` olur, diğer kanal yine gider.
    - `siman.skip_notify='on'` iken hiçbir şey gönderilmez, satır `status='skipped_probe'` olur.
    - Dönüş: `{link_id, expires_at, sends:[{channel, status, error}]}`.
  - Bağlantı URL tabanı `https://siman.app/s/<token>`, sabit olarak `_ps_link_base_url()` fonksiyonundan gelir.
  - WhatsApp (R6): uygun onaylı şablon yoksa kanal `status='unavailable', error='WA_TEMPLATE'` olur. İstemci bunu "WhatsApp şablonu onay bekliyor" diye gösterir.
- **İstemci:**
  - "Onay iste" popup'ında kanal onay kutuları vardır (e-posta, WhatsApp; alıcı bilgisi olmayan pasif ve nedeni yazılı).
  - Gönder düğmesinde çift gönderim kilidi bulunur.
  - Sonuç kanal başına gösterilir. Hata metinleri butonun yanında yer alır.

- [ ] **Step 1: Yakala.** E-posta ve WhatsApp tetikleme yolları, mevcut şablon listesi (yalnız ad ve dil; içerik ya da anahtar yazılmaz) ve `send-email-notification` gövde biçimi raporlanır.
- [ ] **Step 2: Migration ve down yaz.**
- [ ] **Step 3: Probe (skip_notify açık).**
  - Kontroller:
    - `channels_recorded`: iki kanal `skipped_probe` satırı yazar.
    - `no_contact`: e-postasız alıcı → `NO_CONTACT`, diğer kanal yazılır.
    - `scope`: viewer `PS_SCOPE` alır.
    - `message_has_no_patient`: kuyruklanacak gövdede hasta baş harfi ya da kalem açıklaması yoktur. Gövde, gönderici çağrılmadan dönen bir önizleme fonksiyonu `_ps_request_message(link, channel)` ile test edilir.
    - `no_notification_rows`.
- [ ] **Step 4: DUR.** Kontrolör onay alır. **Step 5:** Uygula, ölç.
- [ ] **Step 6: İstemci.** TDD ile saf kanal-durum metni eşlemesi (`sendStatusText(status, error)`) yazılır; ardından popup.
- [ ] **Step 7: Doğrula** (suite, tsc, sahte veriyle görüntü; canlıda "Onay iste"ye BASILMAZ). **Commit:** `feat(on-ekstre): onay iste gönderimi`
- Canlıda ilk gerçek gönderim, kullanıcı demo lab'da kendi e-postasıyla dener.

---

### Task 6: Ay sonu otomatik gönderim (DB, cron)

**Files:**
- Create: `supabase/migrations/20261110102000_on_ekstre_ay_sonu.sql` + rollbacks

**Interfaces:**
- **Consumes:** Task 5 `request_pre_statement_approval` çekirdeği. Kullanıcı bağlamı gerektirmeyen bir iç sürüm `_ps_request_core(p_clinic_id, p_channels, p_trigger)` olarak ayrılır; Task 5'in RPC'si buna yetki kontrolüyle sarılır.
- **Produces:**
  - **`public.run_month_end_pre_statements(p_period text default null) returns jsonb`**
    - SECURITY DEFINER; yalnız `postgres` ya da cron rolü çağırabilir; anon/authenticated'a kapalı.
    - Dönem: `p_period` yoksa lab'ın yerel gününe göre biten ay (`lab_today`).
    - Ayarı açık her lab'da, taslağı olan her klinik için `_ps_request_core(clinic, ARRAY['email','whatsapp'], 'month_end')` çağrılır.
    - Aynı `(clinic, period, channel)` için `month_end` satırı varsa atlanır (idempotent).
    - Klinik başına hata yakalanır ve `error` olarak yazılır; döngü sürer.
    - Dönüş: `{labs, clinics, sent, skipped, failed}` sayımları.
  - **Cron:** `cron.schedule('pre-statement-month-end', '0 6 1 * *', 'select public.run_month_end_pre_statements()')`. Her ayın 1'i 09:00 TR'dir. Mevcut aylık fatura süpürgesi de aynı saatte çalışır; sıra bağımlılığı yoktur, çünkü süpürge taslak üretir ve bu iş onları gönderir. Süpürgenin cron saati okunur; bu iş ondan en az 30 dk sonraya konur.
- Bu iş hiçbir faturayı kesinleştirmez (§2.6).

- [ ] **Step 1: Yakala.** Mevcut cron işlerinin adı ve zamanlaması (`select jobname, schedule from cron.job` — `command` okunmaz), aylık süpürgenin saati.
- [ ] **Step 2: Migration ve down yaz.** Down: unschedule + drop.
- [ ] **Step 3: Probe (skip_notify açık; cron.schedule çağrılmaz, fonksiyon doğrudan çağrılır)**
  - Kontroller:
    - `idempotent`: iki çağrı → ikinci çağrıda `sent=0`, `skipped` = ilk çağrının gönderdiği sayı.
    - `only_enabled_labs`: ayarı kapalı lab'ın kliniği yer almaz.
    - `no_drafts_skip`: taslağı olmayan klinik yer almaz.
    - `error_isolated`: alıcısı olmayan klinik `failed` sayılır, diğerleri işlenir.
    - `no_finalize`: çağrı sonrası kesinleşen fatura sayısı 0.
    - `acl`: authenticated çalıştıramaz.
- [ ] **Step 4: DUR.** Kontrolör onay alır. **Step 5:** Uygula, ölç (cron işinin varlığı ve zamanlaması; ilk gerçek çalışma 1 Aralık).
- [ ] **Step 6: Commit:** `feat(on-ekstre): ay sonu otomatik onay isteği`

---

### Task 7: Çok işli klinik ekranı — gruplama, arama, filtre

**Files:**
- Modify: `modules/invoices/lib/preStatement.ts` + test (`filterPreStatement`, `groupItemsByDoctorOrder`)
- Modify: `modules/finance-clinic/screens/PreStatementScreen.tsx`, `modules/finance-clinic/screens/LinkPreStatementScreen.tsx`, `modules/invoices/components/LabPreStatementSection.tsx`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces — Produces:**
- `filterPreStatement(inv: PreStatementInvoice[], q: { text?: string; work?: string|null }): PreStatementInvoice[]`
  - Metin hasta baş harfi ve sipariş no içinde büyük/küçük harf duyarsız arar (`tr` yerel).
  - `work` açıklamayla tam eşleşir.
  - Boş kalan fatura listeden düşer. Fatura toplamı değişmez; kalemler süzülür.
- `groupItemsByDoctorOrder(inv: PreStatementInvoice): { doctor: string; orders: { order_no: string; items: PreStatementItem[]; subtotal: number }[]; subtotal: number }[]`
- `workTypes(inv: PreStatementInvoice[]): string[]` (benzersiz, sıralı)
- **Ekran:**
  - Fatura içi kalemler hekim → sipariş olarak gruplanır, katlanabilir ve ara toplamlıdır.
  - Arama alanı ve iş türü seçici bulunur.
  - Süzme etkinken "Süzülmüş görünüm — onay tüm faturayı kapsar" uyarısı çıkar. Onay düğmeleri süzmeden etkilenmez ve tüm görünür faturaları gönderir.
  - 300+ kalemde liste sanallaştırılır ya da hekim grupları başlangıçta kapalı gelir.

- [ ] **Step 1:** Failing testler.
  - Arama 'a.y' → yalnız eşleşen kalemler; boş fatura düşer.
  - `work` filtresi doğru süzer.
  - Gruplama ara toplamları kalem toplamına eşittir.
  - Türkçe büyük/küçük harf: 'İ' ve 'i' eşleşir.
- [ ] **Step 2:** FAIL → uygula → PASS.
- [ ] **Step 3:** Ekranlar. 300 kalemli fixture ile kaydırma ve açılma takılmaz; görüntü alınır.
- [ ] **Step 4: Commit:** `feat(on-ekstre): çok işli ön ekstrede gruplama ve arama`
