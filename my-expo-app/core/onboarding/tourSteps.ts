// core/onboarding/tourSteps.ts
// First-login tour copy (Turkish). Two acts:
//   1) Panel gezisi — ana sayfadaki ana butonları tanıt (spotlight).
//   2) İnteraktif form turu — "Yeni sipariş" formunu açıp adım adım, alan alan
//      birlikte gez (action: openNewOrder / formStep). Hedefler:
//      panel nav → app/(doctor|clinic)/_layout.tsx (useTourTarget/getItemRef);
//      form içi → modules/orders/screens/NewOrderScreen.tsx (tour-no-*).

import type { TourStep } from './onboardingStore';

export const DOCTOR_TOUR_STEPS: TourStep[] = [
  // ── 1. Perde: panel gezisi ──────────────────────────────────────────────
  {
    id: 'welcome',
    title: "Siman'a hoş geldin 👋",
    body:
      'Bu panel, laboratuvarınla arandaki tüm dijital iş akışının merkezi: ' +
      'sipariş açar, üretimi anlık izler ve lab ekibiyle konuşursun. Gel, ' +
      'önce ana butonları tanıyalım — sonra birlikte ilk siparişini girelim. ' +
      'İstediğin an sağ üstteki "Atla" ile çıkabilirsin.',
  },
  {
    id: 'new-order',
    targetId: 'tour-new-order',
    title: 'Buradan yeni sipariş açarsın',
    body:
      'En sık kullanacağın buton bu. Tıkladığında 4 adımlık bir sihirbaz ' +
      'açılır: hasta bilgisi → diş & iş seçimi → çalışma yöntemi → özet. ' +
      'Birazdan bu formu birlikte, adım adım dolduracağız.',
  },
  {
    id: 'orders',
    targetId: 'tour-orders',
    title: 'Vakalarını buradan takip edersin',
    body:
      'Gönderdiğin her iş burada bir kart olur. Durumu (planlama → üretim → ' +
      'kalite → teslim) canlı ilerler; karta dokununca o vakanın tüm ' +
      'detayına, dosyalarına ve geçmişine ulaşırsın.',
  },
  {
    id: 'messages',
    targetId: 'tour-messages',
    title: 'Laboratuvarla buradan konuşursun',
    body:
      'Her siparişin kendi sohbeti vardır — renk notu, fotoğraf, sesli mesaj ' +
      'ya da ölçü düzeltmesini buradan iletirsin. Lab yanıtladığında burada ' +
      'bildirim görürsün; telefonla uğraşmana gerek kalmaz.',
  },

  // ── 2. Perde: interaktif form turu ──────────────────────────────────────
  {
    id: 'start-order',
    action: { openNewOrder: true },
    title: 'Hadi ilk siparişini birlikte girelim 🚀',
    body:
      'Şimdi "Yeni sipariş" formunu açıyorum. Endişelenme — bu bir prova; ' +
      'her alanı tek tek anlatacağım, sen de yanımda doldurabilirsin. ' +
      'Başlamak için "İleri"ye bas.',
  },
  {
    id: 'no-clinic',
    action: { formStep: 1 },
    targetId: 'tour-no-clinic',
    title: 'Adım 1 · Klinik ve hekim',
    body:
      'Sen hekim olarak giriş yaptığın için klinik ve hekim bilgisi otomatik ' +
      'senin adına dolu gelir — burada bir şey yapmana gerek yok. Şimdi ' +
      'hastanı tanıtalım.',
  },
  {
    id: 'fld-name',
    targetId: 'tour-fld-name',
    title: 'Hastanın adı ve soyadı',
    body:
      'Buraya hastanın adını ve soyadını yaz — ikisi de zorunlu. İstersen şimdi ' +
      'gerçek bir hasta adı gir, birlikte devam edelim; sonra hazır "İleri"ye bas.',
  },
  {
    id: 'fld-dob',
    targetId: 'tour-fld-dob',
    title: 'Kimlik ve doğum tarihi',
    body:
      'TC/pasaport numarası isteğe bağlıdır. Doğum tarihi ise zorunlu — sağdaki ' +
      'takvim ikonuna dokunup seç. Doldurduysan "İleri" ile ilerleyelim.',
  },
  {
    id: 'fld-gender',
    targetId: 'tour-fld-gender',
    title: 'Cinsiyet ve uyruk',
    body:
      'Cinsiyeti seçmen zorunlu (tek dokunuş). Uyruk isteğe bağlıdır ama ' +
      'yabancı hastalarda faturalama için faydalı. Alttaki ikamet ve telefon ' +
      'alanları da tamamen opsiyonel.',
  },
  {
    id: 'no-teeth',
    action: { formStep: 2 },
    targetId: 'tour-no-teeth',
    title: 'Adım 2 · Diş seçimi',
    body:
      'Şema üzerinden çalışılacak dişlere dokunarak seçersin. Sağ üstteki ' +
      '"Üst çene / Alt çene / Full ağız" kısayollarıyla toplu seçim de ' +
      'yapabilirsin. Seçtiğin her diş için birazdan iş tipini belirleyeceğiz.',
  },
  {
    id: 'no-work',
    targetId: 'tour-no-work',
    title: 'Adım 2 · İş detayı ve iş listesi',
    body:
      'Seçtiğin dişe iş tipini (kron, köprü, implant üstü, protez…) ve rengini ' +
      'burada verirsin. "İş listesi"ne eklediğin her satır siparişin bir ' +
      'kalemidir; farklı dişlere farklı işler ekleyebilirsin.',
  },
  {
    id: 'no-files',
    action: { formStep: 2 },
    targetId: 'tour-no-files',
    title: 'Dosya ekle',
    body:
      'Sağ üstteki bu butondan vakaya dosya eklersin: ağız içi tarama (STL/PLY), ' +
      'röntgen, fotoğraf veya PDF. Dijital tarama yüklemek, laboratuvarın işi ' +
      'doğru başlatması için en kritik adımlardan biridir.',
  },
  {
    id: 'no-chat',
    targetId: 'tour-no-chat',
    title: 'Mesaj kutusu',
    body:
      'Bu buton vakanın kendi mesaj kutusunu açar. Renk notu, özel talimat, ' +
      'sesli mesaj ya da ek görsel gerekiyorsa buradan laboratuvara yazarsın — ' +
      'sipariş oluşmadan önce bile not bırakabilirsin.',
  },
  {
    id: 'no-how',
    action: { formStep: 3 },
    targetId: 'tour-no-how',
    title: 'Adım 3 · Çalışma yöntemi',
    body:
      'Ölçüyü nasıl ilettiğini (dijital tarama mı, fiziksel ölçü mü) ve model ' +
      'tipini burada seçersin. Sağdaki teslimat alanından da beklediğin ' +
      'teslim tarihini ve aciliyet durumunu belirtirsin.',
  },
  {
    id: 'no-summary',
    action: { formStep: 4 },
    targetId: 'tour-no-summary',
    title: 'Adım 4 · Özet ve gönderim',
    body:
      'Son adımda her şeyi tek ekranda görürsün: hasta, iş kalemleri, tahmini ' +
      'ücret ve teslim tarihi. Kontrol edip alttaki "Gönder" ile laboratuvara ' +
      'iletirsin — gerisini artık lab ekibi takip eder.',
  },
  {
    id: 'done',
    action: { formStep: 1 },
    title: 'Hazırsın! 🎉',
    body:
      'Turu tamamladın. Form şimdi ilk adımda, senin için açık bekliyor — ' +
      'dilersen gerçek bilgileri girip ilk siparişini hemen oluşturabilirsin. ' +
      'Takıldığın yerde her ekranda "Denty\'ye sor" butonu yanında.',
  },
];

// Klinik (merkez klinik) turu — aynı akış, klinik yetkilisi tonuyla.
export const CLINIC_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: "Siman'a hoş geldin 👋",
    body:
      'Bu panel kliniğinin laboratuvarla tüm dijital iş akışını yönetir: ' +
      'hekimlerin adına sipariş açar, üretimi izler ve lab ile konuşursun. ' +
      'Önce ana butonları tanıyalım, sonra birlikte ilk siparişi girelim. ' +
      'İstediğin an "Atla" ile çıkabilirsin.',
  },
  {
    id: 'new-order',
    targetId: 'tour-new-order',
    title: 'Buradan yeni sipariş açarsın',
    body:
      'Klinik adına gönderdiğin işler bu butondan başlar. 4 adımlık sihirbaz ' +
      'açılır: hekim & hasta → diş & iş → çalışma yöntemi → özet. Birazdan ' +
      'bu formu birlikte, adım adım dolduracağız.',
  },
  {
    id: 'orders',
    targetId: 'tour-orders',
    title: 'Siparişleri buradan takip edersin',
    body:
      'Kliniğindeki tüm işler burada listelenir; her birinin durumu ' +
      '(planlama → üretim → kalite → teslim) canlı ilerler. Karta dokununca ' +
      'o vakanın tüm detayına ve geçmişine ulaşırsın.',
  },
  {
    id: 'messages',
    targetId: 'tour-messages',
    title: 'Laboratuvarla buradan konuşursun',
    body:
      'Her siparişin kendi sohbeti vardır — renk notu, fotoğraf, sesli mesaj ' +
      'ya da düzeltme talebini buradan iletirsin. Lab yanıtladığında bildirim ' +
      'alırsın, tek yerden yönetirsin.',
  },
  {
    id: 'start-order',
    action: { openNewOrder: true },
    title: 'Hadi ilk siparişi birlikte girelim 🚀',
    body:
      'Şimdi "Yeni sipariş" formunu açıyorum. Bu bir prova — her alanı tek tek ' +
      'anlatacağım. Başlamak için "İleri"ye bas.',
  },
  {
    id: 'fld-doctor',
    action: { formStep: 1 },
    targetId: 'tour-fld-doctor',
    title: 'Adım 1 · Hangi hekim için?',
    body:
      'Kliniğin sabittir; burada siparişin hangi hekim adına açıldığını ' +
      'seçersin. Listede hekim yoksa "Yeni diş hekimi ekle" ile buradan ' +
      'hemen ekleyebilirsin — ayrı ekrana gitmene gerek yok.',
  },
  {
    id: 'fld-name',
    targetId: 'tour-fld-name',
    title: 'Hastanın adı ve soyadı',
    body:
      'Buraya hastanın adını ve soyadını yaz — ikisi de zorunlu. İstersen şimdi ' +
      'gerçek bir hasta adı gir, birlikte devam edelim; sonra "İleri"ye bas.',
  },
  {
    id: 'fld-dob',
    targetId: 'tour-fld-dob',
    title: 'Kimlik ve doğum tarihi',
    body:
      'TC/pasaport numarası isteğe bağlıdır. Doğum tarihi ise zorunlu — sağdaki ' +
      'takvim ikonuna dokunup seç. Doldurduysan "İleri" ile ilerleyelim.',
  },
  {
    id: 'fld-gender',
    targetId: 'tour-fld-gender',
    title: 'Cinsiyet ve uyruk',
    body:
      'Cinsiyeti seçmen zorunlu (tek dokunuş). Uyruk isteğe bağlıdır ama ' +
      'yabancı hastalarda faturalama için faydalı. Alttaki ikamet ve telefon ' +
      'alanları da tamamen opsiyonel.',
  },
  {
    id: 'no-teeth',
    action: { formStep: 2 },
    targetId: 'tour-no-teeth',
    title: 'Adım 2 · Diş seçimi',
    body:
      'Şema üzerinden çalışılacak dişlere dokunarak seçersin. Sağ üstteki ' +
      '"Üst çene / Alt çene / Full ağız" kısayollarıyla toplu seçim de ' +
      'yapabilirsin. Her seçilen diş için birazdan iş tipini belirleyeceğiz.',
  },
  {
    id: 'no-work',
    targetId: 'tour-no-work',
    title: 'Adım 2 · İş detayı ve iş listesi',
    body:
      'Seçtiğin dişe iş tipini (kron, köprü, implant üstü, protez…) ve rengini ' +
      'burada verirsin. "İş listesi"ne eklediğin her satır siparişin bir ' +
      'kalemidir; farklı dişlere farklı işler ekleyebilirsin.',
  },
  {
    id: 'no-files',
    action: { formStep: 2 },
    targetId: 'tour-no-files',
    title: 'Dosya ekle',
    body:
      'Sağ üstteki bu butondan vakaya dosya eklersin: ağız içi tarama (STL/PLY), ' +
      'röntgen, fotoğraf veya PDF. Dijital tarama yüklemek, laboratuvarın işi ' +
      'doğru başlatması için en kritik adımlardan biridir.',
  },
  {
    id: 'no-chat',
    targetId: 'tour-no-chat',
    title: 'Mesaj kutusu',
    body:
      'Bu buton vakanın kendi mesaj kutusunu açar. Renk notu, özel talimat, ' +
      'sesli mesaj ya da ek görsel gerekiyorsa buradan laboratuvara yazarsın — ' +
      'sipariş oluşmadan önce bile not bırakabilirsin.',
  },
  {
    id: 'no-how',
    action: { formStep: 3 },
    targetId: 'tour-no-how',
    title: 'Adım 3 · Çalışma yöntemi',
    body:
      'Ölçünün nasıl iletildiğini (dijital tarama / fiziksel ölçü) ve model ' +
      'tipini burada seçersin. Sağdaki teslimat alanından beklenen teslim ' +
      'tarihini ve aciliyet durumunu belirtirsin.',
  },
  {
    id: 'no-summary',
    action: { formStep: 4 },
    targetId: 'tour-no-summary',
    title: 'Adım 4 · Özet ve gönderim',
    body:
      'Son adımda her şey tek ekranda: hekim, hasta, iş kalemleri, tahmini ' +
      'ücret ve teslim tarihi. Kontrol edip alttaki "Gönder" ile laboratuvara ' +
      'iletirsin.',
  },
  {
    id: 'done',
    action: { formStep: 1 },
    title: 'Hazırsın! 🎉',
    body:
      'Turu tamamladın. Form şimdi ilk adımda açık bekliyor — dilersen gerçek ' +
      'bilgileri girip ilk siparişini hemen oluşturabilirsin. Takıldığın yerde ' +
      'her ekranda "Denty\'ye sor" butonu yanında.',
  },
];
