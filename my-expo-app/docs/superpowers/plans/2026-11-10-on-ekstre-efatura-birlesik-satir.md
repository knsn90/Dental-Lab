# Ön ekstre 5/5 — E-fatura birleşik satır + iş dökümü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kesinleşmiş aylık fatura e-faturaya aynı hizmet + birim fiyat + KDV oranı satırları birleştirilerek gider. Ayrıntılı iş listesi fatura numarasıyla bağlı bir "iş dökümü" PDF'i olarak üretilir. Lab bu biçimi ve ön ekstre PDF varsayılanını ayarlardan seçer.

**Architecture:**
- Birleştirme saf bir fonksiyondur (`_shared/lucaConsolidate.ts`). `buildLucaInput` kalem satırlarını kurduktan sonra, toplam kontrolünden önce uygular.
- Birleşik toplam DB toplamını tutmazsa (KDV satır yuvarlaması) kalem satırlarına geri düşer. Sessiz para farkı yerine görünür bir uyarı gösterilir.
- Biçim lab ayarıdır: `lab_settings.efatura_line_mode`. Varsayılan `'kalem'`, yani bugünkü davranış değişmez. Lab muhasebeci teyidinden sonra `'birlesik'` seçer (spec §16 son madde).
- İş dökümü kesinleşmiş tek faturanın kalemlerini mevcut ekstre şablonuyla (`buildStatementHtml`, ayrıntılı mod) basar. Veri yeni bir RPC'den gelir; hasta baş harfleri sunucuda üretilir (KVKK).

**Tech Stack:** Deno edge (efatura-luca), Postgres (Supabase), Expo/RN Web, node:test.

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-06-on-ekstre-onay-design.md` — §2.16 (e-fatura), §2.15 PDF varsayılanı (plan 4'ten kalan ayar UI'si), §3 (DZ uyarısı, plan 2'de yapıldı; bu planın kapsamı dışında).

## Global Constraints

- Birleştirme anahtarı: **aynı hizmet + aynı birim fiyat + aynı oran**. Liste fiyatı ve indirim birleşik satırda korunur (spec §2.16).
- E-fatura yalnız kesinleşmiş faturadan kesilir. Mevcut kapılar (`taslak` reddi, `mergeApprovalGate`) değişmez.
- Varsayılan `'kalem'`. Ayar kapalıyken Luca'ya giden içerik bayt bayt aynı kalır; mevcut `lucaInvoice` ve `lucaMerge` testleri değişmeden geçer.
- Önizleme zorunlu kuralı korunur: gönderilen = önizlenen (preview token içerik özetine birleşik satırlar da girer).
- DB değişikliği beş adımla yapılır: `.before.txt`, `.down.sql`, rollback'li prob, açık onay ("Onaylıyorum, uygula"), uygula ve ölç. Yeni tablo yok; fonksiyon `SECURITY DEFINER` + `search_path=public` + anon'a kapalı.
- Edge deploy ayrı kullanıcı onayıyla yapılır; web yayını yalnız "deploy" ile.
- Dört dil (tr/en/de/fa) ve koyu tema aynı anda. HugeIcons; renkli sol kenarlı kart yok; hata düğmenin yanında; popup `U.modalOverlay`.
- KVKK: iş dökümünde hasta yalnız baş harfle; e-fatura satır adına hasta bilgisi girmez.
- Kapsam dışı (dokunma): `modules/ar-scanner/**`, `modules/viewer-3d/**`, `FaceScanQuickAction.tsx`, "Tam kafa" sözlük satırları, `ClinicStatementScreen.tsx`. Sözlükler yalnız hunk ile stage edilir.
- Commit main'e; mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push yok.

## Review Focus

1. **KDV yuvarlaması:** birleşik satırın KDV'si (tek yuvarlama) kalem KDV'lerinin toplamından 1 kuruş farklı çıkabilir. Gönderim ya kuruşu kuruşuna tutmalı ya da kalem satırlarına düşüp bunu söylemeli. Test: Task 2 `fallback_on_vat_rounding`.
2. **Aynı ad, farklı liste/indirim:** iki kalem aynı ad ve birim fiyatta ama birinin liste fiyatı ya da iskonto oranı farklı. Anahtar `name + unitPrice (Luca'ya giden) + vatRate + unit` olur; Luca'ya giden birim fiyat liste fiyatıysa iskontolar toplanır. Test: Task 2 `list_price_lines_merge_with_summed_discount`.
3. **Toplu e-fatura (birden çok Siman faturası → tek Luca):** her kalem `line_note` olarak kendi sipariş etiketini taşır. Birleşik modda etiketler düşer ve not "İş dökümü: …" ile tüm fatura numaralarını listeler. Test: Task 2 `merge_notes_list_dokum_numbers`.
4. **Satır notu:** tek kalemde `line_note` varsa ve gruptaki diğerleri farklıysa not düşer (çakışan notlar birleşik satıra yanlış atanmasın). Test: Task 2 `line_note_kept_only_if_uniform`.
5. **İş dökümü yetkisi:** başka lab'ın ya da başka kliniğin faturası RPC'den okunamaz; klinik kullanıcısı yalnız kendi kliniğinin kesinleşmiş faturasını alır; taslak reddedilir. Test: Task 1 probu `acl_*`.

---

### Task 1: DB — satır biçimi ayarı ve iş dökümü RPC'si

**Files:**
- Create: `supabase/migrations/20261110110000_efatura_birlesik_satir.sql`
- Create: `supabase/rollbacks/20261110110000_efatura_birlesik_satir.before.txt`, `.down.sql`

**Interfaces — Produces:**
- `lab_settings.efatura_line_mode text not null default 'kalem' check (efatura_line_mode in ('kalem','birlesik'))`
- `public.get_invoice_work_breakdown(p_invoice_id uuid) returns jsonb`
  - SECURITY DEFINER, `search_path=public`; anon'a kapalı, authenticated'a açık.
  - Yetki: lab tarafı = faturanın lab'ında finans görüntüleme (`lab_can_view_finance()` + `lab_id = get_my_lab_id()`); klinik tarafı = `_ps_profile_is_approver` ya da faturayı RLS ile görebilen klinik/hekim (mevcut `invoices` SELECT politikasının mantığı). Diğer her durumda `PS_SCOPE` (42501).
  - Taslak ve iptal fatura reddedilir: `INV_NOT_FINALIZED` (22023).
  - Dönüş, plan 4 `PreStatementInvoice` biçimiyle birebir: `{id, invoice_number, currency, issue_date, created_at, updated_at, subtotal, tax, total, items:[{id, description, quantity, unit_price, total, gross_total, order_no, patient_initials, doctor_name, dispute_status:null, notes:[]}]}` + `{clinic_name, lab_name}`. Hasta baş harfi ve hekim adı `get_pre_statement` ile aynı yardımcıdan üretilir (aynı biçim).

- [ ] **Step 1: Yakala.** `get_pre_statement` içindeki baş harf ve hekim adı ifadesini, `invoices` SELECT politikalarını ve `lab_settings` sütunlarını `pg_get_functiondef` / `pg_policies` ile oku; `.before.txt`'ye yaz.
- [ ] **Step 2: Migration ve down yaz.** Down: fonksiyonu ve sütunu kaldırır.
- [ ] **Step 3: Prob (rollback'li).** Kontroller:
  - `default_kalem`: yeni sütun mevcut lab'larda `'kalem'`.
  - `check_rejects`: `'x'` değeri reddedilir.
  - `shape`: kesinleşmiş demo faturasında anahtarlar ve kalem sayısı faturayla aynı; `total` faturanınki.
  - `initials_only`: hiçbir alanda hasta tam adı yok (baş harf biçimi `get_pre_statement` ile aynı).
  - `draft_rejected`: taslak → `INV_NOT_FINALIZED`.
  - `acl_other_lab`, `acl_other_clinic`, `acl_anon`: üçü de reddedilir.
- [ ] **Step 4: DUR.** Kontrolör kullanıcı onayını alır. **Step 5:** Uygula ve katalogla ölç.
- [ ] **Step 6: Commit:** `feat(efatura): satır biçimi ayarı ve iş dökümü RPC`

### Task 2: Saf birleştirme ve `buildLucaInput` seçeneği

**Files:**
- Create: `supabase/functions/_shared/lucaConsolidate.ts`, `supabase/functions/_shared/lucaConsolidate.test.ts`
- Modify: `supabase/functions/_shared/lucaInvoice.ts` (`buildLucaInput`), `supabase/functions/_shared/lucaMerge.ts` (yalnız not üretimi gerekiyorsa)
- Test: `supabase/functions/_shared/lucaInvoice.test.ts`, `lucaMerge.test.ts` (mevcutlar değişmeden geçer)

**Interfaces — Produces:**
- `consolidateLucaLines(lines: LucaLine[]): LucaLine[]`
  - Anahtar: `name.trim()` + `unitPrice` + `vatRate` + `unit ?? 'C62'`. İlk görülme sırası korunur.
  - `quantity` toplanır (r2 değil, adet toplamı; ondalıklı adet r4), `discountAmount` toplanır (r2).
  - `code` grubun ilk satırınınki. `note` yalnız gruptaki tüm notlar aynıysa korunur, değilse düşer.
- `buildLucaInput(args & { lineMode?: 'kalem' | 'birlesik'; dokumRefs?: string[] })` dönüşü `{ ok: true; input; consolidated: boolean; consolidateFallback?: 'rounding' }`.
  - `lineMode` yok ya da `'kalem'` → satırlar ve notlar bugünküyle bayt bayt aynı, `consolidated:false`.
  - `'birlesik'` → kalem satırları kurulduktan sonra `consolidateLucaLines`. Birleşik `computeTotals(...).payable` mevcut tolerans kuralını geçmezse kalem satırlarına geri düşülür: `consolidated:false, consolidateFallback:'rounding'`.
  - Birleşik modda notlara bir satır eklenir: `İş dökümü: <dokumRefs.join(', ')>` (yoksa `invoice.invoice_number`).
- `mergeInvoices` değişmez; edge birleşik modda `dokumRefs` olarak kaynak fatura numaralarını geçer.

- [ ] **Step 1: Failing testler** (`lucaConsolidate.test.ts`, `lucaInvoice.test.ts`):
  - `same_service_price_rate_merge`: 3 × "Zirkonyum kron" 1530 %20 → tek satır, adet toplamı, iskonto toplamı.
  - `different_price_not_merged`, `different_vat_not_merged`.
  - `list_price_lines_merge_with_summed_discount` (Review Focus 2).
  - `line_note_kept_only_if_uniform` (Review Focus 4).
  - `order_preserved`: grup sırası ilk görülme sırası.
  - `kalem_mode_unchanged`: `lineMode` yok ve `'kalem'` → çıktı mevcut testlerin beklediğiyle `deepEqual`.
  - `birlesik_payable_matches`: birleşik toplam DB toplamına eşit, `consolidated:true`, not satırı eklenmiş.
  - `fallback_on_vat_rounding` (Review Focus 1): kalem KDV yuvarlaması birleşikte 1 kuruş saptıran fixture → kalem satırları + `consolidateFallback:'rounding'`.
  - `merge_notes_list_dokum_numbers` (Review Focus 3).
- [ ] **Step 2:** Çalıştır, FAIL gör. `find supabase/functions/_shared -name "luca*.test.ts" | xargs node --test`
- [ ] **Step 3:** Uygula.
- [ ] **Step 4:** PASS + tam suite + `npx tsc --noEmit --incremental false` 0 hata.
- [ ] **Step 5: Commit:** `feat(efatura): birleşik satır (saf) ve buildLucaInput seçeneği`

### Task 3: Edge — ayarı oku, önizle, gönder

**Files:**
- Modify: `supabase/functions/efatura-luca/index.ts`, `supabase/functions/_shared/lucaInvoice.ts` (`buildLucaPreview` meta), `modules/efatura/types.ts`

**Interfaces:**
- Consumes: Task 1 `lab_settings.efatura_line_mode`; Task 2 `buildLucaInput` seçenekleri.
- Produces: `preview` ve `merge_preview` yanıtına `lineMode: 'kalem'|'birlesik'`, `consolidated: boolean`, `consolidateFallback?: 'rounding'`. `EFaturaPreview` tipine aynı alanlar.

- [ ] **Step 1:** `labContext` sonucuna `lineMode` ekle (lab_settings okunamazsa `'kalem'`).
- [ ] **Step 2:** `preview`, `send`, `merge_preview`, `merge_send` yollarının hepsi `lineMode`'u ve `dokumRefs`'i (tek fatura: `[invoice_number]`; toplu: kaynak numaralar) `buildLucaInput`'a geçirir. Önizleme jetonunun içerik özeti birleşik satırlardan üretilir; önizleme ile gönderim arasında ayar değişirse jeton tutmaz ve gönderim reddedilir (mevcut "içerik değişti" hatası).
- [ ] **Step 3:** Mevcut edge testleri + Task 2 testleri geçer; `deno check` (varsa) ya da tsc temiz.
- [ ] **Step 4: Commit:** `feat(efatura): edge birleşik satır biçimini uygular`
- [ ] **Step 5: DUR — edge deploy ayrı onay.** Deploy: `supabase functions deploy efatura-luca --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api`. Deploy sonrası yalnız ayarı `'kalem'` olan bir lab'da bir `preview` (Luca'ya göndermez) ile davranışın aynı kaldığı ölçülür; gerçek `send` çağrılmaz.

### Task 4: İstemci — ayarlar, önizleme etiketi, iş dökümü PDF'i

**Files:**
- Modify: `modules/settings/sections/FinanceSection.tsx`, `core/store/labSettingsStore.ts`
- Modify: e-fatura önizleme bileşeni (`modules/efatura/components/EFaturaPanel.tsx`, `BulkEFaturaModal.tsx`)
- Create: `modules/invoices/components/WorkBreakdownPdfButton.tsx`, `modules/invoices/lib/workBreakdown.ts` + `workBreakdown.test.mts`
- Modify: lab fatura detayı (fatura detay ekranında e-fatura panelinin yanında; dosya adı keşifte belirlenir), `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Consumes: Task 1 RPC; Task 3 önizleme alanları; plan 4 `buildStatementHtml` (ayrıntılı mod, `documentTitle`), `exportHtmlPdf`, `labLetterheadApi`.
- Produces:
  - `workBreakdownToPreStatement(rpc: WorkBreakdownRpc): PreStatement` — tek faturalı `PreStatement`; `finalized_balance`/`overdue` null → açılış satırı gizli.
  - `workBreakdownTitle(invoiceNumber: string): string` → `"<no> iş dökümü"` (tr), `autoT` ile çevrilir.

- [ ] **Step 1: Failing testler** (`workBreakdown.test.mts`): adaptör toplamları RPC toplamıyla eşit; kalem sırası korunur; başlık biçimi; boş kalemde hata.
- [ ] **Step 2:** FAIL → uygula → PASS.
- [ ] **Step 3: Ayarlar (FinanceSection).** İki seçici, mevcut `invoice_approval_enabled` anahtarının yanında:
  - "e-Fatura satır biçimi": "Her kalem ayrı" (`kalem`) / "Aynı hizmetler birleşik" (`birlesik`). Altında açıklama: "Birleşik biçime geçmeden önce muhasebecinizle teyit edin. Ayrıntılı iş listesi fatura numarasıyla iş dökümü PDF'i olarak verilir."
  - "Ön ekstre PDF varsayılanı": Özet / Ayrıntılı (`pre_statement_pdf_format`, plan 4 R4).
  - Yazma mevcut lab_settings güncelleme yoluyla; yetkisiz kullanıcıda salt okunur.
- [ ] **Step 4: Önizleme etiketi.** Önizlemede `consolidated` ise "Birleşik satır" rozeti; `consolidateFallback==='rounding'` ise uyarı: "Kuruş yuvarlaması nedeniyle bu fatura kalem kalem gönderilecek."
- [ ] **Step 5: İş dökümü düğmesi.** Kesinleşmiş (`taslak`/`iptal` değil) fatura detayında "İş dökümü PDF". RPC → adaptör → `buildStatementHtml` (ayrıntılı, `documentTitle = workBreakdownTitle(no)`, QR yok) → `exportHtmlPdf`. Hata düğmenin yanında.
- [ ] **Step 6: Görsel kontrol.** Sahte Supabase'li geçici dev rotası: ayar seçicileri, önizleme rozet/uyarı, iş dökümü PDF'i; 1280 ve 390, açık ve koyu. Rota commit edilmez.
- [ ] **Step 7:** Tam suite + tsc 0. **Commit:** `feat(efatura): birleşik satır ayarı, önizleme etiketi ve iş dökümü PDF`
