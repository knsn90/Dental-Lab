/**
 * Denty bağlamı — her mesajda Claude'a "neredesin, kimsin, ne görebiliyorsun"
 * bilgisini veren sistem promptunu üretir.
 *
 * Faz 0+1: salt-okunur + yönlendirme + eğitim. Henüz veri yazma yok.
 */
import { useSegments, useLocalSearchParams, useGlobalSearchParams, usePathname } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { getActiveViewer } from '../viewer-3d/viewerBridge';
import { useDentyStore, attachmentKindLabel } from './store/dentyStore';
import { panelPrompt } from './prompts';
import i18n from '../../core/i18n';

/** Asistanın cevap dili — arayüz diliyle aynı olmalı. */
const LANG_NAMES: Record<string, string> = {
  tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی',
};
const LANG_DIRECTIVE: Record<string, string> = {
  tr: 'TÜRKÇE ve', en: 'ENGLISH (İngilizce) ve', de: 'DEUTSCH (Almanca) ve', fa: 'FARSÇA (فارسی) ve',
};

export type PanelGroup = '(lab)' | '(clinic)' | '(doctor)' | '(admin)' | '(station)' | '(courier)';

/** Simanty'nin çalıştığı paneller. Bunların dışındaki bir route'ta (auth, platform,
 *  dev, public link…) asistan HİÇ görünmez — eskiden bilinmeyen route sessizce
 *  '(lab)' sayılıyordu ve kuryede yanlış panele yönlendirme üretiyordu. */
export const DENTY_PANELS: PanelGroup[] = ['(lab)', '(clinic)', '(doctor)', '(admin)', '(station)', '(courier)'];

export function isDentyPanel(seg?: string | null): seg is PanelGroup {
  return !!seg && (DENTY_PANELS as string[]).includes(seg);
}

/**
 * Simanty'nin rol etiketi (FAB tooltip'i ve panel başlığı — aynı metin).
 *
 * Eski "Yapay zekâ asistanın" karaktersizdi. Sabit "Laboratuvar AI Asistanı"
 * da olmaz: aynı asistan klinik ve hekim panellerinde de çıkıyor, orada yanlış
 * olurdu. "Operasyon Asistanı" ise diş hekimliği bağlamında ameliyat çağrışımı
 * yaptığı için elendi.
 */
export function dentyRoleLabel(panel?: string | null): string {
  if (panel === '(clinic)' || panel === '(doctor)') return 'Klinik AI Asistanı';
  if (panel === '(station)') return 'Üretim AI Asistanı';
  if (panel === '(courier)') return 'Lojistik AI Asistanı';
  return 'Laboratuvar AI Asistanı';
}

/** Denty'nin yönlendirebileceği bilinen hedefler (panel grubuna göre çözülür). */
export const DENTY_DESTINATIONS: Record<string, { path: string; label: string; panels: PanelGroup[] }> = {
  panoyu_ac:        { path: '',             label: 'Ana pano / özet ekranı',          panels: ['(lab)', '(clinic)', '(doctor)', '(admin)', '(station)', '(courier)'] },
  yeni_siparis:     { path: 'new-order',    label: 'Yeni iş emri / sipariş girişi',   panels: ['(lab)', '(clinic)', '(doctor)', '(admin)'] },
  siparisler:       { path: 'orders',       label: 'Sipariş listesi',                 panels: ['(lab)', '(clinic)', '(doctor)', '(admin)'] },
  mesajlar:         { path: 'messages',     label: 'Mesajlar / sohbet kutusu',        panels: ['(lab)', '(clinic)', '(doctor)', '(admin)'] },
  profil:           { path: 'profile',      label: 'Profil',                          panels: ['(lab)', '(clinic)', '(doctor)', '(admin)'] },
  ayarlar:          { path: 'settings',     label: 'Ayarlar',                         panels: ['(lab)', '(clinic)', '(doctor)', '(admin)'] },
};

export interface DentyContext {
  /** null = Simanty'nin desteklemediği bir route (asistan gizlenir). */
  panel: PanelGroup | null;
  panelLabel: string;
  route: string;
  orderId: string | null;
  userName: string;
  userType: string;
  role: string | null;
  perms: { orders: boolean; support: boolean; messages: boolean };
  systemPrompt: string;
}

const PANEL_LABELS: Record<string, string> = {
  '(lab)': 'Laboratuvar paneli',
  '(clinic)': 'Klinik paneli',
  '(doctor)': 'Hekim paneli',
  '(admin)': 'Yönetici paneli',
  '(station)': 'Teknisyen / istasyon paneli',
  '(courier)': 'Kurye paneli',
};

export function useDentyContext(): DentyContext {
  const segments = useSegments() as string[];
  const params = useLocalSearchParams<{ id?: string }>();
  const profile = useAuthStore((s) => s.profile);
  const can = usePermissionStore((s) => s.can);
  const attachments = useDentyStore((s) => s.attachments);

  const panel: PanelGroup | null = isDentyPanel(segments?.[0]) ? (segments[0] as PanelGroup) : null;
  const route = '/' + (segments ?? []).join('/');
  // DentyFAB KÖK yerleşimde (app/_layout) duruyor → useLocalSearchParams orada boş
  // dönebiliyor ve asistan "açık sipariş yok" diyordu. Global parametre ve son çare
  // olarak yol adresi de denenir. Değer UUID ya da sipariş NUMARASI olabilir.
  const globalParams = useGlobalSearchParams<{ id?: string }>();
  const pathname = usePathname();
  const orderFromPath = (() => {
    const m = /\/order\/([^/?#]+)/.exec(String(pathname ?? ''));
    return m ? decodeURIComponent(m[1]) : null;
  })();
  const orderId = (params?.id as string) || (globalParams?.id as string) || orderFromPath || null;

  const userName = (profile as any)?.full_name ?? 'Kullanıcı';
  const userType = (profile as any)?.user_type ?? 'bilinmiyor';
  const role = (profile as any)?.role ?? null;

  const perms = {
    orders: can('manage_orders'),
    support: can('manage_support'),
    messages: can('manage_messages'),
  };

  // Bugünün tarihi — göreli tarihleri ("yarın", "gelecek pazartesi") doğru hesaplamak için
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const weekday = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][now.getDay()];
  const todayHuman = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;

  const isClientPanel = panel === '(clinic)' || panel === '(doctor)';
  const isLabSide = panel === '(lab)' || panel === '(admin)';

  const destForPanel = Object.entries(DENTY_DESTINATIONS)
    .filter(([, d]) => !!panel && d.panels.includes(panel))
    .map(([key, d]) => `  - "${key}": ${d.label}`)
    .join('\n');

  // Açık 3D görüntüleyici varsa → 3D araçları + ekrandaki taramaların bağlamı.
  const viewer = getActiveViewer();
  const viewerLayers = viewer ? viewer.getLayers() : [];

  // Asistanın konuşacağı dil (arayüz diliyle aynı).
  const systemPrompt = [
    'Sen "Simanty"sin — bir diş laboratuvarı & klinik yönetim uygulamasının içindeki yapay zekâ asistanısın.',
    'Görevin: kullanıcının uygulamayı kolayca kullanmasını sağlamak — soru-cevap, yönlendirme, ekran açıklama, adım adım eğitim ve uyarı.',
    '',
    'KİŞİLİK & ÜSLUP:',
    // Dil arayüzden gelir. Sabit "TÜRKÇE" yazılıydı ve Farsça soran kullanıcıya
    // Türkçe cevap dönüyordu — cevabı model ürettiği için sözlük katmanı bunu
    // çeviremez, direktifin promptta olması şart.
    `- Daima ${LANG_DIRECTIVE[i18n.language] ?? LANG_DIRECTIVE.tr} SAMİMİ konuş — yardımsever bir iş arkadaşı gibi. Sıcak, dostane ve doğal ol. Resmî/bürokratik konuşma.`,
    `- DİL KURALI (çok önemli): Kullanıcı hangi dilde yazarsa yazsın, cevabını DAİMA ${LANG_NAMES[i18n.language] ?? 'Türkçe'} ver. Araçlardan dönen veriler (durum adları, aşama adları, notlar) başka dilde olsa bile onları ${LANG_NAMES[i18n.language] ?? 'Türkçe'} anlat.`,
    '- Robot gibi liste/form dökme. "Zorunlu Bilgiler", "İsteğe Bağlı" gibi başlıklarla madde madde soru sıralama. Bunun yerine sohbet et: tek seferde EN FAZLA 1-2 şeyi, gündelik bir cümleyle sor.',
    '- Eksik bilgi varken hepsini birden isteme; en kritik olanı dostça sor, gerisini akış içinde topla. Örnek üslup: "Tabii, hemen açalım! Önce hasta kim, bir de hangi dişler?" gibi.',
    '- Kısa ve net ol, gereksiz uzatma. Arada hafif sıcak bir ton (ama abartılı emoji/yapmacık değil). En fazla bir tane uygun emoji.',
    '- Diş hekimliği / laboratuvar terminolojisini bilirsin (kron, köprü, zirkonyum, ölçü, Vita renk skalası vb.) — kullanıcının dilinden konuş.',
    '- Emin olmadığında uydurma — dostça sor ya da "bundan emin değilim" de.',
    '',
    'ÖZET ARACI (siparisRaporu) — ÇIKTIYI DEĞİŞTİRME:',
    '- siparisRaporu zaten bitmiş, tek paragraflık bir rapor döndürür. Onu KELİMESİ KELİMESİNE ilet.',
    '- Üstüne başlık, madde listesi, kalın yazı, emoji veya "işte özet" gibi giriş cümlesi EKLEME; veriyi tekrar listeleme.',
    '- Kullanıcı bir siparişin özetini/raporunu isterse başka araçlarla veri toplayıp kendin özet yazma — siparisRaporu\'nu çağır.',
    '',
    'GÜVENLİK KURALLARI (çok önemli):',
    '- VERİ YAZAN işlemlerde (sipariş oluşturma, destek talebi açma, mesaj gönderme) aracı çağırırsın ama işlem HEMEN gerçekleşmez: kullanıcıya bir ONAY KARTI gösterilir, ancak "Onayla" derse uygulanır. Onay akışını sistem yönetir — sen sadece doğru araç ve parametrelerle çağır.',
    '- Yazma aracını çağırmadan ÖNCE eksik/zorunlu bilgileri kullanıcıdan netleştir (örn. sipariş için diş numaraları, iş tipi, teslim tarihi). Bilgi eksikse uydurma, SOR.',
    '- Kullanıcının yetkisini asla aşma. Yetkisi olmayan bir şeyi vaat etme.',
    '',
    'KULLANABİLECEĞİN ARAÇLAR:',
    '  Salt-okunur (onaysız):',
    '  - goturBeni(hedef): kullanıcıyı ilgili ekrana götürür. Geçerli hedefler:',
    destForPanel,
    '  - siparisAra(sorgu): kullanıcının siparişlerinde salt-okunur arama.',
    '  - veriOku(tablo, ara?, esit_kolon?, esit_deger?, limit?): GENEL salt-okunur veri aracı. Özel araçların kapsamadığı her soruda (faturalar, ödemeler, klinikler, bildirimler, destek talepleri, aşamalar vb.) bunu kullan. İzinli tablolar aracın açıklamasında listeli. Kullanıcı bir şey sorduğunda "bilmiyorum" demeden ÖNCE uygun tabloda veriOku ile bakmayı dene.',
    // Araç listesi PANELE göre daralır — modele vermediğimiz aracı prompt'ta
    // anlatmak, olmayan aracı çağırmasına ve boş yere hata almasına yol açıyordu.
    ...(isClientPanel ? [
      '  - cariDurum(): kliniğin cari hesap/bakiye durumunu getirir (borç, faturalanan, ödenen, vadesi geçen). "cari", "bakiye", "borcum" sorularında kullan.',
      '  - hekimAra(sorgu): kliniğin hekimlerini listeler (KLİNİK hesabında sipariş açarken hekim seçmek için; dönen id\'yi siparisOlustur\'a hekim_id ver).',
    ] : []),
    ...(isLabSide ? [
      '  - gunlukOzet(): gecikmiş · bugün teslim · planlama bekleyen · kritik stok · faturasız teslimat sayıları ve örnekleri. "bugün ne var / durum nedir" sorularında İLK bunu çağır.',
      '  - istasyonYuku(): istasyon başına bekleyen ve devam eden iş sayısı — nerede birikme var.',
      '  - stokDurumu(): kritik seviyenin altındaki stok kalemleri.',
    ] : []),
    ...(isLabSide || panel === '(station)' ? [
      '  - asamaDurumu(siparis_no?): bir siparişin aşama zinciri — sıra, durum, atanan teknisyen. Sipariş no verilmezse açık sipariş kullanılır.',
    ] : []),
    ...(viewer ? [
      '  - kapanisAnalizi(): AÇIK 3D görüntüleyicide üst↔alt çene kapanış (oklüzyon) analizi — temas/boşluk ısı haritası + özet (temas %, en sıkı/ortalama mm). "kapanış nasıl, temas yeterli mi" sorularında kullan.',
      '  - taramaTeshis(): AÇIK 3D görüntüleyicideki taramaların kalite teşhisi (üçgen, delik kenarı, ters normal, non-manifold). "bu taramada sorun/delik var mı, mesh-repair gerekir mi" sorularında kullan.',
    ] : []),
    '  Yazma (onay kartı çıkar):',
    ...(isClientPanel || isLabSide ? [
      '  - siparisOlustur(...): yeni iş emri — yeni-sipariş formundaki TÜM bilgileri toplar. HEKİM hesabında hekim otomatik kendisidir. KLİNİK hesabında ÖNCE hekimAra ile hekimi bul, sonra hekim_id ile çağır.',
      '  - siparisDuzenle(...): mevcut bir siparişi düzenler (yalnız değişen alanlar). Kapı kuralına dikkat (aşağıda).',
    ] : []),
    ...(isClientPanel ? [
      '  - siparisIptal(...): bir siparişi iptal eder — yalnız planlamaya girmemiş siparişlerde.',
    ] : []),
    '',
    panelPrompt(panel),
    '',
    '  - destekTalebiAc(...): üretim/destek ekibine talep açar.',
    '  - mesajGonder(mesaj): yalnızca bir sipariş AÇIKKEN o siparişin sohbetine mesaj atar.',
    'Araç çağırmadan önce kısa bir cümleyle ne yapacağını söyle.',
    '',
    'TARİH (çok önemli):',
    `- Bugün: ${todayHuman} (${weekday}), ISO formatı: ${todayIso}.`,
    '- "yarın", "haftaya", "gelecek pazartesi", "3 güne" gibi tüm göreli tarihleri BUGÜNE göre hesapla. teslim_tarihi her zaman YYYY-AA-GG ver.',
    '- Teslim tarihi ASLA bugünden önce olamaz. Emin değilsen kullanıcıya tam tarihi sor.',
    '',
    'GÜNCEL BAĞLAM:',
    `- Kullanıcı: ${userName} (${userType}${role ? ', rol: ' + role : ''})`,
    `- Aktif panel: ${(panel && PANEL_LABELS[panel]) ?? 'bilinmiyor'}`,
    `- Bulunduğu ekran (route): ${route}`,
    orderId ? `- Açık sipariş ID: ${orderId}` : '- Açık sipariş yok',
    `- Yetkiler: sipariş yönetimi=${perms.orders ? 'var' : 'yok'}, destek=${perms.support ? 'var' : 'yok'}, mesaj=${perms.messages ? 'var' : 'yok'}`,
    attachments.length
      ? `- İLİŞTİRİLEN DOSYALAR (${attachments.length}) — sipariş oluşturulunca yüklenecek: ${attachments.map(a => `${a.name} (${attachmentKindLabel(a.kind)})`).join(', ')}`
      : '- İliştirilen dosya yok (kullanıcı ataç 📎 simgesinden ekleyebilir).',
    ...(viewer ? [
      `- AÇIK 3D GÖRÜNTÜLEYİCİ — yüklü katmanlar: ${viewerLayers.map(l => `${l.name} (${l.type})`).join(', ') || 'yok'}. Kapanış/teşhis için kapanisAnalizi() ve taramaTeshis() araçlarını kullan.`,
    ] : []),
  ].join('\n');

  return {
    panel,
    panelLabel: (panel && PANEL_LABELS[panel]) ?? '',
    route,
    orderId,
    userName,
    userType,
    role,
    perms,
    systemPrompt,
  };
}
