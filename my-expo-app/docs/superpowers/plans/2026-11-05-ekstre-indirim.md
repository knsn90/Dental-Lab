# Ekstre İndirimi, Fatura Altı İndirim ve Klinik Genel Oranı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab, gönderilmiş bir klinik ekstresine faturalara dokunmadan indirim uygulayabilsin; toplu faturaya fatura altı indirim verebilsin; kliniğe girilen genel oran gerçekten fiyata yansısın. Ekstrede İndirim sütunu yüzde ya da tutar gösterir.

**Architecture:** Üç bağımsız faz. **Faz 1:** yeni `clinic_statement_discounts` tablosu; indirim, `payments`'a `indirim` yöntemli ve kayda bağlı satırlarla faturalara dağıtılır; dağıtılamayan kısım dinamik alacak olarak bakiye görünümlerinden düşer ve açılan faturalara kendiliğinden uygulanır. **Faz 2:** `invoices`'a fatura düzeyinde indirim alanları; toplamı yazan dört yer tek bir SQL yardımcısını ve onun TS aynasını kullanır. **Faz 3:** `resolve_item_price`'a genel oran adımı; liste fiyatı ve oran sipariş/fatura kalemine yalnız gösterim için yazılır, tahsil edilen net fiyat değişmez.

**Tech Stack:** Expo Router + React Native Web, Supabase Postgres (RLS, SECURITY DEFINER RPC, tetikleyiciler), Deno edge (efatura-luca), `node --test` (Node 24, type stripping).

**Spec:** `docs/superpowers/specs/2026-11-05-ekstre-indirim-design.md` — bağlayıcı belge budur; plan onun gerekçesidir. Çelişkide spec geçerlidir; bu planın "Kurucu kararları" bölümündeki sapmalar hariç (kullanıcıya sunuldu).

Tüm yollar `my-expo-app/` köküne görelidir.

---

## Global Constraints

### Veritabanı değişikliği (her DB görevi, beş adım — atlanmaz)
1. Değişecek her canlı nesnenin tanımı yakalanır: fonksiyonlar `pg_get_functiondef`, görünümler `pg_get_viewdef`, kısıtlar `pg_get_constraintdef`, yetkiler `information_schema.routine_privileges`. Hepsi `supabase/rollbacks/<ts>_<ad>.before.txt` dosyasına; ilk satır `-- <ts>_<ad> — CANLI durum (2026-11-05)`, bölümler `## <nesne>`.
2. `supabase/rollbacks/<ts>_<ad>.down.sql`: `BEGIN; … COMMIT;` içinde `.before.txt`'teki tanımları geri yazar, yeni nesneleri düşürür.
3. Prob: scratchpad'de `probe_<ad>.sql`. `BEGIN;` → migration gövdesi → senaryo → her beklenti `IF … THEN RAISE EXCEPTION 'PROBE FAIL: <ne>'` → en sonda `RAISE EXCEPTION 'PROBE OK';` (geri alınır). Beklenen çıktı: `ERROR: PROBE OK`.
   - Lab yetkisi gereken çağrılar demo lab'ın yönetici kullanıcısıyla taklit edilir: `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true);`. Demo lab: bkz. memory `project_iyzico_demo_account`.
   - **Gönderici çağrılmaz.** Fikstür faturası oluşturmadan önce `invoices`/`payments` üzerindeki tetikleyicilerden `net.http_post` ya da `_notify*` çağıranlar listelenir ve probun içinde `ALTER TABLE … DISABLE TRIGGER <ad>` ile kapatılır (geri alınır).
   - Çıktıya kişi adı ya da gerçek tutar yazılmaz (KVKK). Fikstür tutarları 100 / 250 gibi yapay sayılardır.
4. `AskUserQuestion` ile açık onay: seçenek metni **"Onaylıyorum, uygula"**. Soruda ne değişeceği, hangi akışları etkileyeceği ve riski madde madde yazar.
5. Uygula: `cd my-expo-app && supabase db query --linked -f <mutlak yol>/supabase/migrations/<ts>_<ad>.sql`. Ardından canlıda ölç: yeni nesneler var mı, değiştirilen fonksiyonların `md5(pg_get_functiondef(oid))` değeri migration'daki tanımla eşleşiyor mu, yetkiler `.before.txt`'tekiyle aynı mı.
- Fonksiyonlar `SET search_path TO 'public'`. İç (alt çizgili) fonksiyonlarda `REVOKE ALL … FROM PUBLIC, anon, authenticated`. İstemci RPC'lerinde `GRANT EXECUTE … TO authenticated`.
- Yeni tablo: `ENABLE ROW LEVEL SECURITY`, `REVOKE INSERT, UPDATE, DELETE … FROM anon, authenticated`; yazma yalnız SECURITY DEFINER RPC'lerden.
- Yetki kapısı bütün yazan RPC'lerde aynı: `is_platform_admin() OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))`, `v_lab` = `clinics.lab_id`.
- Dönüş tipi değişen fonksiyon `CREATE OR REPLACE` ile değişmez: `DROP FUNCTION <tam imza>` + `CREATE` + `.before.txt`'teki yetkilerin aynen yeniden verilmesi.

### Arayüz
- Dört dil birlikte: kaynak Türkçe; `core/i18n/locales/auto.{en,de,fa}.json` aynı anahtarları içerir. Her faz bir parite testiyle biter (desen: `modules/clinics/clinicsNavI18n.test.mts`).
- JSX dışı metin (PDF/HTML, sabit dizi etiketleri, hata eşleme tabloları, Excel başlıkları) `autoT()` ile sarılır.
- Koyu tema aynı anda: inline stil `useInkUI()` (`U.*`) ya da `useMobileTokens()`. Beyaz butonlar `U.plainBtn`; `U.ink[900]` zeminli butonun içeriği `U.onDarkPill`.
- Pencereler `<Modal transparent animationType="fade">` + `U.modalOverlay` + `U.modalCard`. İpucu `GlassTooltip`. İkon yalnız `core/ui/icons`. Sayfa kenarı `PAGE_PADDING`.
- Doğrulama hatası düğmenin yanında satır içi görünür (desen: `ClinicReceiptModal` `methodErr`); yalnız toast yetmez.
- Onay penceresi: `core/ui/ConfirmDialog.tsx`.

### Para ve gizlilik
- Para formatlayıcıları defansif: `(Number(n)||0)`. Sabit ₺ yazılmaz; para birimi satırdan/ekstreden gelir.
- Tutar yuvarlama SQL `ROUND(x, 2)` ile aynı: yarım değerler sıfırdan uzağa.
- Yeni `.test.mts` dosyaları içe aktardıkları `.ts` dosyalarını uzantıyla yazar (`./x.ts`); test edilen saf dosyalar uzantısız yerel içe aktarma içermez (`import type` serbest).

### Doğrulama ve yayın
- Görev sonu testi: `cd my-expo-app && find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test > <workspace>/suite.log 2>&1; tail -5 <workspace>/suite.log` → `# fail 0`. Başlangıç tabanı: 461 geçen.
- `npx tsc --noEmit --incremental false` → 0 hata (memory `project_tsc_zero_errors`, `feedback_tsc_stale_cache`).
- Web yayını yalnız kullanıcı "deploy" deyince. Edge yayını (`efatura-luca`) ayrı açık onay ister; komut memory `project_edge_function_deploy`. Aynı anda iki yayın yok.
- Commit: `main` üzerinde (bu projenin düzeni), yalnız görevin dosyaları adla `git add` edilir; `modules/ar-scanner/**` gibi ilgisiz bekleyen değişikliklere dokunulmaz. Mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push yok.
- Canlı hesapta önizleme salt okunur: kaydet/gönder/onayla düğmelerine basılmaz. Arayüz kontrolü mock düzeniyle (memory `project_mocked_supabase_browser_harness`) ya da yalnız görüntüleyerek yapılır.

### Kurucu kararları (spec'in kurucuya bıraktıkları ve iki sapma)
- **K1 Depolama:** spec §5.2 Yol 1. Tablo `clinic_statement_discounts`; dağıtım payları `payments` satırı (`payment_method='indirim'`, `statement_discount_id`).
- **K2 Alacak:** ayrı kayıt tutulmaz. Bir indirimin alacağı = `amount − Σ(o indirime bağlı, iptal olmayan faturalardaki payments.amount)`. İptal → alacak kendiliğinden doğar; toplam düşüşünde aşan pay kırpılır (Görev 3).
- **K3 Alacağın uygulanması:** otomatik. Kayıt anında kalan kısım ve sonradan doğan alacak, kliniğin o para birimindeki açık faturalarına (dönem dışı dahil, vadesi en eski önce) uygulanır; yeni fatura kesildiğinde de. Gerekçe: anti-hedef "bakiye sıfırken açık/hatırlatılır fatura".
- **K4 Numara:** lab başına `MAX(doc_no)+1`, `pg_advisory_xact_lock(hashtext('sd:'||lab_id))` altında; görünüm `İND-<doc_no>`.
- **K5 Varsayılan açıklama:** `"Dönem indirimi · <dönem etiketi>"` (spec §5.3'teki "<Ay Yıl> dönemi indirimi" sözdizimi Farsçada ters düşüyor; önek biçimi dört dilde doğru).
- **K6 Fatura altı:** `create_bulk_invoice`'a iki varsayılanlı parametre; indirim öncesi ara toplam saklanmaz, `Σ net_total` olarak hesaplanır; saklanan `discount_amount`.
- **K7 Genel oran, gösterim (spec §7.3'ün "kalem indirimi alanlarını kullanır" önerisinden sapma, onaya sunuldu):** `invoice_items.unit_price` net kalır (kuruş eşitliği için; liste fiyatı + yüzde satır indirimi ROUND farkı üretir, ör. 1250,50 ve %15). Liste fiyatı ve oran ayrı, yalnız gösterim sütunlarında; fiyat formülü tutmazsa tetikleyici bunları siler.
- **K8 Karlılık:** "Ekstre indirimleri" `profitability_by_service`'te ayrı satır türü, `profitability_by_clinic`'te kliniğin altında ayrı alt satır. Hekim kırılımları ve en kârlı siparişler değişmez.
- **S1 (sapma, onaya sunuldu) Hekim/klinik paneli fiyatı:** bugün bu panellerden açılan siparişte `resolve_item_price` 42501 veriyor ve özel fiyat haritası yüklenmiyor; özel fiyatlar da uygulanmıyor. Genel oran bu yolda da uygulanmaz; mevcut boşluk ayrı iş olarak kalır. Gerekçe: düzeltmek çalışan sipariş fiyatlarını değiştirir (CLAUDE.md değişiklik kuralı).
- **S2 (sapma, onaya sunuldu) Liste gösterimi kapsamı:** katalog fiyatı + oran gösterimi yalnız yeni sipariş ekranından gelen kalemlerde. Tarama ücreti ve WhatsApp siparişi oranlı **net fiyatı** alır (RPC üzerinden) ama gösterimsiz kalır; sipariş düzenlemesi (`_apply_order_edit`) gösterimi düşürür, fiyatı korur.

---

## Review Focus

1. **Eşzamanlı kayıt:** aynı idempotency anahtarıyla iki çağrı tek kayıt üretir (ikincisi `replayed: true`); farklı anahtarla aynı döneme eşzamanlı iki indirim toplam sınırı aşamaz (klinik başına kilit). Prob: Görev 3.
2. **Döviz ayrımı:** EUR indirimi TRY faturalarına pay yazmaz, TRY bakiyesini değiştirmez; EUR ekstresinde yalnız EUR indirim satırı görünür. Prob: Görev 3; test: Görev 6.
3. **Pay taşıyan faturanın iptali:** pay alacağa geçer ve kliniğin başka açık faturasına uygulanır; klinik bakiyesi iptal edilen fatura tutarı kadar düşer, indirim yüzünden ayrıca değişmez. Prob: Görev 3.
4. **Sıfır bakiyede açık fatura yok:** indirim + kalan ödeme sonrası kliniğin hiçbir faturası `v_invoice_reminders`'da ya da gecikmiş listesinde görünmez. Prob: Görev 3.
5. **İndirimsiz durumda bit bit aynılık:** tedarikçi ekstre HTML'i, indirimsiz klinik ekstresi, `discount_value=0` faturanın toplamları ve genel oranı olmayan klinikte `resolve_item_price` sonucu değişmez. Testler: Görev 7, 10, 15.

---

## Dosya haritası

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `supabase/migrations/20261105100000_ekstre_indirimi_sema.sql` | tablo, RLS, `payments` sütun/kısıt/koruma, bakiye görünümleri | 2 |
| `supabase/migrations/20261105101000_ekstre_indirimi_rpc.sql` | önizleme/kayıt/silme RPC, alacak uygulama, fatura tetikleyicisi | 3 |
| `supabase/migrations/20261105102000_ekstre_indirimi_rapor.sql` | ciro, karlılık, aylık özet, sipariş geçmişi | 4 |
| `modules/invoices/lib/statementDiscount.ts` (+test) | ekstre indirimi saf kuralları: satır, sütun değeri, hata metni, numara | 1, 6 |
| `modules/invoices/lib/statementTotals.ts` | `lineDelta` + dönem toplamı | 6 |
| `modules/invoices/lib/statementPrefs.ts`, `hooks/useStatementPrefs.ts` | `discountMode` ayarı | 6 |
| `modules/invoices/components/StatementDiscountModal.tsx` | "İndirim ekle" penceresi | 7 |
| `core/util/cariDiscountColumn.ts` (+test), `core/util/buildCariStatementHtml.ts` | isteğe bağlı İndirim sütunu (saf parçalar + bağlama) | 7 |
| `supabase/migrations/20261105110000_fatura_alti_indirim.sql` | fatura altı alanlar, toplam formülü, kilit, toplu fatura | 10 |
| `modules/invoices/lib/invoiceDiscount.ts` + `supabase/functions/_shared/invoiceDiscount.ts` | fatura altı tutar ve kalem dağıtımı (iki çalışma ortamı, parite testli) | 9 |
| `modules/invoices/components/InvoiceDiscountField.tsx` | Yüzde/Tutar + değer alanı | 11 |
| `supabase/migrations/20261105120000_klinik_genel_oran.sql` | `resolve_item_price` oran adımı, gösterim sütunları, tutarlılık tetikleyicisi | 15 |
| `modules/clinics/clinicDiscount.ts` (+test) | `applyClinicRate` | 14 |

---

## Faz 1 — Ekstre indirimi, İndirim sütunu, liste ayarı

### Görev 0: Bekleyen değişiklikleri ayır

**Files:** `modules/clinics/clinicDiscount.ts`, `modules/clinics/clinicDiscount.test.mts`, `modules/clinics/screens/ClinicsScreen.tsx`, `core/i18n/locales/auto.{en,de,fa}.json`, `docs/superpowers/specs/2026-11-05-ekstre-indirim-design.md`, bu plan.

- [ ] **Step 1:** Takım testini ve tsc'yi çalıştır. Expected: `# fail 0`, tsc 0 hata.
- [ ] **Step 2: Commit** (iki ayrı commit; `ar-scanner` dosyaları eklenmez)

```bash
git add modules/clinics/clinicDiscount.ts modules/clinics/clinicDiscount.test.mts modules/clinics/screens/ClinicsScreen.tsx core/i18n/locales/auto.en.json core/i18n/locales/auto.de.json core/i18n/locales/auto.fa.json
git commit -m "fix(klinik): indirim oranı kaydı doğru anahtarla (lab_id, clinic_id); hata düğmenin yanında"
git add docs/superpowers/specs/2026-11-05-ekstre-indirim-design.md docs/superpowers/plans/2026-11-05-ekstre-indirim.md
git commit -m "docs(ekstre): ekstre indirimi tasarımı ve uygulama planı"
```

### Görev 1: Ekstre indirimi saf kuralları (numara, hata metni, dönem etiketi)

**Files:**
- Create: `modules/invoices/lib/statementDiscount.ts`
- Test: `modules/invoices/lib/statementDiscount.test.mts`

**Interfaces:**
- Produces:
  - `type DiscountMode = 'amount' | 'percent'`
  - `type SdErrorCode = 'SD_EMPTY' | 'SD_VALUE' | 'SD_CAP'`
  - `statementDiscountDocNo(n: number): string` → `'İND-' + n`
  - `sdErrorText(code: string | null | undefined): string` → Türkçe kaynak metin (çağıran `autoT` uygular)
  - `discountPeriodLabel(from: string, to: string, monthName: (monthIndex0: number) => string): string`

- [ ] **Step 1: Failing test**

```ts
test('belge numarası', () => { assert.equal(statementDiscountDocNo(7), 'İND-7'); });
test('hata metinleri spec §10', () => {
  assert.equal(sdErrorText('SD_VALUE'), "İndirim 0'dan büyük olmalı.");
  assert.equal(sdErrorText('SD_CAP'), 'Bu döneme verilen indirimlerin toplamı dönemin fatura toplamını aşamaz.');
  assert.equal(sdErrorText('SD_EMPTY'), 'Bu dönemde kesilmiş fatura yok.');
  assert.equal(sdErrorText('XYZ'), 'İndirim kaydedilemedi.');
  assert.equal(sdErrorText(null), 'İndirim kaydedilemedi.');
});
test('dönem etiketi: tam tek ay → "Ay Yıl", aksi halde gün aralığı', () => {
  const m = (i: number) => ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][i];
  assert.equal(discountPeriodLabel('2026-10-01', '2026-10-31', m), 'Ekim 2026');
  assert.equal(discountPeriodLabel('2026-02-01', '2026-02-28', m), 'Şubat 2026');
  assert.equal(discountPeriodLabel('2026-10-01', '2026-12-31', m), '01.10.2026 – 31.12.2026');
  assert.equal(discountPeriodLabel('2026-10-05', '2026-10-31', m), '05.10.2026 – 31.10.2026');
});
```

- [ ] **Step 2:** `node --test modules/invoices/lib/statementDiscount.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** Fonksiyonları yaz. Ay sonu: `new Date(Date.UTC(y, m+1, 0)).getUTCDate()`.
- [ ] **Step 4:** Aynı komut → PASS.
- [ ] **Step 5: Commit** `feat(ekstre): indirim numarası, hata metni ve dönem etiketi kuralları`

### Görev 2: Şema — tablo, `payments` bağı, koruma, bakiye görünümleri

**Files:**
- Create: `supabase/migrations/20261105100000_ekstre_indirimi_sema.sql`, `supabase/rollbacks/20261105100000_ekstre_indirimi_sema.{before.txt,down.sql}`, scratchpad `probe_sd_sema.sql`

**Interfaces:**
- Produces (SQL):
  - Tablo `clinic_statement_discounts`: `id uuid pk default gen_random_uuid()`, `lab_id uuid not null references labs(id)`, `clinic_id uuid not null references clinics(id)`, `currency text not null`, `discount_date date not null`, `period_from date not null`, `period_to date not null` (`check period_to >= period_from`), `kind text not null check in ('percent','fixed')`, `value numeric(12,4) not null check > 0`, `amount numeric(12,2) not null check > 0`, `base_amount numeric(12,2) not null`, `rate numeric not null default 1`, `amount_base numeric(12,2) not null`, `doc_no int not null`, `description text`, `idempotency_key text`, `created_by uuid default auth.uid()`, `created_at timestamptz not null default now()`; `unique (lab_id, doc_no)`, `unique (lab_id, idempotency_key)`; index `(lab_id, clinic_id, currency, period_from, period_to)`.
  - `enforce_lab_id_tenant()` tetikleyicisi diğer tenant tablolarındaki gibi bağlanır (memory `project_tenant_guard_migrations_live`).
  - RLS: lab okuma `lab_id = get_my_lab_id() OR is_platform_admin()`; klinik/hekim okuma: `clinic_receipts` üzerindeki lab dışı SELECT politikalarının **her biri** aynı yüklemle kopyalanır (`clinic_view_own_receipts` örneği). Yazma politikası yok.
  - `payments.statement_discount_id uuid null references clinic_statement_discounts(id) on delete cascade` + index.
  - Yöntem kısıtı: mevcut `payment_method` CHECK (adı `.before.txt`'ten) düşürülüp `('nakit','kart','havale','cek','diger','indirim')` ile yeniden eklenir.
  - `payments_sd_consistency CHECK ((payment_method = 'indirim') = (statement_discount_id IS NOT NULL))`.
  - GUC `siman.sd_write` (işlem yerel). Koruma `_payments_sd_guard()` + `BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW` tetikleyicisi `payments_sd_guard`: eski ya da yeni satır `indirim` ise `current_setting('siman.sd_write', true) = 'on'` ya da `current_user IN ('postgres','service_role')` şart; DELETE'te fatura artık yoksa (fatura silinince zincirleme) geçer. Aksi: `RAISE EXCEPTION 'SD_PAYMENT_LOCKED' USING ERRCODE='42501'`.
  - `trg_log_payment_recorded` fonksiyonu `NEW.payment_method = 'indirim'` ise erken döner.
  - `v_clinic_balance_ccy`: alacağa `Σ(d.amount − pay)` eklenir, `d.lab_id` + `d.clinic_id` + `d.currency` eşleşir; `pay` = o indirime bağlı, `status <> 'iptal'` faturalardaki `payments.amount` toplamı. `balance` ve `overdue_net` bu toplamı da düşer.
  - `v_clinic_balance`: aynı alacak `× d.rate` ile ana paraya çevrilip düşer.
  - Bağımlı görünüm/fonksiyon varsa (`lab_receivables_summary()` vb.) `CREATE OR REPLACE VIEW` sütun listesini ve sırasını korur.

- [ ] **Step 1:** `.before.txt`: iki görünüm (`pg_get_viewdef`), `trg_log_payment_recorded` tanımı, `payments` CHECK kısıtları, `clinic_receipts` politikaları (`pg_policies`), görünüm yetkileri.
- [ ] **Step 2:** `.down.sql` yaz.
- [ ] **Step 3: Prob yaz** (migration + senaryo). Beklentiler:
  - GUC kapalıyken `insert into payments(... payment_method 'indirim' ...)` → `SD_PAYMENT_LOCKED`.
  - `payment_method='indirim'` + `statement_discount_id` null → `payments_sd_consistency` ihlali.
  - Fikstür öncesi kliniğin TRY bakiyesi `B`. Kesilmiş 100 TRY fatura → `B + 100`. GUC açık, `amount 30` indirim + bu faturaya 30'luk pay → fatura `kismi_odendi`, bakiye `B + 70`.
  - Fatura iptal edilir → bakiye `B − 30` (iptal fatura bakiyeden çıkar, pay iptal faturada kaldığı için alacağa döner).
  - Lab'sız (anon) rol `clinic_statement_discounts`'a `insert` → yetki hatası.
  - Canlı veriyle: probtan önce ve sonra `select sum(balance) from v_clinic_balance_ccy` aynı (indirim yokken değişmez).
- [ ] **Step 4:** Probu çalıştır → `ERROR: PROBE OK`.
- [ ] **Step 5:** Onay (`Onaylıyorum, uygula`) → uygula → canlıda ölç: tablo, kısıtlar, tetikleyici, görünüm toplamları uygulama öncesiyle aynı.
- [ ] **Step 6: Commit** `feat(ekstre): indirim tablosu, ödeme bağı ve bakiye görünümlerinde alacak`

### Görev 3: RPC'ler — önizleme, kayıt, silme, alacağın uygulanması

**Files:**
- Create: `supabase/migrations/20261105101000_ekstre_indirimi_rpc.sql`, rollbacks `.before.txt` / `.down.sql`, scratchpad `probe_sd_rpc.sql`

**Interfaces:**
- Consumes: Görev 2 tablosu, GUC, `payments.statement_discount_id`.
- Produces (SQL):
  - `_sd_quote(p_lab uuid, p_clinic uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric) RETURNS jsonb` (iç). Anahtarlar: `ok bool`, `error text|null` (`SD_EMPTY|SD_VALUE|SD_CAP`), `period_total`, `prior_discounts`, `base`, `amount`, `to_invoices`, `to_credit`.
    - `period_total` = `issue_date` dönemde, `currency = p_currency`, `status IN ('kesildi','kismi_odendi','odendi')` faturaların `Σ total`.
    - `prior_discounts` = aynı lab+klinik+para biriminde dönemi `[p_from,p_to]` ile **çakışan** indirimlerin `Σ amount`.
    - `base = period_total − prior_discounts`. `period_total = 0` → `SD_EMPTY`. `p_value <= 0` → `SD_VALUE`. `percent`: `p_value > 100` → `SD_CAP`, `amount = ROUND(base × p_value / 100, 2)`. `fixed`: `amount = p_value`. `amount > base` → `SD_CAP`.
    - `to_invoices` = dönemdeki açık faturalara (aşağıdaki sıra) sığan kısım; `to_credit = amount − to_invoices`.
  - Dağıtım sırası (dönem ve alacak için aynı): `status IN ('kesildi','kismi_odendi') AND total > paid_amount AND currency = …`, `ORDER BY due_date ASC NULLS LAST, created_at, id`, `FOR UPDATE` (`_receipt_alloc_plan` ile aynı).
  - `preview_statement_discount(p_clinic_id uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric) RETURNS jsonb` = `_sd_quote` + `balance_before`, `balance_after` (`v_clinic_balance_ccy`, `balance_after = balance_before − amount`). Hata fırlatmaz.
  - `record_statement_discount(p_clinic_id uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric, p_discount_date date, p_description text, p_idempotency_key text) RETURNS jsonb` → `{id, doc_no, amount, to_invoices, to_credit, replayed}`.
    - Sıra: yetki → aynı `(lab, idempotency_key)` varsa onu `replayed:true` ile döndür → `pg_advisory_xact_lock(hashtext('sd:'||p_clinic_id))` → `_sd_quote` (hata varsa `RAISE EXCEPTION '<kod>'`) → K4 numarası → kur ve `amount_base` (`record_clinic_receipt`'in para birimi→ana para çevirisiyle aynı yardımcıdan) → satır → `set_config('siman.sd_write','on',true)` → dönem faturalarına `payments` satırları (sütun listesi `alloc_receipt_to_invoices`'taki INSERT ile aynı; `payment_method 'indirim'`, `receipt_id NULL`, `statement_discount_id`, `payment_date = p_discount_date`, `notes = 'İND-'||doc_no`) → `_sd_apply_credit` → `log_activity('statement_discount_created', 'clinic', p_clinic_id, 'İND-'||doc_no, {amount, currency, period_from, period_to, kind, value}, v_lab, auth.uid())`.
  - `delete_statement_discount(p_id uuid) RETURNS jsonb` → `{id, invoices_touched}`. Yetki → GUC açık → satırı sil (paylar zincirleme silinir, `recalc_on_payment_change` durumları geri çevirir) → `log_activity('statement_discount_deleted', …)`.
  - `_sd_apply_credit(p_lab uuid, p_clinic uuid, p_currency text) RETURNS numeric` (iç): indirimleri `discount_date, created_at` sırasıyla gezer; her birinin K2 alacağını açık faturalara (yukarıdaki sıra, dönem şartı **yok**) `payments` satırı olarak yazar (`payment_date = CURRENT_DATE`). Uygulanan toplamı döndürür.
  - `_sd_invoice_credit_trg()` + `CREATE TRIGGER zz_sd_invoice_credit AFTER INSERT OR UPDATE OF status, total ON invoices FOR EACH ROW`:
    1. Klinikte indirim yoksa (`NOT EXISTS`) hemen döner.
    2. UPDATE, `NEW.status <> 'iptal'`, `NEW.total < OLD.total`, `NEW.paid_amount > NEW.total` → o faturadaki `indirim` paylarını en yeniden başlayarak aşan kadar küçült/sil (GUC açık).
    3. Fatura açık duruma girdiyse (INSERT `kesildi|kismi_odendi`; UPDATE `taslak` → `kesildi|kismi_odendi`), `iptal` olduysa ya da 2. adım kırptıysa ve GUC kapalıysa → `_sd_apply_credit(NEW.lab_id, NEW.clinic_id, NEW.currency)`.
  - İstemci RPC'leri `GRANT EXECUTE … TO authenticated`; iç fonksiyonlar revoke.

- [ ] **Step 1:** `.before.txt` (bu migration yalnız yeni nesne ekler; kayıt: `invoices` tetikleyici listesi ve `alloc_receipt_to_invoices` INSERT sütunları) ve `.down.sql`.
- [ ] **Step 2: Prob yaz.** Fikstür: demo lab, bir klinik, Ekim'de kesilmiş 100 ve 250 TRY, Kasım'da 100 TRY, Ekim'de 100 EUR fatura. Beklentiler:
  - `preview(TRY, Ekim, percent, 10)` → `period_total 350`, `amount 35`, `to_invoices 35`, `to_credit 0`, `balance_after = balance_before − 35`.
  - `record(... percent 10, key 'k1')` iki kez → tek satır, ikinci dönüş `replayed:true`, `doc_no` aynı.
  - Vadesi eski olan fatura önce: 100'lük faturanın `paid_amount` 35, 250'lik 0.
  - EUR faturası ve EUR bakiyesi değişmedi.
  - İkinci indirim `fixed 320` → `SD_CAP` (kalan dayanak 315). `fixed 315` → kabul; dönem faturaları `odendi`.
  - Ekim faturaları ödenmişken `fixed` üçüncü indirim reddedilir (`SD_CAP`, dayanak 0).
  - Dönemi Ekim-Aralık olan indirim, Ekim indirimlerini `prior_discounts`'a sayar.
  - 100'lük Ekim faturası `iptal` → onun indirim payı Kasım faturasına uygulanır (`paid_amount` > 0, `method 'indirim'`); klinik TRY bakiyesi `iptal` öncesine göre yalnız 100 düştü.
  - Kasım faturasını kalan tutar kadar `nakit` öde → kliniğin TRY bakiyesi 0 ve `v_invoice_reminders`'da bu klinik için satır yok.
  - Kesilmiş bir faturanın `total`'i düşürülünce (`tax_rate` değişimiyle) `paid_amount ≤ total` olur; aşan pay başka açık faturaya geçer.
  - `delete_statement_discount` → paylar silinir, faturalar `kesildi|kismi_odendi`'ye döner, nakit ödeme yerinde kalır.
  - `efatura_uuid` dolu kesilmiş faturaya pay yazılabildi (e-fatura kilidi `paid_amount`/`status` güncellemesini engellemiyor); faturanın `total`'i değişmedi.
  - Kasa ve banka: indirim kaydı ve silinmesi boyunca `_cash_sync`'in yazdığı tabloda ve banka hareketi tablosunda satır sayısı değişmedi.
  - Aktivite kaydı: `statement_discount_created` ve `_deleted` birer satır; ödeme kaydı aktivitesi eklenmedi.
  - Eşzamanlılık tek işlemli probta denenemez: `pg_get_functiondef` çıktısında `pg_advisory_xact_lock` çağrısının `_sd_quote` çağrısından **önce** geçtiği doğrulanır.
- [ ] **Step 3:** Prob → `ERROR: PROBE OK`.
- [ ] **Step 4:** Onay → uygula → canlıda ölç (fonksiyon md5, yetkiler, tetikleyici var; indirimsiz klinikte bir faturanın durum değişimi yeni tetikleyiciden etkilenmedi: `EXPLAIN` yerine 1. adımın `NOT EXISTS` kısa devresini tanımda gör).
- [ ] **Step 5: Commit** `feat(ekstre): indirim önizleme/kayıt/silme ve alacağın açık faturalara uygulanması`

### Görev 4: Raporlar — ciro, tahsilat, karlılık, aylık özet, sipariş geçmişi

**Files:**
- Create: `supabase/migrations/20261105102000_ekstre_indirimi_rapor.sql`, rollbacks, scratchpad `probe_sd_rapor.sql`
- Modify: `modules/finance/profitBreakdown.ts`, `modules/finance/components/ProfitServiceTable.tsx`, klinik kırılım tablosu bileşeni (`ProfitabilityScreen.tsx` içinden `buildClinicRows`'u tüketen bileşen)
- Test: `modules/finance/profitBreakdown.test.mts`

**Interfaces:**
- Produces (SQL, tanımlar canlıdan okunup değiştirilir):
  - `finance_period_metrics(p_from, p_to)`: `revenue`'dan, aynı para biriminde `discount_date` dönemde olan indirimlerin `Σ amount` düşülür; tahsilatın doğrudan ödeme dalı `payment_method <> 'indirim'` ile süzülür. SECURITY INVOKER kalır (lab okuma politikası yeter).
  - `profitability_summary`: ana para cirosundan `Σ amount_base`; `revenue_original` para biriminde `Σ amount`.
  - `profitability_revenue_ccy`: para birimi başına `Σ amount` düşülür.
  - `_profit_revenue_lines`: `row_kind = 'statement_discount'` satırları (klinik, para birimi, `revenue = −amount`, `revenue_base = −amount_base`, diğer sütunlar null/0). Böylece `profitability_by_service` toplamı dönem cirosuna eşit kalır.
  - `profitability_by_clinic`: dönüş tipine en sona `row_kind text` (`'order' | 'statement_discount'`) eklenir → `DROP` + `CREATE` + yetkiler. İndirim satırı: `clinic_id`, `clinic_name`, `doctor_id NULL`, `doctor_name NULL`, `revenue −amount`, `revenue_base −amount_base`, `order_ids '{}'`.
  - `v_monthly_finance_summary`: gelir ayından `Σ amount_base` (ay = `discount_date` ayı).
  - `order_history`: ödeme olaylarından `payment_method = 'indirim'` olanlar çıkar.
- Produces (TS):
  - `ClinicLine.row_kind?: 'order' | 'statement_discount'`; `buildClinicRows` indirim satırını kliniğin altında `key 'statement_discount'`, `name null` alt satırı yapar (hekimsiz siparişlerle birleşmez).
  - `ServiceLine.row_kind` ve `ServiceRow.kind` birleşimine `'statement_discount'`; `KIND_ORDER.statement_discount = 3`; `avgUnitPrice null`.
  - Etiket: hizmet tablosunda `'Ekstre indirimleri'`, klinik alt satırında aynı metin (`autoT`).

- [ ] **Step 1: Failing test** (`profitBreakdown.test.mts`'e ekle)

```ts
test('ekstre indirimi kliniğin altında ayrı satır, klinik toplamını düşürür', () => {
  const rows = buildClinicRows([
    { clinic_id: 'c1', clinic_name: 'K', doctor_id: null, doctor_name: null, currency: 'TRY', revenue: 100, revenue_base: 100, order_ids: ['o1'] },
    { clinic_id: 'c1', clinic_name: 'K', doctor_id: null, doctor_name: null, currency: 'TRY', revenue: -30, revenue_base: -30, order_ids: [], row_kind: 'statement_discount' },
  ]);
  assert.equal(rows[0].revenueBase, 70);
  assert.deepEqual(rows[0].doctors.map(d => [d.key, d.revenueBase]), [['none', 100], ['statement_discount', -30]]);
  assert.equal(rows[0].orderCount, 1);
});
test('hizmet kırılımında ekstre indirimi en sonda ve toplamı düşürür', () => {
  const rows = buildServiceRows([
    { row_kind: 'service', service_id: 's1', service_name: 'Zirkon', unit: null, currency: 'TRY', quantity: 1, revenue: 100, revenue_base: 100, listed_quantity: 0, listed_revenue_base: 0, list_value_base: 0 },
    { row_kind: 'statement_discount', service_id: null, service_name: null, unit: null, currency: 'TRY', quantity: 0, revenue: -30, revenue_base: -30, listed_quantity: 0, listed_revenue_base: 0, list_value_base: 0 },
  ]);
  assert.deepEqual(rows.map(r => r.kind), ['service', 'statement_discount']);
  assert.equal(rows.reduce((s, r) => s + r.revenueBase, 0), 70);
  assert.equal(rows[1].avgUnitPrice, null);
});
```

- [ ] **Step 2:** `node --test modules/finance/profitBreakdown.test.mts` → FAIL (`row_kind` yok sayılıyor; tür hatası değil, beklenti farkı).
- [ ] **Step 3:** `profitBreakdown.ts` ve iki tablo bileşeninin etiketini yaz; `auto.{en,de,fa}.json`'a `"Ekstre indirimleri"` (en "Statement discounts", de "Kontoauszugsrabatte", fa "تخفیف‌های صورت‌حساب").
- [ ] **Step 4:** Test → PASS; tsc 0.
- [ ] **Step 5:** DB beş adımı. Prob beklentileri (Görev 3 fikstürü + Ekim'de 35 TRY indirim): `finance_period_metrics(Ekim).revenue` 35 düşer, `collections` değişmez; `profitability_revenue_ccy` 35 düşer; `profitability_by_service` toplamı `profitability_revenue_ccy` ile eşit; `profitability_by_clinic`'te `row_kind 'statement_discount'` satırı var; `order_history` indirim payını göstermez; indirim yokken her fonksiyonun canlı sonucu probtan önceki ile aynı (Ekim ve Kasım 2026 için karşılaştır).
- [ ] **Step 6: Commit** `feat(ekstre): indirim ciroyu düşürür, tahsilata girmez; karlılıkta ayrı satır`

### Görev 5: İstemci tipleri ve API

**Files:**
- Modify: `modules/invoices/types.ts`, `modules/invoices/api.ts` (`CLINIC_STATEMENT_SELECT` 556-562)

**Interfaces:**
- Produces:
  - `PaymentMethod` birleşimine `'indirim'`; `PAYMENT_METHOD_LABELS.indirim = 'Ekstre indirimi'`.
  - `Payment.statement_discount_id?: string | null`.
  - `interface StatementDiscount { id: string; lab_id: string; clinic_id: string; currency: string; discount_date: string; period_from: string; period_to: string; kind: 'percent' | 'fixed'; value: number; amount: number; base_amount: number; doc_no: number; description: string | null; created_at: string }`
  - `interface StatementDiscountInput { clinicId: string; currency: string; from: string; to: string; kind: 'percent' | 'fixed'; value: number }`
  - `interface StatementDiscountQuote { ok: boolean; error: string | null; period_total: number; prior_discounts: number; base: number; amount: number; to_invoices: number; to_credit: number; balance_before: number; balance_after: number }`
  - `fetchStatementDiscounts(clinicId: string): Promise<{ data: StatementDiscount[]; error: string | null }>` (tarihe göre artan)
  - `previewStatementDiscount(p: StatementDiscountInput): Promise<{ data: StatementDiscountQuote | null; error: string | null }>`
  - `recordStatementDiscount(p: StatementDiscountInput & { date: string; description: string; idempotencyKey: string }): Promise<{ data: { id: string; doc_no: number; replayed: boolean } | null; error: string | null }>` — `error`, sunucu mesajındaki `SD_*` kodu ya da ham mesaj.
  - `deleteStatementDiscount(id: string): Promise<{ error: string | null }>`
  - `CLINIC_STATEMENT_SELECT`'e `items:invoice_items(total, net_total)` ve ödeme seçimine `statement_discount_id`.

- [ ] **Step 1:** `grep -rn "Object.keys(PAYMENT_METHOD_LABELS)\|Object.entries(PAYMENT_METHOD_LABELS)" modules app core` → yöntem seçicisi `invoices` etiketlerini geziyorsa `indirim` o listeden çıkarılır (bugün yalnız `suppliers`'ın kendi etiketi geziliyor; değişiklik gerekmiyorsa not düş).
- [ ] **Step 2:** Tipleri ve fonksiyonları yaz; `auto.{en,de,fa}.json`'a `"Ekstre indirimi"` (en "Statement discount", de "Kontoauszugsrabatt", fa "تخفیف صورت‌حساب").
- [ ] **Step 3:** tsc → 0 hata (yeni birleşim üyesi `Record<PaymentMethod,…>` kullanan her yeri derletir; eksik anahtar varsa ekle).
- [ ] **Step 4: Commit** `feat(ekstre): indirim tipleri ve API`

### Görev 6: Ekstre satırları, sütun değeri ve liste ayarı (saf)

**Files:**
- Modify: `modules/invoices/lib/statementDiscount.ts`, `modules/invoices/lib/statementTotals.ts`, `modules/invoices/lib/statementPrefs.ts`, `modules/invoices/hooks/useStatementPrefs.ts`, `modules/invoices/buildStatementHtml.ts` (`StatementLine` 49-82, `buildStatementLines` 89-161)
- Test: `modules/invoices/lib/statementDiscount.test.mts`, `statementTotals.test.mts`, `statementPrefs.test.mts`

**Interfaces:**
- Consumes: `StatementDiscount` (Görev 5), `DiscountMode` (Görev 1).
- Produces:
  - `StatementLine.type: 'invoice' | 'payment' | 'discount'`; yeni alanlar `discount?: number` (indirim satırında bakiyeyi düşüren tutar; fatura satırında yalnız bilgi), `discountBase?: number`.
  - `lineDelta(l: { type?: string; debit: number; credit: number; discount?: number }): number` (`statementTotals.ts`) = `debit − credit − (type === 'discount' ? discount : 0)`. `statementPeriodTotals` hareketi bununla hesaplar.
  - `invoiceDiscountOf(inv: { items?: ReadonlyArray<{ total: unknown; net_total: unknown }> | null; discount_amount?: unknown }): { amount: number; gross: number }` — `amount = Σ(total − net_total) + discount_amount`, `gross = Σ total`.
  - `discountStatementLines(discounts: ReadonlyArray<StatementDiscount>, currency: string): StatementLine[]` — `id 'disc-'+id`, `type 'discount'`, `date discount_date`, belge `İND-n`, açıklama `description`, `debit 0`, `credit 0`, `discount amount`, `discountBase base_amount`; yalnız `currency` eşleşenler.
  - `discountCellValue(l: { type: string; discount?: number; discountBase?: number }, mode: DiscountMode): { kind: 'amount' | 'percent'; value: number } | null` — tutar yoksa/0 ise null; yüzde `round1(discount / discountBase × 100)`, dayanak 0 ise null.
  - `hasAnyDiscount(lines: ReadonlyArray<{ discount?: number }>): boolean`, `discountTotal(lines): number` (yalnız `type 'discount'`).
  - `StatementPrefs.discountMode: DiscountMode`, varsayılan `'amount'`; `parseStatementPrefs` geçerli değeri kopyalar, geçersizde varsayılan; `PrefLine.type` birleşimine `'discount'`; `applyStatementPrefs` indirim satırını `payments` kapalıyken de tutar.
  - `useStatementPrefs().setPref<K extends keyof StatementPrefs>(key: K, value: StatementPrefs[K])`.
  - `buildStatementLines`: `statement_discount_id` dolu ödemeyi atlar (`receipt_id` gibi); fatura satırına `discount`/`discountBase` = `invoiceDiscountOf`; yürüyen bakiye `lineDelta` ile.

- [ ] **Step 1: Failing tests**

```ts
// statementTotals.test.mts
test('indirim satırı bakiyeyi düşürür, fatura bilgisi düşürmez', () => {
  const lines = [
    { type: 'invoice', date: '2026-10-05', debit: 100, credit: 0, discount: 10 },
    { type: 'discount', date: '2026-10-31', debit: 0, credit: 0, discount: 9 },
  ];
  assert.deepEqual(statementPeriodTotals(lines, '2026-10-01', '2026-10-31'), { opening: 0, closing: 91 });
  assert.deepEqual(statementPeriodTotals(lines, '2026-11-01', '2026-11-30'), { opening: 91, closing: 91 });
});
// statementDiscount.test.mts
test('fatura indirimi: kalem + fatura altı', () => {
  assert.deepEqual(invoiceDiscountOf({ items: [{ total: 100, net_total: 90 }, { total: '50', net_total: '50' }], discount_amount: 14 }), { amount: 24, gross: 150 });
  assert.deepEqual(invoiceDiscountOf({ items: null }), { amount: 0, gross: 0 });
});
test('sütun değeri: tutar/yüzde, bir ondalık', () => {
  const l = { type: 'discount', discount: 35, discountBase: 350 };
  assert.deepEqual(discountCellValue(l, 'amount'), { kind: 'amount', value: 35 });
  assert.deepEqual(discountCellValue(l, 'percent'), { kind: 'percent', value: 10 });
  assert.deepEqual(discountCellValue({ type: 'invoice', discount: 1, discountBase: 3 }, 'percent'), { kind: 'percent', value: 33.3 });
  assert.equal(discountCellValue({ type: 'invoice', discount: 0, discountBase: 100 }, 'amount'), null);
  assert.equal(discountCellValue({ type: 'invoice', discount: 5, discountBase: 0 }, 'percent'), null);
});
test('indirim satırları yalnız seçili para biriminde', () => {
  const d = (id: string, currency: string) => ({ id, currency, discount_date: '2026-10-31', amount: 10, base_amount: 100, doc_no: 3, description: 'x' }) as any;
  const out = discountStatementLines([d('a', 'TRY'), d('b', 'EUR')], 'TRY');
  assert.deepEqual(out.map(l => [l.id, l.type, l.debit, l.credit, l.discount]), [['disc-a', 'discount', 0, 0, 10]]);
});
// statementPrefs.test.mts — satır 19'daki varsayılan beklentisine discountMode: 'amount' eklenir, ayrıca:
test('discountMode okunur, geçersiz değer varsayılana döner', () => {
  assert.equal(parseStatementPrefs(JSON.stringify({ discountMode: 'percent' })).discountMode, 'percent');
  assert.equal(parseStatementPrefs(JSON.stringify({ discountMode: 'x' })).discountMode, 'amount');
  assert.equal(parseStatementPrefs(JSON.stringify({ vat: true })).discountMode, 'amount');
});
test('tahsilat satırları kapalıyken indirim satırı kalır', () => {
  const p = { ...DEFAULT_STATEMENT_PREFS, payments: false };
  assert.deepEqual(applyStatementPrefs([{ type: 'payment' }, { type: 'discount' }, { type: 'invoice' }] as any, p).map((l: any) => l.type), ['discount', 'invoice']);
});
```

(Varsayılan sabitin ve `parseStatementPrefs` girdisinin gerçek adları dosyadan alınır; ad farklıysa test ona uyar.)

- [ ] **Step 2:** Üç test dosyası → FAIL.
- [ ] **Step 3:** Kodu yaz. `buildStatementHtml.ts` içindeki koşucu bakiye ve `ClinicStatementScreen` 562-563'teki `run += l.debit − l.credit` → `run += lineDelta(l)`.
- [ ] **Step 4:** Testler → PASS; takım testi `# fail 0`; tsc 0.
- [ ] **Step 5: Commit** `feat(ekstre): indirim satırı, İndirim sütunu değeri ve liste ayarı`

### Görev 7: Ekstre ekranı, pencere, PDF ve Excel

**Files:**
- Create: `modules/invoices/components/StatementDiscountModal.tsx`
- Create: `core/util/cariDiscountColumn.ts` (saf; `buildCariStatementHtml.ts` uzantısız içe aktarma yaptığı için node'da sınanamıyor, sütun parçaları buraya ayrılır)
- Modify: `modules/invoices/screens/ClinicStatementScreen.tsx`, `modules/invoices/components/StatementPrefsModal.tsx`, `modules/invoices/buildStatementHtml.ts` (CariLine eşleme 182-212), `core/util/buildCariStatementHtml.ts`
- Test: `core/util/cariDiscountColumn.test.mts`

**Interfaces:**
- Consumes: Görev 5 API, Görev 6 saf fonksiyonlar, Görev 1 `sdErrorText` / `statementDiscountDocNo` / `discountPeriodLabel`.
- Produces:
  - `StatementDiscountModal` props: `{ visible: boolean; clinicId: string; currency: string; defaultFrom: string; defaultTo: string; onClose: () => void; onSaved: () => void }`.
  - `cariDiscountTh(show: boolean, label: string): string`, `cariDiscountTd(show: boolean, text: string | undefined): string`, `cariDiscountSummaryRow(show: boolean, label: string, amountHtml: string): string` — `show=false` iken üçü de `''`; metin HTML kaçışlı.
  - `CariStatementInput.showDiscount?: boolean`, `discountTotal?: number`; `CariLine.discountText?: string`, `CariLine.kind?: 'discount'`. `buildCariStatementHtml` sütun/özet HTML'ini yalnız bu üç fonksiyonla ekler; `showDiscount` yokken birleştirilen her parça `''` olduğundan tedarikçi ve çalışan ekstresi değişmez.

- [ ] **Step 1: Failing test** — `show=false` → üç fonksiyon `''`; `show=true` → `<th>` etiketi içerir, `cariDiscountTd(true, '<b>')` kaçışlı `&lt;b&gt;` içerir, `cariDiscountTd(true, undefined)` boş hücre `<td…></td>` döner, özet satırı etiketi ve tutar HTML'ini içerir.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** `cariDiscountColumn.ts`'i yaz; `buildCariStatementHtml`'de KDV sütunu deseni (169, 201-203, 586-587, 592 colspan, 597-603) izlenerek bu fonksiyonlar bağlanır; colspan `showDiscount` iken bir artar; özet satırı fatura toplamı ile bakiye arasına.
- [ ] **Step 4:** Test → PASS; tedarikçi ekstresi (`SupplierDetailScreen.tsx:264`) ve çalışan ekstresi (`EmployeeStatementModal.tsx:204`) çağrıları değişmedi (`git diff` bu iki dosyayı içermez).
- [ ] **Step 5: Ekran.** `ClinicStatementScreen`:
  - Veri: `fetchStatementDiscounts(clinicId)` diğer yüklemelerle birlikte (348-380); `allLines`'a `discountStatementLines(discounts, selectedCcy)`.
  - `typeFilter`: indirim satırı yalnız "Tümü"de.
  - Sütun: `hasAnyDiscount(filtered)` iken masaüstü başlığına (1074-1088) "İndirim" + `GlassTooltip` (spec §10 ipucu metni), satırda `discountCellValue(line, selfView ? 'amount' : prefs.discountMode)` → tutar `-` işaretli para, yüzde `%x,x`. İndirim satırının Borç/Alacak ve KDV hücreleri boş.
  - İndirim satırı başlığı "Dönem indirimi", belge `İND-n`; mobil kartta "İndirim" etiketi (tahsilat kartından ayrı ton: `U.chipTones.info`).
  - Satıra dokunma (`openLine` 519-527): `disc-` → lab'da `ConfirmDialog` (spec §10 silme metni, yıkıcı ton) → `deleteStatementDiscount` → yeniden yükle; hata onay penceresinde satır içi. `selfView`'da dokunma etkisiz.
  - KPI "Tahsil edilen" (568-580): `Σ paid_amount − Σ(statement_discount_id dolu ödemeler)`.
  - Alt döküm (1098-1122): fatura toplamı ile bakiye arasında "İndirimler" = `discountTotal(filtered)`, varsa.
  - "İndirim ekle" düğmesi "Tahsilat ekle"nin (790-797) yanında, `!selfView`, aynı `PillBtn` + `GlassTooltip`.
  - PDF (`handlePrint` 619-656 → `buildStatementHtml`): `showDiscount = hasAnyDiscount(shown)`, satır `discountText`, `discountTotal`. Excel (`exportExcel` 184-256): başlıklara (213) "İndirim" sütunu ve indirim satırı açıklaması "İndirim" (223).
- [ ] **Step 6: Pencere.** `StatementDiscountModal`: alanlar Dönem (iki tarih, `defaultFrom/defaultTo`), Tür (Yüzde | Tutar; segment deseni `ClinicStatementScreen` 1004-1027), Değer, Tarih (varsayılan dönemin son günü), Açıklama (varsayılan `autoT('Dönem indirimi') + ' · ' + discountPeriodLabel(...)`, ay adları geçerli dilde `Intl.DateTimeFormat(locale, { month: 'long' })`). Değer/dönem değişince 300 ms sonra `previewStatementDiscount`; önizleme kartı spec §10 beş satırı (önceki indirimler yalnız > 0 iken). Kaydet: idempotency anahtarı pencere açılışında `sd-${Date.now()}-${random}` (desen: `ClinicReceiptModal` `idemRef`); `ok:false` ya da hata → `autoT(sdErrorText(code))` düğmenin yanında; başarı → `onSaved()`.
- [ ] **Step 7: Liste ayarı.** `StatementPrefsModal`'a "İndirim gösterimi: Yüzde | Tutar" segmenti (`setPref('discountMode', …)`).
- [ ] **Step 8: Metinler.** `auto.{en,de,fa}.json`'a spec §10'daki bu fazın metinleri: İndirim ekle, Ekstre indirimi, Dönem, İndirim türü, Yüzde, Tutar, Hesaplanan indirim, Tarih, Açıklama, Dönemin fatura toplamı, Bu döneme önceki indirimler, Faturalara dağıtılacak, Alacağa kalacak, Yeni bakiye, İndirimi kaydet, üç hata metni, İndirim kaydedilemedi., Dönem indirimi, İndirim, sütun ipucu, İndirimler, İndirim gösterimi, silme onayı, İndirim silinemedi.
- [ ] **Step 9: Parite testi** `modules/invoices/statementDiscountI18n.test.mts`: Görev 1/4/5/7 metinlerinin hepsi üç sözlükte boş olmayan değerle var.
- [ ] **Step 10: Görsel kontrol** (mock düzeni, açık + koyu, masaüstü + 390px): indirimli ve indirimsiz klinik; `selfView`'da düğme yok, sütun tutar; pencere ortada ve bulanık arka planlı. Ekran görüntüsü kullanıcıya.
- [ ] **Step 11:** Takım testi, tsc → temiz. **Commit** `feat(ekstre): İndirim ekle penceresi, İndirim sütunu, PDF ve Excel`

### Görev 8: Sızıntı filtreleri (klinik paneli, fatura ekranı, fatura PDF'i)

**Files:**
- Modify: `modules/finance-clinic/api.ts` (:256, :398, :403, :799, :858, :911), `modules/invoices/screens/InvoiceDetailScreen.tsx` (1019-1088, 465), `modules/invoices/buildInvoiceHtml.ts` (131)

**Interfaces:**
- Consumes: `Payment.statement_discount_id`, `PAYMENT_METHOD_LABELS.indirim`.

- [ ] **Step 1:** `finance-clinic/api.ts`: bu ay ödenen, nakit akışı grafiği, yöntem kırılımı ve `fetchPayments` sorgularına `.neq('payment_method', 'indirim')`. Cari etiketinin (`Tahsilat · method`, :799/:858) üretildiği satır listesi indirim paylarını tahsilat satırı yapmaz (aynı süzgeç).
- [ ] **Step 2:** `InvoiceDetailScreen` ödeme geçmişi: `statement_discount_id` dolu satır "Ekstre indirimi İND-n" (numara `notes`'tan; yoksa yalnız etiket), geri alma düğmesi gösterilmez (1063 koşuluna `!p.statement_discount_id`). `buildInvoiceHtml` ödeme tablosu aynı etiketi basar.
- [ ] **Step 3:** Mock düzeninde klinik panelinde "Bu Ay Ödenen" (OverviewScreen 152-161) indirimli kliniğin fikstüründe indirimi saymıyor — ekran görüntüsü.
- [ ] **Step 4:** tsc, takım testi → temiz. **Commit** `fix(ekstre): indirim payları tahsilat listelerinde ve fatura geçmişinde ayrışır`

---

## Faz 2 — Fatura altı indirim

### Görev 9: Fatura altı indirim saf kuralları (istemci + edge, parite testli)

**Files:**
- Create: `modules/invoices/lib/invoiceDiscount.ts`, `supabase/functions/_shared/invoiceDiscount.ts` (aynı içerik, Deno içe aktarması yok)
- Test: `modules/invoices/lib/invoiceDiscount.test.mts`

**Interfaces:**
- Produces (iki dosyada aynı imzalar):
  - `type InvoiceDiscountType = 'percent' | 'fixed' | null`
  - `invoiceDiscountAmount(itemsNet: number, type: InvoiceDiscountType, value: number): number` — null/≤0 → 0; percent → `round2(itemsNet × value / 100)`; fixed → `min(value, itemsNet)`; sonuç ≥ 0.
  - `invoiceTotalsWithDiscount(itemsNet: number, taxRate: number, type: InvoiceDiscountType, value: number): { discount: number; subtotal: number; tax: number; total: number }` — `tax = round2(subtotal × taxRate / 100)`.
  - `distributeDiscount(lines: ReadonlyArray<{ key: string; net: number }>, discount: number): Record<string, number>` — orantılı, kuruşa yuvarlı; kuruş farkı en büyük `net`'li satıra (eşitlikte ilk); toplam tam `discount`; satır payı satır `net`'ini aşmaz.
- `round2` SQL `ROUND` ile aynı (yarım sıfırdan uzağa, kuruş tamsayısıyla).

- [ ] **Step 1: Failing test**

```ts
import * as client from './invoiceDiscount.ts';
import * as edge from '../../../supabase/functions/_shared/invoiceDiscount.ts';
for (const m of [client, edge]) {
  test('tutar', () => {
    assert.equal(m.invoiceDiscountAmount(1000, 'percent', 10), 100);
    assert.equal(m.invoiceDiscountAmount(100.10, 'percent', 15), 15.02); // 15.015 → 15.02
    assert.equal(m.invoiceDiscountAmount(80, 'fixed', 100), 80);
    assert.equal(m.invoiceDiscountAmount(80, null, 5), 0);
    assert.equal(m.invoiceDiscountAmount(80, 'percent', 0), 0);
  });
  test('toplamlar: KDV indirimden sonra', () => {
    assert.deepEqual(m.invoiceTotalsWithDiscount(1000, 20, 'percent', 10), { discount: 100, subtotal: 900, tax: 180, total: 1080 });
    assert.deepEqual(m.invoiceTotalsWithDiscount(1000, 20, null, 0), { discount: 0, subtotal: 1000, tax: 200, total: 1200 });
  });
  test('dağıtım: orantılı, kuruş farkı en büyük satıra, toplam tam', () => {
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 100 }, { key: 'b', net: 200 }], 10), { a: 3.33, b: 6.67 });
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 1 }, { key: 'b', net: 1 }, { key: 'c', net: 1 }], 0.01), { a: 0.01, b: 0, c: 0 });
    assert.deepEqual(m.distributeDiscount([], 5), {});
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 50 }], 0), { a: 0 });
  });
}
test('iki kopya aynı', () => {
  for (const [n, t, v] of [[999.99, 'percent', 33.3], [12.345, 'fixed', 3], [0, 'percent', 50]] as const)
    assert.deepEqual(client.invoiceTotalsWithDiscount(n, 18, t, v), edge.invoiceTotalsWithDiscount(n, 18, t, v));
});
```

- [ ] **Step 2:** → FAIL. **Step 3:** Yaz. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(fatura): fatura altı indirim hesap ve kalem dağıtımı`

### Görev 10: Şema — fatura altı alanlar, toplam formülü, kilit, toplu fatura, karlılık dağıtımı

**Files:**
- Create: `supabase/migrations/20261105110000_fatura_alti_indirim.sql`, rollbacks, scratchpad `probe_fatura_alti.sql`

**Interfaces:**
- Produces (SQL):
  - `invoices.discount_type text NULL CHECK (discount_type IN ('percent','fixed'))`, `discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0)`, `discount_amount numeric(12,2) NOT NULL DEFAULT 0`, `CHECK (discount_type IS DISTINCT FROM 'percent' OR discount_value <= 100)`.
  - `_invoice_discount_amount(p_net numeric, p_type text, p_value numeric) RETURNS numeric IMMUTABLE` — Görev 9 `invoiceDiscountAmount` ile aynı kural.
  - `recalc_invoice_totals(p_invoice_id)` ve `aa_enforce_invoice_totals()`: kalem varken `discount_amount = _invoice_discount_amount(Σ net_total, discount_type, discount_value)`, `subtotal = Σ net_total − discount_amount`, KDV/total bugünkü formülle. Kalem yokken bugünkü dondurma korunur ve `discount_amount = 0`.
  - `set_invoice_amount_base`: değişmez (`total` zaten indirimli); probta doğrulanır.
  - Kilit `_invoices_discount_lock()` + `BEFORE UPDATE OF discount_type, discount_value ON invoices` tetikleyicisi `zz_invoices_discount_lock`: değer değiştiyse ve (`OLD.status <> 'taslak'` ya da `_invoice_efatura_locked(OLD.efatura_uuid, OLD.efatura_status)`) ve `current_user NOT IN ('postgres','service_role')` → `RAISE EXCEPTION 'INV_DISCOUNT_LOCKED' USING ERRCODE='42501'`.
  - `create_bulk_invoice`: `DROP FUNCTION create_bulk_invoice(uuid, uuid[], integer, text)`; yeni `create_bulk_invoice(p_clinic_id uuid, p_work_order_ids uuid[], p_due_days integer DEFAULT 30, p_notes text DEFAULT NULL, p_discount_type text DEFAULT NULL, p_discount_value numeric DEFAULT 0) RETURNS uuid`. Doğrulama: tür null → değer 0 olmalı; percent `0 < v ≤ 100`; fixed `v > 0`; aksi `RAISE EXCEPTION 'INV_DISCOUNT_VALUE'`. İndirim alanları fatura INSERT'inde yazılır (kalemlerden önce, böylece `recalc` uygular). Yetkiler `.before.txt`'ten aynen. `fn_generate_monthly_invoices` 4 argümanla çağırmaya devam eder.
  - `_profit_revenue_lines`: kalem geliri `net_total × (1 − discount_amount / NULLIF(Σ net_total, 0))` (yuvarlamasız numeric); `no_items` farkı indirimden etkilenmez.
- Produces (istemci): `api.ts` `updateInvoice` beyaz listesine (284) `discount_type`, `discount_value`.

- [ ] **Step 1:** `.before.txt`: `recalc_invoice_totals`, `aa_enforce_invoice_totals`, `set_invoice_amount_base`, `create_bulk_invoice` (+ yetkiler), `_profit_revenue_lines`, `invoices` tetikleyici listesi. `.down.sql`: eski 4 argümanlı `create_bulk_invoice` geri gelir, yeni sütunlar düşer.
- [ ] **Step 2: Prob.** Beklentiler:
  - İndirimsiz aynılık: migration gövdesinden **önce** üç fikstür taslak (kalem indirimli, indirimsiz, %18 KDV'li 3 kalem) oluşturulup `subtotal, tax_amount, total, amount_base` saklanır; migration sonrası her biri için `recalc_invoice_totals` → dört değer birebir aynı, `discount_amount 0`. Canlı faturalara dokunulmaz.
  - Taslak, kalemler net 1000, %20 KDV: `discount percent 10` → `discount_amount 100`, `subtotal 900`, `tax 180`, `total 1080`, `amount_base = total × rate`.
  - Acil ek ücret kalemi sonradan eklenince indirim yeni toplama uygulanır.
  - `fixed 1500` (net 1000) → `discount_amount 1000`, `subtotal 0`.
  - `kesildi` faturada indirim değişimi → `INV_DISCOUNT_LOCKED`; `efatura_uuid` dolu taslakta da.
  - `create_bulk_invoice(..., 'percent', 10)` → fatura `discount_amount` dolu; 4 argümanlı çağrı hâlâ çalışır ve indirim 0.
  - `profitability_by_service` toplamı `profitability_revenue_ccy` ile eşit, `no_items` satırı negatif değil.
- [ ] **Step 3:** Prob → `ERROR: PROBE OK`. **Step 4:** Onay → uygula → ölç (md5, yetkiler, cron fonksiyonu hâlâ derleniyor: `select 1 from pg_proc where proname='fn_generate_monthly_invoices'` ve tanımda 4 argümanlı çağrı).
- [ ] **Step 5: Commit** `feat(fatura): fatura altı indirim alanları, toplam formülü ve kilit`

### Görev 11: İstemci — tipler, `patchItem` aynası, indirim alanı, iki toplu fatura akışı

**Files:**
- Create: `modules/invoices/components/InvoiceDiscountField.tsx`
- Modify: `modules/invoices/types.ts` (Invoice; 236-241), `modules/invoices/api.ts` (`createBulkInvoice` 211-222, `CLINIC_STATEMENT_SELECT`), `modules/invoices/hooks/useInvoices.ts` (`patchItem` 65-75), `modules/invoices/screens/InvoicesListScreen.tsx` (`BulkInvoiceModal` 708-1005), `modules/invoices/screens/ClinicBalanceScreen.tsx` (`handleBulkBill` 105-128, düğme 539)
- Test: `modules/invoices/lib/invoiceDiscount.test.mts` (alan doğrulaması)

**Interfaces:**
- Consumes: Görev 9 `invoiceDiscountAmount`, `invoiceTotalsWithDiscount`; Görev 10 RPC parametreleri.
- Produces:
  - `Invoice.discount_type: 'percent' | 'fixed' | null`, `discount_value: number`, `discount_amount: number`.
  - `createBulkInvoice(params: { clinicId; workOrderIds; dueDays?; notes?; discountType?: 'percent' | 'fixed' | null; discountValue?: number })` → RPC'ye `p_discount_type`, `p_discount_value`.
  - `validateInvoiceDiscount(type: InvoiceDiscountType, raw: string): { ok: true; value: number } | { ok: false; error: string }` (`lib/invoiceDiscount.ts`): boş → `{ok:true, value:0}`; sayı değil ya da ≤ 0 → "İndirim 0'dan büyük olmalı."; percent > 100 → "Yüzde 100'ü aşamaz.". Virgül kabul.
  - `InvoiceDiscountField` props: `{ type: InvoiceDiscountType; value: string; onChange: (type: InvoiceDiscountType, value: string) => void; error?: string | null; disabled?: boolean; lockedHint?: string }`.
  - `CLINIC_STATEMENT_SELECT`'e `discount_amount` (Görev 6 `invoiceDiscountOf` bunu okur).

- [ ] **Step 1: Failing test** — `validateInvoiceDiscount(null, '')` ok 0; `('percent','7,5')` ok 7.5; `('percent','101')` hata; `('fixed','0')` hata; `('fixed','abc')` hata.
- [ ] **Step 2:** → FAIL. **Step 3:** Yaz. **Step 4:** → PASS.
- [ ] **Step 5:** `patchItem`: `subtotal = Σ(net_total ?? total) − invoiceDiscountAmount(Σ…, inv.discount_type, inv.discount_value)`; KDV bugünkü yuvarlamayla.
- [ ] **Step 6:** `BulkInvoiceModal`: vade/not alanlarının (947-990) altına "Fatura indirimi" (`InvoiceDiscountField`); önizleme toplamı (746-753) `invoiceTotalsWithDiscount` ile; hata alanın yanında; `handleCreate` (781-801) parametreleri geçirir. Alan boş açılır (kliniğin genel oranıyla dolmaz).
- [ ] **Step 7:** `ClinicBalanceScreen.handleBulkBill`: RPC çağrısından önce küçük ortalanmış bir pencere (`U.modalOverlay`) açılır: `InvoiceDiscountField` + seçili işlerin indirimli toplamı + "Faturala"; iptal edilebilir. Akışta bugün bir onay adımı varsa bu pencereye taşınır, metni korunur.
- [ ] **Step 8:** Metinler (4 dil): Fatura indirimi, Yüzde 100'ü aşamaz., Faturala (yoksa), önizleme etiketi "İndirimli toplam".
- [ ] **Step 9:** Mock düzeninde iki akışın görüntüsü (açık + koyu). tsc, takım testi → temiz. **Commit** `feat(fatura): toplu faturada fatura indirimi`

### Görev 12: Fatura detayı ve fatura PDF'i

**Files:**
- Modify: `modules/invoices/screens/InvoiceDetailScreen.tsx` (toplamlar 955-1014, düzenleme kilitleri 339-343), `modules/invoices/buildInvoiceHtml.ts` (toplamlar 433-456)

**Interfaces:**
- Consumes: `InvoiceDiscountField`, `validateInvoiceDiscount`, `updateInvoice` (`discount_type`, `discount_value`).

- [ ] **Step 1:** Toplam bloğu sırası (spec §6.3): Kalem toplamı (`Σ net_total`) → Fatura indirimi (yüzdeyse "%10" ile) → Ara toplam → KDV → Genel toplam → Ödenen / Kalan. `discount_amount = 0` iken blok bugünkü haliyle (Kalem toplamı ve indirim satırı çizilmez).
- [ ] **Step 2:** Taslakta `InvoiceDiscountField` düzenlenebilir (kaydet → `updateInvoice` → yeniden yükle; sunucu hatası alanın yanında; `INV_DISCOUNT_LOCKED` → kilit metni). Taslak değilse ya da `efLocked` ise alan devre dışı, yanında "Kesilmiş faturada indirim değiştirilemez. Ekstreden indirim ekleyebilirsiniz.".
- [ ] **Step 3:** `buildInvoiceHtml` toplamları aynı sıra; metinler `autoT`.
- [ ] **Step 4:** Metinler (4 dil): Kalem toplamı, Fatura indirimi, kilit metni.
- [ ] **Step 5:** Mock düzeninde indirimli ve indirimsiz taslak + kesilmiş fatura; PDF önizlemesi. tsc, takım testi → temiz. **Commit** `feat(fatura): fatura detayında ve PDF'te fatura indirimi`

### Görev 13: E-fatura (Luca) dağıtımı

**Files:**
- Modify: `supabase/functions/_shared/lucaInvoice.ts` (`buildLucaInput` 173, kalem indirimi 222-231, ödenecek kontrolü 233-236), `supabase/functions/_shared/lucaMerge.ts` (`mergeInvoices` 94, `MergeRow` 12), `supabase/functions/efatura-luca/index.ts` (seçimler 373-377, 548-553), `modules/invoices/components/EFaturaPreviewModal.tsx`
- Test: `supabase/functions/_shared/lucaInvoice.test.ts`, `lucaMerge.test.ts`

**Interfaces:**
- Consumes: `distributeDiscount` (`_shared/invoiceDiscount.ts`).
- Produces: `buildLucaInput` girdisindeki faturada `discount_amount?: number`; her kalemin `DiscountAmount`'u += payı.

- [ ] **Step 1: Failing tests**
  - `buildLucaInput`: kalemler net 100 + 200, `discount_amount 10`, %20 KDV, `total 348` → kalem indirimleri 3.33 ve 6.67 artar, ödenecek tutar kontrolü geçer (hata yok), Luca toplamı `invoice.total` ile 0.01 içinde.
  - `discount_amount` yok/0 → çıktı bugünküyle `deepEqual`.
  - `mergeInvoices`: iki faturadan biri indirimli → yalnız onun kalemlerine pay yazılır.
- [ ] **Step 2:** `node --test supabase/functions/_shared/lucaInvoice.test.ts supabase/functions/_shared/lucaMerge.test.ts` → FAIL.
- [ ] **Step 3:** Dağıtımı yaz; `efatura-luca` seçimlerine `discount_amount`. Önizleme penceresi "Toplam iskonto"yu kalem indirimleri + `discount_amount` gösterir.
- [ ] **Step 4:** → PASS; takım testi, tsc temiz.
- [ ] **Step 5: Commit** `feat(efatura): fatura altı indirim Luca kalemlerine dağıtılır`
- [ ] **Step 6:** Edge yayını: `AskUserQuestion` ile ayrı onay ("efatura-luca yayını", `LUCA_PROD_ENABLED=false` durumu, mevcut `verify_jwt` ayarı korunur). Onaysız yayınlanmaz; ledger'a "edge yayını bekliyor" düşülür. Luca test ortamında gerçek gönderim denemesi kullanıcıyla birlikte yapılır (kimlik bilgisi girilmez).

---

## Faz 3 — Kliniğin genel indirim oranı

### Görev 14: `applyClinicRate` (saf)

**Files:**
- Modify: `modules/clinics/clinicDiscount.ts`
- Test: `modules/clinics/clinicDiscount.test.mts`

**Interfaces:**
- Produces: `applyClinicRate(catalog: number, pct: number): number` — `ROUND(catalog × (100 − pct) / 100, 2)` ile kuruşu kuruşuna aynı (ondalık yüzde dahil, kayan nokta hatası olmadan).

- [ ] **Step 1: Failing test**

```ts
test('genel oran SQL ROUND ile aynı', () => {
  assert.equal(applyClinicRate(1250.50, 15), 1062.93); // 1062.925
  assert.equal(applyClinicRate(100.10, 15), 85.09);    // 85.085 (float 85.0849… tuzağı)
  assert.equal(applyClinicRate(99.99, 7.5), 92.49);    // 92.49075
  assert.equal(applyClinicRate(100, 0), 100);
  assert.equal(applyClinicRate(0, 10), 0);
  assert.equal(applyClinicRate(1.05, 50), 0.53);       // 0.525
});
```

- [ ] **Step 2:** → FAIL. **Step 3:** Yaz. **Step 4:** → PASS. **Step 5: Commit** `feat(klinik): genel oranla fiyat kuralı`

### Görev 15: Şema — `resolve_item_price` oran adımı ve gösterim sütunları

**Files:**
- Create: `supabase/migrations/20261105120000_klinik_genel_oran.sql`, rollbacks, scratchpad `probe_genel_oran.sql`

**Interfaces:**
- Produces (SQL):
  - `resolve_item_price(p_lab_id uuid, p_service_id uuid, p_clinic_id uuid, p_order_date date DEFAULT CURRENT_DATE) RETURNS TABLE(price numeric, currency text, source text, source_id uuid, list_price numeric, discount_percent numeric)` — `DROP` + `CREATE` + yetkiler. Sıra: özel fiyat → özel yüzde → **genel oran** (`clinic_discounts` `lab_id = p_lab_id AND clinic_id = p_clinic_id AND discount_rate > 0`: `price = ROUND(katalog × (100 − rate) / 100, 2)`, katalog para birimi, `source 'clinic_rate'`, `source_id = clinic_discounts.id`, `list_price = katalog`, `discount_percent = rate`) → kampanya → katalog. Diğer dallarda son iki sütun NULL. `assert_my_lab` aynen.
  - `order_items.list_price numeric NULL`, `order_items.discount_percent numeric NULL`; `invoice_items.list_unit_price numeric NULL`, `invoice_items.list_discount_pct numeric NULL`.
  - Tutarlılık `_list_price_consistency()` iki tabloda `BEFORE INSERT OR UPDATE` (`order_items` `price`, `invoice_items` `unit_price` ile): liste alanları dolu ve fiyat `ROUND(liste × (100 − yüzde) / 100, 2)`'ye eşit değilse ikisi de NULL'a çekilir. Tek fonksiyon `TG_TABLE_NAME`'e göre sütun seçer.
  - `create_invoice_from_order` ve `create_bulk_invoice` kalem INSERT'i `list_unit_price = oi.list_price`, `list_discount_pct = oi.discount_percent` taşır (`create_bulk_invoice` Görev 10 imzasıyla `CREATE OR REPLACE`).
  - `_scan_bill_charges`, `_apply_order_edit`, `whatsapp-webhook`: değişmez (S2).

- [ ] **Step 1:** `.before.txt`: `resolve_item_price` (+ yetkiler), `create_invoice_from_order`, `create_bulk_invoice` (Görev 10 sonrası), `scan_decide` (çağıran; adlı sütun okuduğunun kanıtı). Ayrıca kullanıcıya CLAUDE.md değişiklik kuralı gereği etki özeti (yeni sipariş, tarama ücreti, WhatsApp siparişi; oranı olmayan klinikte sonuç değişmez) onay sorusuna yazılır.
- [ ] **Step 2: Prob.** Beklentiler:
  - Probtan önce canlı bütün `(lab, hizmet, klinik)` üçlüleri için eski fonksiyonun `(price, currency, source, source_id)` sonucu geçici tabloya; migration sonrası aynı üçlüler için yeni sonuç **birebir aynı** (canlıda `clinic_discounts` boş). `assert_my_lab` her lab için o lab'ın yöneticisi taklit edilerek geçilir; çıktıya yalnız sayımlar yazılır.
  - Fikstür klinik oranı 15: özel fiyatı olmayan, katalogu 1250.50 hizmet → `1062.93`, `'clinic_rate'`, `list_price 1250.50`, `discount_percent 15`. Özel fiyatlı hizmet → değişmedi. Özel yüzdeli hizmet → değişmedi, `list_price NULL`.
  - `order_items` INSERT: `price 1062.93, list_price 1250.50, discount_percent 15` → alanlar kalır; `price 1000` ile → ikisi NULL.
  - `create_invoice_from_order` → `invoice_items.unit_price 1062.93`, `list_unit_price 1250.50`, `list_discount_pct 15`, `net_total` oran doğrudan uygulanmış tutarla aynı.
  - `scan_decide` yolu (fikstürsüz, tanım üzerinden): fonksiyon derleniyor (`pg_get_functiondef` hatasız) ve yalnız `rp.price, rp.currency, rp.source` okuyor.
- [ ] **Step 3:** Prob → `ERROR: PROBE OK`. **Step 4:** Onay → uygula → ölç (md5, yetkiler `authenticated` için EXECUTE).
- [ ] **Step 5: Commit** `feat(fiyat): kliniğin genel oranı özel fiyatı olmayan hizmetlere uygulanır`

### Görev 16: Yeni sipariş ekranı, fiyat listesi, klinik penceresi

**Files:**
- Modify: `modules/orders/screens/NewOrderScreen.tsx` (harita 1553-1585, `effectiveServices` 1628-1635, `addPendingItem` 1797-1838, kalem yazımı 2779-2787 ve 2830-2840, `selectService` 8628-8638), `modules/orders/api.ts` (`addOrderItem` 797-815 tip), fiyat listesi `CustomTab` (`PriceListScreen.tsx` 2181, 2283-2290, 2378-2385, 2522-2560), `modules/clinics/screens/ClinicsScreen.tsx` (indirim penceresi cümlesi)

**Interfaces:**
- Consumes: `applyClinicRate` (Görev 14), RPC'nin `list_price` / `discount_percent` sütunları (Görev 15).
- Produces: `clinicPriceMap` değeri `{ price: number; currency?: string | null; listPrice?: number; ratePct?: number }`.

- [ ] **Step 1:** Harita (lab paneli, bugünkü koşullar aynen): aynı efektte `clinic_discounts` `(lab_id, clinic_id)` okunur; özel fiyat/yüzde olmayan her hizmete `rate > 0` ise `{ price: applyClinicRate(katalog, rate), listPrice: katalog, ratePct: rate }`. Özel yüzde dalındaki `Math.round(...)` de `applyClinicRate`'e geçer (aynı kural, kuruş eşitliği). `applyClinicPriceMap` karşılaştırması yeni alanları da kapsar.
- [ ] **Step 2:** `addPendingItem`: RPC satırındaki `list_price` / `discount_percent` kaleme taşınır. Diş işlemi seçiminde (`selectService`) haritadaki `listPrice` / `ratePct` kopyalanır; elle fiyat değişimi bunları temizlemek zorunda değildir (veritabanı tutarlılık tetikleyicisi siler).
- [ ] **Step 3:** İki kalem yazım noktası `list_price`, `discount_percent` gönderir (yoksa alan gönderilmez).
- [ ] **Step 4:** Fiyat listesi `CustomTab`: kliniğin oranı okunur; kendi fiyatı/yüzdesi olmayan satır `applyClinicRate(katalog, oran)` ile ve "Genel indirim %X" işaretiyle (`U.chipTones.info`) görünür.
- [ ] **Step 5:** `ClinicsScreen` penceresindeki cümle: "Bu oran, kliniğe özel fiyatı olmayan hizmetlerde yeni siparişlere uygulanır." Eski cümle `grep` ile başka yerde bulunmazsa üç sözlükten kaldırılır; bulunursa kalır.
- [ ] **Step 6:** Metinler (4 dil): yeni cümle, "Genel indirim" (`%X` ayrı string çocuğu olarak).
- [ ] **Step 7:** Mock düzeninde: oranı %10 olan klinik seçilince özel fiyatı olmayan hizmet %10 eksik, özel fiyatlı aynı; fiyat listesinde işaret. Açık + koyu. tsc, takım testi → temiz.
- [ ] **Step 8: Commit** `feat(fiyat): yeni siparişte ve fiyat listesinde kliniğin genel oranı`

### Görev 17: Faturada liste fiyatı ve oranın gösterimi (ekran, PDF, Luca)

**Files:**
- Modify: `modules/invoices/types.ts` (InvoiceItem), `modules/invoices/screens/InvoiceDetailScreen.tsx` (kalem satırları), `modules/invoices/buildInvoiceHtml.ts` (kalem indirimi 103-117), `supabase/functions/_shared/lucaInvoice.ts`, `modules/invoices/components/EFaturaPreviewModal.tsx`
- Test: `supabase/functions/_shared/lucaInvoice.test.ts`, `modules/invoices/lib/invoiceDiscount.test.mts`

**Interfaces:**
- Produces:
  - `InvoiceItem.list_unit_price?: number | null`, `list_discount_pct?: number | null`.
  - `listPriceInfo(item: { quantity: unknown; unit_price: unknown; list_unit_price?: unknown; list_discount_pct?: unknown }): { listUnit: number; pct: number } | null` (`lib/invoiceDiscount.ts` ve edge kopyası) — alanlar dolu ve `unit_price = ROUND(liste × (100 − yüzde) / 100, 2)` ise döner, aksi null. Dosya başka modülü içe aktarmaz (tsc `.ts` uzantılı içe aktarmaya izin vermiyor); kuruş hesabı dosyanın kendi `round2`'siyle. Parite testi `listPriceInfo` sonucunu `applyClinicRate` (Görev 14) ile bir tabloda karşılaştırır.

- [ ] **Step 1: Failing tests**
  - `listPriceInfo({ quantity: 2, unit_price: 1062.93, list_unit_price: 1250.50, list_discount_pct: 15 })` → `{ listUnit: 1250.50, pct: 15 }`; `unit_price 1000` → null; alanlar null → null.
  - `buildLucaInput`: böyle bir kalemde `PriceAmount = 1250.50`, `DiscountAmount = round2(2 × 1250.50 − net_total)` (+ varsa fatura altı payı); ödenecek kontrolü geçer; liste alanı yokken çıktı bugünküyle `deepEqual`.
- [ ] **Step 2:** → FAIL. **Step 3:** Yaz (`listPriceInfo` iki kopyada; parite testine bir satır).
- [ ] **Step 4:** Fatura detayı ve PDF: kalem açıklamasının altında ikincil satır "Liste fiyatı <tutar> · Genel indirim %<oran>"; birim fiyat ve tutar sütunları değişmez.
- [ ] **Step 5:** Metinler (4 dil): "Liste fiyatı". 
- [ ] **Step 6:** Testler → PASS; tsc, takım testi temiz. **Commit** `feat(fatura): genel orandan gelen kalemde liste fiyatı ve oran`
- [ ] **Step 7:** Görev 13 yayını henüz yapılmadıysa bu değişiklikle birlikte tek onay sorusu; yapıldıysa ikinci edge yayını için ayrı onay.

---

## Bitiş kontrolü (son görevden sonra)

- [ ] Spec §14 senaryosu mock düzeninde baştan sona: ekstre → İndirim ekle (%10) → PDF'te indirim satırı ve düşen bakiye; klinik paneli aynı bakiye; kalan ödeme sonrası dönem faturaları Ödendi; karlılıkta ciro düşüşü; tahsilat raporunda indirim yok.
- [ ] Canlı sağlık ölçümü (salt okuma): `v_clinic_balance_ccy` toplamı ve `finance_period_metrics` (Ekim–Kasım 2026) planın başındaki değerlerle aynı (canlıda indirim kaydı yok).
- [ ] Memory: `project_statement_discount.md` (tablo, GUC, K2/K3 kuralları, sapmalar S1/S2) ve MEMORY.md satırı; `project_profitability_clinic_revenue.md`'ye "ekstre indirimi ayrı satır" notu.
- [ ] Web yayını kullanıcı "deploy" deyince.
