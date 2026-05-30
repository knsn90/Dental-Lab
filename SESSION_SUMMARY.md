# Oturum Özeti — claude/security-testing-PMHri

**Tarih:** 30 Mayıs 2026  
**Branch:** `claude/security-testing-PMHri`  
**Supabase Projesi:** LabFlow (`kjwjxqfdsxkxgcgophdy`) — Dental Lab projesi artık kullanılmıyor  

---

## Yapılan Değişiklikler

### 1. Güvenlik Düzeltmeleri

**`modules/auth/screens/VerifyPhoneScreen.tsx`**
- `TEST_OTP = '1234'` kaldırıldı
- OTP uzunluğu 4 → 6 olarak güncellendi
- Edge Function çağrıları aktifleştirildi (`send-otp`, `verify-otp`)

**`supabase/functions/verify-otp/index.ts`**
- Timing attack koruması eklendi (`timingSafeEqual` fonksiyonu)

**`supabase/functions/_shared/cors.ts`**
- Bilinmeyen origin'lere `null` dönecek şekilde güncellendi (önceden ilk allowed origin dönüyordu)

**`supabase/functions/admin-list-users/index.ts`**  
**`supabase/functions/admin-create-user/index.ts`**  
**`supabase/functions/admin-update-user/index.ts`**  
**`supabase/functions/admin-delete-user/index.ts`**
- Çok-kiracı (multi-tenant) izolasyonu: caller'ın `lab_id`'si çekilerek tüm işlemler bu lab_id ile kısıtlandı
- Cross-tenant erişim engellendi
- Son-admin koruması eklendi (`admin-delete-user`)

**`modules/auth/screens/RegisterLabScreen.tsx`**
- Şifre politikası güçlendirildi: büyük harf + rakam zorunlu

**`modules/auth/screens/LoginScreen.tsx`**
- Şifre sıfırlama URL'i env var'dan okunacak şekilde güncellendi

**`.env` / `.env.example`**
- `EXPO_PUBLIC_PASSWORD_RESET_URL` eklendi

**`lib/supabase.ts`**
- `supabaseUrl` boşsa açıklayıcı Türkçe hata mesajı verecek şekilde güncellendi

**`vercel.json`**
- Build komutu env var fallback'leri ile güncellendi

**`supabase/migrations/20260527_rls_missing_policies.sql`** (yeni)
- `couriers`, `deliveries`, `order_boxes`, `stage_photos` tablolarına eksik RLS politikaları eklendi

---

### 2. Mesaj Kutusu Başlıkları

**`modules/orders/components/MessagesPopup.tsx`**
- Klinik paneli: başlık = hasta adı
- Admin / müdür / teknisyen: başlık = klinik adı, alt başlık = hasta adı

---

### 3. Müdür "Bugün" Sayfası Düzeltmesi

**`modules/dashboard/screens/LabDashboardScreen.tsx`**
- `loadPipeline`, `loadExtra`, `loadAnalytics`: `lab_id` filtresi eklendi
- Bozuk `doctor:doctor_id(full_name)` FK join kaldırıldı (migration 037'de FK düşürülmüştü), yerine ayrı profiles fetch eklendi
- `useCallback` bağımlılıkları düzeltildi (stale closure sorunu)
- "Yükleniyor..." → profile yoksa "Yükleniyor...", varsa "Henüz iş emri yok"

---

### 4. Hekim Tasarım Onayı Akışı

**Sorun:** Hekim yeni sipariş girerken "tasarıma onay" tikini aktifleştiriyor ancak teknisyen tasarımı bitirince hekim onaya gitmiyor.

**`modules/orders/api.ts`**
- `doctor_approval_required` alanı yanlışlıkla strip ediliyordu → kaldırıldı, artık DB'ye kaydediliyor

**`modules/station/hooks/useKanbanData.ts`**
- `KanbanCard` interface'ine `doctor_approval_required` ve `doctor_id` alanları eklendi

**`modules/station/screens/ProductionKanbanScreen.tsx`**
- `StageChecklistModal`'a `doctorId` ve `requiresDoctorApproval` prop'ları geçirildi

---

### 5. Hekim Onayı Gate + Timeline Adımı + Onaylar Sayfası

**`supabase/migrations/053_doctor_approval_gate.sql`** (yeni — LabFlow'a uygulandı ✓)
- `advance_to_next_stage`: `doctor_approval_status = 'pending'` iken aşama ilerleyemez (DB seviyesi gate)
- `doctor_approve`: onay/red sonrası `case_steps` tablosundaki `doktor_onay` adımını senkronize eder
- `approvals` tablosuna hekim okuma RLS politikası eklendi

**`modules/workflow/engine.ts`**
- `createCaseSteps` no-op'tan çıktı: `measurement_type` ve `doctor_approval_required`'a göre `case_steps` tablosuna gerçek adımlar ekler
- `doctor_approval_required = true` ise `doktor_onay` adımı timeline'a dahil edilir; false ise atlanır

**`modules/orders/api.ts`**
- `createWorkOrder`: `doctor_approval_required` değeri `createCaseSteps`'e iletiliyor

**`modules/production/components/StepTimeline.tsx`**
- `doktor_onay` adımı için start/complete butonu gösterilmez
- İlerleme yüzdesi bu bekleme adımını saymaz

**`modules/production/components/StepCard.tsx`**
- `doktor_onay` adımı `pending` iken "Hekim tasarım onayı bekleniyor" mesajı
- `blocked` iken "Hekim değişiklik istedi — yeniden tasarım gerekli" mesajı

**`modules/orders/screens/ApprovalsScreen.tsx`** (yeni)
- Hekim: kendi bekleyen onaylarını listeler
- Klinik müdürü: kliniğindeki hekimlerin bekleyen onaylarını listeler
- 12 saatten az kalan onaylar kırmızıya döner
- Onay linkine yönlendirme

**`app/(doctor)/approvals.tsx`** (yeni)  
**`app/(clinic)/approvals.tsx`** (yeni)
- Onaylar sayfası route dosyaları

**`app/(doctor)/_layout.tsx`**
- Desktop nav ve mobile tab'a "Onaylar" eklendi

**`app/(clinic)/_layout.tsx`**
- Desktop nav ve mobile tab'a "Onaylar" eklendi

---

## Mevcut Durum

### Kod
Tüm değişiklikler `claude/security-testing-PMHri` branch'ine push edildi.

### Uygulanmış Migrations (LabFlow)
- `053_doctor_approval_gate.sql` ✓ (bu oturumda uygulandı)

### Henüz Uygulanmamış Migrations
- `20260527_rls_missing_policies.sql` — couriers/deliveries/order_boxes/stage_photos RLS
  (Dental Lab için yazılmıştı, LabFlow'a uygulanması gerekiyor)

### Bekleyen Manuel İşlemler
- Vercel Project Settings'e şu env var'ların eklenmesi:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_PASSWORD_RESET_URL`
- Edge Functions'a `CORS_ALLOWED_ORIGINS` secret eklenmesi
- Supabase Auth'ta HaveIBeenPwned şifre koruması aktifleştirilmesi

---

## Bilinen Açık Konular

### Kurye Atama Hatası
`invalid input syntax for type uuid: "__virtual_courier_..."` hatası alınıyor.
Hata, timeline'daki "Kurye" adımının "Teknisyene gönder" butonunu tıkladığında sanal bir courier stage'i aktive etmeye çalışmasından kaynaklanıyor. "Kuryeye Gönder" modalını açmalı. İlgili kod bu repoda bulunamadı — deploy edilen ekranlar farklı bir kaynaktan geliyor olabilir; araştırılması gerekiyor.

### Hekim/Klinik Onaylar Sayfası — Klinik Filtresi
Klinik müdürünün doktorlarını bulmak için `clinics.profile_id` → `doctors.clinic_id` join zinciri kullanıldı. Tablo yapısı farklıysa sorgu boş dönebilir; test edilmesi gerekiyor.

---

## Temel Dosya Referansları

| Konu | Dosya |
|------|-------|
| Kanban veri katmanı | `modules/station/hooks/useKanbanData.ts` |
| Kanban ekranı | `modules/station/screens/ProductionKanbanScreen.tsx` |
| Stage checklist modal | `modules/orders/components/StageChecklistModal.tsx` |
| Hekim onay ekranı (public) | `modules/orders/screens/DoctorApprovalScreen.tsx` |
| Onaylar ekranı | `modules/orders/screens/ApprovalsScreen.tsx` |
| Workflow adım şablonları | `modules/workflow/templates.ts` |
| Stage tanımları | `modules/orders/stages.ts` |
| İstasyon mapping | `modules/orders/stationMapping.ts` |
| Production timeline | `modules/production/components/StepTimeline.tsx` |
| Sipariş oluşturma API | `modules/orders/api.ts` |
| Workflow engine | `modules/workflow/engine.ts` |
| Hekim layout | `app/(doctor)/_layout.tsx` |
| Klinik layout | `app/(clinic)/_layout.tsx` |
