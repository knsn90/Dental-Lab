/**
 * İMPLANT BİLGİSİ — tek okuma/yazma kaynağı.
 *
 * Tarihçe: implant marka/tür/abutment/vida bilgisi yalnız `order_items.notes`
 * içine düz metin olarak kodlanıyordu ("İmplant detayları: 23 = Neodent|…") ve
 * hiçbir ekran okumuyordu; sihirbaz adım 4'teki "İmplant markası" seçimi ise
 * hiçbir yere yazılmıyordu (kolon yoktu).
 *
 * Bugün: `work_orders.implant_brand / implant_teeth / implant_details` yapısal
 * alanları var (migration 20260910090000). Yazma tarafı HER İKİSİNİ de doldurur
 * (notes kodlaması geriye dönük uyum ve yazdırma için duruyor); okuma tarafı
 * önce yapısal alanlara bakar, boşsa eski kayıtlar için notes parse'ına düşer.
 *
 * Bu modül SAF'tır (supabase/React importu yok) — hem ekranlar hem prefill
 * hem yazdırma aynı mantığı paylaşsın diye.
 */

import type { ImplantDetail } from './types';

export type { ImplantDetail };

/** Bir siparişin normalize edilmiş implant bilgisi. */
export interface ImplantInfo {
  /** Vaka geneli marka (sihirbaz adım 4). Diş bazlı marka için `details`. */
  brand: string;
  /** İmplant bulunan diş pozisyonları (FDI), artan sıralı. */
  teeth: number[];
  /** Diş → detay. Yalnız en az bir alanı dolu olan dişler bulunur. */
  details: Record<number, ImplantDetail>;
  /** Gösterilecek bir şey var mı — ekranlar bölümü buna göre gizler. */
  hasAny: boolean;
}

const EMPTY_INFO: ImplantInfo = { brand: '', teeth: [], details: {}, hasAny: false };

// ─── notes kodlaması (eski kayıtlar) ─────────────────────────────────────────

const POS_LABELS = ['i̇mplant pozisyonları', 'implant pozisyonları', 'i̇mplant pozisyonlari', 'implant pozisyonlari'];
const DET_LABELS = ['i̇mplant detayları', 'implant detayları', 'i̇mplant detaylari', 'implant detaylari'];

/** Nottaki "Başlık: değer" bölümlerini gezer; başlık eşleşince değeri döner. */
function findNotePart(notes: string | null | undefined, labels: string[]): string | null {
  if (!notes) return null;
  for (const part of String(notes).split('·')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const label = part.slice(0, idx).trim().toLocaleLowerCase('tr');
    if (labels.includes(label)) return part.slice(idx + 1);
  }
  return null;
}

/** "İmplant pozisyonları: 16, 21, 24" → diş numaraları. */
export function parseImplantPositions(notes?: string | null): number[] {
  const val = findNotePart(notes, POS_LABELS);
  if (!val) return [];
  return val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
}

/** "İmplant detayları: 13 = Neodent|Bone Level|Anatomik|Multi-unit; 26 = …" → tooth→detay. */
export function parseImplantDetails(notes?: string | null): Record<number, ImplantDetail> {
  const out: Record<number, ImplantDetail> = {};
  const val = findNotePart(notes, DET_LABELS);
  if (!val) return out;
  for (const seg of val.split(';')) {
    const eq = seg.indexOf('=');
    if (eq === -1) continue;
    const n = parseInt(seg.slice(0, eq).trim(), 10);
    if (!Number.isFinite(n)) continue;
    const [system = '', type = '', abutment = '', screw = ''] = seg.slice(eq + 1).split('|').map(s => s.trim());
    out[n] = { system, type, abutment, screw };
  }
  return out;
}

/**
 * order_items.notes, yazma tarafında şu biçimde kodlanır:
 *   "Marka: X · Tür: Y · Abutment: Z · Vida: W · Materyal: M · Renk: R"
 * (NewOrderScreen submit → addOrderItem). Burada tersine çevrilir.
 * Biçim bozuksa sessizce boş döner — okuma hiçbir zaman çökmez.
 */
export function parseItemNotes(notes?: string | null): {
  implant_system: string; implant_type: string; abutment: string;
  screw: string; material: string; shade: string;
} {
  const out = {
    implant_system: '', implant_type: '', abutment: '',
    screw: '', material: '', shade: '',
  };
  if (!notes) return out;

  const LABELS: Record<string, keyof typeof out> = {
    'marka': 'implant_system',
    'tür': 'implant_type',
    'tur': 'implant_type',
    'abutment': 'abutment',
    'vida': 'screw',
    'materyal': 'material',
    'renk': 'shade',
  };

  for (const part of String(notes).split('·')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const label = part.slice(0, idx).trim().toLocaleLowerCase('tr');
    const value = part.slice(idx + 1).trim();
    const key = LABELS[label];
    if (key && value) out[key] = value;
  }
  return out;
}

// ─── Okuma ───────────────────────────────────────────────────────────────────

function isBlankDetail(d?: ImplantDetail | null): boolean {
  return !d || !(d.system || d.type || d.abutment || d.screw);
}

function normalizeDetail(raw: any): ImplantDetail {
  return {
    system:   String(raw?.system   ?? '').trim(),
    type:     String(raw?.type     ?? '').trim(),
    abutment: String(raw?.abutment ?? '').trim(),
    screw:    String(raw?.screw    ?? '').trim(),
  };
}

interface ImplantOrderShape {
  implant_brand?: string | null;
  implant_teeth?: number[] | null;
  implant_details?: Record<string, any> | null;
}
interface ImplantItemShape {
  notes?: string | null;
  /** Kalem geneli ("Marka: X · Tür: Y") kodlamayı dişlere dağıtmak için gerekli. */
  tooth_numbers?: number[] | null;
}

/**
 * Siparişin implant bilgisini çıkarır. ÖNCELİK yapısal kolonlar; eksik kalan
 * parçalar için kalem notlarına düşer (2026-09 öncesi siparişlerde kolonlar boş).
 *
 * notes'ta İKİ AYRI kodlama var, ikisi de okunur:
 *   a) diş bazlı  — "İmplant pozisyonları: 15, 16 · İmplant detayları: 15 = …"
 *   b) kalem geneli — "Marka: X · Tür: Y · Abutment: Z · Vida: W"
 *      (ToothOp seviyesindeki eski alanlar; kalemin TÜM dişlerine uygulanır)
 * (b) okunmadığı için LAB-2026-17 gibi siparişlerde implant bilgisi vardı ama
 * ekranlarda hiç görünmüyordu.
 *
 * @param order  work_orders satırı (implant_* kolonlarıyla)
 * @param items  order_items satırları (`notes` + `tooth_numbers`) — fallback kaynağı
 */
export function readImplantInfo(
  order?: ImplantOrderShape | null,
  items?: ImplantItemShape[] | null,
): ImplantInfo {
  if (!order && !items?.length) return EMPTY_INFO;

  const brand = String(order?.implant_brand ?? '').trim();

  const teethSet = new Set<number>();
  const details: Record<number, ImplantDetail> = {};

  // 1) YAPISAL kolonlar — 2026-09 sonrası siparişlerin tek doğru kaynağı.
  const colTeeth = Array.isArray(order?.implant_teeth) ? order!.implant_teeth! : [];
  for (const t of colTeeth) if (Number.isFinite(t)) teethSet.add(Number(t));

  const colDetails = order?.implant_details;
  if (colDetails && typeof colDetails === 'object') {
    for (const [k, v] of Object.entries(colDetails)) {
      const n = parseInt(k, 10);
      if (!Number.isFinite(n)) continue;
      const d = normalizeDetail(v);
      if (!isBlankDetail(d)) details[n] = d;
    }
  }

  // 2) Diş bazlı NOT kodlaması — "İmplant pozisyonları / İmplant detayları".
  //    Kolon boşsa devreye girer; kolon varsa onu ezmez.
  for (const it of items ?? []) {
    for (const t of parseImplantPositions(it?.notes)) teethSet.add(t);
    for (const [k, v] of Object.entries(parseImplantDetails(it?.notes))) {
      const n = Number(k);
      if (!isBlankDetail(v) && isBlankDetail(details[n])) details[n] = v;
    }
  }

  // 3) LEGACY kalem geneli kodlaması — "Marka: X · Tür: Y · Abutment: Z · Vida: W".
  //    Kalemin TÜM dişlerine uygulanır, o yüzden yalnız (1) ve (2) hiçbir şey
  //    bulamadığında çalışır: yeni siparişlerde iki kodlama birlikte yazılıyor ve
  //    bu blok implantı olmayan komşu dişleri de implant sanardı (ör. 15-16
  //    köprüsünde yalnız 15 implantsa).
  if (teethSet.size === 0 && Object.keys(details).length === 0) {
    for (const it of items ?? []) {
      const n = parseItemNotes(it?.notes);
      const d = normalizeDetail({
        system: n.implant_system, type: n.implant_type,
        abutment: n.abutment, screw: n.screw,
      });
      // Diş listesi olmayan kalem (serbest hizmet) atlanır — hangi dişe ait
      // olduğu bilinmiyor, uydurma diş numarası üretmeyiz.
      if (isBlankDetail(d)) continue;
      for (const t of (Array.isArray(it?.tooth_numbers) ? it!.tooth_numbers! : [])) {
        if (!Number.isFinite(t)) continue;
        details[Number(t)] = d;
        teethSet.add(Number(t));
      }
    }
  }

  // Detayı olan diş pozisyon listesinde yoksa da göster (veri kaybolmasın).
  for (const k of Object.keys(details)) teethSet.add(Number(k));

  const teeth = Array.from(teethSet).sort((a, b) => a - b);
  return { brand, teeth, details, hasAny: !!brand || teeth.length > 0 };
}

/** Bir dişin detayını okunur tek satıra çevirir: "Neodent · Bone Level · Ti-base". */
export function formatImplantDetail(d?: ImplantDetail | null): string {
  if (!d) return '';
  return [d.system, d.type, d.abutment, d.screw].map(s => (s ?? '').trim()).filter(Boolean).join(' · ');
}

/**
 * Bir dişin ekranda gösterilecek satırı.
 * Marka İKİ yerden gelebilir: diş bazlı kart ("İmplant Markası") ve sihirbaz
 * adım 4'teki vaka geneli seçici. Diş bazlı boşsa vaka geneline düşülür —
 * aksi halde hekim markayı adım 4'te girdiğinde satır markasız görünüyor.
 */
export function implantLineFor(info: ImplantInfo, tooth: number): string {
  const d = info.details[tooth];
  const system = (d?.system ?? '').trim() || info.brand;
  return [system, d?.type, d?.abutment, d?.screw].map(s => (s ?? '').trim()).filter(Boolean).join(' · ');
}

/**
 * Aynı detaya sahip dişleri tek satırda toplar.
 *
 * Tam çene vakalarda 12-14 diş aynı markayı taşıyor ve liste "11 Neodent /
 * 12 Neodent / …" diye uzayıp gidiyordu; okurken fark yaratan şey tekrar eden
 * marka değil, farklı olan satır. Gruplar ilk görülme sırasını korur, böylece
 * diş sırası bozulmaz.
 */
export function groupImplantTeeth(info: ImplantInfo): { teeth: number[]; detail: string }[] {
  const out: { teeth: number[]; detail: string }[] = [];
  const index = new Map<string, number>();
  for (const t of info.teeth) {
    const detail = implantLineFor(info, t);
    const at = index.get(detail);
    if (at === undefined) { index.set(detail, out.length); out.push({ teeth: [t], detail }); }
    else out[at].teeth.push(t);
  }
  return out;
}

/** Vakada geçen benzersiz markalar (diş bazlı + vaka geneli). Rozet/özet için. */
export function implantBrands(info: ImplantInfo): string[] {
  const set = new Set<string>();
  if (info.brand) set.add(info.brand);
  for (const d of Object.values(info.details)) if (d.system) set.add(d.system);
  return Array.from(set);
}

// ─── Yazma ───────────────────────────────────────────────────────────────────

interface ImplantFormShape {
  implant_brand?: string;
  implant_teeth?: number[];
  implant_details?: Record<number, ImplantDetail>;
}

/**
 * Sihirbaz form'undan work_orders implant kolonlarına gidecek payload.
 * Boş değerler `null` gönderilir — düzenlemede implant kaldırıldığında
 * eski değer kalmasın (`_apply_order_edit` anahtar varsa yazar).
 */
export function implantFieldsPayload(form: ImplantFormShape): {
  implant_brand: string | null;
  implant_teeth: number[] | null;
  implant_details: Record<string, ImplantDetail> | null;
} {
  const brand = (form.implant_brand ?? '').trim();
  const teeth = (form.implant_teeth ?? []).filter(n => Number.isFinite(n)).sort((a, b) => a - b);

  const details: Record<string, ImplantDetail> = {};
  for (const [k, v] of Object.entries(form.implant_details ?? {})) {
    const d = normalizeDetail(v);
    if (!isBlankDetail(d)) details[String(k)] = d;
  }

  return {
    implant_brand:   brand || null,
    implant_teeth:   teeth.length > 0 ? teeth : null,
    implant_details: Object.keys(details).length > 0 ? details : null,
  };
}
