# Maaş tek kaynak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maaş ve TC kimlik no'yu, yalnız maaş yetkisinin ve kişinin kendisinin okuyabildiği tek bir tabloda toplamak. Profildeki ve personel kartındaki açık kopyaları aşamalı olarak kapatmak.

**Architecture:**
- Yeni `employee_compensation` tablosu RLS ile korunur.
  - Okuma: `can_view_payroll()` veya kendi satırı.
  - Yazma: yeni `can_write_payroll()`.
- `employees` üzerindeki iki tetikleyici geçiş dönemini yönetir:
  - "koru": yetkisiz kişinin maaş sütunlarını değiştirmesini engeller.
  - "aktar": yetkili yazımı yeni tabloya taşır.
- Bordro fonksiyonları ve `v_employee_summary` maaşı yeni tablodan okur.
- İstemci yeni tabloyu kullanır. Yayından sonra eski sütunlar boşaltılır, silinmez.

**Tech Stack:** Supabase Postgres (RLS, plpgsql, `supabase db query --linked`), Expo + react-native-web, edge functions (Deno).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-25-maas-tek-kaynak-design.md`

## Global Constraints

- **Veritabanı değişikliği beş adımda yapılır** (kullanıcı kuralı):
  1. Canlı tanım `supabase/rollbacks/*.before.*`'a kaydedilir.
  2. Geri alma betiği `supabase/rollbacks/<migration>.down.sql` yazılır.
  3. Değişiklik, gerçek kullanıcı kimlikleriyle rol rol, geri alınan işlemde denenir. KIRMIZI önce, YEŞİL sonra.
  4. **Kullanıcı açık onay verir.**
  5. `supabase db query --linked -f <mutlak yol>` ile uygulanır ve canlıda hemen doğrulanır.
- **Yayın:**
  - Kullanıcı "deploy" demeden web ya da edge fonksiyonu yayını yok.
  - Commit yok.
  - Canlı hesapta kaydet/gönder/onayla düğmesine basılmaz.
- **KVKK:** Raporlarda ve çıktılarda kişi adı ve maaş tutarı yazılmaz; sayılar ve ad başlangıcı ("Mel…") yeterli.
- **Ekran kuralları:**
  - Yeni her metin aynı anda tr/en/de/fa'ya eklenir: `auto.{en,de,fa}.json` ve gerekiyorsa anahtarlı JSON.
  - Yeni UI koyu temada da doğru görünür: `useMobileTokens` / `useInkUI`.
  - İkonlar yalnız `core/ui/icons`'tan.
- **Para gösterimi:** Baz para birimiyle (`formatMoney` + `useBaseCurrency()`); sabit ₺ yasak.
- **Her görevin sonunda:** `npx tsc --noEmit -p .` 0 hata ve `node --test` yeşil.
- **Panel-agnostik rota:** Paylaşılan ekranda panel öneki `useSegments()[0]` ile çözülür, `/(lab)` sabitlenmez.

## Review Focus

1. **Lab müdürü eski ya da yeni Ekip formunu kaydeder.** Maaş görünmediği için form 0 gönderebilir; kayıtlı maaş DEĞİŞMEMELİ. Görev 1 YEŞİL denemesi.
2. **Personelin maaş satırı yok ya da e-postası eşleşmiyor.** "Aylık maaşın" satırı hiç görünmemeli; "0 ₺" görünmemeli. Görev 5 kontrolü.
3. **Yönetici yeni personel oluştururken maaşı boş bırakır.** Maaş kaydı oluşmamalı ya da null olmalı; 0 yazılmamalı. Görev 4 kontrolü.
4. **Bordro, prim, toplu prim hesabı aynı girdilerle taşıma öncesi ve sonrası çalıştırılır.** Çıktılar birebir aynı olmalı. Görev 2 YEŞİL denemesi.
5. **Bağlı klinik yöneticisi lab personelinin profilini okur.** `monthly_salary` boş gelmeli. Görev 1 YEŞİL denemesi.

---

### Task 1: Veritabanı A1 — `employee_compensation`, yetki fonksiyonu, geri doldurma, koruma ve aktarma tetikleyicileri

**Files:**
- Create: `supabase/migrations/20261025100000_employee_compensation.sql`
- Create: `supabase/rollbacks/20261025100000_employee_compensation.down.sql`
- Create: `supabase/rollbacks/20261025-maas.before.txt` — canlı `employees` / `profiles` tetikleyicileri, `can_view_payroll`, `profiles_guard_privileged_columns`
- Test: geri alınan işlem denemesi `scratchpad/w2-0a/t1_red.sql`, `t1_green.sql`

**Interfaces:**
- Produces:
  - Tablo `public.employee_compensation(employee_id uuid PK → employees(id) ON DELETE CASCADE, lab_id uuid NOT NULL → labs(id), base_salary numeric NULL, tc_no text NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL)`
  - Fonksiyon `public.can_write_payroll() returns boolean` = `is_platform_admin() or has_permission('manage_salaries') or has_permission('manage_finance')`. SECURITY DEFINER, stable, `search_path=public`.
  - Tetikleyiciler:
    - `trg_employees_comp_guard`: BEFORE INSERT OR UPDATE ON employees.
    - `trg_employees_comp_sync`: AFTER INSERT OR UPDATE ON employees.
    - `trg_profiles_monthly_salary_null`: BEFORE INSERT OR UPDATE ON profiles.

- [ ] **Step 1: Canlıyı ölç ve kaydet**
  - `role_permissions`: hangi rollerde `view_salaries`, `manage_salaries`, `manage_finance` var (global ve lab'a özel). Spec'e göre yalnız `admin` beklenir; farklıysa DUR, kullanıcıya sor.
  - `employees` / `profiles` tetikleyici listesi ve ilgili fonksiyon tanımları → `.before.txt`.

- [ ] **Step 2: KIRMIZI deneme (geri alınan işlem)**
  - Kimlikler: lab müdürü, teknisyen, kurye, bağlı klinik yöneticisi.
  - `set_config('request.jwt.claims', …)` + `set local role authenticated` ile her biri için ölç:
    - `select count(*) filter (where base_salary is not null) from employees`
    - `select count(*) filter (where monthly_salary is not null) from profiles`
  - Ayrıca lab müdürü `update employees set base_salary = 0 where id = <maaşı dolu personel>` yapar → satır değişir.
  - Expected: lab müdürü 4 maaş görür; klinik yöneticisi profillerde ≥1 maaş görür; lab müdürü güncellemesi maaşı 0 yapar (bugünkü açıklar).

- [ ] **Step 3: Geçişi yaz**
  - Tablo; RLS açık; `revoke all … from anon`.
  - Kurallar:
    - `ec_read`: `lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id())`
    - `ec_write` (insert/update/delete): `lab_id = get_my_lab_id() and can_write_payroll()`
  - Geri doldurma: her `employees` satırı için `base_salary` ve `tc_no` boş değilse satır.
    - Profil maaşı yalnız personel kartı maaşı boşsa ve giriş e-postası eşleşiyorsa kullanılır. Spec §5.2-A3; bugün 0 kayıt.
    - "Mel…" için personel kartı (80.000) esas.
  - `update profiles set monthly_salary = null where monthly_salary is not null`.
  - Tetikleyici fonksiyonları:
    - **koru** (SECURITY INVOKER): `auth.uid() is not null and not can_write_payroll()` ise:
      - UPDATE'te `NEW.base_salary := OLD.base_salary; NEW.tc_no := OLD.tc_no`
      - INSERT'te ikisini null yap.
    - **aktar** (SECURITY DEFINER): yazan yetkili ya da `auth.uid() is null`, ve (`NEW.base_salary` IS DISTINCT FROM eski) ya da (`NEW.tc_no` IS DISTINCT FROM eski), ve yeni değer null değilse → `insert … on conflict (employee_id) do update` yalnız değişen alan(lar)la; `updated_by = auth.uid()`.
    - **profil**: `NEW.monthly_salary := null`.
  - `profiles_guard_privileged_columns` değişikliğe engel olursa YEŞİL'de görülür; o durumda boşaltma `pg_trigger_depth`/servis bağlamında yapılır ve ledger'a Ruling yazılır.

- [ ] **Step 4: Geri alma betiğini yaz**
  - Üç tetikleyiciyi ve fonksiyonlarını kaldır.
  - `profiles.monthly_salary`'yi `.before.txt`'teki 3 değerden geri yaz: id + değer, tam kopya `scratchpad`'e alınır, betiğe gömülür.
  - Tabloyu ve `can_write_payroll`'u kaldır.

- [ ] **Step 5: YEŞİL deneme (geri alınan işlem: geçiş → ölçüm → geri alma → ölçüm)**

  | Durum | Expected |
  |---|---|
  | admin | `employee_compensation` 4 maaş |
  | lab müdürü | 0 maaş; `employees` okuması değişmez (ad/rol görünür) |
  | teknisyen / kurye | yalnız kendi satırı (eşleşen varsa 1, yoksa 0) |
  | klinik yöneticisi | profillerde 0 maaş |
  | lab müdürü `update employees set base_salary = 0, full_name = full_name` | `employee_compensation` değişmez; `employees.base_salary` de değişmez |
  | admin `update employees set base_salary = base_salary + 1` | compensation +1 |
  | geri alma sonrası | profil maaşları ve tetikleyiciler eski hâli |

- [ ] **Step 6: Kullanıcıdan onay al, uygula, canlıda Step 5 ölçümlerini (geri alınan işlemde) tekrarla**

- [ ] **Step 7: Ledger.** `Task 1: complete …` + Ruling satırları.

### Task 2: Veritabanı A2 — bordro fonksiyonları ve `v_employee_summary` yeni tablodan okur

**Files:**
- Create: `supabase/migrations/20261025101000_payroll_reads_compensation.sql`
- Create: `supabase/rollbacks/20261025101000_payroll_reads_compensation.down.sql` — Step 1'deki canlı tanımların aynısı
- Test: `scratchpad/w2-0a/t2_green.sql`

**Interfaces:**
- Consumes: Task 1 tablo.
- Produces: `v_employee_summary` sütunları birebir aynı (`id, lab_id, full_name, role, phone, base_salary, is_active, start_date, total_salary_paid, total_advances, pending_advances, current_month_paid`). `base_salary` artık `employee_compensation`'dan gelir.

- [ ] **Step 1: Canlı tanımları kaydet**
  - `upsert_payroll_from_attendance(uuid,text)`
  - `calculate_performance_bonuses(uuid)`
  - `calculate_bonus_run(uuid,int,int,boolean)`
  - `v_employee_summary`

- [ ] **Step 2: Geçişi yaz**
  - Üç fonksiyonda SELECT listesindeki `e.base_salary` → `(select ec.base_salary from public.employee_compensation ec where ec.employee_id = e.id) as base_salary`. Başka hiçbir satır değişmez; `v_emp.base_salary`, `ep.*` vb. aynen kalır. Fonksiyon başına tam 1 değişiklik; fazlası varsa DUR.
  - Görünüm: `employees e left join employee_compensation ec on ec.employee_id = e.id`, `e.base_salary` → `ec.base_salary`; `security_invoker=on` korunur.

- [ ] **Step 3: YEŞİL deneme (geri alınan işlem)**
  - Önce, mevcut tanımlarla:
    - `calculate_bonus_run(<her politika>, 2026, <son 3 ay>, true)`
    - `upsert_payroll_from_attendance(<maaşı dolu her personel>, '2026-10')` → oluşan `employee_payroll` satırı
    - `calculate_performance_bonuses(<son 3 ayın performans kayıtları>)` sonucu
  - Hepsi JSON olarak saklanır.
  - Task 1 + Task 2 geçişleri uygulanır, aynılar tekrar çalıştırılır.
  - Expected: JSON'lar birebir eşit (`=`); `v_employee_summary` admin'de 4 maaş, lab müdüründe 0.

- [ ] **Step 4: Onay → uygula → canlıda görünüm ölçümünü tekrarla. Ledger.**

### Task 3: İstemci — maaş okuma/yazma yeni tablo üzerinden (Personel, Maaşlar, Avanslar)

**Files:**
- Create: `modules/employees/compensationApi.ts`
- Modify: `modules/employees/api.ts` (create/update maaş/TC göndermez; `Employee.base_salary: number | null`)
- Modify: `modules/employees/screens/EmployeesScreen.tsx` (form kaydı: personel + compensation; toplam kutusu null-güvenli)
- Modify: `modules/finance/screens/SalariesScreen.tsx:89`, `modules/finance/screens/AdvancesScreen.tsx:80` (`.from('employees')` → `.from('v_employee_summary')`, aynı sütunlar)
- Test: `scratchpad/w2-0a/check_t3.sh`

**Interfaces:**
- Produces (`compensationApi.ts`):
  - `upsertCompensation(employeeId: string, labId: string, v: { base_salary?: number | null; tc_no?: string | null }): Promise<{ ok: boolean; error?: string }>` — alan `undefined` ise gönderilmez.
  - `fetchMyCompensation(): Promise<{ base_salary: number | null } | null>` — `rpc('my_employee_id')` → null ise null; değilse `employee_compensation` satırı.

- [ ] **Step 1: Kontrol betiğini yaz ve KIRMIZI çalıştır.** `check_t3.sh` FAIL vermeli. Koşullar:
  - `employees/api.ts` insert/update gövdesinde `base_salary` / `tc_no` yok.
  - `SalariesScreen` / `AdvancesScreen` `from('employees')` ile `base_salary` seçmiyor.
  - `compensationApi.ts` iki fonksiyonu export ediyor.
- [ ] **Step 2: Uygula**
  - Ekip formunda maaş/TC alanları mevcut `canViewSalaries` koşuluyla kalır.
  - Kaydette personel kaydından sonra, yalnız `can('manage_salaries') || can('manage_finance')` ise `upsertCompensation`.
  - Maaş alanı boşsa `base_salary: null`.
  - Toplam maaş `Number(e.base_salary) || 0`.
- [ ] **Step 3: `check_t3.sh` PASS + `tsc` 0**
- [ ] **Step 4: Ekran kontrolü** (yerel, canlı veri, yalnız okuma)
  - Yönetici: Ekip, Maaşlar, Avanslar listelerinde maaşlar görünür.
  - Lab müdürü bakışı yoksa yalnız yönetici. Ledger'a not.
- [ ] **Step 5: Ledger.**

### Task 4: İstemci — Kullanıcılar ekranları ve edge fonksiyonları

**Files:**
- Modify: `modules/admin/users/LabUsersManagement.tsx`
  - Kullanılmayan `setSalary(userId, rate)` (≈331) silinir.
  - Düzenleme penceresindeki maaş alanı (≈1550) yerine bilgi satırı + Personel ekranına bağlantı.
  - Düzenleme kaydındaki `monthly_salary` (≈1331) kaldırılır.
  - Oluşturmada personel insert'i `base_salary` göndermez, `.select('id, lab_id').single()` döner; maaş doluysa `upsertCompensation`; `monthly_salary` (≈1735) gönderilmez.
- Modify: `app/(admin)/users.tsx:915` — `body.monthly_salary` gönderilmez.
- Modify: `supabase/functions/admin-create-user/index.ts:182` — `monthly_salary` yazılmaz, parametre yok sayılır.
- Modify: `supabase/functions/admin-list-users/index.ts:77` — select'ten `monthly_salary` çıkar.
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`
- Test: `scratchpad/w2-0a/check_t4.sh`

**Interfaces:**
- Consumes: Task 3 `upsertCompensation`.

- [ ] **Step 1: `check_t4.sh` yaz, KIRMIZI çalıştır.** Repo'da (locales ve migrations hariç) `monthly_salary` geçmemeli; `LabUsersManagement` `from('employees').insert` gövdelerinde `base_salary` olmamalı.
- [ ] **Step 2: Uygula**
  - Bilgi satırı metni: **"Maaş, Personel ekranından düzenlenir."** Bağlantı metni: **"Personel ekranına git"**.
  - Rota `/${useSegments()[0]}/employees`.
  - Koyu tema `useInkUI`.
  - Dört dil.
- [ ] **Step 3: `check_t4.sh` PASS + `tsc` 0 + dört dil dengesi**
- [ ] **Step 4: Ekran kontrolü**
  - Kullanıcılar → bir lab kullanıcısının düzenleme penceresi açılır (kaydetmeden kapatılır): maaş alanı yok, bağlantı Personel ekranına gider.
  - Yeni kullanıcı penceresi açılır (kaydetmeden): maaş alanı var.
- [ ] **Step 5: Ledger.** Edge fonksiyonları yayın görevinde deploy edilir.

### Task 5: İstemci — kişinin kendi maaşı (teknisyen avans ekranı, kurye istatistik ekranı)

**Files:**
- Create: `modules/employees/components/MySalaryLine.tsx`
- Modify: `modules/advance-requests/screens/TechAdvanceRequestsScreen.tsx` (içeriğin en üstü)
- Modify: `app/(courier)/stats.tsx` (içeriğin en üstü)
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`
- Test: `scratchpad/w2-0a/check_t5.sh`

**Interfaces:**
- Consumes: Task 3 `fetchMyCompensation()`.
- Produces: `export function MySalaryLine(): JSX.Element | null`
  - Veri yükleniyor, satır yok ya da `base_salary` null/0 ise **null** döner.
  - Yoksa "Aylık maaşın" etiketi + `formatMoney(base_salary, baseCurrency)`.
  - Kart `useMobileTokens()`: `T.card` / `T.ink` / `T.ink2` / `T.hairline`.
  - Kenar `PAGE_PADDING` kuralına uyar.

- [ ] **Step 1: `check_t5.sh` yaz, KIRMIZI çalıştır.** Bileşen var mı; iki ekranda kullanılıyor mu; "0" göstermeyen erken `return null` var mı.
- [ ] **Step 2: Uygula. Metin: "Aylık maaşın".** Dört dil.
- [ ] **Step 3: PASS + `tsc` 0**
- [ ] **Step 4: Ekran kontrolü**
  - Yönetici oturumunda bileşen render yolu kontrolü: geçici `app/dev/tmp-mysalary.tsx`, yalnız okuma, sonra silinir.
  - Açık/koyu tema.
  - Eşleşmeyen personelde görünmediği DB ölçümüyle doğrulanır: Task 1 YEŞİL teknisyen = 0 satır.
- [ ] **Step 5: Ledger.**

### Task 6: Yayın + Veritabanı C — eski sütunların boşaltılması (YALNIZ kullanıcı "deploy" dedikten ve B canlıda doğrulandıktan sonra)

**Files:**
- Create: `supabase/migrations/20261025102000_salary_columns_blank.sql`
- Create: `supabase/rollbacks/20261025102000_salary_columns_blank.down.sql` — boşaltılan `employees.base_salary` / `tc_no` değerlerinin tam kopyası + `v_user_salary_summary` canlı tanımı
- Test: `scratchpad/w2-0a/t6_green.sql`

**Interfaces:**
- Consumes: Task 1 tetikleyicileri.
- Produces: `trg_employees_comp_blank` (AFTER INSERT OR UPDATE ON employees, SECURITY DEFINER)
  - `NEW.base_salary` ya da `NEW.tc_no` null değilse `update employees set base_salary = null, tc_no = null where id = NEW.id`.
  - Sıralama: ad sırasıyla `…_comp_sync`'ten SONRA çalışmalı.
  - Özyineleme `sync`'in null'da atlamasıyla biter.

- [ ] **Step 1: Yayın** (kullanıcı "deploy" dediğinde)
  - Web deploy (CLAUDE.md komutu).
  - `admin-create-user` + `admin-list-users` edge deploy (memory komutu).
  - Canlı doğrulama: değişen parça 200 + entry `?v` eşleşmesi.
- [ ] **Step 2: Canlı tanımları kaydet** (`v_user_salary_summary`, `employees` değerleri)
- [ ] **Step 3: YEŞİL deneme (geri alınan işlem)**

  | Durum | Expected |
  |---|---|
  | geçiş sonrası `employees` | `base_salary` / `tc_no` hepsi null |
  | admin `update employees set base_salary = 123 where id = x` | compensation 123, `employees.base_salary` null |
  | lab müdürü aynı güncelleme | compensation değişmez |
  | `v_user_salary_summary` | yok |
  | bordro JSON'ları (Task 2 betiği) | öncekiyle eşit |
  | geri alma sonrası | değerler geri |

- [ ] **Step 4: Onay → uygula → canlıda doğrula**
- [ ] **Step 5: Kapanış**
  - Giriş e-postası personel kartıyla eşleşmeyen aktif personel sayısını lab bazında ölç. Kullanıcıya "Personel ekranında e-postayı düzelt" notuyla bildir; ad değil, sayı ve rol (spec §4).
  - Yol haritasında 0a ve 10'u kapat.
  - Memory ve ledger'ı güncelle.
