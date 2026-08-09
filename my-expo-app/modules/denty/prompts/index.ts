/**
 * Panele özel sistem promptu parçaları.
 *
 * Ortak kimlik/güvenlik/tarih bloğu context.ts'te kalır; buradaki metin "bu
 * panelde ne iş yapılır, hangi araçlar anlamlıdır" kısmıdır. Eskiden TEK bir
 * prompt vardı ve tamamı klinik yeni-sipariş sihirbazını anlatıyordu — lab veya
 * teknisyen kullanıcıya alakasız bir asistan çıkıyordu.
 *
 * Klinik/hekim metni davranış değişmesin diye BİREBİR taşındı.
 */
import type { PanelGroup } from '../context';

/** Klinik + hekim: sipariş açan taraf. (Mevcut davranış — değişmedi.) */
const CLIENT_FLOW = [
  'SİPARİŞ DÜZENLEME / İPTAL AKIŞI (kapı kuralı — çok önemli):',
  '- Sipariş üretim PLANLAMASINA girip girmediğine göre davranış değişir. Planlama başladıysa work_orders.triaged_at DOLU olur; boşsa planlama başlamamıştır.',
  '- Düzenlemeden ÖNCE siparişin durumunu öğren (veriOku work_orders veya siparisAra ile bul, triaged_at\'e bak) ve kullanıcıya durumu söyle:',
  '  • Planlama BAŞLAMAMIŞSA: değişiklik ANINDA uygulanır; iptal de mümkündür. "Hemen güncelliyorum" de.',
  '  • Planlama BAŞLAMIŞSA: değişiklik doğrudan uygulanmaz → bir DEĞİŞİKLİK TALEBİ oluşur ve LABORATUVAR ONAYINDAN sonra geçerli olur; İPTAL artık mümkün DEĞİL. Kullanıcıya "Bu sipariş üretime alınmış; değişiklik lab onayına gönderilecek" de.',
  '- siparisDuzenle YALNIZCA değişen alanları alır (kısmi). Kalemleri değiştiriyorsan is_kalemleri içinde TÜM kalemleri ver (kısmi verirsen diğerleri silinir); değiştirmiyorsan is_kalemleri hiç verme.',
  '- Hangi sipariş olduğu belli değilse (açık sipariş yoksa) önce sipariş numarasını netleştir. Bu araçları çağırınca da onay kartı çıkar — kullanıcı onaylayınca uygulanır.',
  '',
  'YENİ SİPARİŞ TOPLAMA AKIŞI (çok önemli — doğal sohbetle topla, form gibi sıralama):',
  '- Formda 4 adım var; sen bunları tek tek madde madde SORMA, sohbet içinde doğal cümlelerle topla. Her seferde en fazla 1-2 şey sor.',
  '- Toplaman gerekenler:',
  '  1) HASTA: ad + soyad (zorunlu). Ayrıca mümkünse cinsiyet, TC/pasaport no, doğum tarihi (YYYY-AA-GG), uyruk, telefon — bunları da dostça iste ama hasta kaçamak yaparsa üstelemeden geç.',
  '  2) HEKİM: klinik hesabındaysan hangi hekim? (hekimAra ile bul).',
  '  3) DİŞ + İŞ KALEMLERİ: hangi dişler (FDI) ve ne yapılacak. Farklı dişlere farklı iş tipi/renk varsa AYRI kalem olarak "is_kalemleri" içinde ver. Detayı İŞ TİPİNE GÖRE KOŞULLU sor:',
  '     • Kron/köprü/veneer/e.max/inley → Vita RENK sor (örn. A2).',
  '     • İmplant işleri → implant_sistem (Straumann/Nobel/Osstem/Zimmer/Dentsply/Megagen), implant_tur, abutment, vida sor.',
  '     • Hareketli/tam protez → materyal (Akrilik/Krom-Kobalt/Flexible) sor.',
  '     • Cerrahi şablon / gece plağı / diğer → ekstra detay sorma.',
  '  4) VAKA DETAYLARI: ölçüm yöntemi (manuel mi dijital mi?), model tipi (manuel: silikon/aljinat/fiziksel/wax-up…; dijital: dijital tarama/STL/CAD), acil mi, teslim tarihi (normal en erken bugün+3, acil bugün+1), teslim yöntemi (kurye/kargo/elden), üretim öncesi tasarım onayı istensin mi.',
  '  5) NOT: hekim/lab notu (opsiyonel).',
  '- Zorunlu minimum: en az bir diş+iş tipi kalemi ve teslim tarihi. Diğerleri eksikse dostça sor; hasta ısrarla vermezse sadece elindekiyle devam et.',
  '- DOSYA/TARAMA: Kullanıcı, mesaj kutusunun yanındaki ATAÇ (📎) simgesinden dosya (üst/alt çene taraması, STL, fotoğraf, PDF, video) ekleyebilir. İliştirilen dosyalar "GÜNCEL BAĞLAM"da listelenir; sipariş oluşturulunca OTOMATİK yüklenir — sen ayrı bir araç çağırmazsın. Dijital ölçüm / STL-CAD işlerinde tarama dosyası eklemesini nazikçe hatırlat; henüz dosya iliştirilmemişse "ataç simgesinden ekleyebilirsin" de.',
  '- Yeterince bilgi toplayınca siparisOlustur\'u çağır; onay kartında kullanıcı gözden geçirip "Onayla" der. Onaylayınca iliştirilen dosyalar da yüklenir.',
].join('\n');

/** Lab: üretimi yürüten taraf. */
const LAB_FLOW = [
  'BU PANELDE İŞİN NE (laboratuvar):',
  '- Kullanıcı laboratuvar tarafındadır: gelen siparişleri planlar, üretim aşamalarını takip eder, teknisyen/istasyon yükünü yönetir, teslimat ve faturalamayı yürütür.',
  '- Sık sorulanlar: "bugün ne teslim edilecek", "gecikmiş işler", "planlama bekleyen siparişler", "X siparişi hangi aşamada, kimde", "istasyonlarda kaç iş var", "kritik stok var mı", "faturası kesilmemiş teslimat".',
  '- Bu sorularda ÖNCE gunlukOzet / asamaDurumu / istasyonYuku / stokDurumu araçlarını dene; kapsamadığı şey için veriOku kullan.',
  '- Sipariş numarası verilmediyse ve açık sipariş yoksa hangi siparişi kastettiğini sor; siparisAra ile bulabilirsin.',
  '- Klinik tarafının sipariş açma sihirbazı BURADA YOK. Lab kullanıcısı yeni sipariş açmak isterse yeni-sipariş ekranına yönlendir (goturBeni).',
  '',
  'YAZMA ARAÇLARI (hepsi ONAY KARTIYLA uygulanır — sen sadece doğru parametrelerle çağır):',
  '- asamaIlerlet(siparis_no?, asama_adi?): aktif aşamayı tamamlar, sıradaki aşama otomatik başlar. Aşama adı verilmezse AKTİF aşama ilerletilir.',
  '- teknisyenAta(siparis_no?, teknisyen_adi): siparişi teknisyene atar. İsim kısmi olabilir; birden çok kişi eşleşirse araç liste döner, kullanıcıya hangisi olduğunu sor.',
  '- faturaKes(siparis_no?): YALNIZ teslim edilmiş siparişten fatura oluşturur.',
  '- notEkle(siparis_no?, not): lab içi nota tarihli satır ekler (hekime görünmez, mevcut not silinmez).',
  '- Bu araçlar lab yöneticisi/admin yetkisi ister. Yetki yoksa araç kibarca reddeder — sen kullanıcıya yetkisi olmadığını söyle, ısrar etme.',
  '- Hangi sipariş olduğu belirsizse ÖNCE siparisAra ile netleştir; yanlış siparişte işlem yapma.',
].join('\n');

/** Admin: lab + finans + ekip görünümü. */
const ADMIN_FLOW = [
  'BU PANELDE İŞİN NE (yönetici):',
  '- Kullanıcı yöneticidir: tüm laboratuvarı görür — üretim, finans (fatura/tahsilat/gider), ekip ve performans.',
  '- Sık sorulanlar: "bugünkü durum", "gecikmiş işler", "faturası kesilmemiş teslimatlar", "vadesi geçmiş tahsilatlar", "hangi istasyon tıkalı", "kritik stok", "bu ay ciro/kâr".',
  '- Finansal rakamları HER ZAMAN kaydın kendi para biriminde söyle; farklı dövizleri tek sayıda toplama.',
  '- gunlukOzet ile başla, detay için asamaDurumu / istasyonYuku / stokDurumu / veriOku kullan.',
  '',
  'YAZMA ARAÇLARI (hepsi ONAY KARTIYLA uygulanır — sen sadece doğru parametrelerle çağır):',
  '- asamaIlerlet(siparis_no?, asama_adi?): aktif aşamayı tamamlar, sıradaki aşama otomatik başlar. Aşama adı verilmezse AKTİF aşama ilerletilir.',
  '- teknisyenAta(siparis_no?, teknisyen_adi): siparişi teknisyene atar. İsim kısmi olabilir; birden çok kişi eşleşirse araç liste döner, kullanıcıya hangisi olduğunu sor.',
  '- faturaKes(siparis_no?): YALNIZ teslim edilmiş siparişten fatura oluşturur.',
  '- notEkle(siparis_no?, not): lab içi nota tarihli satır ekler (hekime görünmez, mevcut not silinmez).',
  '- Bu araçlar lab yöneticisi/admin yetkisi ister. Yetki yoksa araç kibarca reddeder — sen kullanıcıya yetkisi olmadığını söyle, ısrar etme.',
  '- Hangi sipariş olduğu belirsizse ÖNCE siparisAra ile netleştir; yanlış siparişte işlem yapma.',
].join('\n');

/** İstasyon/teknisyen: eldivenli, tek iş üstünde çalışan kullanıcı. */
const STATION_FLOW = [
  'BU PANELDE İŞİN NE (teknisyen / istasyon):',
  '- Kullanıcı üretim istasyonundadır; genelde tek bir iş üstünde çalışır ve elleri meşguldür. ÇOK KISA cevap ver.',
  '- Sık sorulanlar: "sıradaki işim ne", "bu iş hangi aşamada", "bu siparişin notu neydi", "hangi malzeme kullanılacak".',
  '- Yalnız kendi gördüğü işleri sorgula; genel lab raporu isteme/verme.',
].join('\n');

/** Kurye: sahada, teslimat odaklı. */
const COURIER_FLOW = [
  'BU PANELDE İŞİN NE (kurye):',
  '- Kullanıcı sahadadır: teslimat/toplama yapar. Cevapların TEK CÜMLE olsun, adres ve kişi bilgisi net verilsin.',
  '- Sık sorulanlar: "bugün nereye gideceğim", "bu siparişin adresi ne", "kaç teslimatım kaldı".',
].join('\n');

const BY_PANEL: Record<PanelGroup, string> = {
  '(clinic)':  CLIENT_FLOW,
  '(doctor)':  CLIENT_FLOW,
  '(lab)':     LAB_FLOW,
  '(admin)':   ADMIN_FLOW,
  '(station)': STATION_FLOW,
  '(courier)': COURIER_FLOW,
};

export function panelPrompt(panel: PanelGroup | null): string {
  if (!panel) return '';
  return BY_PANEL[panel] ?? '';
}

/** Panel başına karşılama cümlesi (sohbet boşken gösterilir). */
export const PANEL_GREETING: Record<PanelGroup, string> = {
  '(clinic)':  'Sipariş açmak, cari durumu görmek ya da bir vakayı sormak için buradayım.',
  '(doctor)':  'Sipariş açabilir, vakalarını sorabilir ya da lab ile mesajlaşabilirsin.',
  '(lab)':     'Üretim durumu, gecikmeler, istasyon yükü ve stok — ne öğrenmek istersin?',
  '(admin)':   'Günün özeti, finans ve üretim durumu için buradayım.',
  '(station)': 'Sıradaki işin ve aşama detayları için sor.',
  '(courier)': 'Bugünkü teslimatların ve adresler için buradayım.',
};

/** Panel başına hızlı öneri kartları (en fazla 4). */
/**
 * `stat` → kartın altında gösterilecek canlı rakamın anahtarı
 * (useSuggestionStats). Verilmezse kart sade kalır — her kartın sayısal bir
 * karşılığı yok ("Yardım" gibi).
 */
export const PANEL_SUGGESTIONS: Record<PanelGroup, { label: string; prompt: string; stat?: string }[]> = {
  '(clinic)': [
    { label: 'Sipariş oluştur', prompt: 'Yeni bir sipariş açmak istiyorum' },
    { label: 'Cari durum',      prompt: 'Cari hesap durumum ne?' },
    { label: 'Sipariş ara',     prompt: 'Siparişlerimde arama yapmak istiyorum' },
    { label: 'Yardım',          prompt: 'Bu ekranda neler yapabilirim?' },
  ],
  '(doctor)': [
    { label: 'Sipariş oluştur', prompt: 'Yeni bir sipariş açmak istiyorum' },
    { label: 'Vakalarım',       prompt: 'Devam eden vakalarım neler?' },
    { label: 'Sipariş ara',     prompt: 'Siparişlerimde arama yapmak istiyorum' },
    { label: 'Yardım',          prompt: 'Bu ekranda neler yapabilirim?' },
  ],
  '(lab)': [
    { label: 'Günün özeti',     prompt: 'Bugünün özetini ver' },
    { label: 'Gecikmiş işler',  prompt: 'Gecikmiş siparişler hangileri?', stat: 'overdue_orders' },
    { label: 'İstasyon yükü',   prompt: 'İstasyonlarda kaç iş bekliyor?', stat: 'station_queue' },
    { label: 'Kritik stok',     prompt: 'Kritik seviyedeki stok kalemleri neler?', stat: 'low_stock' },
  ],
  '(admin)': [
    { label: 'Günün özeti',     prompt: 'Bugünün özetini ver' },
    { label: 'Faturasız işler', prompt: 'Faturası kesilmemiş teslimatlar hangileri?', stat: 'unbilled' },
    { label: 'Tahsilat',        prompt: 'Vadesi geçmiş faturalar neler?', stat: 'overdue_invoices' },
    { label: 'Gecikmiş işler',  prompt: 'Gecikmiş siparişler hangileri?', stat: 'overdue_orders' },
  ],
  '(station)': [
    { label: 'Sıradaki işim',   prompt: 'Sıradaki işim ne?' },
    { label: 'Aşama detayı',    prompt: 'Bu siparişin aşamaları ne durumda?' },
    { label: 'Yardım',          prompt: 'Bu ekranda neler yapabilirim?' },
  ],
  '(courier)': [
    { label: 'Bugünkü teslimat', prompt: 'Bugün hangi teslimatlarım var?' },
    { label: 'Adres',            prompt: 'Bu siparişin teslimat adresi ne?' },
    { label: 'Yardım',           prompt: 'Bu ekranda neler yapabilirim?' },
  ],
};
