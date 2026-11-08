# Tahsilat FIFO + Dönem Hatırlatma Implementation Plan (2/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tahsilat en eski açık borçtan (FIFO) dağılsın, fazlası alacak olarak kalıp sonraki fatura kesinleşince kendiliğinden uygulansın, lab kayıtta faturaları elle seçebilsin, ekstre tahsilatın neyi kapattığını göstersin ve hatırlatma gecikmiş dönemleri listelesin.

**Architecture:** FIFO dağıtımı zaten canlıda (`_receipt_alloc_plan`, sıra `due_date asc nulls last, created_at, id`). Bu plan dört boşluğu kapatır:
- **DB:**
  - `apply_clinic_credit` gövdesi yetki kapısız bir çekirdeğe (`_apply_clinic_credit_core`) taşınır. Fatura kesinleşince bir AFTER tetikleyici bu çekirdeği çağırır.
  - `_receipt_alloc_plan` / `preview_clinic_receipt` / `record_clinic_receipt` isteğe bağlı `p_invoice_ids uuid[]` alır.
  - Hatırlatma metni saf bir SQL yardımcısıyla (`_overdue_periods_text`) üretilir. `_send_payment_reminder_core` bu cümleyi gövdeye ekler.
- **İstemci:**
  - Tahsilat penceresine "Faturaları elle seç" eklenir.
  - Ekstrede tahsilat satırının altında "Kapattığı: …" yazar. Bu satır ekran, PDF ve Excel'de görünür.

**Tech Stack:** Supabase Postgres (plpgsql, migration + `.down.sql` + rolled-back probe), Expo/React Native Web (TS), `node --test` (.test.mts), i18n sözlükleri (`core/i18n/locales/auto.{en,de,fa}.json`).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-06-on-ekstre-onay-design.md` — §2.12 (dönem bazlı hatırlatma), §2.13 (tahsilat dağıtımı). Plan 1 (kilit + DZ) bitti: commits 9ee1fbe..6d1122f. `v_statement_discount_effective` tek kuraldır.

## Global Constraints

- **Komutlar:**
  - DB: `cd my-expo-app && supabase db query --linked -f <abs path> [-o csv]`. Proje: kjwjxqfdsxkxgcgophdy.
  - Test: `find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test`. Taban 583/583.
  - Tip: `npx tsc --noEmit --incremental false`. ÖN PLANDA çalışır, bitişini bekle, aynı anda iki tsc açma. 0 hata kalmalı.
- **Her DB değişikliği şu sırayla gider:**
  - Değişen her nesnenin canlı tanımı `pg_get_functiondef` / `pg_get_viewdef` ile `supabase/migrations/<ad>.before.txt`'ye alınır.
  - Migration yazılır, yanında `<ad>.down.sql` (before.txt'ten geri yükler).
  - `BEGIN … ROLLBACK` içinde probe çalışır.
  - **DUR**: kontrolör kullanıcıdan "Onaylıyorum, uygula" alır.
  - Sonra uygula, ölç, commit.
- **Gönderici fonksiyonlar probe'larda ASLA çağrılmaz:** `_send_payment_reminder_core`, `send_payment_reminder*`, `run_auto_payment_reminders`, `send_payment_reminders_bulk`.
  - Probe'un geçtiği yolda `net.http_post` çağıran bir tetikleyici varsa implementer durur ve raporlar.
  - NOTIFY_FN_SECRET ve anon key yazdırılmaz. `cron.job.command` seçilmez.
- **Yetki taklidi:** yalnız `set_config('request.jwt.claims', …, true)` ile yapılır. Hiçbir parola girilmez ya da yazdırılmaz.
- **KVKK:** çıktıda kişi adı ve gerçek tutar yok. Canlı veride yalnız sayım (count) raporlanır.
- **Repo kuralları:**
  - node ile test edilen lib dosyaları yerel içe aktarmada yalnız `import type` kullanır. Çalışma zamanında `.ts` uzantılı içe aktarma yok.
  - Testlerde `setLanguage` çağrılmaz.
- **i18n ve tema:**
  - Her yeni kullanıcı metni tr kaynak + en/de/fa sözlük girdisiyle birlikte gelir.
  - Koyu tema aynı anda: yeni renkler token'dan gelir, sabit hex yok.
  - Sözlük dosyaları yalnız hunk bazında stage edilir ("Tam kafa"/head-scan satırları başka oturumundur, dokunma).
- **Dokunulmaz dosyalar** (başka oturum): `modules/ar-scanner/**`, `modules/viewer-3d/**`, `modules/orders/components/FaceScanQuickAction.tsx`.
- **Commit:** main üzerinde, push yok. Mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Davranış korunur:**
  - `p_invoice_ids` verilmediğinde dağıtım bugünküyle birebir aynı kalır.
  - `apply_clinic_credit` imzası ve yetki kapısı (`manage_finance`) değişmez.
  - Taslaklar bakiyeye ve hatırlatmaya girmez (spec §2.12, §4).

## Review Focus

1. **Alacak yanlış faturaya uygulanmamalı.** Otomatik uygulama yalnız `taslak → kesildi` geçişinde ya da doğrudan `kesildi` INSERT'ünde çalışır. Taslak, iptal ya da zaten ödenmiş faturaya ödeme yazılmaz. `kismi_odendi/odendi` güncellemesi tetikleyiciyi yeniden çalıştırmaz (özyineleme yok).
2. **Farklı para birimi.** EUR alacak varken TL fatura kesinleşirse alacak, faturanın kuruyla (mevcut 2. adım kuralı) uygulanır. `allocated_base` alacağı aşmaz.
3. **Elle seçimde geçersiz fatura.** Başka kliniğin, iptal, taslak ya da kapalı faturası seçilirse `RCPT_INVOICE_INVALID` hatası döner (sessizce yok sayılmaz). Pencere bu hatayı butonun yanında okunur metinle gösterir.
4. **Fiş düzenleme.** `update_clinic_receipt` yeniden dağıtırken elle seçim korunmaz; FIFO'ya döner. Pencere düzenleme modunda elle seçimi gizler ve bunu tek satırla söyler. Plan, sessiz bir seçim kaybı bırakmamalıdır.
5. **Dönem metni sınırları.** Çok para birimi ve yıl dönümü (Aralık 2025 + Ocak 2026), tek dönem ve 3+ dönem birleştirmesi ("A, B ve C") ile vadesi gelmemiş ya da kısmen ödenmiş faturanın açık kısmı doğru gösterilmelidir.

---

### Task 1: Alacak otomatik uygulama + elle fatura seçimi (DB)

**Files:**
- Create: `supabase/migrations/20261108100000_tahsilat_alacak_secim.sql`
- Create: `supabase/migrations/20261108100000_tahsilat_alacak_secim.before.txt`
- Create: `supabase/migrations/20261108100000_tahsilat_alacak_secim.down.sql`
- Create (probe, commit edilmez): scratchpad `probe_tahsilat.sql`

**Interfaces:**
- Produces:
  - `public._apply_clinic_credit_core(p_clinic_id uuid, p_receipt_id uuid default null) returns jsonb`
    - SECURITY DEFINER, yetki kapısı yok.
    - `revoke execute … from public, anon, authenticated`.
    - Bugünkü `apply_clinic_credit` gövdesini birebir taşır; dönüş `{applied_base, receipts_touched}`.
  - `public.apply_clinic_credit(p_clinic_id uuid, p_receipt_id uuid default null)`
    - Aynı imza, aynı kapı; gövde artık çekirdeği çağırır.
  - Tetikleyici fonksiyonu `public._trg_invoice_apply_receipt_credit()`.
    - Tetikleyici adı `zz_tr_invoice_receipt_credit`: AFTER INSERT OR UPDATE OF status ON invoices, FOR EACH ROW.
    - Ad, `zz_sd_invoice_credit`'ten sonra ve `zzz_` öncesine dizilir; İND alacağı önce uygulanır.
    - Çalışma koşulu: `new.status = 'kesildi'` VE (`TG_OP = 'INSERT'` OR `old.status = 'taslak'`) VE kliniğin `total_base > allocated_base` olan en az bir fişi var.
    - Koşul sağlanınca `_apply_clinic_credit_core(new.clinic_id)` çağrılır.
  - `public._receipt_alloc_plan(p_clinic_id uuid, p_lines jsonb, p_base numeric, p_invoice_ids uuid[] default null)`
    - Eski 3 argümanlı sürüm DROP edilir (aşırı yükleme belirsizliği olmasın).
    - Yeni sürüm aynı OUT sütunlarını döndürür.
  - `public.preview_clinic_receipt(p_clinic_id uuid, p_lines jsonb, p_invoice_ids uuid[] default null)`
    - Eski DROP edilir. Dönen JSON'a `open_invoices` eklenir: `[{invoice_id, invoice_no, currency, open, issue_date, due_date}]`, FIFO sırasıyla.
  - `public.record_clinic_receipt(p_clinic_id uuid, p_lines jsonb, p_receipt_date date default null, p_payment_method text default 'nakit', p_reference_no text default null, p_notes text default null, p_idempotency_key text default null, p_invoice_ids uuid[] default null)`
    - Eski 7 argümanlı DROP edilir. `p_invoice_ids`, `alloc_receipt_to_invoices`'a geçer.
  - `public.alloc_receipt_to_invoices(…, p_invoice_ids uuid[] default null)`
    - Eski imza DROP edilir. Diğer çağıranlar (`apply_clinic_credit` çekirdeği, `update_clinic_receipt`) argümanı vermez → FIFO.
  - Hata kodu: `RCPT_INVOICE_INVALID` (ERRCODE 22023).
    - Seçilen bir id bu kliniğin `kesildi/kismi_odendi` ve `total > paid_amount` faturası değilse yükselir.
    - Dağıtımdan ÖNCE `record_clinic_receipt` ve `preview_clinic_receipt` içinde kontrol edilir.
- DROP + CREATE'ten sonra `grant execute` ve `revoke` ayarları before.txt'teki ACL'ye birebir geri yüklenir (`\dp` yerine `pg_proc.proacl` ile yakalanır).

**Elle seçim algoritması** (spec "otomatik sıranın yerine elle seçebilir"):
- `p_invoice_ids` boş değilse 1. ve 2. adımın fatura döngüleri önce seçilen faturaları dizideki sırayla (`array_position`) işler, sonra kalan faturaları FIFO sırasıyla.
- Seçilenler kapandıktan sonra kalan tutar diğer açık faturalara FIFO ile, kalanı da alacağa gider.
- Neden: açık borç dururken alacak bekletilmez. Ön koşul kararı ledger'a ruling olarak yazılır.
- Uygulama: her iki döngünün `order by` ifadesinin başına `coalesce(array_position(p_invoice_ids, i.id), 2147483647)` eklenir.

- [ ] **Step 1: Canlı tanımları yakala**
  - `_receipt_alloc_plan`, `alloc_receipt_to_invoices`, `apply_clinic_credit`, `preview_clinic_receipt`, `record_clinic_receipt`, `update_clinic_receipt` için `pg_get_functiondef` ve `proacl` alınır.
  - invoices ve payments tetikleyici listesi alınır.
  - Hepsi `.before.txt`'ye yazılır.
  - payments/invoices tetikleyici fonksiyonlarında `net.http_post` geçen var mı diye grep edilir ve sonuç rapora yazılır. Varsa ve probe yolunda kalıyorsa DUR ve raporla.
  - `update_clinic_receipt`'in `alloc_receipt_to_invoices`'ı nasıl çağırdığını rapora yaz (Review Focus 4).

- [ ] **Step 2: Migration ve down yaz**
  - Migration, Interfaces bloğundaki nesneleri tek transaction'da oluşturur.
  - Down, before.txt'teki tanımları ve ACL'leri geri yükler, yeni çekirdek, tetikleyici ve fonksiyonu DROP eder.

- [ ] **Step 3: Probe yaz ve çalıştır (BEGIN … ROLLBACK, migration probe içinde uygulanır)**
  - Kimlik: `manage_finance` yetkili bir lab kullanıcısı. Sentetik klinik ve faturalar yalnız transaction içinde oluşturulur. Her kontrol `PASS/FAIL` satırı basar:
  - `auto_credit_on_issue`
    - Kurulum: klinikte 1.000 TRY alacaklı fiş (`record_clinic_receipt`, açık fatura yokken), sonra 600 TRY taslak fatura.
    - Fatura `kesildi`'ye geçirilir.
    - Beklenen: faturada fişe bağlı 600 ödeme var, fişin `allocated_base` değeri 600 arttı, fatura `odendi`.
  - `no_credit_on_draft_insert`: taslak INSERT ödeme üretmez.
  - `no_rerun_on_paid_transition`: `kismi_odendi → odendi` güncellemesi ek ödeme üretmez. Ödeme sayısı değişmez.
  - `cross_ccy_credit`: EUR alacak + TRY fatura kesinleşince ödeme faturanın kuruyla yazılır ve `amount_base ≤ alacak`.
  - `manual_selection_order`
    - Kurulum: üç açık fatura A (en eski), B, C ve `p_invoice_ids = [C]` ile C'nin açığı + A'nın yarısı kadar tahsilat.
    - Beklenen: önce C kapanır, sonra A kısmen kapanır, B'ye dokunulmaz.
  - `manual_selection_invalid`: başka kliniğin faturası ya da taslak id → `RCPT_INVOICE_INVALID`.
  - `fifo_unchanged_without_ids`: `p_invoice_ids` yokken plan çıktısı, aynı veride eski 3 argümanlı mantığın (before.txt'teki gövde geçici adla kurulur) çıktısıyla satır satır eşit.
  - `credit_gate_kept`: yetkisiz kimlikle `apply_clinic_credit` → `Yetkiniz yok`.
  - `core_not_callable`: `authenticated` rolüyle `_apply_clinic_credit_core` → permission denied.
  - Beklenen: tüm satırlar PASS.

- [ ] **Step 4: DUR — kontrolöre raporla** (before/down/probe çıktısı). Kontrolör kullanıcıdan "Onaylıyorum, uygula" alır.

- [ ] **Step 5: Uygula ve ölç**
  - Migration'ı canlıya uygula.
  - Ölçümler:
    - (a) Yeni imzalar `pg_proc`'ta, eski imzalar yok.
    - (b) ACL'ler before ile aynı.
    - (c) Tetikleyici var.
    - (d) Probe'un salt-okur kısmı canlıda PASS (sentetik veri yine ROLLBACK içinde).
    - (e) Canlıda alacaklı fiş ve açık kesinleşmiş faturası birlikte olan klinik sayısı (yalnız sayı). Geçmiş veri için toplu uygulama YAPILMAZ.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261108100000_tahsilat_alacak_secim.*
git commit -m "feat(tahsilat): alacak fatura kesinleşince uygulanır, elle fatura seçimi"
```

---

### Task 2: Tahsilat penceresinde elle fatura seçimi (istemci)

**Files:**
- Modify: `modules/invoices/api.ts`. `previewClinicReceipt(clinicId, lines, invoiceIds?)` ve `recordClinicReceipt({ …, invoiceIds?: string[] })` içinde `p_invoice_ids` yalnız dolu dizi olduğunda gönderilir. `ReceiptResult` tipine `open_invoices?: OpenInvoice[]` eklenir.
- Modify: `modules/invoices/components/ClinicReceiptModal.tsx`
- Create: `modules/invoices/lib/receiptSelection.ts`
- Test: `modules/invoices/lib/receiptSelection.test.mts`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`. Yeni metinler: "Faturaları elle seç", "Seçilen faturalar önce kapanır, kalanı en eskiden başlar", "Düzenlemede dağıtım en eski borçtan yeniden yapılır", "Seçilen fatura artık açık değil".

**Interfaces:**
- Consumes: Task 1'deki `preview_clinic_receipt(…, p_invoice_ids)` → `open_invoices`. `record_clinic_receipt(…, p_invoice_ids)`. Hata `RCPT_INVOICE_INVALID`.
- Produces:
  - `export interface OpenInvoice { invoice_id: string; invoice_no: string | null; currency: string; open: number; issue_date: string | null; due_date: string | null }`, `api.ts` içinde.
  - `toggleSelection(ids: string[], id: string): string[]` — seçim sırasını korur, tekrar seçilen çıkar.
  - `pruneSelection(ids: string[], open: OpenInvoice[]): string[]` — artık açık olmayanları atar.
  - `receiptErrorText(msg: string): string | null` — `RCPT_INVOICE_INVALID` → "Seçilen fatura artık açık değil", diğerleri null.
  - Üçü de `receiptSelection.ts` içinde.

- [ ] **Step 1: Failing test**
  - `toggleSelection(['a','b'],'c')` → `['a','b','c']`; `toggleSelection(['a','b','c'],'b')` → `['a','c']`.
  - `pruneSelection(['a','x'], [{invoice_id:'a',…}])` → `['a']`.
  - `receiptErrorText('… RCPT_INVOICE_INVALID …')` → `'Seçilen fatura artık açık değil'`; `receiptErrorText('başka')` → `null`.
- [ ] **Step 2:** `node --test modules/invoices/lib/receiptSelection.test.mts` → FAIL (modül yok).
- [ ] **Step 3: Uygula**
  - Pencerede önizleme altında "Faturaları elle seç" anahtarı olur. Açıkken `open_invoices` listesi çıkar: fatura no, düzenleme tarihi, açık tutar, para birimi.
  - Dokunulan fatura sıra numarasıyla işaretlenir. Önizleme seçimle yeniden istenir.
  - Kayıt `invoiceIds` ile gider. Anahtar kapalıyken dizi gönderilmez.
  - Düzenleme modunda (`editingReceipt`) anahtar gizlenir ve tek satır açıklama gösterilir (Review Focus 4).
  - Hata, kaydet butonunun yanında `receiptErrorText` metniyle görünür.
  - Renkler tema token'larından gelir. Satır, sol kenarlıklı kart değildir.
- [ ] **Step 4:** Test → PASS; tam suite yeşil; `npx tsc --noEmit --incremental false` → 0 hata.
- [ ] **Step 5: Commit**
  - `git add` ile api.ts, modal, lib ve test eklenir; sözlükler `git add -p` ile yalnız bu hunk'lar.
  - Komut: `git commit -m "feat(tahsilat): pencerede faturaları elle seçme"`

---

### Task 3: Ekstrede "Kapattığı" satırı (ekran, PDF, Excel)

**Files:**
- Modify: `modules/invoices/lib/receiptStatement.ts`
- Modify: `modules/invoices/lib/receiptStatement.test.mts`
- Modify: `modules/invoices/screens/ClinicStatementScreen.tsx`. Satır kurulumu ~619–641. Excel `exportExcel` ~213; açıklama sütununa ` · ` ile eklenir.
- Modify: `modules/invoices/buildStatementHtml.ts`. `StatementLine` (~51) içine `coverage?: string | null` eklenir. Ödeme satırında detay altına küçük ikinci satır.
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`. Yeni metinler: "Kapattığı", "Alacağa"; ay adları mevcut sözlükten.

**Interfaces:**
- Consumes: mevcut `ReceiptForStatement`, `InvoiceForStatement`. `InvoiceForStatement`'a `id?`, `invoice_number?: string | null` ve `issue_date?: string | null` alanları eklenir.
- Produces:
  - `receiptCoverage(r: ReceiptForStatement, invoices: InvoiceForStatement[], ccy: string): { items: { invoiceNo: string; issueDate: string | null; amount: number }[]; credit: number }`
    - items: bu paradaki, iptal olmayan faturalarda `receipt_id === r.id` ödemelerinin fatura başına toplamı, `issueDate` artan.
    - credit: yalnız baz para sekmesinde `max(0, total_base − allocated_base)`.
    - Hepsi 2 haneye yuvarlanır.
  - `formatReceiptCoverage(cov, opts: { tr: (s: string) => string; money: (n: number) => string; month: (isoDate: string) => string }): string | null`
    - Biçim: `"Kapattığı: F-1212 Eylül 1.600 · F-1240 Ekim 5.900 · Alacağa 1.300"`.
    - Alacak yoksa son parça düşer. items yoksa ve alacak varsa `"Alacağa 1.300"`. İkisi de yoksa `null`.
    - `issueDate` yoksa ay parçası düşer.
  - `receiptCreditForCurrency` davranışı değişmez. Toplamı `receiptCoverage`'dan türetmek serbesttir ama mevcut testleri yeşil kalmalı.

- [ ] **Step 1: Failing test** (`receiptStatement.test.mts`)
  - `receiptCoverage` iki TRY fatura (F-1212 2026-09-10 → 1600, F-1240 2026-10-05 → 5900) + `total_base 8800, allocated_base 7500, base_currency 'TRY'` ile çağrılır.
    - Beklenen: `ccy 'TRY'` → `items` [F-1212 1600, F-1240 5900], `credit 1300`.
    - Beklenen: `ccy 'EUR'` → `items []`, `credit 0`.
  - İptal faturadaki ödeme items'a girmez.
  - `formatReceiptCoverage` sabit `tr=id`, `money=n=>n.toLocaleString('tr-TR')` ve `month=d=>({ '09':'Eylül','10':'Ekim' })[d.slice(5,7)]` ile çağrılır. Beklenen dize: `'Kapattığı: F-1212 Eylül 1.600 · F-1240 Ekim 5.900 · Alacağa 1.300'`.
  - Yalnız alacak → `'Alacağa 1.300'`. Hiçbiri → `null`.
- [ ] **Step 2:** `node --test modules/invoices/lib/receiptStatement.test.mts` → FAIL.
- [ ] **Step 3: Uygula**
  - Ekranda `rcptLines`'a `coverage: formatReceiptCoverage(receiptCoverage(r, postedInvoices, selectedCcy), {tr: autoT, money: <ekranın para biçimleyicisi, (Number(n)||0)>, month: <mevcut ay-adı yardımcısı ya da autoT(ay adı)>})` eklenir.
  - Detay satırının altında ikincil renkte görünür. PDF ve Excel aynı metni kullanır.
  - Klinik paneli (`modules/finance-clinic`) bu planda değişmez; spec §14 görünümü plan 4'tedir. Bu ruling ledger'a yazılır.
- [ ] **Step 4:** Test → PASS; tam suite yeşil; tsc 0 hata.
- [ ] **Step 5: Commit**
  - Komut: `git commit -m "feat(ekstre): tahsilat satırında kapattığı faturalar ve alacak"`
  - Sözlükler `git add -p` ile eklenir.

---

### Task 4: Dönem bazlı gecikme hatırlatması (DB)

**Files:**
- Create: `supabase/migrations/20261108101000_donem_hatirlatma.sql`, `.before.txt`, `.down.sql`
- Create (probe, commit edilmez): scratchpad `probe_donem.sql`

**Interfaces:**
- Produces:
  - `public._overdue_periods_text(p_rows jsonb, p_today date) returns text`
    - IMMUTABLE, saf; tablo okumaz.
    - Girdi: `[{currency, issue_date, due_date, open}]`.
    - Yalnız `due_date < p_today` ve `open > 0` satırları sayılır. Dönem = `date_trunc('month', coalesce(issue_date, due_date))`.
    - Para birimi başına bir cümle parçası. Dönemler eskiden yeniye sıralanır, aynı dönemin açıkları toplanır.
    - Biçim: `"<Ay>[ <Yıl>] <tutar> ve <Ay> <tutar>, toplam <tutar> gecikti."`.
      - Yıl yalnız `p_today`'in yılından farklıysa yazılır.
      - 3+ dönem: `"A, B ve C"`.
      - Tek dönem: `"Eylül ₺1.600,00 gecikti."` (toplam parçası yok).
    - Birden çok para birimi `"; "` ile birleşir, cümle tek nokta ile biter.
    - Tutar `_reminder_amounts` ile AYNI biçimdir: sembol eşlemesi ve `to_char(…, 'FM999G999G990D00')`.
    - Ay adları Türkçe sabit dizidir (Ocak…Aralık). Hatırlatma gövdesi bugün de Türkçedir; bu ruling ledger'a yazılır.
    - Hiç satır yoksa `null`.
  - `public._reminder_periods(p_lab uuid, p_clinic uuid) returns jsonb`
    - STABLE. Bu kliniğin `status in ('kesildi','kismi_odendi')` ve `total > paid_amount` faturalarını yukarıdaki biçimde döndürür.
    - Kapsam dışı: taslak, iptal, onay bekleyen.
  - `_send_payment_reminder_core`: yalnız gövde kurulumu değişir.
    - `p_invoice_id is null` iken `v_body`'ye "N fatura vadesini aştı." cümlesinden sonra `_overdue_periods_text(_reminder_periods(p_lab_id, p_clinic_id), lab_today(p_lab_id))` eklenir (null ise atlanır).
    - Diğer her şey before.txt'teki tanımla birebir aynı kalır: alıcılar, kanallar, `dueText`, payload anahtarları, WhatsApp şablon parametreleri.

- [ ] **Step 1: Yakala**
  - `_send_payment_reminder_core`, `_reminder_amounts` (salt referans) ve `my_payment_reminder` tanımları + ACL `.before.txt`'ye alınır.
  - `my_payment_reminder` gövdeyi `payment_reminders.body`'den mi okuyor, rapora yaz. Okuyorsa ek değişiklik gerekmez.
- [ ] **Step 2: Migration + down yaz.** `_send_payment_reminder_core` CREATE OR REPLACE ile değişir. Diff yalnız gövde satırı + bir değişken olmalı; implementer before/after diff'ini rapora koyar.
- [ ] **Step 3: Probe (BEGIN … ROLLBACK).** Yalnız saf fonksiyon + `_reminder_periods` sayımı. Gönderici çağrılmaz. Her kontrol `PASS/FAIL`:
  - `two_periods`
    - Girdi: TRY {2026-09-10, due 2026-10-10, 1600} + {2026-10-05, due 2026-11-04, 5900}, today 2026-11-08.
    - Beklenen: `"Eylül ₺1,600.00 ve Ekim ₺5,900.00, toplam ₺7,500.00 gecikti."` (G/D ayırıcıları canlı `lc_numeric`'e göre; beklenen dize `_reminder_amounts` ile aynı biçimden üretilir).
  - `not_yet_due_excluded`: due ≥ today satırı metne girmez.
  - `same_period_summed`: aynı aydaki iki fatura tek dönemde toplanır.
  - `year_boundary`
    - Girdi: 2025-12 + 2026-01, today 2026-02-20.
    - Beklenen: `"Aralık 2025 … ve Ocak … , toplam … gecikti."` (Ocak'ta yıl yok).
  - `three_periods`: `"A, B ve C"` birleştirmesi.
  - `multi_ccy`: TRY ve EUR → iki parça `"; "` ile.
  - `empty`: `'[]'` → null.
  - `periods_live_count`: canlı bir lab'da `_reminder_periods` dönen dizi uzunluğu > 0 olan klinik sayısı. Yalnız sayı basılır.
  - `core_body_diff`: `pg_get_functiondef(_send_payment_reminder_core)` migration sonrası yalnız beklenen satırlarda farklı (metin karşılaştırması probe içinde).
  - Beklenen: tümü PASS.
- [ ] **Step 4: DUR** — kontrolör "Onaylıyorum, uygula" alır.
- [ ] **Step 5: Uygula ve ölç.** Fonksiyonlar mevcut, ACL'ler before ile aynı, probe'un saf kısmı canlıda PASS. Hiçbir hatırlatma GÖNDERİLMEZ; bir sonraki otomatik cron çalışmasında görülür.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261108101000_donem_hatirlatma.*
git commit -m "feat(hatirlatma): gecikmiş dönemleri listeleyen tek mesaj"
```
