# Maaş tek kaynak ve yetkiye bağlı görünürlük — tasarım

**Tarih:** 2026-10-25
**Kapsam:** Denetim yol haritası 2. dalga **0a** (profildeki maaş alanı) + **10. madde** (personel kartındaki maaş) + `tc_no`.
**Kaynak:** `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md`, Paket 1 kararları (`.superpowers/sdd/2026-10-24-denetim-dalga-1/progress.md`).

## 1. Amaç ve neden

Personel maaşı bugün iki yerde tutuluyor ve ikisi de fazla kişiye açık:

- **Profildeki maaş (`profiles.monthly_salary`):**
  - 3 hesapta dolu.
  - Lab içindeki herkes okuyabiliyor.
  - `clinic_admin_view_lab_users` kuralı yüzünden bağlı kliniklerin yöneticileri de okuyabiliyor; bu **lab dışı sızıntı**.
  - Yalnız Ayarlar → Kullanıcılar ekranında görünüyor ve düzenleniyor.
  - Hiçbir hesaba girmiyor.
- **Personel kartındaki maaş (`employees.base_salary`):**
  - 4 kayıtta dolu.
  - Bordro, prim ve avans hesaplarının kullandığı asıl rakam bu.
  - Ekip ekranı maaş sütununu ve toplam kutusunu yalnız `view_salaries` yetkisine gösteriyor (`EmployeesScreen.tsx:254`). Ama personel listesini görme yetkisi olan herkes (bugün lab müdürü) maaşı **veri olarak** okuyabiliyor: `employees` tablosu ve `v_employee_summary` görünümü `base_salary`'yi döndürüyor. Sızıntı ekranda değil, sorgu düzeyinde.
- **İki kaynak birbirinden kopuyor:**
  - Kullanıcılar ekranında personel *oluşturulurken* maaş iki yere yazılıyor.
  - *Düzenlenince* yalnız profile yazılıyor; bordro değişmiyor.
  - Canlıda bir kişide personel kartı 80.000, profil 60.000 gösteriyor.
- **`employees.tc_no`:** Kimlik verisi, hiçbir kayıtta dolu değil. Personel kartında, maaşla aynı geniş erişimle duruyor.

## 2. Kullanıcının kararları (2026-10-25)

1. **Maaş tutarlarını yalnız lab sahibi (yönetici) görür.**
   - Lab müdürü maaşı veri olarak da okuyamaz. Ekranda zaten görmüyordu.
   - Bağlı klinik yöneticileri hiç görmez.
2. **Personel kendi aylık maaşını görebilir.**
3. **Maaş tek yerde düzenlenir: Personel (Ekip) ekranı.**
   - Kullanıcılar ekranında maaş yalnız **yeni personel oluştururken** girilir.
   - Düzenleme penceresinde maaş alanı kalkar; yerine "Maaş, Personel ekranından düzenlenir" yönlendirmesi gelir.
4. **Personelin kendi maaşı** paneldeki ekranda gösterilir. Benim önerim; kullanıcı itiraz etmedi.
   - Teknisyen: **Avans talepleri** ekranının başında.
   - Kurye: kurye panelinde avans ekranı olmadığı için **İstatistik** ekranının başında. Bu benim kararım (§8).

## 3. Hedefler, hedef olmayanlar, yapılmaması gerekenler

**Hedefler**
- Maaş ve TC kimlik no için tek kaynak: yalnız maaş yetkisi olanların ve kişinin kendisinin okuyabildiği ayrı bir tablo.
- Lab dışı sızıntının kapanması.
- Kullanıcılar ↔ Personel arasındaki kopma hatasının bitmesi.

**Hedef olmayanlar**
- Bordro, prim ve avans hesaplama mantığını değiştirmek. Hesaplar yalnız maaşı yeni yerden okur.
- 0b kapsamındaki kardeş İK tabloları (`employee_leaves`, `salary_adjustments` …).
- Personel için ayrı bir "Maaşım" ekranı.

**Yapılmaması gerekenler (iş "çalışsa" bile başarısızlık sayılır)**
- Bordro, prim, avans tutarlarının taşımadan önceki ve sonraki hâlinin farklı çıkması.
- Bir maaş değerinin kaybolması.
- Lab müdürünün maaş DIŞINDAKİ personel bilgisini (ad, rol, telefon, işe başlama, aktiflik) kaybetmesi.
- Canlıdaki eski istemcinin, yeni istemci yayınlanana kadar çökmesi. Taşıma aşamalı olmalı.
- Personelin başkasının maaşını görebilmesi.

## 4. Mevcut durum (canlı, 2026-10-25)

**Okuyan / yazan yerler**

| Yer | Ne yapıyor |
|---|---|
| `v_employee_summary` (security_invoker) | `employees.base_salary`'yi döndürür. Ekip ekranı (`modules/employees/api.ts` → `EmployeesScreen`) buradan okur. |
| `v_user_salary_summary` (security_invoker) | `profiles.monthly_salary` + `salary_adjustments`. **İstemcide kullanılmıyor.** |
| `upsert_payroll_from_attendance`, `calculate_performance_bonuses`, `calculate_bonus_run` (SECURITY DEFINER) | `employees.base_salary` okur. |
| `profiles_guard_privileged_columns` (tetikleyici) | `monthly_salary`'yi korumalı sütun sayar. |
| İstemci, maaş okuma | `SalariesScreen`, `AdvancesScreen`: `employees.base_salary`. `EmployeesScreen`: liste, toplam kutusu, form. `EmployeeStatementModal`. |
| İstemci, Kullanıcılar ekranı | `LabUsersManagement` (`setSalary`, düzenleme formu, oluşturma), `app/(admin)/users.tsx` (oluşturma). |
| Edge fonksiyonları | `admin-create-user` profile `monthly_salary` yazar. `admin-list-users` `monthly_salary`'yi listeler. |

**Erişim kuralları**
- `employees` RLS'i Paket 1'den: okuma `view_employees` / `manage_employees` / kendi kaydı; yazma `manage_employees`.
- Maaş yetkisi `can_view_payroll()` = `view_salaries` / `manage_salaries` / `manage_finance`.
  - **Canlıda** yalnız `admin` rolünün ortak varsayılanında var.
  - `lab_manager`'da yok, hiçbir lab'da rol yetki ayarı (`lab_role_permission_overrides`) da yok. 2026-10-25'te ölçüldü.
  - Repo'daki eski geçişler (`20260507…`) farklı görünür; esas olan canlı durum. Plan ilk adımda bunu yeniden ölçer.
- Profil ↔ personel eşleşmesi: `my_employee_id()`, giriş e-postası = personel e-postası.
  - Ölçüm, Nexadent: kurye 1/1, müdür 2/2, teknisyen 0/1 eşleşiyor. Demo lab'da 4 teknisyenin hiçbiri eşleşmiyor.
  - Eşleşmeyen personel kendi maaşını göremez. Otomatik eşleme YOK; güvenlik nedeniyle ad eşleşmesi 20261024114000'de kaldırıldı.
  - Çözüm veri düzeyinde: yönetici Personel ekranında e-postayı giriş e-postasıyla aynı yapar. Plan, eşleşmeyenleri yöneticiye listeler.
- Profilde maaşı dolu 3 hesabın üçü de bir personel kartına bağlı. Taşımada değer kaybı yok.

## 5. Tasarım

### 5.1 Veri

Yeni tablo **`employee_compensation`**, personel başına bir satır:

| Sütun | Açıklama |
|---|---|
| `employee_id` | PK, `employees(id)` ON DELETE CASCADE |
| `lab_id` | `labs(id)`. Proje kuralı: tenant `lab_id` her zaman `labs`'a FK. |
| `base_salary` | numeric, null olabilir |
| `tc_no` | text, null olabilir |
| `updated_at`, `updated_by` | |

RLS açık. `anon`'dan erişim alınır (yeni tablo kuralı).

| İşlem | Kural |
|---|---|
| Okuma | `lab_id = get_my_lab_id()` ve (`can_view_payroll()` **veya** `employee_id = my_employee_id()`) |
| Ekleme / güncelleme / silme | `lab_id = get_my_lab_id()` ve (`manage_salaries` veya `manage_finance`) |

- "Yalnız ben" rol adına değil, maaş yetkisine bağlanır. Bugün yalnız yönetici rolünde. İleride yetki verilen biri (ör. muhasebeci) kod değişmeden görür.
- `tc_no` da aynı kurala tabi. Personel kendi TC'sini görür.

### 5.2 Aşamalar

Çalışan sistemi bozmamak için taşıma üç aşamada yapılır.

**A — veritabanı, eklemeli; eski istemci çalışmaya devam eder**
1. Tablo ve kurallar oluşturulur.
2. Geri doldurma: her personel için `base_salary` ve `tc_no`, `employees`'tan kopyalanır.
3. Profil maaşı yalnız personel kartında maaş YOKSA ve profil e-postası bir personelle eşleşiyorsa kullanılır. Bugün böyle bir kayıt yok.
4. Uyuşmazlıkta (§7.1) personel kartı esas alınır, çünkü bordro onu kullanıyor.
5. **Lab dışı sızıntı A'da kapanır:** geri doldurmadan hemen sonra `profiles.monthly_salary` boşaltılır.
   - Hiçbir hesap bu alanı kullanmıyor.
   - Eski Kullanıcılar ekranında alan boş görünür; zararsız.
   - Bir tetikleyici alanı bundan sonra hep boş tutar: yazılan değer yok sayılır.
6. Geçiş tetikleyicisi: `employees.base_salary` / `tc_no` yazılınca `employee_compensation` güncellenir. Eski istemci yazmaya devam ederken tek kaynak tutarlı kalır.
   - Yalnız yazan kişinin maaş yazma yetkisi (`manage_salaries` / `manage_finance`) varsa ve değer gerçekten değiştiyse aktarılır.
   - Neden: yetkisiz biri eski Ekip formunu kaydederken boş maaşı 0 olarak gönderir; bu, kayıtlı maaşı sıfırlamamalı.
7. Bordro, prim, avans fonksiyonları `employee_compensation.base_salary`'den okur. Önce/sonra sonuçları birebir aynı olmalı (§6).
8. `v_employee_summary`, maaşı `employee_compensation`'dan LEFT JOIN ile alır. Görünüm security_invoker olduğu için yetkisiz kişide maaş **null** gelir. Sütun adı ve şekli değişmez; eski istemci bozulmaz.

**B — istemci (yayınla birlikte)**
- Maaş ve TC okuma / yazma `employee_compensation` üzerinden yapılır:
  - Salaries, Advances, Employees ekranları
  - `EmployeeStatementModal`
  - `employees/api.ts` oluşturma / güncelleme
- **Ekip ekranı:** Maaş sütunu, toplam maaş kutusu ve formdaki maaş/TC alanları yalnız maaş yetkisi olana gösterilir. Diğerlerinde sütun/kutu gizlenir; "0" ya da "—" gösterilmez.
- **Kullanıcılar ekranı (`LabUsersManagement`):**
  - Oluşturmada maaş `employee_compensation`'a yazılır.
  - Düzenleme penceresindeki maaş alanı ve satır içi `setSalary` kaldırılır; yerine Personel ekranına yönlendiren bağlantı gelir.
  - `app/(admin)/users.tsx` oluşturma akışı da aynı şekilde yazar.
- **Edge fonksiyonları:** `admin-create-user` artık `monthly_salary` yazmaz. Maaşı, oluşturulan personelin compensation satırına istemci yazar (bkz. §8). `admin-list-users` `monthly_salary`'yi listelemez.
- **Kendi maaşı:** "Aylık maaşın: …" satırı gösterilir. Kayıt yoksa ya da personel eşleşmiyorsa satır görünmez.
  - Teknisyen: `TechAdvanceRequestsScreen` (`app/(station)/avans-talebi.tsx`).
  - Kurye: `app/(courier)/stats.tsx` ekranının başı.
- Yeni metinler dört dilde (tr/en/de/fa) eklenir; koyu tema da birlikte.

**C — veritabanı temizliği (B canlıya çıkıp canlıda doğrulandıktan SONRA, aynı gün)**
- `employees.base_salary` ve `employees.tc_no` **boşaltılır, sütunlar silinmez.**
  - Neden: telefonlara yüklü eski bir uygulama, ya da servis çalışanının ilk yenilemede sunduğu eski paket, bu sütunları sorgularsa çökmemeli; yalnız boş görür.
  - Geçiş tetikleyicisi "yönlendir ve boşalt" yapar: yetkili yazımı `employee_compensation`'a aktarır, sütunu hep NULL tutar.
- `profiles.monthly_salary` A'dan beri boş; aynı şekilde sütun kalır.
- `v_user_salary_summary` kaldırılır; istemcide kullanılmıyor. Kaldırmadan önce canlı tanım kaydedilir.
- `v_employee_summary` yeniden doğrulanır.
- Sütunların fiziksel silinmesi ayrı, sonraki bir temizlik işidir: eski istemci kalmadığında. Bu tasarımın kapsamında değil.

### 5.3 Değişiklik protokolü (kullanıcı kuralı)

Her veritabanı adımı için:
1. Canlı tanım kaydedilir.
2. Geri alma dosyası yazılır.
3. Rol rol deneme, geri alınan işlemde yapılır.
4. Kullanıcı onay verir.
5. Uygulanır ve canlıda doğrulanır.

Yayın yalnız kullanıcı "deploy" deyince yapılır. Commit yok.

## 6. Doğrulama ölçütleri

**Rol denemeleri (A ve C sonrasında, geri alınan işlemde, gerçek kullanıcı kimlikleriyle)**

| Rol | Beklenen |
|---|---|
| admin | Tüm maaşlar |
| lab_manager | Maaş null / görünmez; ad, rol, telefon görünür. Eski Ekip formunu kaydetmek maaşı DEĞİŞTİRMEZ. |
| teknisyen | Yalnız kendi maaşı |
| kurye | Yalnız kendi maaşı |
| bağlı klinik yöneticisi | Lab personelinin maaşı yok; profil sütunu da yok |

**Hesaplar**
- `upsert_payroll_from_attendance`, `calculate_performance_bonuses`, `calculate_bonus_run` taşımadan önce ve sonra aynı girdilerle çalıştırılır.
- Çıktılar birebir aynı olmalı. Deneme geri alınan işlemde yapılır.

**Veri**
- Taşıma sonrası her personelin maaşı, taşıma öncesi `employees.base_salary` ile aynı.
- §7.1 kararına uyulmuş.

**Ekranlar**
- Yerel oturumda (canlı veri, yalnız okuma) yönetici ve lab müdürü gözüyle bakılır: Ekip, Maaşlar, Avanslar, Kullanıcılar, Avans talepleri.
- Açık ve koyu tema, masaüstü ve telefon.
- `tsc` 0 hata, testler yeşil, dört dil sözlüğü eşit.

## 7. Açık konular

### 7.1 "Mel…" personelinin maaşı — KARARLANDI

Personel kartında 80.000, profilde 60.000 yazıyordu. **Kullanıcı (2026-10-25): 80.000 doğru.** Taşımada personel kartındaki değer esas alınır; profildeki 60.000 atılır.

## 8. Uygulayıcıya bırakılanlar

- Yardımcı fonksiyon ve tip adları.
- Maaş okuma için PostgREST gömme mi (`employees?select=*,employee_compensation(base_salary)`), ayrı sorgu mu, yoksa görünüm mü kullanılacağı. Hangisi seçilirse seçilsin RLS aynı kalmalı.
- Oluşturma akışında compensation satırını kimin yazacağı: istemci, oluşturmanın hemen ardından; ya da `employees` insert'ine bağlı bir RPC. Koşul: yetkisiz kişi maaş YAZAMAZ.
- Ekip ekranında maaş sütunu gizlenince tablonun sütun genişlik dağılımı. Bugün de `view_salaries` yoksa gizli; mevcut düzen korunur.

## 9. Tasarım sırasında verilen kararlar (kullanıcının kontrolü için)

- **Yetki koşulu:** "Yalnız ben", rol adı yerine maaş yetkisi (`can_view_payroll`) ile uygulanır. Bugün yalnız yönetici rolünde var.
- **TC kimlik no:** Maaşla aynı korumaya alınır. Kişi kendi TC'sini görür.
- **Profil sızıntısı A'da kapanır:** profildeki maaş geri doldurmadan hemen sonra boşaltılır.
- **Eski Ekip formunun maaşı sıfırlaması engellenir:** Geçiş tetikleyicisi yalnız maaş yazma yetkisi olanın değişikliğini aktarır.
- **C'de sütunlar silinmez, boşaltılır:** Eski uygulama ya da eski paket çökmesin diye. Fiziksel silme sonraki bir temizlik işi.
- **Kuryenin kendi maaşı:** Kurye panelinde avans ekranı olmadığı için İstatistik ekranının başında gösterilir.
- **Eşleşmeyen personel:** Giriş e-postası personel kartıyla eşleşmeyenler otomatik bağlanmaz. Yöneticiye listelenir, e-postayı Personel ekranından düzeltir.
