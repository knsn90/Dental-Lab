/**
 * Smart Suggestions — ticket konusu/gövdesi + context'inden anahtar kelimeler tespit
 * edip ilgili "hızlı çözüm önerileri" döndürür.
 *
 * Composer / center workspace bunları kullanır ve kullanıcıya inline kart olarak gösterir.
 */
import type { SupportTicket } from '../types';

export interface Suggestion {
  id:    string;
  title: string;
  hint:  string;
  /** İsteğe bağlı: lokal navigasyon hedefi (web router) */
  href?: string;
}

interface Rule {
  keys: RegExp;
  out:  Suggestion[];
}

const RULES: Rule[] = [
  {
    keys: /\bstl\b.*(açıl|aç[ıi]lm|bozuk|hatal|corrupt|invalid)|mesh.*(repair|onar|d[üu]zelt)/i,
    out: [
      { id: 'stl-repair',       title: 'Mesh onarımı', hint: 'STL\'i Meshmixer veya Inspector ile onarmayı dene. Ters normal / non-manifold / boş yüz hataları %80 sebep.' },
      { id: 'stl-normals',      title: 'Ters normal kontrolü', hint: 'Bazı CAD\'lerden export\'ta normaller içeri bakar. STLLoader bunu nokta bulutu gibi yorumlar.' },
      { id: 'stl-format',       title: 'Binary vs ASCII', hint: 'ASCII STL büyük dosyalarda zaman aşımına uğrar. Binary export yeniden yükle.' },
    ],
  },
  {
    keys: /qr.*(tara|okum|çal[ıi]ş[mı]|scanner|kamera)/i,
    out: [
      { id: 'qr-camera',  title: 'Kamera izni', hint: 'Safari\'de Site Settings > Camera > Allow. iOS\'ta PWA \'add to home\' sonrası gerekli.' },
      { id: 'qr-jsqr',    title: 'BarcodeDetector fallback', hint: 'Tarayıcı BarcodeDetector desteklemiyorsa jsQR otomatik devreye girer — hafif gecikme normal.' },
    ],
  },
  {
    keys: /yaz[ıi]c[ıi]|print(er)?|baskı.*hatas/i,
    out: [
      { id: 'printer-driver', title: 'Yazıcı sürücüsü', hint: 'SprintRay / Asiga: en güncel sürücü + firmware yüklü mü kontrol et. Yetersiz reçine sensörü %30 vaka.' },
      { id: 'slice-redo',     title: 'Slice yeniden', hint: 'Slice cache\'i bozuk olabilir — projeyi sil, yeniden import et.' },
    ],
  },
  {
    keys: /şifre.*resetle|password.*reset|giriş yapamıyorum|giri[şs] olmuyor|login fail/i,
    out: [
      { id: 'pw-reset',   title: 'Şifre sıfırlama', hint: '/forgot-password üzerinden email gönder. Cache temizlemek de yardımcı olur.' },
      { id: 'pw-cache',   title: 'Tarayıcı cache', hint: 'Cmd+Shift+R ile sert yenileme — eski PWA cache\'i giriş hatasına neden olabiliyor.' },
    ],
  },
  {
    keys: /kargo|yurti[çc]i|aras|ups|fedex|teslim/i,
    out: [
      { id: 'kargo-track', title: 'Takip numarası', hint: 'Sipariş detayında \'Kargo\' sekmesinden takip linkini açabilirsin.' },
      { id: 'kargo-claim', title: 'Hasar bildirimi', hint: 'Teslimattan sonra 24 saat içinde fotoğrafla destek vakası aç — sigorta süresi kısıtlı.' },
    ],
  },
  {
    keys: /fatura|invoic|kdv|fatura kesil/i,
    out: [
      { id: 'invoice-vat', title: 'Fatura/KDV ayarı', hint: 'Ayarlar > Klinik > Vergi Bilgileri\'ni doğrula. Tutar sıfır görünüyorsa fiyat listesi atanmamış olabilir.' },
    ],
  },
];

export function getSuggestions(ticket: SupportTicket): Suggestion[] {
  const haystack = [
    ticket.subject ?? '',
    ticket.context?.error_message ?? '',
    ticket.context?.last_action ?? '',
    ticket.error_code ?? '',
    ticket.context?.file_name ?? '',
  ].join(' ');

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (rule.keys.test(haystack)) {
      for (const s of rule.out) {
        if (!seen.has(s.id)) { out.push(s); seen.add(s.id); }
      }
    }
  }
  // Kategori-bazlı yardımcı pas: STL kategorisi varsa STL kuralı eşleşmemiş olsa bile en az 1 öneri ekle
  if (ticket.category === 'stl_dosya' && out.length === 0) {
    out.push({
      id: 'stl-generic',
      title: 'STL teşhis adımları',
      hint: 'Dosya boyutu / format / üçgen sayısı kontrol et. Önce Meshmixer Inspector ile aç, sonra slicer\'a yolla.',
    });
  }
  return out.slice(0, 4);
}
