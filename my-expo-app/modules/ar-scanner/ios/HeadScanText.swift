import Foundation

// Tam kafa taraması ekran metinleri — uygulama dilinden (JS) gelir: tr · en · de · fa.
// Yerel ekran i18n katmanının dışında olduğu için metinler burada dört dilde tutulur.

struct HeadScanText {
    let lang: String
    var isRTL: Bool { lang == "fa" }

    init(lang: String?) {
        let l = (lang ?? "tr").lowercased().prefix(2)
        self.lang = ["tr", "en", "de", "fa"].contains(String(l)) ? String(l) : "tr"
    }

    private func pick(_ tr: String, _ en: String, _ de: String, _ fa: String) -> String {
        switch lang { case "en": return en; case "de": return de; case "fa": return fa; default: return tr }
    }

    var title: String { pick("Tam kafa taraması", "Full head scan", "Kopf-Rundumscan", "اسکن کامل سر") }
    var aimHint: String {
        pick("Hasta sabit otursun. Halkayı hastanın burnuna getirin ve Başlat'a dokunun.",
             "Ask the patient to sit still. Place the ring on the patient's nose and tap Start.",
             "Der Patient sitzt ruhig. Richten Sie den Ring auf die Nase und tippen Sie auf Start.",
             "بیمار ثابت بنشیند. حلقه را روی بینی بیمار بگیرید و «شروع» را بزنید.")
    }
    var start: String { pick("Başlat", "Start", "Start", "شروع") }
    var aimFailed: String {
        pick("Yüz bulunamadı. Halkayı burna getirin, 25–100 cm uzaktan.",
             "No face found. Put the ring on the nose, 25–100 cm away.",
             "Kein Gesicht erkannt. Ring auf die Nase, 25–100 cm Abstand.",
             "چهره پیدا نشد. حلقه را روی بینی بگیرید، از فاصله ۲۵ تا ۱۰۰ سانتی‌متر.")
    }
    var walkHint: String {
        pick("Hastanın etrafında yavaşça dönün: önce göz hizası, sonra yukarıdan ve aşağıdan.",
             "Walk slowly around the patient: eye level first, then from above and below.",
             "Gehen Sie langsam um den Patienten: erst auf Augenhöhe, dann von oben und unten.",
             "آرام دور بیمار بچرخید: اول هم‌سطح چشم، بعد از بالا و پایین.")
    }
    var tooFast: String { pick("Daha yavaş", "Slower", "Langsamer", "آهسته‌تر") }
    var tooClose: String { pick("Biraz uzaklaşın", "Step back a little", "Etwas zurücktreten", "کمی عقب‌تر") }
    var tooFar: String { pick("Biraz yaklaşın", "Move a little closer", "Etwas näher kommen", "کمی نزدیک‌تر") }
    var aimAtHead: String { pick("Kamerayı kafaya çevirin", "Point the camera at the head", "Kamera auf den Kopf richten", "دوربین را به سمت سر بگیرید") }
    var tracking: String { pick("Takip zayıf — yavaş hareket edin", "Tracking is weak — move slowly", "Tracking schwach — langsam bewegen", "ردیابی ضعیف است — آرام حرکت کنید") }
    var needLow: String { pick("Şimdi çene altından çekin", "Now capture from below the chin", "Jetzt von unterhalb des Kinns", "حالا از زیر چانه بگیرید") }
    var needHigh: String { pick("Şimdi tepeden çekin", "Now capture from above the head", "Jetzt von oben", "حالا از بالای سر بگیرید") }
    var ready: String { pick("Yeterli — bitirebilirsiniz", "Enough — you can finish", "Ausreichend — Sie können beenden", "کافی است — می‌توانید تمام کنید") }
    var finish: String { pick("Bitir", "Finish", "Fertig", "پایان") }
    var keepGoing: String { pick("Devam edin", "Keep going", "Weiter", "ادامه دهید") }
    var ringLow: String { pick("Alt", "Below", "Unten", "پایین") }
    var ringMid: String { pick("Göz hizası", "Eye level", "Augenhöhe", "هم‌سطح چشم") }
    var ringHigh: String { pick("Üst", "Above", "Oben", "بالا") }
    func shots(_ n: Int) -> String { pick("\(n) kare", "\(n) shots", "\(n) Aufnahmen", "\(n) عکس") }
    var building: String { pick("3D model oluşturuluyor", "Building 3D model", "3D-Modell wird erstellt", "در حال ساخت مدل سه‌بعدی") }
    var buildingNote: String {
        pick("Birkaç dakika sürebilir. Uygulamayı kapatmayın.",
             "This can take a few minutes. Keep the app open.",
             "Das kann einige Minuten dauern. App geöffnet lassen.",
             "ممکن است چند دقیقه طول بکشد. برنامه را نبندید.")
    }
    var failedTitle: String { pick("Tarama başarısız", "Scan failed", "Scan fehlgeschlagen", "اسکن ناموفق بود") }
    var close: String { pick("Kapat", "Close", "Schließen", "بستن") }
    var rescan: String { pick("Tekrar tara", "Scan again", "Erneut scannen", "اسکن دوباره") }
    var save: String { pick("Kaydet", "Save", "Speichern", "ذخیره") }
    var cameraFailed: String {
        pick("Kamera başlatılamadı.", "The camera could not start.", "Die Kamera konnte nicht starten.", "دوربین شروع نشد.")
    }
    var noModel: String {
        pick("Model üretilemedi. Daha fazla açıdan, daha yavaş tekrar deneyin.",
             "No model could be built. Try again more slowly, from more angles.",
             "Es konnte kein Modell erstellt werden. Langsamer und aus mehr Winkeln erneut versuchen.",
             "مدل ساخته نشد. آهسته‌تر و از زاویه‌های بیشتر دوباره امتحان کنید.")
    }
}
