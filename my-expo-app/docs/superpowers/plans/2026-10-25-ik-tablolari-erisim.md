# İK tablolarının erişim kuralları (0b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kardeş İK tablolarının ve personel belgesi deposunun "lab içi herkes her şey" kurallarını yetki + kendi kaydı kurallarıyla değiştirmek. Prim yönetimini ve izin onayını yalnız lab sahibine bağlamak.

**Architecture:**
- Tablo başına RLS kuralları yeniden yazılır. Yardımcılar: mevcut `has_permission()`, `my_employee_id()`, `can_view_payroll()`, `can_write_payroll()`.
- `_is_bonus_manager()` yeniden tanımlanır; `unpost_bonus_run` ona bağlanır.
- Lab müdürünün `approve_leave` varsayılanı kaldırılır.
- İK ekranındaki onay düğmesi yetkiye bağlanır.

**Tech Stack:** Supabase Postgres (RLS, storage policies, plpgsql), Expo/react-native-web.

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-25-ik-tablolari-erisim-design.md`

## Global Constraints

- **Veritabanı adımları beş aşamalı** (kullanıcı kuralı):
  1. Canlı tanım `.before` dosyasına kaydedilir.
  2. Geri alma betiği yazılır.
  3. Değişiklik, gerçek kimliklerle, geri alınan işlemde rol rol denenir. KIRMIZI önce, YEŞİL sonra.
  4. **Kullanıcı onayı** alınır.
  5. `supabase db query --linked -f <mutlak>` ile uygulanır ve canlıda doğrulanır.
- **Yayın:** "deploy" demeden yok; commit yok. Canlı hesapta kaydet/onayla düğmesine basılmaz.
- **KVKK:** Çıktılarda ad ve tutar yok.
- **Teknisyen denemeleri:** Teknisyenlerin `my_employee_id()` değeri boş. Denemede, geri alınan işlemin içinde o teknisyenin giriş e-postasıyla geçici aktif personel kartı açılır.
- **Ekran:** Yeni metin varsa dört dil birlikte; koyu tema token'la; `tsc` 0.

## Review Focus

1. Teknisyen izin talebi açar (`bekliyor`) ve iptal eder. Geçmeli; bugünkü izin ekranı bozulmamalı.
2. Lab müdürü personel adına bekleyen izin girer, sonra onu `onaylandi` yapmaya ya da onaylı bir izni silmeye çalışır. Ekleme geçmeli, diğer ikisi engellenmeli.
3. QR ile devam girişi (`qr_checkin`, SECURITY DEFINER) yeni kurallardan sonra da çalışmalı.
4. Yönetici prim hesaplar, onaylar, kesinleştirir, geri alır. Hepsi geçmeli; hesap sonuçları önceki ile aynı olmalı.
5. `employee-docs` deposu: personel kendi klasörünü görür, başkasınınkini listeleyemez; belge yetkilisi hepsini görür ve yükler.

---

### Task 1: Veritabanı — operasyonel İK tabloları ve belge deposu

**Files:**
- Create: `supabase/migrations/20261025110000_hr_tables_rls.sql`
- Create: `supabase/rollbacks/20261025110000_hr_tables_rls.down.sql`
- Create: `supabase/rollbacks/20261025-0b.before.txt`

**Interfaces:**
- Consumes: `has_permission(text)`, `my_employee_id()`, `get_my_lab_id()`, `can_write_payroll()`.
- Produces: Aşağıdaki kurallar. Eski kurallar düşer: `employee_leaves_lab_own`, `employee_attendance_lab_own`, `emp_docs_lab_own`, `emp_perf_lab_own`, depo `employee_docs_read/upload/delete`.

**`employee_leaves`**

| Kural | Koşul |
|---|---|
| `el_read` | lab ve (own veya `view_leaves` / `manage_leaves` / `approve_leave`) |
| `el_insert` | lab ve (`approve_leave` veya ((`manage_leaves` veya own) ve `status='bekliyor'`)) |
| `el_update` USING | lab ve (`approve_leave` veya ((`manage_leaves` veya own) ve `status in ('bekliyor','iptal')`)) |
| `el_update` CHECK | lab ve (`approve_leave` veya ((`manage_leaves` veya own) ve `status in ('bekliyor','iptal')`)) |
| `el_delete` | lab ve (`approve_leave` veya (`manage_leaves` ve `status in ('bekliyor','iptal')`)) |

Own, CHECK'te ayrıca `employee_id = my_employee_id()` olarak kalmalı; başkasının adına talep açamaz.

**`employee_attendance`**

| Kural | Koşul |
|---|---|
| okuma | lab ve (own veya `view_attendance_all` / `manage_attendance`) |
| yazma | lab ve `manage_attendance` |

**`employee_documents`**

| Kural | Koşul |
|---|---|
| okuma | lab ve (own veya `view_employee_documents` / `manage_employee_documents`) |
| yazma | lab ve `manage_employee_documents` |

**`employee_performance`**

| Kural | Koşul |
|---|---|
| okuma | lab ve (own veya `view_performance`) |
| yazma | lab ve `can_write_payroll()` |

**Depo `employee-docs`** — yol `{lab}/{employee}/…`

| Kural | Koşul |
|---|---|
| okuma | lab klasörü ve (`(storage.foldername(name))[2] = my_employee_id()::text` veya `view_employee_documents` / `manage_employee_documents`) |
| yükleme / silme | lab klasörü ve `manage_employee_documents` |

- [ ] **Step 1:** Canlı kuralları (tablolar + depo), sütun adlarını (`status`, `employee_id`) ve `qr_checkin` / `manual_attendance` tanımlarını `.before` dosyasına kaydet. Fonksiyonlar SECURITY DEFINER mi, doğrula.
- [ ] **Step 2: KIRMIZI** (geri alınan işlemde; teknisyen için geçici kart açılır):
  - Teknisyen kendi iznini `onaylandi` olarak ekler → **GEÇER** (açık).
  - Teknisyen başkasının devam kaydını görür → **≥0, görür**.
  - Teknisyen depoya başka personel klasörüne yazar → **GEÇER**.
- [ ] **Step 3:** Geçişi ve geri almayı yaz. Geri alma, `.before` dosyasındaki kuralların aynısını kurar.
- [ ] **Step 4: YEŞİL** (geri alınan; geçiş → ölçüm → geri alma → ölçüm):
  - Teknisyen `onaylandi` ekler → ENGEL; `bekliyor` ekler ve `iptal` eder → GEÇER.
  - Teknisyen başkasının devamını görür → 0; QR `qr_checkin` çağrısı → GEÇER.
  - Müdür bekleyen izin ekler → GEÇER. Müdür `onaylandi` yapar → ENGEL (`approve_leave` henüz müdürde; bu ölçüm Görev 3 sonrası tekrar edilir).
  - Depo: teknisyen başkasının klasörüne yazar → ENGEL; yönetici yazar → GEÇER.
  - Geri alma sonrası KIRMIZI'daki davranış geri gelir.
- [ ] **Step 5:** Onay → uygula → canlıda YEŞİL ölçümlerini (geri alınan işlemde) tekrarla. Ledger.

### Task 2: Veritabanı — tutar tabloları, prim yönetimi, prim geri alma

**Files:**
- Create: `supabase/migrations/20261025111000_pay_tables_rls.sql`
- Create: `supabase/rollbacks/20261025111000_pay_tables_rls.down.sql`

**Interfaces:**
- Consumes: `can_view_payroll()`, `can_write_payroll()`.
- Produces:
  - `payroll_settings`: okuma `can_view_payroll()`, yazma `can_write_payroll()`.
  - `performance_rules`: okuma lab içi herkes, yazma `can_write_payroll()`.
  - `salary_adjustments`:
    - `manager_admin_full` düşer.
    - Yeni okuma: `can_view_payroll()` veya `user_id = auth.uid()` (mevcut `user_read_own` kalır).
    - Yeni yazma: `can_write_payroll()`.
    - RESTRICTIVE `tenant_guard` aynen kalır.
  - `bonus_runs`: `bonus_runs_read` → `lab and can_view_payroll()`; yazma kuralı (`_is_bonus_manager`) aynı.
  - `_is_bonus_manager()` gövdesi → `select public.can_write_payroll()` (imza, SECURITY DEFINER, `search_path` aynı).
  - `unpost_bonus_run(uuid)`: yetki bloğu (`v_user_type='admin' OR v_emp_role='yonetici'`) → `IF NOT public._is_bonus_manager() THEN RAISE EXCEPTION 'forbidden …'`. Gövdenin geri kalanı birebir.

- [ ] **Step 1:** Canlı tanımları kaydet: kurallar, `_is_bonus_manager`, `unpost_bonus_run`.
- [ ] **Step 2: KIRMIZI.**
  - Lab müdürü `bonus_runs` okur → **1** satır.
  - Lab müdürü `payroll_settings` / `performance_rules`'a yazar → **GEÇER**.
  - Lab müdürü `_is_bonus_manager()` → **true**.
- [ ] **Step 3:** Geçiş + geri alma.
- [ ] **Step 4: YEŞİL** (geri alınan):

  | Kim | Durum | Beklenen |
  |---|---|---|
  | Müdür | `bonus_runs` okur | 0 |
  | Müdür | `performance_rules` okur | geçer |
  | Müdür | `performance_rules` / `payroll_settings` / `salary_adjustments` yazar | ENGEL |
  | Müdür | `_is_bonus_manager()` | false |
  | Müdür | `calculate_bonus_run(p,2026,10,true)` | hata (forbidden) |
  | Müdür | `unpost_bonus_run(x)` | forbidden |
  | Teknisyen | `bonus_runs` okur | 0 |
  | Yönetici | aynı işler | geçer |
  | Yönetici | 0a bordro karşılaştırma betiği | önce = sonra |
  | Geri alma | | KIRMIZI davranışı geri |

- [ ] **Step 5:** Onay → uygula → canlıda doğrula. Ledger.

### Task 3: Veritabanı — lab müdürünün izin onaylama yetkisi

**Files:**
- Create: `supabase/migrations/20261025112000_lab_manager_no_approve_leave.sql` — `delete from role_permissions where role_key='lab_manager' and lab_id is null and permission_key='approve_leave'`.
- Create: rollback (satırı geri ekler).

- [ ] **Step 1:** Lab'a özel `lab_manager` yetki seti var mı, kontrol et. Spec'e göre yok; varsa DUR, sor.
- [ ] **Step 2: KIRMIZI.** Müdür bir izni `onaylandi` yapar → GEÇER.
- [ ] **Step 3: YEŞİL** (geri alınan):
  - Müdür `onaylandi` yapar → ENGEL; bekleyen izin girer → GEÇER.
  - Müdür `has_permission('approve_leave')` → false; `view_leaves` / `manage_leaves` → true.
  - Geri alma sonrası onaylama geri gelir.
- [ ] **Step 4:** Onay → uygula → doğrula. Ledger.

### Task 4: İstemci — İK ekranında onay düğmesi yetkiye bağlı

**Files:**
- Modify: `modules/hr/screens/HRScreen.tsx:153` — `canApprove` = `usePermissionStore(s => s.can('approve_leave'))`. Rol karşılaştırması kalkar.
- Test: `scratchpad/w2-0b/check_t4.sh`

- [ ] **Step 1: `check_t4.sh` KIRMIZI.** `HRScreen`'de `profile?.role === 'manager'` ile onay kararı var, `can('approve_leave')` yok.
- [ ] **Step 2:** Uygula. "mesul müdür onayı bekliyor" metni, yetkisi olmayana gösterilen bekleme metnidir; aynen kalır.
- [ ] **Step 3:** PASS + `tsc` 0.
- [ ] **Step 4: Ekran.** Yönetici oturumunda İK → İzinler; onay düğmeleri görünür. Yerel, canlı veri, kaydetmeden.
- [ ] **Step 5:** Ledger. Yayın kullanıcı "deploy" deyince.
