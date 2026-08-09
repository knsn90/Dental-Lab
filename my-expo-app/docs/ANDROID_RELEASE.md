# Android — Play Store Yayın Runbook'u (Siman)

Durum (2026-07-24): Uygulama Android'de **build'lenebilir ve dahili test edilmiş**
(EAS'te `preview` APK'ları var, en son 3 Haziran 2026). **Play Store'da DEĞİL.**
Eksik iki şey: (1) FCM = native push, (2) Play Store submit kimliği + AAB build.

| Alan | Değer |
|---|---|
| Paket adı | `com.nexadent.app` |
| EAS proje | `@kaanesen/dental-lab-app` (projectId `4eccdeb0-…`) |
| versionCode | Uzaktan yönetiliyor (`appVersionSource: remote`, `autoIncrement`) |
| Native push | `expo-notifications` + edge fn `send-expo-push` (FCM kimliği ŞART) |

Kod/konfig tarafı hazır (bu commit): `eas.json`'a Android submit config eklendi,
secret dosyalar `.gitignore`'a alındı. Kalan adımlar **senin Firebase + Google Play
hesabını** gerektiriyor — aşağıda sırayla.

---

## 1) FCM kur (Android native push için ŞART)

Android'de push, kendi Firebase Cloud Messaging kimliğinle çalışır (Expo'nun eski
FCM'i kapandı). İki parça: build'e giren `google-services.json` + EAS'e yüklenen
FCM V1 servis hesabı.

1. **Firebase projesi:** https://console.firebase.google.com → Add project (mevcut
   Google Cloud projeni de seçebilirsin).
2. **Android app ekle:** package name **`com.nexadent.app`** (birebir aynı olmalı).
3. **`google-services.json` indir** → proje köküne koy:
   `~/Desktop/DentalSoftware/my-expo-app/google-services.json`
   (`.gitignore`'da — commit edilmez.)
4. **app.json'a referans ekle** — `expo.android` bloğuna şu satır:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
   > ⚠️ Bu satırı **ancak dosyayı koyduktan sonra** ekle. Dosya yokken Android
   > build'i patlar (şu an bu yüzden eklemedik — mevcut preview build'i bozmasın).
5. **FCM V1 servis hesabını EAS'e yükle:** Firebase → Project settings → Service
   accounts → "Generate new private key" (JSON iner). Sonra:
   ```bash
   eas credentials
   # Platform: Android → Push Notifications: FCM V1 → yeni JSON'u yükle
   ```
6. Doğrula: yeni build sonrası fiziksel Android cihazda test push
   (`send-expo-push` üzerinden bir bildirim tetikle).

---

## 2) Google Play submit kimliği

`eas.json` → `submit.production.android` hazır; yalnız servis hesabı dosyası lazım:
```json
"android": { "serviceAccountKeyPath": "./google-play-service-account.json", "track": "internal" }
```

1. **Play Console** hesabı (tek seferlik $25) — https://play.google.com/console
2. Uygulama oluştur: ad "Siman", paket `com.nexadent.app`.
3. **Servis hesabı:** Play Console → Setup → API access → yeni servis hesabı
   (Google Cloud'da açılır) → JSON anahtarını indir → köke koy:
   `google-play-service-account.json` (`.gitignore`'da).
4. Play Console'da o servis hesabına **Release yetkisi** ver.

---

## 3) Production AAB build + submit

```bash
# 1. Play Store için AAB üret (production profili → varsayılan app-bundle)
eas build --platform android --profile production

# 2. Build bitince Play Store'a gönder (internal track)
eas submit --platform android --profile production --latest
```

- İlk yüklemeyi Play Console'da **Internal testing** track'inde yaparsın; sorunsuzsa
  Closed → Production'a yükseltirsin.
- İlk sürümde Play Console **App signing**'i (Google-managed) kabul et.
- `versionCode` otomatik artar (`autoIncrement`) — elle uğraşma.

---

## Play Console için gereken içerikler (ilk yayın)
- Gizlilik Politikası URL'si (KVKK/GDPR belgelerimiz var — `legal/documents/`)
- **Hesap silme** akışı zaten CANLI (5.1.1 — App Store için yapıldı, Play da ister)
- Uygulama ikonu (512×512), feature graphic (1024×500), ekran görüntüleri (≥2)
- Veri güvenliği formu (topladığımız veriler: hesap, kullanım, kamera/mikrofon)
- İçerik derecelendirme anketi

---

## Özet checklist
- [x] eas.json Android submit config (bu commit)
- [x] .gitignore secret dosyalar (bu commit)
- [ ] Firebase projesi + `google-services.json` (kökte)
- [ ] app.json'a `googleServicesFile` satırı (dosya konunca)
- [ ] FCM V1 servis hesabı → `eas credentials`
- [ ] Play Console hesabı + uygulama
- [ ] `google-play-service-account.json` (kökte)
- [ ] `eas build -p android --profile production`
- [ ] `eas submit -p android --profile production --latest`
