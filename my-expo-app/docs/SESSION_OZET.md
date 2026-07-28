# Oturum Özeti — Teknisyen Paneli Çalışmaları

> Tarih: 2026-06-03 · Proje: LabFlow (my-expo-app) · Panel odağı: Teknisyen (istasyon)

Bu doküman, bu oturumda yapılan tüm değişiklikleri, kararları ve açık kalan
maddeleri özetler.

---

## 1. Production / Supabase Bağlantısı Düzeltmesi (kritik)

**Sorun:** Canlı (nexadent.net) uygulama "Uygulama yanlış Supabase projesine bağlı (eski URL)"
hatası veriyor, boş açılıyordu.

**Kök neden zinciri:**
1. **Vercel proje env var'ları** ölü Supabase projesini (`fukaxeppklvtegnjuwih`) gösteriyordu.
   `vercel build`, bunları `.vercel/.env.production.local`'e çekip yerel `.env`'i geçersiz kılıyordu.
2. Yerel `.env` de ölü projeye dönmüştü.
3. **Metro transform cache**, eski (ölü-env) build'inden supabase modülünü cache'lemişti;
   env düzelse bile ölü URL'i bundle'a gömüyordu.

**Çözüm:**
- Vercel env (URL + anon key) **REST API ile silinip canlı projeye** (`kjwjxqfdsxkxgcgophdy`)
  **plaintext** olarak (production+preview+development) yeniden kuruldu.
- Yerel `.env` canlı projeye sabitlendi.
- `expo export --clear` ile Metro cache sıfırlandı.
- Her aşamada bundle grep'lenerek canlı proje URL'inin aktif olduğu doğrulandı, sonra deploy edildi.

---

## 2. Avans Talebi + İzin Talebi (yeni özellik)

Teknisyen paneline, admin'e istinaden iki talep akışı eklendi.

### Veri / Backend
- **İzin:** mevcut `employee_leaves` tablosu + `modules/hr/api.ts` (createLeave/fetchLeaves/cancelLeave)
  yeniden kullanıldı — migration gerekmedi (onay akışı zaten vardı: bekliyor/onaylandı/reddedildi/iptal).
- **Avans:** yeni tablo `employee_advance_requests` (onay akışlı, lab-scoped RLS) —
  migration `supabase/migrations/20260603120000_advance_requests.sql`. **Kullanıcı tarafından canlıya uygulandı.**
  Onaylanınca `employee_advances` defterine kayıt düşer.

### Modüller / Ekranlar
- `modules/advance-requests/api.ts` — tipler + CRUD + admin approve/reject.
- `modules/advance-requests/screens/TechAdvanceRequestsScreen.tsx` — teknisyen avans ekranı.
- `modules/advance-requests/screens/AdvanceRequestsAdminScreen.tsx` — **admin onay ekranı** (Onayla/Reddet).
- `modules/leave-requests/screens/TechLeaveRequestsScreen.tsx` — teknisyen izin ekranı.

### Rotalar
- `app/(station)/avans-talebi.tsx`, `app/(station)/izin-talebi.tsx`, `app/(admin)/advance-requests.tsx`
- İlgili `_layout.tsx`'lere Tabs.Screen + nav kayıtları.

### Kararlar (kullanıcı onayı ile)
- Onay yetkisi: **sadece admin/yönetici**.
- Admin tarafına da tam onay ekranı eklendi.

---

## 3. Çalışan (employee) Eşleştirme Düzeltmesi

**Sorun:** "Personel kaydı bulunamadı" — herkes için boş çıkıyordu.

**Kök neden:** `profiles.employee_id` kolonu **DB'de yok** (tasarım bu kolona dayanıyordu).
Ayrıca kullanıcının login e-postası (`...@nexadentlab.com`) ile personel kaydının e-postası
(`...@nexadent.net`) **farklı domain** olduğundan e-posta ile de eşleşmiyordu.

**Çözüm:** `core/api/resolveEmployee.ts` — çalışan kaydını runtime'da **aynı lab içinde
önce e-posta, sonra tam isim eşleşmesiyle** çözen resolver. Avans + İzin ekranları artık bunu
kullanıyor (şema değişikliği gerekmedi). Test kullanıcısı (Aryan Talebi) isim eşleşmesiyle bağlandı.

> **Açık öneri:** Daha kalıcı çözüm için Admin → Ekip'te kullanıcı↔personel eşleme (e-posta eşitleme)
> ya da `profiles.employee_id` kolonu eklenebilir. Şu an gerekmiyor.

---

## 4. Navbar "Talepler" Butonu

- **Masaüstü (sidebar):** `PatternsShell`'e **opsiyonel `children`** ile açılır/kapanır grup desteği
  eklendi (geriye uyumlu — diğer paneller etkilenmedi). Tek **📨 Talepler** butonu altında:
  Malzeme Talebi · Avans Talebi · İzin Talebi.
- **Mobil/PWA:** alt bara (PillTabBar) **Talepler** sekmesi → dokununca 3 talebi listeleyen
  **bottom sheet**. Ayrıca Profil → "Özlük İşlemleri" altında da erişilebilir.
- Arama/komut paleti düzleştirilmiş nav listesi kullanacak şekilde güncellendi.

---

## 5. PWA Çıkış Yap Düzeltmesi

PWA (standalone) modda `window.confirm` çalışmadığından "Çıkış Yap" butonu tetiklenmiyordu.
`DoctorProfileMobile`'da güvenilmez `window.confirm` yerine **uygulama-içi onay modalı** kondu
(signOut mantığına dokunulmadan).

---

## 6. Gece Modu (Dark Mode) — Tüm Teknisyen Akışı

`STATION_PALETTE` sabit açık paletti; bu yüzden istasyon ekranları gece modunda açık kalıyordu.

**Altyapı:** `core/theme/stationPalette.ts`'e **`STATION_PALETTE_DARK`** + **`useStationTheme()`**
hook'u eklendi (`resolvedDark`'a göre seçer, tema değişince otomatik re-render).

**Dark-aware yapılan ekranlar/bileşenler:**
- İşlerim / workstation özelliği (**~20 dosya**: OperatorScreen + ActiveJobHero, kuyruk kartı,
  dosyalar, diş şeması, timeline'lar, doğrulama checklist'leri, timing/makine kartları, QC workspace, vb.)
- `app/(station)/history.tsx` (Geçmiş), `app/(station)/stats.tsx` (Panel istatistik)
- Avans / İzin ekranları, `MyPerformanceCard`
- `material-requests` modülü (atoms.tsx + TechRequestsScreen + NewRequestModal + RequestDetailDrawer)
  → `useMobileTokens()` (panel-agnostik, dark-aware)
- `_layout.tsx` Talepler bottom sheet

**Yöntem notları:** `P.xxx` çağrıları korundu; aktif siyah pill'ler `P.ink900` ile **ters çevrildi**
(koyu modda açık-zemin + koyu metin); accent/status renkleri ve denim hero gradyanları korundu.
Açık + koyu modda screenshot ile doğrulandı.

---

## 7. UI / Tasarım İyileştirmeleri (DESIGN_LANGUAGE.md)

- **Teknisyen mobil dashboard:** Son Tamamlananlar listesi, Performansım kartı (knob'lu pill bar),
  "Aktif işlerim" Mesai altına alındı, hero (Verimliliğin) halkası büyütüldü + katmanlı gradient,
  Ring %0'da animasyonu durur + NaN guard.
- **ActiveJobHero (İş Detayı):** hasta/sipariş bloğu dikey tam-genişlik okunur düzene, timer mobilde
  başlığın altına, SİPARİŞ AKIŞI (MasterWorkflowTimeline) adımları eşit flex ile her ekrana sığar.
- **OperatorScreen (İşlerim):** kuyruk + Son Tamamlananlar **collapsible**, diş şeması responsive.
- **Avans + İzin ekranları:** sade başlık + düz KPI yerine **F1c HeroCompact** hero
  (full-bleed accent + dekoratif daireler + mini-stat şeridi + koyu denim CTA) + rafine empty state.

---

## 8. Diğer (önceki turlardan)

- Fiyat listesi birim özelliği, Türkçe yazım düzeltmeleri, AI katalog kopyası, A4 katalog redesign.
- Üretim Panosu tamamlandı (filtre+arama+KPI, operasyonel zeka, kart düzeltme, gerçek istasyonlardan kolonlar)
  + panel-renk uyumu + boş istasyon gizleme.
- Root'a `SafeAreaProvider` eklendi (üst/alt safe-zone web/PWA).

---

## Açık Maddeler / Sonraki Adımlar

- [ ] **Deploy:** Gece modu, employee-resolver fix ve hero redesign'lar **henüz canlıda değil**.
      "deploy" denildiğinde yayına alınacak.
- [ ] (Opsiyonel) Kullanıcı↔personel kalıcı eşleme (admin UI veya e-posta eşitleme).
- [ ] (Opsiyonel) Malzeme Talebi ekranına explicit safe-area (üst çentik) eklenebilir.
- [ ] Migration repo'da var; başka ortamlara da uygulanmalı (`20260603120000_advance_requests.sql`).

---

## Hızlı Referans — Dokunulan Önemli Dosyalar

| Alan | Dosya |
|---|---|
| Dark palette + hook | `core/theme/stationPalette.ts` |
| Employee resolver | `core/api/resolveEmployee.ts` |
| Avans API | `modules/advance-requests/api.ts` |
| Avans (teknisyen) | `modules/advance-requests/screens/TechAdvanceRequestsScreen.tsx` |
| Avans (admin) | `modules/advance-requests/screens/AdvanceRequestsAdminScreen.tsx` |
| İzin (teknisyen) | `modules/leave-requests/screens/TechLeaveRequestsScreen.tsx` |
| Talepler nav/sheet | `app/(station)/_layout.tsx`, `core/layout/PatternsShell.tsx` |
| Avans migration | `supabase/migrations/20260603120000_advance_requests.sql` |
| Çıkış modalı | `modules/profile/screens/DoctorProfileMobile.tsx` |

---
---

# Oturum Özeti — Hekim RLS + Ölü Supabase URL Nüksü

> Tarih: 2026-07-28 · Proje: Siman (my-expo-app) · Odak: Hekim sipariş akışı RLS + prod bağlantı kurtarma

## 1. Metro-cache "ölü Supabase URL" hatası TEKRAR yaşandı (kritik)

**Sorun:** Canlı (siman.app) uygulama yine "Uygulama yanlış Supabase projesine bağlı
(eski URL)" kırmızı banner'ı verip boş açıldı (bkz. yukarıdaki 2026-06-03 kaydı — aynı hata).

**Kök neden:** Bu sefer suçlu Vercel env veya yerel `.env` DEĞİLdi — ikisi de doğruydu
(`kjwjxqfdsxkxgcgophdy`). Suçlu yine **Metro transform cache**: eski bir "ölü-env"
build'inden `lib/supabase.ts` modülü cache'lenmiş; doğru env'e rağmen bundle'a ölü URL
(`fukaxeppklvtegnjuwih`) gömülüyordu. `rm -rf dist .vercel/output` Metro cache'ini
(`.expo`, `node_modules/.cache`, `$TMPDIR/metro-*`) temizlemiyor.

**Çözüm (uygulandı + canlı):**
- Metro cache elle temizlendi → temiz `vercel build` → bundle grep ile doğrulandı
  (`n="https://kjwjxqfdsxkxgcgophdy.supabase.co"`, ölü ref yalnız guard dizisinde) →
  `vercel deploy --prebuilt --prod` ile production'a alındı. Prod ayağa kalktı.

**KALICI KORUMA (tekrarı imkânsız kılmak için — `scripts/vercel-build.sh`):**
1. Her prod build öncesi Metro/Expo cache'i sıfırlanır
   (`rm -rf .expo node_modules/.cache $TMPDIR/metro-*`). Bayat cache asla eski env gömemez.
2. Build sonrası **bekçi grep**: `dist/`'te `https://fukaxeppklvtegnjuwih` bulunursa
   build `exit 1` ile DURUR — kırık bundle production'a asla çıkamaz. (Guard'ın kendi
   `DEAD_SUPABASE_REFS` dizisi tırnak içinde/`https://`siz olduğu için tetiklemez.)

## 2. Ölü Supabase artıkları temizlendi

- **`copy-storage-tmp.mjs` silindi** (git-tracked) — tek seferlik Tokyo→Frankfurt storage
  taşıma scripti; işini bitirmişti + **canlı projenin service_role anahtarını sızdırıyordu.**
- **`supabase/.temp/project-ref`** ölü ref'ten canlıya (`kjwjxqfdsxkxgcgophdy`) çevrildi;
  `supabase/.temp/pooler-url` (ölü host) silindi (CLI yeniden üretir).
- Kalan ölü ref'ler kasıtlı: bu doküman (tarihsel), `.claude/settings.local.json`
  (yerel izin listesi) ve iki bekçi (`vercel-build.sh` + `lib/supabase.ts` — tespit için gerekli).

## 3. Hekim sipariş akışı RLS düzeltmesi (doctor_id polimorfizmi)

**Sorun:** Hekim iş girerken `new row violates row-level security policy for table
"work_orders"`; ayrıca açtığı siparişi listede/dosyalarda göremiyordu.

**Kök neden:** `work_orders.doctor_id` **polimorfik** — NewOrderScreen `form.doctor_id`'yi
(hekimin `auth.uid()`'si) `doctors` tablosu satırına çevirir. Yani TÜM siparişlerde
`doctor_id = doctors.id` (profil id DEĞİL). Hekim-kapsamlı RLS politikaları
`doctor_id = auth.uid()` varsayıyordu → eşleşmiyordu. **En kritik tuzak:**
`.insert().select()` RETURNING dönen satırı SELECT USING politikasına tabi tutar →
INSERT geçse bile okuma reddedilince "violates RLS" + rollback.

**Çözüm (DB, canlı+doğrulandı):** İki SECURITY DEFINER yardımcı
(`doctor_owns_order_doctor`, `is_my_doctor_order`); 12 politika bunlara geçirildi
(work_orders INSERT/SELECT/UPDATE, work_order_photos, stage_photos, order_messages,
approvals, provas, status_history, qr_links).
**Çözüm (istemci):** `fetchWorkOrdersForDoctor`'daki hatalı `.eq('doctor_id', ...)`
filtresi kaldırıldı (RLS zaten scope'luyor).

## 4. Bu oturumda ayrıca

- OCR (Opus 5 `temperature` deprecated kaldırıldı) + paper-order storage upload `apikey` fix.
- Hekim/personel hesap oluşturma `signUp` → `admin-create-user` (confirmation-email hatası çözüldü).
- "Merhaba Dr. Dr." → isim önekindeki tekrarlı "Dr." temizlendi.
- Kurye harita düzeltmeleri (özel ikon, ETA hesabı, gelen-sarf yönü, Google Places adres autocomplete).
- WhatsApp giden bildirim Meta şablonlarına bağlandı; Twilio yolu kaldırıldı.
- BanaBiKurye 56198 gönderisi #LAB-2026-0123'e bağlandı.

## 5. Açık kalan

- **WhatsApp ile rehberli manuel sipariş alma** (anahtar kelime + buton girişi, bekleyen
  kutusuna düşme) — yaklaşım onaylandı, henüz başlanmadı.

## Hızlı Referans — Bu Oturumda Dokunulan Önemli Dosyalar

| Alan | Dosya |
|---|---|
| Build cache/URL bekçileri | `scripts/vercel-build.sh` |
| Runtime ölü-URL guard | `lib/supabase.ts` |
| Hekim RLS yardımcıları | DB (execute_sql, migration dosyası yok) |
| Sipariş listesi filtresi | `modules/orders/api.ts` |
| Silinen sızdıran script | `copy-storage-tmp.mjs` (silindi) |
