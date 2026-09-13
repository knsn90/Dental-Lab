# App Store Başvuru Rehberi — Siman (iOS)

> Bu doküman App Store Connect'te **elle doldurulacak** her alanı paste-edilebilir
> halde verir. Sıra: metadata gir → build TestFlight'a düşünce seç → Review'a gönder.
>
> **⚠️ build 24+ gerekiyor:** Arka plan konumu (`UIBackgroundModes: location` + Always
> izni) ve Universal Links bu sürümde eklendi → yeni bir EAS production build alınmalı;
> App Privacy'de **Precise Location** beyanı + §10 arka plan gerekçesi ZORUNLU (aksi hâlde ret).

---

## 0. Kimlik (hazır)

| Alan | Değer |
|---|---|
| App adı | **Siman** |
| Bundle ID | `com.nexadent.app` |
| ASC App ID | `6772297713` |
| Apple Team | `772P3JLQ7W` (Kaan Esen, Individual) |
| Sürüm | `1.0.0` · Build `22` |

---

## 1. App Information

- **Name:** Siman
- **Subtitle (30 kr):** `Diş laboratuvarı yönetimi`
- **Primary Category:** Business
- **Secondary Category:** Productivity
  - _Not: "Medical" seçilirse Apple ek inceleme (Guideline 1.4.1) ister — B2B üretim/takip
    aracı olduğu için Business daha güvenli ve doğru._
- **Content Rights:** Üçüncü taraf içerik yok.

## 2. Pricing & Availability

- **Price:** Free (uygulama ücretsiz; laboratuvar hizmeti App Store dışı B2B faturalama)
- **Availability:** Türkiye (+ istersen tümü)

## 3. URL'ler (hepsi canlı, 200)

| Alan | URL |
|---|---|
| **Privacy Policy URL** (zorunlu) | `https://siman.app/legal/gizlilik` |
| Support URL (zorunlu) | `https://siman.app/legal/hakkimizda` |
| Marketing URL (ops.) | `https://siman.app` |

## 4. Promotional Text (170 kr)

```
Diş laboratuvarınızın tüm iş akışını tek yerde yönetin: sipariş alımı, üretim
aşamaları, stok, fatura ve kurye takibi. Klinik, hekim ve teknisyen tek platformda.
```

## 5. Description

```
Siman, diş laboratuvarları ile klinik ve hekimleri tek platformda buluşturan
uçtan uca laboratuvar yönetim uygulamasıdır.

• Sipariş & İş Emri: Klinik ve hekimler kolayca iş emri oluşturur; laboratuvar
  siparişleri tek ekrandan yönetir.
• Üretim Takibi: Her siparişin aşamalarını (tasarım, frezeleme, porselen, teslim)
  gerçek zamanlı izleyin; teknisyen atayın, süreleri ölçün.
• Stok & Malzeme: Malzeme tüketimini aşama bazında düşün, stok uyarıları alın.
• Finans: Çoklu döviz fatura, cari hesap, tahsilat ve kâr/zarar raporları.
• Kurye & Teslimat: Sipariş bacaklarını ve canlı kurye konumunu takip edin.
• Bildirimler: Aşama, teslimat ve onay bildirimleri anlık ulaşır.
• Çok dilli: Türkçe, İngilizce, Almanca ve Farsça arayüz.

Siman; laboratuvar, klinik, hekim, teknisyen ve yönetici rolleri için ayrı
panellerle çalışır ve verilerinizi satır düzeyi güvenlik (RLS) ile korur.
```

## 6. Keywords (100 kr, virgülle)

```
diş,laboratuvar,protez,sipariş,iş emri,klinik,hekim,teknisyen,fatura,stok,üretim,dental
```

## 7. Screenshots — ⚠️ ELLE ÇEKİLECEK (asıl manuel iş)

Zorunlu boyutlar (en az 1, en fazla 10 adet, PNG/JPG):

| Cihaz | Çözünürlük | Zorunlu mu? |
|---|---|---|
| iPhone 6.9" (15/16 Pro Max) | 1290 × 2796 | **Evet** |
| iPad 13" (Pro) | 2064 × 2752 | **Evet** — `supportsTablet: true` olduğu için |

> **Karar noktası:** iPad screenshot'ı istemiyorsan `app.json → ios.supportsTablet: false`
> yapıp yeniden build almak gerekir. Build 22 `true` ile derleniyor → şimdilik **iPad
> screenshot'ı da hazırlamak** en hızlısı (yeniden build gerektirmez).

Önerilen 5-6 ekran: Dashboard → Siparişler listesi → Sipariş detayı (aşama timeline)
→ Yeni sipariş / Simanty → Finans/Fatura → Stok.

Çekim: `open -a Simulator` → iPhone 16 Pro Max & iPad Pro 13" → `Cmd+S` (Desktop'a kaydeder).
Demo verisi dolu bir hesapla giriş yap ki ekranlar boş görünmesin.

## 8. App Privacy (Data Collection anketi)

**Data used to track you:** Hayır (üçüncü taraf reklam/izleme yok → "Data Not Used to Track You").

Toplanan veriler (hepsi **App Functionality** amaçlı, kullanıcıya **bağlı**, izleme için **değil**):

| Veri türü | Örnek |
|---|---|
| **Location (Precise)** | **Kurye rolünde, yalnız aktif teslimat sırasında (arka plan dahil) konum** |
| Contact Info | Ad-soyad, e-posta, telefon |
| User Content | İş emri/tarama fotoğrafları, mesajlar |
| Identifiers | Kullanıcı ID |
| Usage Data | Uygulama içi işlem/aktivite logları |

> **⚠️ Konum ZORUNLU beyan (build 24+ ile eklendi):** Uygulama artık kurye rolünde
> **arka plan konumu** (`UIBackgroundModes: location`) toplar. Bu yüzden App Privacy
> anketinde **Precise Location → App Functionality → kullanıcıya bağlı, izleme DEĞİL**
> işaretlenmelidir. Beyan edilmezse Apple reddeder. Konum yalnız aktif teslimat taşıyan
> kurye için toplanır; diğer roller için HİÇ toplanmaz. (§10 review notuna gerekçe eklendi.)

> **⟦KARAR⟧ Sağlık verisi:** Uygulama hastaya ait sınırlı üretim bilgisi (vaka referansı,
> diş no, renk) tutar. Bu kullanıcının _kendi_ sağlık verisi değil, profesyonelin girdiği
> B2B üretim verisidir. Apple'ın "Health & Fitness" tipi kullanıcının kendi verisi içindir;
> bu veriyi **"Other User Content"** altında beyan etmek doğru ve güvenli. (HealthKit
> kullanılmıyor.) Yine de reddi önlemek için Review notuna bir cümle ekleyeceğiz (§10).

## 9. Age Rating

Tüm sorulara **None** → **4+**. (Şiddet/müstehcenlik/kumar yok; tıbbi/tedavi tavsiyesi
vermez, üretim takip aracıdır.)

## 10. App Review Information

- **Sign-in required:** ✅ Evet
- **Demo hesap:** ⚠️ Oluşturulacak — reviewer'ın tüm panelleri görebileceği, örnek verisi
  dolu bir hesap. (Öneri: `appstore.review@siman.app` / güçlü parola; admin veya lab rolü.)
- **Contact:** Kaan Esen · telefon · e-posta
- **Notes (paste):**
```
Siman is a B2B dental-lab management app used by dental laboratories, clinics,
dentists, and technicians. Sign-in is required; demo credentials are provided above.

The app stores limited dental production data (case reference, tooth number, shade)
entered by professionals to fulfill lab orders. This is not the user's own health
data and HealthKit is not used. All data is protected with row-level security.

Background location (couriers only): a user with the Courier role can share precise
location — including while the app is backgrounded — ONLY when they are carrying an
active delivery, so the lab and clinic can track the shipment in real time. Tracking
starts when a delivery is picked up and stops automatically once no active delivery
remains. Location is never collected for any other role and is never used for
advertising or tracking. To test: sign in with the courier demo account, open an
assigned delivery, and mark it picked up.

Payments for lab services are handled B2B outside the App Store (no in-app purchases).
Account deletion is available in-app (Profile → Delete Account; couriers: Performance →
Settings → Delete Account), compliant with 5.1.1(v).
```

> **Not (build 24+):** Universal Links de eklendi — `siman.app/order/*` ve
> `/delivery/*` derin bağlantıları uygulamayı açar (AASA canlı: `siman.app/.well-known/
> apple-app-site-association`). Bu review'da alan gerektirmez; yalnız native build'de aktifleşir.

---

## Gönderim akışı (özet)

1. ☐ §1-6, §8-10 alanlarını App Store Connect'e gir (URL'ler hazır).
2. ☐ Demo hesabı oluştur, örnek veri gir, kimlik bilgilerini §10'a yaz.
3. ☐ iPhone 6.9" + iPad 13" screenshot'ları çek, yükle.
4. ☐ Build 22 TestFlight'a düşünce sürüme ekle (`eas submit ... --latest`).
5. ☐ "Add for Review" → "Submit for Review".
