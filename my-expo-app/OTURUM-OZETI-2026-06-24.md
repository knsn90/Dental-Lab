# Oturum Özeti — 2026-06-24 (Siman)

Bu oturumda yapılan tüm değişikliklerin özeti. Tüm işler `tsc`-temiz ve canlı önizlemede doğrulandı; aşağıda belirtilen sürümler prod'a (siman.app) deploy edildi.

---

## 1. Sipariş Detayı — Timeline & Aşama Kartı

- **Mobil timeline** artık desktop'la aynı **macro adımları** gösteriyor: `Alındı · Üretim · Final QC · Kurye · Teslim` (elden teslimde Kurye'siz) + otomatik ikonlar. Paylaşımlı `StepsTimelineX` bileşeni mobile taşındı.
  - `modules/orders/screens/OrderDetailMobileHandoff.tsx`, `modules/orders/screens/OrderDetailScreenV2.tsx`
- **Mobil "şu an aşama" kartı** desktop kartının bilgilerini içeriyor: **ZAMANLAMA** (Operatör/Kuyruk dk) + **AŞAMA DETAYLARI** (açılır liste, durum noktalı).
- Aktif aşama ilerlemesi düzeltildi (yanlış aşamada gösterme sorunu giderildi).

## 2. Sipariş Detayı — Çalışma & Diş Şeması

- **Desktop ÇALIŞMA tablosu** artık her `order_item`'ı **ayrı satırda** gösteriyor (farklı işler ayrı satır; kendi diş çipleri + adet + ilerleme). `tooth_numbers` yoksa eski tek-satıra düşer.
- **Mobil dişe-tıklama** düzeltildi: eskiden hep ilk item'ı gösteriyordu; artık tıklanan dişin **gerçek işini** (`tooth_numbers` eşleşmesi) gösteriyor.
- Tüm bu bölümler 5 panelde + root'ta tek paylaşımlı `OrderDetailScreenV2`'den geldiği için **her panele otomatik** uygulandı.

## 3. Mesajların Öne Çıkarılması

- **Sipariş içi sohbet**: header butonu okunmamışta accent-çerçeveli "Mesaj" pill + kırmızı sayı; "Mesaj" sekmesinde okunmamış rozeti.
- **Dashboard mesaj kartı**: yeni paylaşımlı `core/ui/mobile/UnreadMessagesCard.tsx` → **5 panelin** (Lab/Klinik/Hekim/Admin/Station) dashboard'una eklendi, her biri kendi accent rengiyle; son konuşmalar + okunmamış vurgusu.
- **Global rozet** zaten mevcuttu (TopActionBar + Tüm Menü).
- *Bekleyen:* uygulama-içi toast / gerçek push (`expo-notifications`) — ayrı faz.

## 4. KPI Kartları — Yeniden Tasarım

- 5 panelin mobil dashboard'undaki `Kpi` bileşeni referans stiline çevrildi: radius 24, büyük sayı (34), **ikon dairesi** (accent-tint), vurgulu kart **accent-dolu** (her panel kendi rengi). Açık accent'lerde metin otomatik koyulaşır (`onAccentInk` luminance).
- İkonlar: Aktif sipariş→pano, Bugün biten/Tamamlanan→tik, Onay→dosya-tik, Hekim→steteskop, Aktif iş→liste.
- Lab dashboard karşılama bloğu yukarı çekildi (header boşluğu 112→88).

## 5. Görsel Önizleme (Lightbox)

- Yeni `core/ui/ImageLightbox.tsx`: **zoom** (desktop scroll + mobil pinch), **pan**, **next/prev** (buton + klavye ←/→ + mobil kaydırma), **safe-area** uyumlu başlık, çift-tık zoom, %gösterge.
- HTML tasarım viewer header'ı da safe-area uyumlu yapıldı (çentikle çakışma giderildi).
- Web (RN-web) → hem desktop hem mobil-web/PWA. *Native lightbox ayrı iş.*

## 6. Çoklu Dil (i18n) — 4 Dil

- **Diller:** Türkçe (varsayılan) · English · Deutsch · فارسی (Farsça).
- **Çıkarım hattı genişletildi** (`scripts/extract-ui-strings.js`): JSXText + prop + **Türkçe diakritik içeren tüm string/template literal**'ler + `.ts` dosyaları. Toplam **5470** UI string.
- **Runtime sözlükleri** (`core/i18n/locales/auto.{en,de,fa}.json`): 5470 string × 3 dil; paralel alt-ajanlarla çevrildi, index-merge ile birleştirildi (anahtarlar bozulmadan).
- **i18next katalogları** (`core/i18n/locales/{en,de,fa}.json`): 703 anahtar; **interpolasyonlu** `t()` string'lerini de çözer (ör. "3 Aufträge heute in Produktion").
- **Kayıt:** `SUPPORTED=['tr','en','de','fa']`, BCP-47 (tr-TR/en-US/de-DE/fa-IR), `autoTranslate` DICTS, i18next `resources`, `isRTL()` helper.
- **Dil tercihi** her zaman TR başlar, Ayarlar'dan değişince AsyncStorage'da saklanır.
- **Dil seçici** Ayarlar > Genel'de **dropdown** (4 dil).
- Tarih/sayı biçimleri locale'e uyumlu (Farsça'da Farsça takvim/rakam dahil).
- *Bekleyen:* **Farsça RTL düzen** (sağdan-sola aynalama) — metin çevrildi, düzen hâlâ LTR; tam RTL ayrı cila adımı (`I18nManager`/web `dir`, sabit left/right → start/end).

## 7. Diğer

- Ayarlar > Genel kart yan boşlukları responsive (mobil 16 / desktop 28) — alt başlıkla hizalı.

---

## Deploy

`npm run deploy` zinciri: `rm -rf dist .expo .vercel/output` + `NODE_OPTIONS=--max-old-space-size=8192 vercel build --prod` + `vercel deploy --prebuilt --prod --yes`. Prod: **https://siman.app**. (Ham deployment URL'leri 401 verir — normal; siman.app alias'ı açık.)

## Bilinen Sınırlar / Sonraki Adımlar

1. Farsça **RTL düzen** cilası.
2. Mesajlar için **push/in-app toast**.
3. **Native** (iOS/Android app) görsel lightbox bileşeni.
4. İçinde değişken olan birkaç birleşik metin, katalogda anahtarı yoksa çevrilmeyebilir — fark edilen yerler katalog/sözlüğe eklenir.
