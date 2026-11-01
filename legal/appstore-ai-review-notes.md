# App Store — Yapay Zekâ İzni (5.1.2(i)) · İnceleme Notları ve Etiketler

Bu dosya App Store Connect'e girilecek metinleri içerir. Kod tarafı hazır:
izin kapısı, geri alma anahtarı, sunucu doğrulaması ve gizlilik metni.

## 1) App Review Notes'a yapıştır (İngilizce)

    Third-party AI disclosure (Guideline 5.1.2(i))

    The app uses Anthropic (Claude) to read uploaded invoices/receipts and dental
    work orders (OCR) and to power the in-app assistant "Simanty".

    Personal data that may be transmitted: text on the uploaded document or image,
    and — for work-order scanning — patient name, date of birth and gender, plus
    order and dentist details.

    Consent flow:
    - Before the first transmission, an in-app dialog names the provider
      (Anthropic / Claude), lists exactly what is shared, and requires an explicit
      "Allow" tap. No data leaves the device before that tap.
    - The decision is stored in an append-only consent ledger (user_consents,
      kind = 'ai_processing') together with the version of the legal document shown.
    - Users can withdraw at any time: Settings → Privacy → "AI processing" toggle
      (clinic/dentist accounts: Profile → Privacy). Withdrawal writes a new ledger
      row; AI features stop working immediately.
    - The server also verifies consent: the AI endpoints reject requests with
      HTTP 403 "AI_CONSENT_REQUIRED" when no valid consent exists, so the client
      cannot be bypassed.
    - Declining keeps the rest of the app fully usable.

    Privacy policy (lists the provider and the data shared):
    https://siman-legal.vercel.app/

    Test account: <e-posta> / <şifre>
    To see the dialog: log in → Purchases → New purchase → "Upload PDF invoice".

## 2) App Privacy (Nutrition Labels) — kontrol listesi

Veri toplama beyanında şunların işaretli olduğundan emin ol:

- Contact Info → Name (hesap + iş emrindeki hasta adı)
- Health & Fitness → Health (iş emri: hasta doğum tarihi/cinsiyeti dahil klinik bağlam)
- User Content → Photos or Videos (fatura/iş emri görselleri), Other User Content
- Identifiers → User ID
- Kullanım amacı: App Functionality
- "Data used to track you": HAYIR
- Third parties: veri işleyici olarak Anthropic (alt işleyici listesi:
  https://siman-legal.vercel.app/subisleyenler.html)

## 3) Yayın sırası (ÖNEMLİ)

1. Web deploy + yeni iOS build (izin arayüzü kullanıcıya ulaşır).
2. SONRA edge function deploy (sunucu kapısı):

       supabase functions deploy parse-invoice --project-ref kjwjxqfdsxkxgcgophdy --workdir ~/Desktop/DentalSoftware/my-expo-app --use-api
       supabase functions deploy parse-receipt --project-ref kjwjxqfdsxkxgcgophdy --workdir ~/Desktop/DentalSoftware/my-expo-app --use-api
       supabase functions deploy parse-work-order --project-ref kjwjxqfdsxkxgcgophdy --workdir ~/Desktop/DentalSoftware/my-expo-app --use-api
       supabase functions deploy denty-brain --project-ref kjwjxqfdsxkxgcgophdy --workdir ~/Desktop/DentalSoftware/my-expo-app --use-api

Ters sırada yapılırsa: izin kaydı olmayan mevcut kullanıcılarda yapay zekâ
özellikleri 403 döner ve istemcide henüz izin isteyen ekran bulunmaz.

## 4) Açık kalan küçük iş

Yayındaki politika (siman-legal) sağlayıcıyı adıyla anıyor ve açık rızadan
söz ediyor; ancak **izni geri alma** cümlesi yok. `siman-legal/ai.html`
içine bir cümle eklenmeli: izin Ayarlar → Gizlilik'ten geri alınabilir.

## 5) Arka plan konumu (Guideline 2.5.4) — App Review Notes'a EKLE (İngilizce)

    Background location (Guideline 2.5.4)

    The "location" background mode is used ONLY by the courier role, to share
    live position with the dental clinic while the courier is carrying an
    active delivery.

    - Tracking starts only when the courier has at least one active delivery
      and stops automatically when none remain — including when the app is in
      the background (the background task checks active deliveries on every
      update and stops itself).
    - While tracking, iOS shows the blue location indicator
      (showsBackgroundLocationIndicator = true).
    - No other role (lab, clinic, dentist) ever requests location in the
      background. Lab staff use "When In Use" location only for workplace
      check-in.

    How to test: log in with the courier demo account below, open
    Deliveries, start the assigned demo delivery → the blue location bar
    appears; complete the delivery → tracking stops.

    Courier demo account: <kurye e-posta> / <şifre>

Not: Kurye demo hesabına **atanmış, aktif bir test teslimatı** olmalı; yoksa
inceleyici arka plan konumunu tetikleyemez ve özelliği "kullanılmıyor" diye
işaretleyebilir.

## 6) TrueDepth / yüz verisi (Guideline 5.1.2(vi)) — App Review Notes'a EKLE (İngilizce)

Apple, ARKit yüz izleme kullanan uygulamalara bu soruları sorar. Cevabı baştan vermek incelemenin durmasını önler.

    Face data (TrueDepth / ARKit)

    The optional "3D face scan" (smile design) uses ARFaceTrackingConfiguration
    on the TrueDepth camera, started only when the dentist taps "Face Scan".
    - What is collected: a 3D face mesh (PLY) and color images of the patient's
      face, captured only during the user-initiated scan.
    - Purpose: attached to the dental work order so the lab can design the
      prosthesis / smile. It is NOT used for authentication, face recognition,
      advertising, marketing, profiling or data mining.
    - Sharing: visible only to the lab and the clinic/dentist of that order.
      It is not sent to any AI service or other third party.
    - Storage: encrypted in our hosting backend (Supabase), retained with the
      work order; deletion can be requested per our privacy policy.
    - The privacy policy describes this in the "3D yüz taraması (TrueDepth /
      ARKit)" section: https://siman-legal.vercel.app/

## 7) Mikrofon (bilgi)

Uygulama ses kaydetmez; `NSMicrophoneUsageDescription` yalnız expo-camera modülü binary'de mikrofon API'sini bağladığı için tanımlı (ITMS-90683). İzin hiç istenmez. Sorulursa bu açıklamayı ver.

