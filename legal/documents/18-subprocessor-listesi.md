# SIMAN — Alt-İşleyen (Sub-processor) Listesi

**Sürüm:** 1.0 · **Yürürlük:** 23 Temmuz 2026
**Güncelleme taahhüdü:** Bu listeye yeni bir alt-işleyen eklenmeden önce Veri
Sorumlusu kiracılar bilgilendirilir ve makul itiraz süresi tanınır.

> Bu liste, SIMAN kaynak kodundaki **gerçek** entegrasyonlardan türetilmiştir
> (tüm `https://` uç noktaları taranarak — bkz. `04-third-party-data-flow.md`).
> “Kod kanıtı” sütunu, ilgili entegrasyonun bulunduğu dosyayı gösterir.

## Aktif alt-işleyenler

| # | Alt-işleyen | Hizmet | İşlenen/aktarılan veri | Yurt dışı | Kod kanıtı |
|---|---|---|---|---|---|
| 1 | **Supabase** | Barındırma, veritabanı, kimlik doğrulama, dosya depolama | Tüm veriler | ⟦HUKUK: SUPABASE_BOLGE⟧ | `core/api/supabase.ts`, tüm edge fn |
| 2 | **Anthropic (Claude)** | Yapay zekâ asistanı + belge okuma | Sohbet, ilgili kayıtlar, belge görüntüleri (hasta adı dâhil) | **Evet (ABD)** | `functions/denty-brain`, `parse-work-order`, `parse-invoice`, `parse-receipt` |
| 3 | **Resend** | Transaksiyonel e-posta | E-posta adresi, bildirim gövdesi | **Evet** | `functions/send-email-notification` |
| 4 | **Expo** (→ Apple APNs / Google FCM) | Mobil push bildirimi | Push jetonu, bildirim başlığı/gövdesi | **Evet** | `functions/send-expo-push` |
| 5 | **Twilio** (→ WhatsApp/Meta) | WhatsApp bildirimi | Telefon no, şablon değişkenleri | **Evet** | `functions/send-whatsapp-notification` |
| 6 | **NetGSM** | SMS OTP/bildirim (varsayılan) | Telefon no, mesaj | Hayır (TR) | `functions/send-otp` |
| 7 | **İleti Merkezi** | SMS (alternatif) | Telefon no, mesaj | Hayır (TR) | `functions/send-otp` |
| 8 | **Mutlucell** | SMS (alternatif) | Telefon no, mesaj | Hayır (TR) | `functions/send-otp` |
| 9 | **Nilvera** (→ GİB) | Yasal e-Fatura | Fatura, VKN/TCKN, ünvan, adres | Hayır (TR) | `functions/efatura-send` |
| 10 | **iyzico** | Kart ile ödeme | Ödeme tutarı, alıcı referansı (kart verisi bize gelmez) | Hayır (TR) | `functions/payments-charge` |
| 11 | **BanaBiKurye** | Kurye/teslimat | Hekim adı+telefon, klinik adı+adres | Hayır (TR) | `functions/banabikurye-dispatch` |
| 12 | **Google Places API** | Adres çözümleme | Teslimat adresi metni | **Evet** | `functions/banabikurye-dispatch` |
| 13 | **Google Fonts** | Web yazı tipi | Ziyaretçi IP’si | **Evet** | web build (`scripts/inject-fonts.js`) |
| 14 | **Brandfetch** | Klinik logosu arama | Klinik adı | **Evet** | `functions/clinic-logo-search` |
| 15 | **Clearbit Logo** | Logo getirme | Alan adı | **Evet** | `functions/clinic-logo-search` |
| 16 | **Google Favicon** | Logo yedeği | Alan adı | **Evet** | `functions/clinic-logo-search` |
| 17 | **QRServer (goqr.me)** | E-postada QR görseli | Bağlantı + alıcı IP’si | **Evet** | `functions/send-email-notification` — ⚠️ **kaldırılacak (R-16)** |
| 18 | **Medit** (gelen) | Ağız-içi tarayıcı entegrasyonu | Hasta adı, tarama dosyaları | **Evet** | `functions/medit-webhook` |
| 19 | **Vercel** | Web barındırma / CDN | Web ziyaretçisi IP + user-agent | **Evet** | `vercel.json`, deploy |
| 20 | **TCMB** | Döviz kuru (kişisel veri yok) | — | Hayır (TR) | `functions/tcmb-rates` |

## Kullanılmayan (doğrulanmış yokluk)

Aşağıdaki yaygın hizmetler kodda **bulunmaz** — reklam/izleme yapılmadığının
teyididir: Sentry, Firebase, Google Analytics, PostHog, Mixpanel, Amplitude,
Segment, LogRocket, FullStory, Hotjar, Stripe, OpenAI, Google Gemini ve tüm
reklam/atıf SDK’ları.

## Açık noktalar (hukuk/operasyon)

- **DPA/SCC:** Yukarıdaki yurt dışı alt-işleyenlerle imzalı veri işleme
  sözleşmesi/aktarım mekanizması **henüz tamamlanmamıştır**; öncelik sırası:
  Anthropic, Supabase, Resend, Twilio, Expo, Medit, sonra diğerleri (R-08).
- **Supabase bölgesi:** Kod/konfigürasyondan tespit edilemedi; Supabase panelinden
  teyit edilmelidir (aktarımın gerçekleşip gerçekleşmediğini bu belirler).

---

**Sürüm 1.0 · Yürürlük: 23 Temmuz 2026**
