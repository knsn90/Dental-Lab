// Bildirim tercihleri — tipler ve varsayılanlar (saf; içe aktarma yok, node --test ile sınanır).
// Mağaza: notificationPrefsStore.ts (aynı adları yeniden dışa aktarır).

export type NotificationCategory =
  | 'new_order'    | 'order_status'    | 'chat'      | 'approval'
  | 'payment'      | 'stock'           | 'delivery'  | 'paper_order'
  | 'material_request' | 'order_watch' | 'stage_critical' | 'stock_count'
  | 'implant_parts' | 'scan_annotation' | 'account' | 'scan_schedule'
  | 'review_request' | 'review_problem' | 'review_minor'
  | 'review_low' | 'review_low_reminder';

export type NotificationChannel = 'in_app' | 'browser_push' | 'email' | 'whatsapp';

export interface CategoryToggles {
  in_app:       boolean;
  browser_push: boolean;
  email:        boolean;
  whatsapp:     boolean;
}

export interface NotificationPrefs {
  master_enabled: boolean;
  channels:   CategoryToggles;
  categories: Record<NotificationCategory, CategoryToggles>;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  master_enabled: true,
  channels:   { in_app: true,  browser_push: false, email: true,  whatsapp: true },
  // Email default — "önemliler" açık (new_order/approval/payment/delivery),
  // chat & order_status & stock & paper_order email'i kapalı (spam olmasın).
  //
  // WhatsApp default AÇIK — yalnız Meta ONAYLI şablonu olan kategorilerde
  // (new_order · delivery · approval · payment · account · review_problem) gerçekten mesaj çıkar; diğer
  // kategorilerde şablon olmadığı için gönderim zaten atlanır. Numara olarak
  // kullanıcının kayıtlı telefonu kullanılır (profiles.whatsapp_phone boşsa
  // profiles.phone → send-whatsapp-meta'daki fallback). Sunucu tarafı da
  // "yalnızca açıkça false ise sustur" mantığıyla çalışıyor; istemci
  // varsayılanı false kaldığı sürece ayarlarını bir kez kaydeden kullanıcıda
  // WhatsApp sessizce kapanıyordu (2026-09-24).
  categories: {
    new_order:    { in_app: true,  browser_push: true,  email: true,  whatsapp: true },
    order_status: { in_app: true,  browser_push: false, email: false, whatsapp: false },
    chat:         { in_app: true,  browser_push: true,  email: false, whatsapp: false },
    approval:     { in_app: true,  browser_push: true,  email: true,  whatsapp: true },
    payment:      { in_app: true,  browser_push: false, email: true,  whatsapp: true },
    stock:        { in_app: true,  browser_push: false, email: false, whatsapp: false },
    delivery:     { in_app: true,  browser_push: false, email: true,  whatsapp: true },
    paper_order:  { in_app: true,  browser_push: true,  email: false, whatsapp: false },
    material_request: { in_app: true, browser_push: true,  email: false, whatsapp: false },
    // İmplant parçaları (scan body, dijital analog …) — klinik aksiyon alacak:
    // talep maili gider, diğer adımlar yalnız uygulama içi.
    implant_parts: { in_app: true, browser_push: true, email: true, whatsapp: false },
    // Tarama üzerine 3D kalem notu — karşı taraf için aksiyon işareti, ama
    // yazışma temposunda geliyor: uygulama içi + push, mail YOK (gürültü).
    scan_annotation: { in_app: true, browser_push: true, email: false, whatsapp: false },
    // Günlük geciken + beklemedeki iş digest'i (yalnız admin/lab-manager alır) — önemli: in-app + push + email açık, whatsapp opt-in.
    order_watch:  { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
    // Kritik aşama tamamlandı (hekim/klinik/müdür/admin) — önemli kilometre taşı: in-app + push + email açık.
    stage_critical: { in_app: true, browser_push: true, email: true, whatsapp: false },
    // Fiziksel sayım hatırlatması (yalnız admin/lab-manager) — aksiyon gerektirir,
    // ayda birkaç kez çıkar: in-app + push + email açık, whatsapp kapalı.
    stock_count:  { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
    // Tarama programı (sabah bugün / akşam yarın; admin, lab yöneticisi, teknisyen) — WhatsApp gönderilmez.
    scan_schedule: { in_app: true, browser_push: true, email: true, whatsapp: false },
    // Hesap açıldı (lab onayı) — işlemsel: sunucu e-postayı tercihten bağımsız atar.
    account:      { in_app: true,  browser_push: true,  email: true,  whatsapp: true },
    // "İşinizi değerlendirin" (hekim/klinik) — hatırlatma: uygulama içi + push, mail yok.
    review_request: { in_app: true, browser_push: true, email: false, whatsapp: false },
    // Hekim WhatsApp'tan "Sorun var" dedi (lab) — aksiyon gerektirir: mail de gider.
    // WhatsApp AÇIK: Meta lab şablonu is_sorunu_lab var; gönderici opt-out (yukarıdaki not).
    review_problem: { in_app: true, browser_push: true, email: true,  whatsapp: true },
    // Eski: "Küçük düzeltme" (2026-11-04'ten beri yazılmaz; eski bildirimler için kalır).
    review_minor:   { in_app: true, browser_push: true, email: false, whatsapp: false },
    // Düşük puan (lab yöneticisi) — uygulama içi + push; Meta şablonu dusuk_puan_lab. Mail yok.
    review_low:     { in_app: true, browser_push: true, email: false, whatsapp: true },
    // Düşük puan 2 gündür aranmadı (lab yöneticisi) — Meta şablonu dusuk_puan_hatirlatma. Mail yok.
    review_low_reminder: { in_app: true, browser_push: true, email: false, whatsapp: true },
  },
};
