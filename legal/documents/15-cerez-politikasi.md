# SIMAN — Çerez ve Yerel Depolama Politikası

**Sürüm:** 1.0 · **Yürürlük:** 23 Temmuz 2026

> Bu politika, koddan doğrulanan gerçek durumu yansıtır: SIMAN’da **reklam veya
> izleme amaçlı çerez/teknoloji kullanılmaz.** Tespit yöntemi: tüm kaynak kodunda
> analitik/reklam SDK’sı taraması (Sentry, Firebase, Google Analytics, PostHog,
> Mixpanel, Amplitude, Segment vb. **bulunmadı**) ve kimlik-doğrulama depolama
> mekanizmasının incelenmesi.

---

## 1. Kapsam

Bu politika şunları kapsar:
- **Uygulama** (`siman.app`, `app.nexadentlab.com`) — Expo/React Native tabanlı
  web ve mobil istemci.
- **Hukuki doküman sitesi** (`siman-legal.vercel.app`) — statik HTML.

## 2. Kullandığımız Teknolojiler

| Teknoloji | Tür | Amaç | Süre |
|---|---|---|---|
| Kimlik-doğrulama oturumu (Supabase) | **Zorunlu** yerel depolama (web’de `localStorage`, mobilde `AsyncStorage`) | Oturumunuzu açık tutmak (JWT + yenileme jetonu) | Çıkış yapana kadar |
| Uygulama tercihleri | **Zorunlu/işlevsel** yerel depolama | Son panel, dil, taslak sipariş, arayüz tercihleri | Kullanıcı temizleyene kadar |
| — | Reklam/izleme çerezi | **KULLANILMIYOR** | — |
| — | Üçüncü-taraf analitik | **KULLANILMIYOR** | — |

**Not:** SIMAN, oturum bilgisini klasik “çerez” yerine büyük ölçüde tarayıcı
`localStorage` / mobil `AsyncStorage` üzerinde tutar. İşlev olarak bunlar
“zorunlu/işlevsel çerez” kategorisine denktir ve hizmetin çalışması için
gereklidir; onay gerektirmez.

## 3. Üçüncü Taraf İstekleri

Aşağıdaki hâllerde tarayıcınız/cihazınız üçüncü-taraf sunuculara istek yapabilir
ve bu istekler IP adresinizi taşıyabilir (çerez tabanlı izleme değildir):

- **Google Fonts** — web’de yazı tipi yüklenmesi.
- **QRServer (goqr.me)** — bildirim e-postalarındaki QR kod görselinin
  yüklenmesi (*kaldırılması planlanıyor*).
- **Vercel** — web/CDN barındırma istekleri.

## 4. Onay

Yalnızca zorunlu/işlevsel teknolojiler kullanıldığından ve reklam/izleme çerezi
bulunmadığından, ayrı bir çerez onay bandı (cookie banner) hukuken zorunlu
değildir. İleride pazarlama sitesi veya analitik eklenirse, bu politika
güncellenir ve **açık rıza temelli bir çerez onay mekanizması** eklenir.

## 5. Yerel Depolamayı Yönetme

Tarayıcı ayarlarınızdan `localStorage`/çerezleri temizleyebilir; mobilde uygulama
verisini temizleyebilir veya çıkış yapabilirsiniz. Bu, sizi oturumdan düşürür ve
tercihlerinizi sıfırlar.

---

**Sürüm 1.0 · Yürürlük: 23 Temmuz 2026**
