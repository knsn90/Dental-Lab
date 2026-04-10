# Dental Lab — Teknik Dokümantasyon

Diş laboratuvarları ile hekimler arasındaki iş emri (work order) akışını
dijitalleştiren çok kullanıcılı bir uygulama. Hekim sipariş açar, lab
üretim adımlarını yürütür, admin sistemi yönetir.

## 1. Teknoloji Yığını

| Katman          | Teknoloji |
|-----------------|-----------|
| İstemci         | Expo SDK 52, React Native 0.76, React 18.3 |
| Yönlendirme     | expo-router v4 (typed routes) |
| Dil             | TypeScript 5.7 |
| State           | Zustand 5 |
| Backend         | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Auth Depolama   | `expo-secure-store` (native) / `localStorage` (web) |
| UI              | react-native-web, Plus Jakarta Sans, MaterialCommunityIcons |
| 3D / Grafik     | three.js, react-native-svg |
| Dosya / PDF     | pdfjs-dist, xlsx, expo-image-picker, expo-file-system |
| Web Dağıtımı    | Vercel (statik export: `expo export --platform web`) |

Paket kimlikleri: iOS/Android `com.dentallab.app`, scheme `dental-lab`.

## 2. Proje Yapısı

```
my-expo-app/
├── app/                  # expo-router dosya-tabanlı yönlendirme
│   ├── _layout.tsx       # Kök layout, auth yönlendirmesi, font yükleme
│   ├── (auth)/           # login, register-doctor, register-lab, admin-login
│   ├── (doctor)/         # Hekim paneli
│   ├── (lab)/            # Lab paneli (technician/manager)
│   ├── (admin)/          # Admin paneli
│   ├── admin/            # Alt admin rotaları (orders, reports, users)
│   └── order/[id].tsx    # Ortak sipariş detay rotası
├── modules/              # Özellik bazlı modüller
│   ├── auth/             # Giriş/kayıt ekranları, api
│   ├── orders/           # İş emirleri: api, ekranlar, kanban, form
│   ├── production/       # Üretim / workflow adımları
│   ├── workflow/         # engine.ts + şablon adımlar (manual/digital)
│   ├── approvals/        # Tasarım & admin onayları
│   ├── provas/           # Prova (try-in) yönetimi
│   ├── clinics/          # Klinik ve hekim yönetimi
│   ├── services/         # Lab servis (fiyat) kataloğu
│   ├── stock/            # Stok ekranları
│   ├── dashboard/        # Ana panel bileşenleri
│   ├── admin/            # Admin modülü (orders, reports, users)
│   └── profile/          # Profil yönetimi
├── core/                 # Paylaşılan altyapı
│   ├── api/supabase.ts   # lib/supabase.ts'yi re-export eder
│   ├── store/authStore.ts# Zustand auth state
│   ├── theme/            # colors, spacing, typography, shadows
│   ├── layout/, ui/, hooks/, utils/
├── components/           # Ortak UI (icons, layout, ui, work-orders)
├── lib/                  # Supabase client + domain API'leri
│   ├── supabase.ts       # createClient + platform storage adapter
│   ├── types.ts          # Tüm domain tipleri
│   ├── auth.ts, workOrders.ts, clinics.ts, doctors.ts,
│   ├── photos.ts, provas.ts, services.ts
├── supabase/
│   ├── migrations/       # SQL şema migrasyonları
│   └── functions/        # Deno tabanlı Edge Functions (admin-*)
├── assets/, constants/, hooks/, scripts/, store/, web/
├── app.json, vercel.json, tsconfig.json, babel.config.js
└── fdi_tooth_data.py     # FDI diş numaralandırma verisi (veri üretimi)
```

## 3. Kullanıcı Rolleri & Yetki Modeli

`profiles.user_type` üç değer alır:

- **doctor** — Sipariş açar, kendi siparişlerini görür, fotoğraf yükler.
  Kayıt sonrası `approval_status = 'pending'` ile başlar, lab manager
  onaylayana kadar `is_active = false`.
- **lab** — İki alt rol: `technician` ve `manager`. Tüm siparişleri
  görür, durum günceller, fotoğraf yükler. Yalnızca `manager` rolü
  hekim onaylayabilir ve diğer profilleri yönetebilir.
- **admin** — Tam yetki. Kullanıcı yönetimi, raporlar, loglar.
  `(admin)` panelindedir; ayrıca `(lab)` panelini de açabilir
  (çoklu sekme desteği `app/_layout.tsx` içinde tanımlı).

Panel yönlendirmesi `app/_layout.tsx` kök layout'unda yapılır:
kullanıcı tipi yanlış route grubundaysa otomatik olarak doğru gruba
(`(doctor)` / `(lab)` / `(admin)`) yönlendirilir, alt yol korunur.

## 4. Kimlik Doğrulama Akışı

1. Giriş/kayıt Supabase Auth ile e-posta+parola üzerinden yapılır.
2. `auth.users` tablosuna kayıt atıldığında `handle_new_user()`
   tetikleyicisi `profiles` tablosuna satır ekler. Hekimler için
   `is_active = false`, `approval_status = 'pending'`.
3. Oturum token'ı platforma göre saklanır:
   - **Web:** `localStorage` adaptörü
   - **Native:** `expo-secure-store`
4. Uygulama ön plana gelince native'de `supabase.auth.startAutoRefresh()`
   çağrılır (`lib/supabase.ts:70`).
5. Kök layout `onAuthStateChange` dinler, `authStore` içindeki
   `session` ve `profile` state'lerini günceller.
6. `fetchProfile` 5 saniyelik timeout ile profil çeker, hata durumunda
   sessizce düşer (`core/store/authStore.ts:26`).

## 5. Veritabanı Şeması (Supabase/PostgreSQL)

### Ana Tablolar

**`profiles`** — `auth.users` ile 1-1 bağlı kullanıcı profili.
- `id` (auth.users FK), `user_type` (lab/doctor/admin), `full_name`,
  `clinic_name`, `role` (technician/manager), `phone`, `email`,
  `is_active`, `approval_status` (pending/approved/rejected).

**`work_orders`** — Ana iş emri tablosu.
- `order_number` — `LAB-YYYY-NNNN` formatında otomatik üretilir
  (`generate_order_number` trigger + `work_order_seq`).
- `doctor_id`, `assigned_to` (FK `profiles`).
- `tooth_numbers INTEGER[]` — FDI diş numaraları (fdi_tooth_data.py).
- `work_type`, `shade`, `machine_type` (`milling` | `3d_printing`).
- `status` ENUM `work_order_status`: `alindi` → `uretimde` →
  `kalite_kontrol` → `teslimata_hazir` → `teslim_edildi`.
- `patient_name`, `patient_id`, `patient_gender`, `department`,
  `tags TEXT[]`, `model_type`, `is_urgent`.
- `notes` (hekim-görünür) / `lab_notes` (iç kullanım).
- `delivery_date`, `delivered_at`.

**`work_order_photos`** — Sipariş fotoğrafları (Storage bucket
`work-order-photos`, private). `storage_path`, `uploaded_by`, `caption`.

**`status_history`** — Tüm durum değişikliklerinin denetim izi.
`old_status`, `new_status`, `note`, `changed_by`.

**`order_items`** — Sipariş kalemleri (servis kataloğundan veya
manuel). `service_id`, `name`, `price`, `quantity`.

**`lab_services`** — Lab hizmet/fiyat kataloğu. `category`, `price`,
`currency`, `is_active`, `sort_order`.

**`clinics`** ve **`doctors`** — Lab'in müşteri klinik ve hekim
kartları (auth'tan bağımsız CRM verisi).

**`provas`** — Prova (try-in) takibi: bisküvi, metal, seramik, bitmek,
teslim aşamaları. `scheduled_date`, `sent_date`, `return_date`,
`status` (planlandı/gönderildi/döndü/tamamlandı).

**`case_steps`** — Workflow motorunun ürettiği adım kayıtları
(aşağıda §6).

**`activity_logs`** — Tüm sistem eylemleri. `actor_id`, `actor_type`,
`action`, `entity_type`, `entity_id`, `entity_label`, `metadata JSONB`.
Yalnızca adminler okuyabilir; tetikleyicilerle otomatik doldurulur
(migrations/005).

### Atomic İşlemler (RPC)

`update_work_order_status(p_work_order_id, p_new_status, p_changed_by,
p_note)` — `work_orders` ve `status_history` tablolarını tek
transaction'da günceller, `teslim_edildi` durumunda `delivered_at`
set eder (migrations/001 satır 143).

### Row Level Security (RLS)

Tüm tablolarda RLS aktiftir. Temel politikalar:

- **profiles:** Kullanıcı kendi profilini okur/günceller. Lab
  kullanıcıları tüm profilleri okuyabilir. Lab manager'lar hekim
  onay durumunu güncelleyebilir (006_doctor_approval.sql).
- **work_orders:** Hekim yalnızca `doctor_id = auth.uid()` olanları
  görür; lab kullanıcıları hepsini görür/günceller.
- **work_order_photos / status_history:** Ana iş emrine erişim
  hakkı olan herkes görebilir.
- **activity_logs:** SELECT yalnızca admin, INSERT tetikleyicilerden
  (migrations/005).

RLS recursion hatası (profil sorgularının kendini çağırması)
`is_lab_user()` SECURITY DEFINER yardımcı fonksiyonuyla çözüldü;
ek düzeltme `007_fix_rls_recursion.sql` içinde.

### Migrasyon Geçmişi

| Dosya | İçerik |
|-------|--------|
| `001_initial_schema.sql` | Ana şema, trigger'lar, RLS, RPC |
| `004_patient_dob_phone.sql` | Hasta doğum tarihi/telefon |
| `005_activity_logs.sql` | Aktivite log tablosu + trigger'lar |
| `006_doctor_approval.sql` | Hekim onay akışı, manager politikaları |
| `007_fix_rls_recursion.sql` | RLS sonsuz döngü düzeltmesi |
| `008_patient_geo.sql` | Hasta coğrafi bilgi |
| `009_lab_notes_visible.sql` | Lab notları görünürlük ayarı |
| `010_fix_activity_log_fk.sql` | FK düzeltmesi |
| `011_stock_extras.sql` | Stok ek alanları |

## 6. Workflow Motoru

`modules/workflow/` dizini, measurement type'a (manual/digital) göre
üretim adımlarını oluşturur.

**Şablonlar** (`templates.ts`):

- **MANUAL (11 adım):** receive_impression → model_cast → scan →
  design (onay gerekir) → milling (onayda bloklar) → sinter →
  porcelain → oven → qc → packaging → delivery
- **DIGITAL (9 adım):** receive_file → design → milling → sinter →
  porcelain → oven → qc → packaging → delivery

Her adımda iki bayrak vardır:
- `requires_approval` — bu adım tamamlandığında onay gereklidir
- `blocks_on_approval` — bu adım, önceki onay gelmeden başlayamaz

`engine.ts::createWorkflow(workOrderId, measurementType)` şablonu
`case_steps` tablosuna insert eder, her satır `status: 'pending'`
başlar.

## 7. Edge Functions

`supabase/functions/` altında Deno tabanlı admin operasyonları
(service_role gerektirir):

- `admin-create-user` — Yeni kullanıcı oluşturma
- `admin-list-users` — Tüm auth kullanıcılarını listeleme
- `admin-update-user` — Kullanıcı güncelleme
- `admin-delete-user` — Kullanıcı silme

Bu işlemler client tarafında anon key ile yapılamaz (Supabase
`auth.admin` yalnızca service_role'a açıktır), bu nedenle Edge
Function katmanından geçilir.

## 8. İstemci Mimarisi

### State Yönetimi

Zustand store (`core/store/authStore.ts`) yalnızca kimlik ve profil
için kullanılır. Sipariş/klinik/servis verileri ekran bazında
`useEffect` + Supabase query ile çekilir; global cache yoktur. Bu
proje `@tanstack/react-query` **kullanmaz**.

### Tema

`core/theme/` içinde statik tanımlar:
- `colors.ts` — Ana marka rengi `#1A56DB`
- `spacing.ts`, `typography.ts`, `shadows.ts`

Tipografi olarak Plus Jakarta Sans (300/400/500/600/700) kullanılır,
web'de `<link>` üzerinden, native'de `@expo-google-fonts` ile
yüklenir.

### Responsive / Web Shell

`app/_layout.tsx::useWebStyles` yalnızca web'de global CSS enjekte
eder:
- **≥769px:** Tam ekran
- **521–768px:** 480×900 "telefon kabuğu" ortalanır, gölgeli kart
- **≤520px:** Tam ekran mobil

Scrollbar `#BFDBFE` mavi tonunda özelleştirilmiştir.

### expo-router Grupları

Parantezli klasörler URL'de görünmeyen grup oluşturur:
- `(auth)`, `(doctor)`, `(lab)`, `(admin)` — rol grupları
- `order/[id].tsx` — dinamik sipariş detay rotası
- `app.json` içinde `typedRoutes: true` ile rotalar tip güvenli

## 9. Ortam Değişkenleri

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

- `EXPO_PUBLIC_` ön eki Expo tarafından istemci bundle'a dahil
  edilir. **Service role anahtarı asla client'a eklenmemelidir.**
- Vercel derlemesinde `.env` dosyası `buildCommand` içinde
  ortam değişkenlerinden yazılır (`vercel.json`).

## 10. Derleme & Dağıtım

**Geliştirme:**
```bash
npm install
npm run web        # Web'de çalıştır (--clear ile)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run start      # Expo dev menu
```

**Web üretim derlemesi:**
```bash
npm run build:web  # expo export --platform web + fontları enjekte et
```
Çıktı `dist/` dizininde statik dosyalar olarak oluşur.

**Vercel dağıtımı** (`vercel.json`):
- `/index.html` için cache devre dışı
- `/_expo/static/*` için bir yıl immutable cache
- Tüm rotalar `/index.html`'e rewrite (SPA davranışı)
- Output dizini `dist`

**`scripts/inject-fonts.js`** — Derleme sonrası HTML'e Google Fonts
preconnect ve stylesheet link'lerini enjekte eder.

## 11. Önemli Yol Haritası / Dikkat Edilecekler

- **Fotoğraf depolama:** `work-order-photos` bucket'ı **private**;
  her görüntüleme için `getSignedUrl` ile imzalı URL üretilir
  (`WorkOrderPhoto.signed_url`).
- **FDI diş numaraları:** `fdi_tooth_data.py` sadece veri üretir,
  runtime'da kullanılmaz. Client `tooth_numbers` alanını
  `ToothNumberPicker` bileşeni üzerinden toplar.
- **Hekim onay kuyruğu:** Yeni hekim kayıtları lab manager
  panelinde görünür; onaylanana kadar giriş yapabilir ancak
  `is_active = false` nedeniyle sipariş açamaz.
- **Çoklu Supabase client riskini** önlemek için tüm modüller
  `lib/supabase.ts`'den tek instance kullanır; `core/api/supabase.ts`
  yalnızca yeniden export eder.
- **Sipariş numarası:** DB sequence tabanlıdır; rollback'lerde
  boşluk oluşabilir (bu bir hata değil, sequence'in doğal
  davranışı).
- **Status geçişleri** daima `update_work_order_status` RPC'si
  üzerinden yapılmalıdır ki `status_history` kaydı kopmasın.
