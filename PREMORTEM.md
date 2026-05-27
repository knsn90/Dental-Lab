# 🦷 Dental-Lab — Proje Premortem Raporu

> **Tarih:** 27 Mayıs 2026  
> **Yöntem:** Premortem — "Proje çöktü. Neden?" sorusundan geriye doğru analiz.  
> **Kapsam:** Teknik, ürün, güvenlik, operasyonel ve süreç riskleri.

---

## Senaryo: Proje Başarısız Oldu

Hayali senaryomuz: Dental-Lab 6 ay sonra production'a alındı ama;
- Bir klinik başka bir kliniğin siparişlerini gördü
- Bir ödeme çift tahsil edildi
- e-Fatura sistemi vergi cezasına yol açtı
- Üç büyük lab müşterisi iptal etti

Bu hataların her biri **bugün** var olan boşluklardan kaynaklanabilir.

---

## 🔴 KRİTİK RİSKLER (Blocker — Üretim öncesi çözülmeli)

### R-01 · Ödeme Entegrasyonları Tamamlanmamış

**Durum:** `payments-charge` ve `payments-callback` Edge Function'larında **TODO** yorumları var.

```typescript
// payments-charge/index.ts
// TODO: iyzico 3DS endpoint
// TODO: PayTR entegrasyonu
// TODO: Param/Garanti callback doğrulaması
```

**Etki:** Gerçek para alınamaz. Çift çekim ya da kayıp ödeme riski.  
**Olasılık:** %100 — kod tamamlanmadan deploy edilse kesinlikle hata verir.

**Önlem:**
- [ ] iyzico sandbox → production akışı tamamlanmalı
- [ ] Her provider için HMAC imza doğrulaması yazılmalı
- [ ] Idempotency key eklenmeli (çift çekimi önler)
- [ ] Ödeme sonrası `payment_intents` tablosu reconciliation scripti

---

### R-02 · e-Fatura Entegrasyonu Eksik

**Durum:** `efatura-send` Edge Function'ında Nilvera API çağrısı **TODO**.

```typescript
// efatura-send/index.ts
// TODO: Nilvera API call
```

**Etki:** Türkiye'de **yasal zorunluluk**. Fatura kesilemezse vergi cezası riski.  
**Olasılık:** %100 — tamamlanmamış kod deploy edilemez.

**Önlem:**
- [ ] Nilvera API entegrasyonu test ortamında tamamlanmalı
- [ ] GİB mükellef sorgulama (e-fatura ya da e-arşiv mükellefi?)
- [ ] Fatura UUID üretimi ve mutable-immutable akışı
- [ ] Başarısız gönderim retry queue'su (5'er dakika, max 3 deneme)

---

### R-03 · Üretimde Test OTP Kodu

**Durum:** `VerifyPhoneScreen.tsx` içinde hardcoded test kodu:

```typescript
// Hardcoded test OTP — production'da da çalışıyor!
if (otp === '1234') { /* giriş başarılı */ }
```

**Etki:** Herhangi biri `1234` girerek **herhangi bir telefon numarası** ile giriş yapabilir.  
**Olasılık:** %100 — şu an aktif bir güvenlik açığı.

**Önlem:**
- [ ] Bu satır derhal kaldırılmalı (`__DEV__` guard bile yeterli değil)
- [ ] OTP doğrulaması tamamen Edge Function üzerinden geçmeli
- [ ] Staging ortamı için ayrı SMS mock oluşturulmalı

---

### R-04 · Sıfır Otomatik Test

**Durum:** 451 TypeScript dosyası, 103 ekran, 29 modül — **0 test dosyası**.

**Etki:** Her değişiklik regresyon riski taşır. Ödeme akışı, RLS politikaları, fatura hesaplama — hiçbiri doğrulanmıyor.

**Kritik test edilmemiş alanlar:**
- Para hesapları (bakiye, borç/alacak doğruluğu)
- Çek vade takibi
- Workflow state machine (sipariş durumu geçişleri)
- Multi-tenancy izolasyonu (klinik A → klinik B erişimi olmamalı)

**Önlem:**
- [ ] Vitest ile modül başına en az 1 `api.ts` unit testi
- [ ] RLS politikaları için Supabase pgTAP testleri
- [ ] Kritik akışlar için Playwright E2E (sipariş oluşturma, fatura kesme, ödeme)
- [ ] GitHub Actions CI pipeline (push → test → deploy)

---

### R-05 · Multi-Tenancy RLS Güvenliği

**Durum:** 70+ migration var, ancak hiçbir RLS policy test scripti yok. Karmaşık JOIN'ler cross-tenant veri sızdırabilir.

**Tehlike senaryoları:**
- Lab A teknisyeni Lab B siparişlerini görüyor
- Klinik A doktoru Klinik B'nin fiyat listesini görüyor
- Admin paneli tüm lablara açık ama policy sadece `is_admin` kontrol ediyor

**Önlem:**
- [ ] Her tablo için "kötü niyetli kullanıcı" ile PSQL test scripti yazılmalı
- [ ] `SECURITY DEFINER` fonksiyonları gözden geçirilmeli
- [ ] Tüm `SELECT/INSERT/UPDATE/DELETE` policy'leri policy matrix dokümanına yazılmalı

---

## 🟠 YÜKSEK RİSKLER (Production'a geçmeden önce ele alınmalı)

### R-06 · Sıfır Monitoring ve Error Tracking

**Durum:** Sentry, Rollbar veya herhangi bir hata izleme yok. Production'da bir hata olsa kimse haberdar olmaz.

**Önlem:**
- [ ] Sentry entegrasyonu (`@sentry/react-native`)
- [ ] Edge Function'lar için hata alertleri (Supabase Log Drains → Sentry)
- [ ] Kritik iş akışları için uptime monitör (Better Uptime / Checkly)

---

### R-07 · CI/CD Pipeline Yok

**Durum:** `sync-and-deploy.sh` scripti manuel çalıştırılıyor. GitHub Actions yok.

**Riskler:**
- Testler geçmeden kod deploy edilebilir
- Birden fazla developer aynı anda push ederse çakışma
- Vercel deploy başarısız olsa bile kimse bilmiyor (bildirim yok)

**Önlem:**
- [ ] GitHub Actions: `push → lint → test → build → deploy`
- [ ] PR'lar için `required status checks`
- [ ] Vercel preview deployment (her PR için ayrı URL)

---

### R-08 · SMS OTP Tek Nokta Hatası

**Durum:** Giriş tamamen SMS OTP'ye bağlı. NetGSM/İleti Merkezi down olsa kimse giriş yapamaz.

**Önlem:**
- [ ] Fallback SMS provider mekanizması (NetGSM → İleti Merkezi → Mutlucell sıralı deneme)
- [ ] SMS başarısız olursa "tekrar gönder" ile farklı provider denemesi
- [ ] Kritik admin kullanıcılar için e-posta OTP alternatifi

---

### R-09 · Veritabanı Migration Risk

**Durum:** 70+ migration mevcut, ancak:
- Otomatik migration çalıştırma yok (CI/CD yok)
- Rollback scripti yok
- Production'da migration öncesi backup alınmıyor

**Kritik senaryo:** Yanlış migration çalıştırıldı → `DROP TABLE` → veri kaybı

**Önlem:**
- [ ] Her migration için `rollback` scripti
- [ ] `supabase db push` → `pre-push hook` → backup al
- [ ] Migration smoke test scripti (temel sorgular çalışıyor mu?)

---

### R-10 · Edge Function Güvenlik Açıkları

**Durum:**
- Rate limiting yok (OTP endpoint'i brute-force'a açık)
- CORS politikaları incelenmemiş
- Admin Edge Function'larında `service_role` key client tarafına sızabilir mi?

**Önlem:**
- [ ] OTP endpoint: IP başına 5 istek/dakika rate limit (Upstash Redis veya in-memory)
- [ ] Admin fonksiyonları sadece `service_role` ile çağrılabilmeli, client key ile değil
- [ ] CORS header'larında `*` yerine whitelist kullanılmalı

---

## 🟡 ORTA RİSKLER (İlk milestone sonrası ele alınmalı)

### R-11 · Performans: Three.js 3D Oklüzyon Analizi

**Durum:** `three@0.183` + `three-mesh-bvh` paketleri mobil cihazlarda yükleniyor. Okklüzyon analiz ekranı düşük RAM'li Android cihazlarda crash yapabilir.

**Önlem:**
- [ ] Düşük end cihazlarda bellek testi
- [ ] 3D render lazy loading + worker thread
- [ ] WebGL desteklenmiyor ise fallback UI

---

### R-12 · Stil Tutarsızlığı (NativeWind vs StyleSheet)

**Durum:** Bazı eski ekranlar hâlâ `StyleSheet.create({})` kullanıyor. Yeni ekranlar NativeWind `className` kullanıyor. Design token uyumu yok.

**Etki:** UI tutarsızlığı → müşteri güveni kaybı. Renk/font/spacing farkları gözle görülür.

**Önlem:**
- [ ] Legacy `StyleSheet` dosyalarını listele: `grep -r "StyleSheet.create" app/ modules/`
- [ ] Kademeli NativeWind migration planı
- [ ] ESLint custom rule: `style={}` prop'unu engelle (CLAUDE.md kuralını code olarak enforce et)

---

### R-13 · Seed Data Eksikliği

**Durum:** `seed.sql` boş. Yeni bir lab onboarding yapılırken:
- Hizmet kataloğu (kron, köprü, implant vs.) manuel girilmeli
- Workflow aşamaları elle tanımlanmalı
- Stok lokasyonları sıfırdan oluşturulmalı

**Etki:** İlk lab onboardingi saatler alıyor. Demo gösterimi zor.

**Önlem:**
- [ ] Standart hizmet kataloğu seed (lab türüne göre: genel, ortodonti, implant odaklı)
- [ ] Demo lab seed data (gerçekçi sipariş ve fatura verileriyle)
- [ ] Onboarding wizard UI

---

### R-14 · Çevrimdışı Destek Yok

**Durum:** Tüm veri Supabase'den real-time çekiliyor. İnternet kesintisinde uygulama çalışmıyor.

**Etki:** Diş lab teknisyenler sipariş durum güncelleyemiyor → üretim duraksıyor.

**Önlem:**
- [ ] Zustand persist (AsyncStorage) ile kritik verileri cache'le
- [ ] Offline queue: Güncelleme isteği → local store → internet gelince sync
- [ ] "Çevrimdışı modda çalışıyorsunuz" banner

---

### R-15 · Belgelendirme ve Onboarding Eksikliği

**Durum:**
- `README.md` yok (kök dizinde)
- Local dev setup dokümantasyonu yok
- Supabase local stack nasıl kurulur? Bilinmiyor.
- Edge Function'ları test etmek için ne yapılır? Bilinmiyor.

**Etki:** Yeni developer projeyi 3 gün içinde kuramaz. Knowledge silosu oluşur.

**Önlem:**
- [ ] `README.md` oluştur (kurulum, geliştirme, deploy adımları)
- [ ] `.env.example` oluştur (gerçek key'ler olmadan)
- [ ] `CONTRIBUTING.md` (branch stratejisi, test kuralları, review süreci)
- [ ] `docs/` klasörü (mimari kararlar, RLS stratejisi, API dokümantasyonu)

---

## 🟢 DÜŞÜK RİSKLER (Teknik borç — Zaman içinde çözülmeli)

### R-16 · ESLint Konfigürasyonu Yok

Tip güvenliği var (`tsconfig strict`) ama kod kalitesi kuralları (unused imports, console.log, any kullanımı) uygulanmıyor.

### R-17 · Vercel + Supabase SLA Bağımlılığı

İki ayrı cloud servisi. Vercel down → web yok. Supabase down → her şey yok. SLA anlaşmaları gözden geçirilmeli.

### R-18 · Mobile/Tablet Responsive Boşluklar

Tablet (iPad) breakpoint'leri bazı ekranlarda test edilmemiş. Özellikle tablolar ve formlar.

### R-19 · Büyük Bundle Boyutu

Three.js (~600KB gzip) tüm kullanıcılara yükleniyor, sadece oklüzyon analizi kullananlar için değil. Code splitting gerekli.

### R-20 · Türkçe Karakter Desteği

PDF fatura üretiminde Türkçe karakter (ğ, ü, ş, ı, ö, ç) problemi yaşanabilir. Özel font embed edilmeli.

---

## 📊 Risk Özet Matrisi

| # | Risk | Olasılık | Etki | Öncelik |
|---|------|----------|------|---------|
| R-01 | Ödeme entegrasyonu eksik | 🔴 Yüksek | 🔴 Kritik | **P0** |
| R-02 | e-Fatura eksik | 🔴 Yüksek | 🔴 Kritik | **P0** |
| R-03 | Üretimde test OTP | 🔴 Yüksek | 🔴 Kritik | **P0** |
| R-04 | Sıfır test | 🔴 Yüksek | 🔴 Kritik | **P0** |
| R-05 | RLS güvenlik açığı | 🟠 Orta | 🔴 Kritik | **P1** |
| R-06 | Monitoring yok | 🔴 Yüksek | 🟠 Yüksek | **P1** |
| R-07 | CI/CD yok | 🔴 Yüksek | 🟠 Yüksek | **P1** |
| R-08 | SMS tek nokta | 🟠 Orta | 🟠 Yüksek | **P1** |
| R-09 | Migration riski | 🟡 Düşük | 🔴 Kritik | **P1** |
| R-10 | Edge Function güvenlik | 🟠 Orta | 🟠 Yüksek | **P1** |
| R-11 | Three.js performans | 🟡 Düşük | 🟡 Orta | **P2** |
| R-12 | Stil tutarsızlığı | 🔴 Yüksek | 🟡 Orta | **P2** |
| R-13 | Seed data eksik | 🔴 Yüksek | 🟡 Orta | **P2** |
| R-14 | Çevrimdışı destek | 🟡 Düşük | 🟡 Orta | **P2** |
| R-15 | Belgelendirme | 🔴 Yüksek | 🟡 Orta | **P2** |
| R-16–20 | Teknik borç | Çeşitli | 🟢 Düşük | **P3** |

---

## 🗺️ Önerilen Aksiyon Planı

### Hafta 1–2: Güvenlik & Yasal Uyum (P0)
```
[ ] R-03: Üretim OTP kodunu kaldır (1 saat)
[ ] R-02: e-Fatura (Nilvera) sandbox entegrasyonu (3 gün)
[ ] R-01: İlk ödeme provider'ı tamamla - iyzico (3 gün)
[ ] R-10: OTP rate limiting (yarım gün)
```

### Hafta 3–4: Kalite Altyapısı (P0-P1)
```
[ ] R-04: İlk test suite'ini kur (Vitest + temel modüller)
[ ] R-05: RLS policy test scripti yaz
[ ] R-07: GitHub Actions CI pipeline
[ ] R-06: Sentry entegrasyonu
```

### Hafta 5–6: Güvenilirlik (P1)
```
[ ] R-08: SMS fallback mekanizması
[ ] R-09: Migration rollback scriptleri
[ ] R-15: README + kurulum dokümantasyonu
[ ] R-13: Seed data (demo lab + standart hizmetler)
```

### Sonraki Sprint: Teknik Borç (P2-P3)
```
[ ] R-12: Legacy StyleSheet → NativeWind migration
[ ] R-11: Three.js lazy loading + code splitting
[ ] R-14: Offline cache mekanizması
[ ] R-16: ESLint konfigürasyonu
```

---

## ✅ Güçlü Yönler (Premortem'de risk olmayan alanlar)

- **Modern tech stack** — Expo 52 + Supabase + NativeWind güçlü bir temel
- **Kapsamlı DB şeması** — 70+ migration ile iş mantığı iyi modellenmiş
- **CLAUDE.md design contract** — Tutarlı UI/UX için solid kural seti
- **Multi-tenancy mimarisi** — RLS ile doğru yerde implement edilmiş
- **TypeScript strict mode** — Type güvenliği iyi seviyede
- **Modüler yapı** — 29 feature module, net sorumluluk ayrımı
- **Türkiye'ye özgü entegrasyonlar** — e-Fatura + yerel SMS provider desteği planlanmış

---

*Bu rapor, projenin production'a çıkmadan önce ele alması gereken riskleri belgelemek amacıyla hazırlanmıştır. Risk öncelikleri iş etkisi ve gerçekleşme olasılığına göre belirlenmiştir.*
