import Foundation

// Rehberli (arka kamera) tarama ekran metinleri — tr · en · de · fa.
// Tam kafa taramasıyla ortak olanlar HeadScanText'ten gelir; yalnız bu ekrana
// özgü olanlar burada tutulur.

struct GuidedRearText {
    let base: HeadScanText
    var isRTL: Bool { base.isRTL }

    init(lang: String?) { base = HeadScanText(lang: lang) }

    private func pick(_ tr: String, _ en: String, _ de: String, _ fa: String) -> String {
        switch base.lang { case "en": return en; case "de": return de; case "fa": return fa; default: return tr }
    }

    // Ortak
    var finish: String { base.finish }
    var keepGoing: String { base.keepGoing }
    var buildingNote: String { base.buildingNote }
    var failedTitle: String { base.failedTitle }
    var close: String { base.close }
    var rescan: String { base.rescan }
    var save: String { base.save }
    var cameraFailed: String { base.cameraFailed }
    var noModel: String { base.noModel }

    // Çekim
    var aimAtFace: String {
        pick("Arka kamerayı hastanın yüzüne çevirin",
             "Point the rear camera at the patient's face",
             "Richten Sie die Rückkamera auf das Gesicht des Patienten",
             "دوربین پشت را به سمت صورت بیمار بگیرید")
    }
    var moveHint: String {
        pick("Hastanın yüzü etrafında yavaşça gezin: sol, ön, sağ, üst, alt",
             "Move slowly around the patient's face: left, front, right, above, below",
             "Bewegen Sie sich langsam um das Gesicht: links, vorne, rechts, oben, unten",
             "آرام دور صورت بیمار حرکت کنید: چپ، جلو، راست، بالا، پایین")
    }
    var qualityStandard: String { pick("Standart · 12 MP", "Standard · 12 MP", "Standard · 12 MP", "استاندارد · ۱۲ مگاپیکسل") }
    func qualityHigh(_ mp: Int) -> String {
        pick("Yüksek · \(mp) MP", "High · \(mp) MP", "Hoch · \(mp) MP", "بالا · \(mp) مگاپیکسل")
    }

    // Hazırlık ekranı
    var start: String { base.start }
    var introTitle: String { pick("Rehberli yüz taraması", "Guided face scan", "Geführter Gesichtsscan", "اسکن راهنمایی‌شدهٔ صورت") }
    var tipLight: String {
        pick("Hasta sabit otursun, yüzü eşit aydınlık olsun.",
             "Have the patient sit still, with the face evenly lit.",
             "Der Patient sitzt ruhig, das Gesicht ist gleichmäßig beleuchtet.",
             "بیمار ثابت بنشیند و صورتش یکنواخت روشن باشد.")
    }
    var tipDistance: String {
        pick("Telefonu yüzden 40–50 cm uzakta tutun.",
             "Hold the phone 40–50 cm from the face.",
             "Halten Sie das Telefon 40–50 cm vom Gesicht entfernt.",
             "گوشی را ۴۰ تا ۵۰ سانتی‌متر از صورت نگه دارید.")
    }
    var tipMove: String {
        pick("Yüzün etrafında yavaşça gezin; kareler kendiliğinden çekilir.",
             "Move slowly around the face; shots are taken automatically.",
             "Bewegen Sie sich langsam um das Gesicht; die Aufnahmen erfolgen automatisch.",
             "آرام دور صورت حرکت کنید؛ عکس‌ها خودکار گرفته می‌شوند.")
    }
    var tipSmile: String {
        pick("Hasta doğal gülüşünü sabit tutsun; taramaya tam karşıdan başlayın.",
             "Ask the patient to hold a natural smile; start the scan straight on.",
             "Der Patient hält ein natürliches Lächeln; beginnen Sie den Scan frontal.",
             "بیمار لبخند طبیعی‌اش را ثابت نگه دارد؛ اسکن را از روبه‌رو شروع کنید.")
    }
    var tipRetractor: String {
        pick("Dişlerin net çıkması için yanak ekartörü kullanabilirsiniz.",
             "A cheek retractor gives sharper teeth, if you need them.",
             "Für schärfere Zähne können Sie einen Wangenhalter verwenden.",
             "برای وضوح بیشتر دندان‌ها می‌توانید از رترکتور گونه استفاده کنید.")
    }
    var qualityLabel: String { pick("Çözünürlük", "Resolution", "Auflösung", "وضوح") }
    var qualityNote: String {
        pick("Yüksek çözünürlük daha ayrıntılıdır, model daha geç oluşur.",
             "High resolution gives more detail and a slower build.",
             "Die hohe Auflösung liefert mehr Details, das Modell entsteht langsamer.",
             "وضوح بالا جزئیات بیشتری دارد و مدل دیرتر ساخته می‌شود.")
    }
    func zones(_ done: Int, _ total: Int) -> String {
        pick("\(done)/\(total) bölge", "\(done)/\(total) zones", "\(done)/\(total) Bereiche", "\(done) از \(total) ناحیه")
    }

    // Yönlendirme — yönler ekrandaki kafa göstergesiyle aynı taraftadır
    func shots(_ n: Int) -> String { base.shots(n) }
    var tooFast: String { base.tooFast }
    var tooClose: String {
        pick("Çok yakınsınız — 40–50 cm'ye uzaklaşın", "Too close — step back to 40–50 cm",
             "Zu nah — auf 40–50 cm zurückgehen", "خیلی نزدیک هستید — تا ۴۰–۵۰ سانتی‌متر عقب بروید")
    }
    var tooFar: String {
        pick("Çok uzaksınız — 40–50 cm'ye yaklaşın", "Too far — move in to 40–50 cm",
             "Zu weit — auf 40–50 cm herangehen", "خیلی دور هستید — تا ۴۰–۵۰ سانتی‌متر نزدیک شوید")
    }
    func distance(_ cm: Int) -> String {
        pick("Yaklaşık \(cm) santimetre", "About \(cm) centimeters", "Etwa \(cm) Zentimeter", "حدود \(cm) سانتی‌متر")
    }
    var ready: String { base.ready }
    var frontFirst: String {
        pick("Tam karşıdan tutun, hasta gülümsesin",
             "Hold straight on while the patient smiles",
             "Frontal halten, der Patient lächelt",
             "از روبه‌رو نگه دارید، بیمار لبخند بزند")
    }
    var chaseDot: String {
        pick("Dönerek beyaz bölgeyi yüzün ortasına getirin",
             "Move around until the white patch is at the center of the face",
             "Gehen Sie herum, bis das weiße Feld in der Gesichtsmitte liegt",
             "بچرخید تا بخش سفید به وسط صورت برسد")
    }
    var moveLeft: String { pick("Hastanın etrafında sola dönün", "Move around the patient to the left", "Um den Patienten nach links gehen", "دور بیمار به چپ بچرخید") }
    var moveRight: String { pick("Hastanın etrafında sağa dönün", "Move around the patient to the right", "Um den Patienten nach rechts gehen", "دور بیمار به راست بچرخید") }
    var moveUp: String { pick("Telefonu kaldırın, yukarıdan çekin", "Raise the phone, capture from above", "Telefon anheben, von oben aufnehmen", "گوشی را بالا ببرید، از بالا بگیرید") }
    var moveDown: String { pick("Telefonu indirin, aşağıdan çekin", "Lower the phone, capture from below", "Telefon senken, von unten aufnehmen", "گوشی را پایین بیاورید، از پایین بگیرید") }
    var holdSteady: String { pick("Burada sabit tutun", "Hold steady here", "Hier ruhig halten", "همین‌جا ثابت نگه دارید") }
    var perfect: String {
        pick("Tüm bölgeler tamam — bitirebilirsiniz",
             "All zones covered — you can finish",
             "Alle Bereiche erfasst — Sie können beenden",
             "همه ناحیه‌ها کامل شد — می‌توانید تمام کنید")
    }
    var limitReached: String {
        pick("Kare sınırına ulaşıldı — bitirebilirsiniz",
             "Shot limit reached — you can finish",
             "Aufnahmelimit erreicht — Sie können beenden",
             "به سقف تعداد عکس رسیدید — می‌توانید تمام کنید")
    }
    var limitTooFew: String {
        pick("Kare sınırı doldu ama kapsama eksik. Tekrar tarayın.",
             "Shot limit reached but coverage is incomplete. Scan again.",
             "Aufnahmelimit erreicht, aber die Abdeckung ist unvollständig. Erneut scannen.",
             "سقف عکس پر شد ولی پوشش کامل نیست. دوباره اسکن کنید.")
    }
    func keepGoing(_ percent: Int) -> String {
        pick("Devam edin · %\(percent)", "Keep going · \(percent)%", "Weiter · \(percent) %", "ادامه دهید · \(percent)٪")
    }

    // Model oluşturma
    func building(_ percent: Int) -> String {
        pick("3D model oluşturuluyor… %\(percent)",
             "Building 3D model… \(percent)%",
             "3D-Modell wird erstellt… \(percent) %",
             "در حال ساخت مدل سه‌بعدی… \(percent)٪")
    }
    var cancel: String { pick("İptal", "Cancel", "Abbrechen", "لغو") }
    var cancelBuildTitle: String {
        pick("Model oluşturma durdurulsun mu?",
             "Stop building the model?",
             "Modellerstellung abbrechen?",
             "ساخت مدل متوقف شود؟")
    }

    // Önizleme
    var colorOn: String { pick("Renkli", "Color", "Farbe", "رنگی") }
    var colorOff: String { pick("Renksiz", "No color", "Ohne Farbe", "بدون رنگ") }
    var previewHint: String {
        pick("Kaydetmeden önce diş bölgesini renksiz kontrol edin.",
             "Check the teeth without color before saving.",
             "Prüfen Sie die Zähne ohne Farbe, bevor Sie speichern.",
             "پیش از ذخیره، ناحیهٔ دندان‌ها را بدون رنگ بررسی کنید.")
    }

    // Çıkış onayı
    var exitTitle: String {
        pick("Taramadan çıkılsın mı?", "Leave the scan?", "Scan verlassen?", "از اسکن خارج می‌شوید؟")
    }
    var discardNote: String {
        pick("Çekilen kareler silinir.",
             "The captured shots will be deleted.",
             "Die Aufnahmen werden gelöscht.",
             "عکس‌های گرفته‌شده حذف می‌شوند.")
    }
    var exit: String { pick("Çık", "Leave", "Verlassen", "خروج") }
    var stay: String { pick("Devam et", "Continue", "Fortfahren", "ادامه") }

    // Hata
    var retry: String { pick("Tekrar dene", "Try again", "Erneut versuchen", "تلاش دوباره") }

    // Kamera izni
    var permissionTitle: String {
        pick("Kamera izni gerekli", "Camera access needed", "Kamerazugriff erforderlich", "دسترسی به دوربین لازم است")
    }
    var permissionBody: String {
        pick("3D tarama için Ayarlar'dan kamera erişimine izin verin.",
             "Allow camera access in Settings to run a 3D scan.",
             "Erlauben Sie den Kamerazugriff in den Einstellungen, um einen 3D-Scan zu starten.",
             "برای اسکن سه‌بعدی، در تنظیمات به دوربین دسترسی بدهید.")
    }
    var openSettings: String { pick("Ayarları aç", "Open Settings", "Einstellungen öffnen", "باز کردن تنظیمات") }
}
