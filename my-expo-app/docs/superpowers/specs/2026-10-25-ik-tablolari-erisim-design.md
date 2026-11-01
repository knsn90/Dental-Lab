# İK tablolarının erişim kuralları (2. dalga 0b) — tasarım

**Tarih:** 2026-10-25
**Kaynak:** Denetim yol haritası 2. dalga **0b**. Önceki iş: maaş tek kaynak, `docs/superpowers/specs/2026-10-25-maas-tek-kaynak-design.md`.

## 1. Amaç ve neden

Paket 1 ve 0a maaş tablolarını kapattı. Kardeş İK tablolarında kural hâlâ yalnız "aynı lab'da mısın" diye bakıyor (FOR ALL, lab içi). Bu yüzden lab'daki herkes, teknisyen dahil:

- kendi izin talebini **onaylayabilir**, başkasının iznini, devamını ve belgesini okuyup değiştirebilir;
- bordro ayarlarını (SGK oranları) ve performans kayıtlarını değiştirebilir;
- **prim hesaplarının tamamını okuyabilir.** Hesaplanan bir primin dökümünde her personelin prim tutarı var; hesap fonksiyonu dökümün içine maaşı da koyuyor. Teknisyenin prim ekranı kendi satırını süzüyor ama verinin tamamı cihazına iniyor.

Ayrıca lab müdürü bugün prim kurallarını değiştirebiliyor ve prim hesaplayıp onaylayabiliyor (`_is_bonus_manager`). Prim/ceza düzeltmelerini (`salary_adjustments`) de "müdür" rolündeki herkes tam yetkiyle yönetebiliyor.

**Canlı veri (2026-10-25):** İzin, devam, belge, performans, bordro ayarı, performans kuralı ve prim/ceza düzeltmesi tablolarının hepsi boş. Prim hesabı tablosunda tek bir taslak var, dökümü boş. İş, özellikler kullanılmadan önce kapıları doğru kurmak.

## 2. Kullanıcının kararları (2026-10-25)

1. **Prim tutarlarını da yalnız lab sahibi (yönetici) görür.** Kapsam: prim hesapları ve dökümleri, prim/ceza düzeltmeleri, bordro ayarları.
2. **Lab müdürü prim hesaplayamaz ve onaylayamaz.** Prim kurallarını da değiştiremez.
3. **Prim kuralları lab'daki herkese açıktır.** Hangi hedefe ne kadar prim verildiğini personel okuyabilir; değiştirmek yalnız yöneticiye açık.
4. **İzinleri yalnız lab sahibi (yönetici) onaylar ya da reddeder.** Lab müdürü hiçbir izni onaylayamaz, kendisininkini de.
   - Yetki: `approve_leave`, lab müdürünün ortak varsayılanından kaldırılır (kurye `view_employees` değişikliği gibi bir rol yetkisi değişikliği).
   - Ekranda onay düğmesi bugün role göre gösteriliyor (`HRScreen.tsx:153`, yönetici veya müdür); yetkiye (`can('approve_leave')`) bağlanır.

## 3. Benim kararlarım (kullanıcı itiraz etmedi)

- **Personelin prim ekranı yok; bugün eklenmiyor.** İlk taslakta sandığım `TechnicianBonusScreen`, yöneticinin Finans → Prim Motoru'nda seçtiği personelin dökümüdür. `bonus_runs`'tan okumaya devam eder (yönetici okuyabilir) ve değişmez. Personelin kendi primini göreceği ekran ve buna ait sunucu fonksiyonu sonraki iş.
- **Lab müdürünün günlük İK işleri tutar içermez ve sürer:**
  - izinleri görme, personel adına **bekleyen** izin girme, bekleyen izni düzeltme (`view_leaves`, `manage_leaves`). Onay/ret yok (karar 4).
  - devam kaydı (`manage_attendance`, `view_attendance_all`)
  - personel belgeleri (`manage_employee_documents`, `view_employee_documents`)
  - performans puanlarını görme (`view_performance`)
- **Personel kendi kayıtlarında:**
  - Kendi izin, devam, belge ve performans kayıtlarını görür.
  - İzin talebini yalnız `bekliyor` durumunda açabilir. Kendi bekleyen talebini yalnız `bekliyor` ya da `iptal` olarak güncelleyebilir; onaylayamaz.
  - Devamı QR ile girer. Bu yol yetkili sunucu fonksiyonu `qr_checkin` (SECURITY DEFINER) üzerinden gider ve değişmez.

## 4. Hedefler, hedef olmayanlar, yapılmaması gerekenler

**Hedefler**
- Her tablo, mevcut yetki anahtarlarına bağlanır. Kural: "personel kendi kaydı + o işin yetkisi olan".
- Prim tutarları yalnız maaş yetkisine açılır: `can_view_payroll()` okur, `can_write_payroll()` yazar (0a fonksiyonları).

**Hedef olmayanlar**
- Yeni ekran açmak.
- Prim ve bordro hesaplama mantığını değiştirmek.
- 0c'deki küçük notlar (bkz. yol haritası); ayrı iş.

**Yapılmaması gerekenler**
- Teknisyenin bugün yaptığı bir şeyin bozulması: izin talebi açmak ve iptal etmek, QR ile devam girmek, kendi primini görmek.
- Lab müdürünün izin onaylama, devam ve belge işlerinin bozulması.
- Prim/bordro sonuçlarının değişmesi.

## 5. Tasarım — tablo tablo

`own` = personelin kendi kaydı (`employee_id = my_employee_id()`). Profil temelli tablolarda `user_id = auth.uid()`. Tüm kurallar ayrıca `lab_id = get_my_lab_id()` şartı taşır.

| Tablo | Okuma | Yazma |
|---|---|---|
| `employee_leaves` | `own` veya `view_leaves` / `manage_leaves` / `approve_leave` | **Onaylayan (`approve_leave`):** her durumda ekler, günceller, siler. **`manage_leaves`:** yalnız `bekliyor` / `iptal` durumundaki kayıtlarda, eski ve yeni durum bu ikisi; onaylı ya da reddedilmiş kaydı değiştiremez, silemez. **`own`:** ekleme yalnız `bekliyor`; güncelleme yalnız eski durum `bekliyor` iken, yeni durum `bekliyor` ya da `iptal`. |
| `employee_attendance` | `own` veya `view_attendance_all` / `manage_attendance` | `manage_attendance` |
| `employee_documents` | `own` veya `view_employee_documents` / `manage_employee_documents` | `manage_employee_documents` |
| Depo `employee-docs` (yol `{lab}/{personel}/{dosya}`) | kendi klasörü (`{lab}/{my_employee_id()}/…`) veya `view_employee_documents` / `manage_employee_documents` | yükleme ve silme `manage_employee_documents`. Bugünkü kural lab'daki herkese her dosyada okuma, yükleme ve silme veriyor; tablo kuralı tek başına belge açığını kapatmaz. |
| `employee_performance` | `own` veya `view_performance` | `can_write_payroll()` (istemci yazmıyor; hesap fonksiyonları yetkili) |
| `payroll_settings` | `can_view_payroll()` | `can_write_payroll()` |
| `performance_rules` | lab içi herkes (karar 3) | `can_write_payroll()` |
| `bonus_runs` | yalnız `can_view_payroll()` | `_is_bonus_manager()` (aşağıda) |
| `salary_adjustments` | `can_view_payroll()` veya kendi satırı (`user_id = auth.uid()`; mevcut `user_read_own` kuralı) | `can_write_payroll()`. Mevcut `tenant_guard` RESTRICTIVE kuralı aynen kalır. |
| Prim kuralları: `bonus_policies`, `bonus_policy_assignments`, `bonus_stage_rates`, `bonus_thresholds`, `bonus_quality_rules`, `bonus_eligible_work_types`, `bonus_difficulty_rules`, `bonus_rule_history` | Bugünkü lab içi okuma kalır (karar 3). | `_is_bonus_manager()` |

**`_is_bonus_manager()` yeniden tanımlanır:** `can_write_payroll()`. Hem prim tablolarının yazma kuralları hem de `calculate_bonus_run`, `approve_bonus_run`, `revert_bonus_run_to_draft`, `post_bonus_run` bu fonksiyonu kullanıyor. Tek değişiklik lab müdürünü ve personel kartında `yonetici` / `hr_manager` / `finance_manager` rolü olanı prim yönetiminden çıkarır (karar 2).

**`unpost_bonus_run` da aynı kontrole bağlanır.** Bugün kendi kontrolü var (`user_type='admin'` ya da personel kartında `yonetici`). İki lab müdürünün de `yonetici` kartı var; kesinleşmiş bir primi geri alıp prim/ceza kayıtlarını silebilirlerdi.

## 6. Doğrulama ölçütleri

Rol rol denemeler gerçek kimliklerle, geri alınan işlemde, önce KIRMIZI sonra YEŞİL yapılır.

**Not:** Canlıdaki teknisyenlerin hiçbirinin aktif personel kartı giriş e-postasıyla eşleşmiyor; `my_employee_id()` hepsinde boş. Teknisyen denemeleri, geri alınan işlemin içinde o teknisyen için geçici bir aktif personel kartı açılarak yapılır. Kartları düzeltmek kullanıcının Personel ekranındaki işi. QR'ın ad eşleşmesiyle giriş yapan biri, e-posta düzelene kadar kendi devam kaydını göremez.

| Kim | Ne denenir | Beklenen |
|---|---|---|
| Teknisyen | Kendi iznini `onaylandi` olarak açar ya da günceller | Engellenir |
| Teknisyen | Bekleyen izin açar, iptal eder | Geçer |
| Teknisyen | Başkasının izin, devam ya da belge kaydını okur | Göremez |
| Teknisyen | `bonus_runs` okur | 0 satır |
| Teknisyen | `employee-docs` deposunda başkasının dosyasını listeler, indirir, siler | Engellenir |
| Lab müdürü | Bekleyen izin girer, devam kaydı ekler, belge ekler | Geçer |
| Lab müdürü | Bir izni (kendisininki dahil) onaylar ya da reddeder; onaylı izni siler | Engellenir |
| Lab müdürü | `unpost_bonus_run` çağırır | Engellenir |
| Lab müdürü | `bonus_runs`, `payroll_settings`, `salary_adjustments` okur | Göremez |
| Lab müdürü | Prim kuralı yazar ya da `calculate_bonus_run` çağırır | Engellenir |
| Lab müdürü | Prim kurallarını okur | Görür |
| Yönetici | Hepsi | Geçer |

Ek olarak:
- Prim/bordro hesap sonuçları önce ve sonra aynıdır; 0a'daki karşılaştırma betiği kullanılır.
- Ekran: yönetici gözüyle İK (izin onay düğmeleri görünür) ve prim ekranları açılır.
- `tsc` 0 hata, dört dil sözlüğü eşit.

## 7. Uygulayıcıya bırakılanlar

- Kural adları, geçişin tek dosya mı birkaç dosya mı olacağı. Her veritabanı adımı kullanıcı onayıyla uygulanır; geri alma dosyaları zorunlu.
- Depo kurallarının adları; mevcut `employee-docs` kurallarının canlı tanımı önce kaydedilir.
- `HRScreen`'de onay yetkisi olmayan kişiye gösterilen bekleyen izin metni.
