// lib/printOrderHtml.ts
// Tek "Dijital Vaka Özeti / İş Emri" çıktı template'i — yeni sipariş ekranı ve
// sipariş detay sayfası "Yazdır" akışlarının ikisi de buradan beslenir.
// A4 portrait, Nexadent brand layout.

export interface PrintOrderInput {
  /** İş emri no (örn LAB-2026-0086 veya NXD-...) */
  orderNumber: string;
  createdAt: Date | string;
  isUrgent: boolean;
  patient: { name: string; gender?: string | null };
  doctor: { name: string; phone?: string | null };
  clinic: { name: string };
  lab: { name: string; phone?: string | null; logoUrl?: string | null };
  /** Lab sidebar markası "sadece logo" ise başlıkta isim/LABORATORY yazılmaz. */
  logoOnly?: boolean;
  /** Tekil iş tipi (form.work_type / order.work_type) */
  workType: string;
  shade?: string | null;
  modelType?: string | null;
  machineType?: string | null;
  deliveryDate?: Date | string | null;
  deliveryMethod?: 'kurye' | 'elden' | 'kargo' | 'klinik' | '' | string;
  toothNumbers: number[];
  /** Per-tooth ops — verilirse diş tablosunda detaylı satırlar oluşur */
  toothOps?: Array<{
    tooth: number;
    workType: string;
    shade?: string | null;
    material?: string | null;
    implantSystem?: string | null;
    abutment?: string | null;
    screw?: string | null;
  }>;
  notes?: string | null;
  labNotes?: string | null;
  attachments?: Array<{ name: string }>;
  /** Chat messages (hekim talepleri) — sipariş detay messages tablosundan veya form.chat_messages'ten */
  messages?: Array<{
    text?: string;
    timestamp: string | Date;
    senderName?: string | null;
    type?: 'text' | 'voice' | 'image' | 'file';
    fileName?: string | null;
    duration?: number | null;
  }>;
  /** QR SVG markup (string) — DOM'dan veya server-side QR'dan */
  qrSvgHtml?: string;
  /** qrSvgHtml yoksa bu URL'den QR görseli üretilir (api.qrserver). */
  qrUrl?: string;
  /** FDI tooth path data — caller'dan opsiyonel; verilmezse arch çizilmez */
  toothPaths?: Record<number, string[]>;
  toothLabelPos?: Record<number, [number, number]>;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('tr-TR');
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtShortStamp(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

const ICONS = {
  clinic: `<svg width="14" height="14" viewBox="0 0 48 48"><path d="M28.869,11.067H26.412V8.61a.75.75,0,0,0-.75-.75H22.338a.75.75,0,0,0-.75.75v2.457H19.131a.75.75,0,0,0-.75.75v3.324a.75.75,0,0,0,.75.75h2.457v2.458a.75.75,0,0,0,.75.75h3.324a.75.75,0,0,0,.75-.75V15.891h2.457a.75.75,0,0,0,.75-.75V11.817A.75.75,0,0,0,28.869,11.067Z" fill="#0F172A"/><path d="M47.25,12.729H33.358V6.12h2.363a.75.75,0,0,0,.75-.75V.75a.75.75,0,0,0-.75-.75H12.279a.75.75,0,0,0-.75.75V5.37a.75.75,0,0,0,.75.75h2.363v6.609H.75a.751.751,0,0,0-.75.743l-.031,3.39a.751.751,0,0,0,.75.757H14.642V47.25a.75.75,0,1,0,1.5,0V6.12h2.1a.75.75,0,0,0,0-1.5H13.029V1.5H34.971V4.62H20.959a.75.75,0,0,0,0,1.5h10.9V47.25a.75.75,0,0,0,1.5,0V17.619H47.25a.75.75,0,0,0,.75-.75v-3.39A.75.75,0,0,0,47.25,12.729Z" fill="#0F172A"/></svg>`,
  doctor: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M17 14v4M15 16h4"/></svg>`,
  person: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
  male: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><path d="M14 10l5-5M19 5h-4M19 5v4"/></svg>`,
  female: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="5"/><path d="M12 15v4M9 17h6"/></svg>`,
  phone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>`,
  tooth: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.5c-1.5 0-2.5-1-4-1-2.5 0-4 1.5-4 4 0 4 2 12 4 12 1.5 0 1.5-4 4-4s2.5 4 4 4c2 0 4-8 4-12 0-2.5-1.5-4-4-4-1.5 0-2.5 1-4 1z"/></svg>`,
  pen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
  file: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  material: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`,
  gear: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  truck: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  rowIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 19 13 19"/><polyline points="13 19 13 5"/><polyline points="13 5 22 5"/><polyline points="11 19 2 19"/><polyline points="2 19 2 12"/></svg>`,
};

export function buildOrderPrintHtml(input: PrintOrderInput): string {
  const {
    orderNumber, createdAt, isUrgent, patient, doctor, clinic, lab,
    workType, shade, modelType, machineType, deliveryDate, deliveryMethod,
    toothNumbers, toothOps, notes, labNotes, attachments, messages, qrSvgHtml,
    qrUrl, logoOnly, toothPaths, toothLabelPos,
  } = input;

  // ── Dental arch SVG (toothPaths verildiyse) ──
  let archSVG = '';
  if (toothPaths && toothLabelPos && toothNumbers.length > 0) {
    const ALL_FDI = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,
                     48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    const VBX = -320, VBY = 200, VBW = 3720, VBH = 4380;
    const selSet = new Set(toothNumbers);
    const elements = ALL_FDI.map(fdi => {
      const paths = toothPaths[fdi];
      const pos = toothLabelPos[fdi];
      if (!paths || !pos) return '';
      const sel = selSet.has(fdi);
      const fill = sel ? '#1E293B' : '#F8FAFC';
      const stroke = sel ? '#0F172A' : '#CBD5E1';
      const txtCol = sel ? '#FFFFFF' : '#94A3B8';
      const detail = paths.slice(1).map(d =>
        `<path d="${d}" fill="none" stroke="${sel ? 'rgba(255,255,255,0.35)' : '#CBD5E1'}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`
      ).join('');
      return `<g><path d="${paths[0]}" fill="${fill}" stroke="${stroke}" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>${detail}<text x="${pos[0]}" y="${pos[1]}" font-size="130" font-weight="700" fill="${txtCol}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${fdi}</text></g>`;
    }).join('');
    archSVG = `<svg viewBox="${VBX} ${VBY} ${VBW} ${VBH}" width="240" height="${Math.round(240 * VBH / VBW)}" style="display:block;">${elements}</svg>`;
  }

  // ── Op table rows — aynı işlem değerlerine sahip dişler tek satırda ──
  const ops = toothOps && toothOps.length > 0
    ? [...toothOps].sort((a, b) => a.tooth - b.tooth)
    : toothNumbers.map(t => ({ tooth: t, workType, shade: shade ?? null, material: null, implantSystem: null, abutment: null, screw: null }));

  const groupKeyOf = (o: typeof ops[number]) => [
    o.workType ?? '', o.shade ?? '', o.material ?? '',
    o.implantSystem ?? '', o.abutment ?? '', o.screw ?? '',
  ].join('||');
  const opGroupMap = new Map<string, { ops: typeof ops; teeth: number[] }>();
  ops.forEach(o => {
    const k = groupKeyOf(o);
    if (!opGroupMap.has(k)) opGroupMap.set(k, { ops: [] as any, teeth: [] });
    const g = opGroupMap.get(k)!;
    (g.ops as any).push(o);
    g.teeth.push(o.tooth);
  });
  const opGroups = Array.from(opGroupMap.values())
    .map(g => ({ ...g, teeth: Array.from(new Set(g.teeth)).sort((a, b) => a - b) }))
    .sort((a, b) => a.teeth[0] - b.teeth[0]);

  const formatTeethRangeHtml = (teeth: number[]): string => {
    if (teeth.length === 0) return '';
    if (teeth.length === 1) return String(teeth[0]);
    const parts: string[] = [];
    let start = teeth[0], prev = teeth[0];
    for (let i = 1; i <= teeth.length; i++) {
      const t = teeth[i];
      if (t !== prev + 1) {
        parts.push(start === prev ? String(start) : `${start}–${prev}`);
        start = t as number; prev = t as number;
      } else {
        prev = t as number;
      }
    }
    return parts.join(', ');
  };

  const opTableRows = opGroups.length > 0 ? opGroups.map(g => {
    const op = g.ops[0];
    const det = [op.workType, op.shade, op.material, op.implantSystem, op.abutment, op.screw]
      .filter(Boolean).join(' · ') || '—';
    const teethLabel = formatTeethRangeHtml(g.teeth);
    const count = g.ops.length;
    return `<div class="opRow">
      <div class="opNum">${escapeHtml(teethLabel)}</div>
      <div class="opText">${escapeHtml(det)}${count > 1 ? `<span class="opCount">${count} adet</span>` : ''}</div>
    </div>`;
  }).join('') : '<div class="opEmpty">Henüz işlem eklenmedi</div>';

  // ── Materyal & üretim — adet ile dedupe ──
  const matCounts = new Map<string, number>();
  ops.forEach(o => {
    const key = (o.material && o.material.trim()) ? o.material.trim() : null;
    if (key) matCounts.set(key, (matCounts.get(key) ?? 0) + 1);
  });
  // NOT: materyal yoksa iş türünü tekrar ETME — boşsa "—" gösterilir.
  const materyalList = Array.from(matCounts.entries()).map(([name, count]) =>
    count > 1 ? `${name} × ${count}` : name,
  );

  const uretimSet = new Set<string>();
  ops.forEach(o => {
    const m = (o.material || o.workType || '').toLowerCase();
    if (m.includes('zirk') || m.includes('e.max') || m.includes('cad')) {
      uretimSet.add('CAD/CAM'); uretimSet.add('Frezeleme');
    }
    if (m.includes('zirk') || m.includes('seramik')) uretimSet.add('Sinterleme');
    if (m.includes('metal')) uretimSet.add('Döküm');
    if (m.includes('3d')) uretimSet.add('3D Baskı');
  });
  const uretimList = Array.from(uretimSet);
  if (uretimList.length === 0) uretimList.push('Manuel Üretim');

  // ── Teslimat ──
  const teslimSekli = deliveryMethod === 'kurye' ? 'Kurye'
                    : deliveryMethod === 'kargo' ? 'Kargo'
                    : deliveryMethod === 'elden' ? 'Elden Teslim'
                    : 'Klinik Teslim';
  const oncelikLabel = isUrgent ? 'Acil' : 'Normal';

  // ── Messages ──
  const textMsgs = (messages ?? []).filter(m => (m.type === 'text' || !m.type) && m.text && m.text.trim());
  const attachMsgs = (messages ?? []).filter(m => m.type && m.type !== 'text');

  const genderIco = patient.gender === 'erkek' ? ICONS.male : ICONS.female;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>İş Emri · ${escapeHtml(orderNumber)}</title>
<style>
@page{size:A5 portrait;margin:7mm 7mm}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#0F172A;background:#fff;font-size:8.5px;line-height:1.35;-webkit-font-smoothing:antialiased}
.doc{max-width:134mm;margin:0 auto}
.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}
.brand{display:flex;align-items:center;gap:10px}
.brand svg{width:24px;height:24px}
/* Logo çoğu labda GENİŞ bir sözcük-işareti. 48x48 kare kutuya sokunca
   yükseklik boşa gidiyor, marka pul kadar kalıyordu. Yüksekliği sabitle,
   genişliği serbest bırak. */
.brand img{height:34px;width:auto;max-width:150px;object-fit:contain;display:block}
.brandName{font-size:13px;font-weight:800;letter-spacing:0.6px;color:#0F172A;line-height:1}
.brandSub{font-size:6.5px;font-weight:700;color:#64748B;letter-spacing:2.6px;margin-top:3px}
.qrBox{text-align:center;flex-shrink:0}
.qrBox svg{display:block;width:54px;height:54px;border:1px solid #E2E8F0;border-radius:5px;padding:3px;background:#fff;box-sizing:content-box}
.qrPlaceholder{width:54px;height:54px;background:#F1F5F9;border:1px dashed #CBD5E1;border-radius:5px}
.qrBox img.qrImg{display:block;width:54px;height:54px;border:1px solid #E2E8F0;border-radius:5px;padding:3px;background:#fff;box-sizing:content-box;object-fit:contain}
.qrBox .qrLbl{margin-top:3px;font-size:6.5px;font-weight:800;color:#0F172A;letter-spacing:1px}
.qrBox .qrCap{display:none}
.eb{font-size:7px;font-weight:700;color:#64748B;letter-spacing:1.3px;text-transform:uppercase}
/* ── Hero ─────────────────────────────────────────────────────────
   Kâğıda bakan kişinin ilk sorusu "bu kimin işi?" — o yüzden sayfanın
   en büyük elemanı hasta adı. İş emri numarası, hekim, klinik ve aciliyet
   onun etrafında toplanır; QR da burada, ayrı bir kat açmadan. */
.hero{display:flex;align-items:flex-start;gap:10px;border:1px solid #E2E8F0;border-radius:8px;padding:9px 11px;margin-bottom:6px}
.heroMain{flex:1;min-width:0}
.heroName{font-size:21px;font-weight:700;letter-spacing:-0.6px;line-height:1.08;color:#0F172A}
.heroBadge{display:inline-block;vertical-align:middle;margin-left:7px;background:#DC2626;color:#fff;padding:2px 9px;border-radius:9999px;font-size:9px;font-weight:800;letter-spacing:1px}
.heroSub{margin-top:4px;font-size:8.5px;color:#475569;line-height:1.45}
.heroSub b{color:#0F172A;font-weight:700}
/* ── Özet şeridi — "ne yapılacak, ne zaman" tek bakışta ── */
.factStrip{display:flex;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:6px}
.fact{flex:1;min-width:0;padding:6px 9px;border-right:1px solid #F1F5F9}
.fact:last-child{border-right:none}
.factL{font-size:6.5px;font-weight:700;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:2px}
.factV{font-size:9.5px;font-weight:700;color:#0F172A;line-height:1.2;word-break:break-word}
.factV .pill{display:inline-block;background:#DCFCE7;color:#166534;padding:1px 6px;border-radius:9999px;font-size:7.5px;font-weight:800}
.factV .pillUrgent{background:#FEE2E2;color:#991B1B}
.metaRow{display:flex;gap:0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:5px 0;margin-bottom:8px}
.metaCell{flex:1;padding:0 7px;border-right:1px solid #F1F5F9;min-width:0}
.metaCell:last-child{border-right:none}
.metaCell:first-child{padding-left:0}
.ml{font-size:6.5px;font-weight:700;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:2px}
.mv{font-size:8.5px;font-weight:700;color:#0F172A;line-height:1.2;word-break:break-word}
.card{border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.row{display:flex;gap:6px;margin-bottom:6px}
.col{flex:1;min-width:0;display:flex}
.col > .card{flex:1}
.ch{padding:6px 8px;font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A;display:flex;align-items:center;gap:5px;border-bottom:1px solid #F1F5F9}
.ch svg{width:11px;height:11px;flex-shrink:0}
.chBadge{margin-left:4px;font-weight:600;color:#94A3B8;letter-spacing:0.4px;font-size:7px}
.cardBody{padding:3px 8px 8px}
.cr{display:flex;align-items:center;padding:3px 0;border-bottom:1px solid #F1F5F9;gap:6px;font-size:8.5px}
.cr:last-child{border-bottom:none}
.ci{width:11px;flex-shrink:0;color:#94A3B8}
.cl{color:#94A3B8;flex:1;font-size:7.5px}
.cv{font-weight:700;color:#0F172A;font-size:8.5px}
.teethCard{margin-bottom:6px}
.teethBox{display:flex;gap:8px;padding:7px;align-items:flex-start}
.archCol{flex-shrink:0;width:88px}
.archCol svg{display:block;width:100%;height:auto}
.tableCol{flex:1;min-width:0}
.tHead{display:flex;align-items:center;gap:8px;padding:0 2px 4px;border-bottom:1px solid #E2E8F0;font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase}
.tHead .h1{width:64px}
.tHead .h2{flex:1}
.opRow{display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px solid #F1F5F9;font-size:8.5px}
.opRow:last-child{border-bottom:none}
.opNum{min-width:60px;max-width:90px;padding:3px 5px;border-radius:4px;background:#0F172A;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:8.5px;line-height:1.15;text-align:center}
.opText{flex:1;color:#0F172A;font-weight:600;line-height:1.3}
.opCount{display:inline-block;margin-left:6px;padding:1px 5px;border-radius:9999px;background:#F1F5F9;color:#64748B;font-size:7px;font-weight:700;letter-spacing:0.3px;vertical-align:middle}
.opEmpty{padding:9px;text-align:center;color:#94A3B8;font-size:7.5px;font-style:italic}
.row4{display:flex;gap:6px;margin-bottom:8px}
.row4 > .card{flex:1;min-width:0}
.kv{padding:7px}
.kv h{display:flex;align-items:center;gap:5px;font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A;margin-bottom:6px}
.kv h svg{width:10px;height:10px}
.kvChips{display:flex;flex-wrap:wrap;gap:3px}
.kvChips .chip{display:inline-block;padding:1.5px 6px;border-radius:9999px;background:#F1F5F9;color:#0F172A;font-size:7.5px;font-weight:600;line-height:1.3;border:1px solid #E2E8F0}
.kv .deliveryGrid{display:flex;flex-direction:column;gap:4px;font-size:8px}
.kv .dRow{display:flex;justify-content:space-between;align-items:center;gap:6px}
.kv .dLbl{color:#94A3B8}
.kv .dVal{font-weight:700;color:#0F172A;text-align:right}
.kv .pill{display:inline-block;background:#DCFCE7;color:#166534;padding:1px 6px;border-radius:9999px;font-size:7px;font-weight:700;letter-spacing:0.2px}
.kv .pillUrgent{background:#FEE2E2;color:#991B1B}
.fileRow{display:flex;align-items:center;gap:4px;padding:2px 0;font-size:8px;color:#475569}
.fileRow svg{flex-shrink:0;width:9px;height:9px}
.fileTotal{margin-top:5px;padding-top:4px;border-top:1px solid #F1F5F9;font-size:7px;color:#94A3B8;font-weight:600}
.notesBox{margin:6px 0;padding:6px 8px;background:#F8FAFC;border-radius:5px;font-size:8.5px;color:#0F172A;line-height:1.4}
.notesBox .nh{font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:3px}
.msgList{margin:6px 0;display:flex;flex-direction:column}
.msgList .nh{font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:4px}
.msgItem{display:flex;align-items:baseline;gap:6px;padding:3px 0;border-bottom:1px solid #F1F5F9;font-size:8.5px;line-height:1.35}
.msgItem:last-child{border-bottom:none}
.msgTs{flex-shrink:0;width:62px;font-size:7px;color:#94A3B8;font-weight:600;letter-spacing:0.2px;font-variant-numeric:tabular-nums}
.msgBody{flex:1;color:#0F172A}
.msgItemAttach .msgBody em{font-style:italic;color:#475569;font-weight:600;margin-right:2px}
.sigFooter{display:flex;gap:6px;margin-top:8px}
.sigItem{flex:1;border:1px solid #E2E8F0;border-radius:5px;padding:7px}
.sigHead{display:flex;align-items:center;gap:5px;margin-bottom:6px}
.sigHead svg{width:11px;height:11px;color:#0F172A}
.sigHead h{font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A}
.sigLine{height:1px;background:#0F172A;margin:10px 0 4px}
.sigDateLine{font-size:7.5px;color:#475569;text-align:right;font-weight:600}
.sigDateLine span{display:inline-block;border-bottom:1px solid #94A3B8;min-width:16px;padding:0 4px;margin:0 1px}
.brandFooter{margin-top:6px;padding-top:5px;border-top:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:7px;color:#94A3B8;letter-spacing:0.2px}
.brandFooter svg{width:9px;height:9px}
.brandFooter b{color:#0F172A;font-weight:700}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>
<div class="doc">

  <div class="topbar">
    <div class="brand">
      ${lab.logoUrl
        ? `<img src="${escapeHtml(lab.logoUrl)}" alt="${escapeHtml(lab.name)}" />`
        : ICONS.tooth.replace('width="14"','width="24"').replace('height="14"','height="24"')}
      ${(logoOnly && lab.logoUrl) ? '' : `<div>
        <div class="brandName">${escapeHtml((lab.name || 'NEXADENT').toLocaleUpperCase('tr-TR'))}</div>
        <div class="brandSub">LABORATORY</div>
      </div>`}
    </div>
    <div style="text-align:right">
      <div class="eb">İş Emri</div>
      <div style="font-size:12px;font-weight:800;letter-spacing:0.2px;color:#0F172A;line-height:1.15">${escapeHtml(orderNumber)}</div>
      <div style="font-size:7.5px;color:#94A3B8;margin-top:1px">${fmtDateTime(createdAt)}</div>
    </div>
  </div>

  <!-- Hero: kâğıdın cevapladığı ilk soru "bu kimin işi?" -->
  <div class="hero">
    <div class="heroMain">
      <div class="eb">Hasta</div>
      <div class="heroName">${escapeHtml(patient.name || '—')}${isUrgent ? '<span class="heroBadge">ACİL</span>' : ''}</div>
      <div class="heroSub">
        ${patient.gender && patient.gender !== 'belirtilmedi' ? `${patient.gender === 'erkek' ? 'Erkek' : 'Kadın'} &middot; ` : ''}
        ${doctor.name ? `<b>${escapeHtml(doctor.name)}</b>` : ''}${clinic.name ? ` &middot; ${escapeHtml(clinic.name)}` : ''}
        ${doctor.phone ? `<br>${escapeHtml(doctor.phone)}` : ''}
      </div>
    </div>
    <div class="qrBox">
      ${qrSvgHtml
        || (qrUrl ? `<img class="qrImg" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&bgcolor=ffffff&color=0a0a0a&data=${encodeURIComponent(qrUrl)}" alt="QR" />` : '<div class="qrPlaceholder"></div>')}
      <div class="qrLbl">VAKA QR</div>
    </div>
  </div>

  <!-- Özet şeridi: ne yapılacak, hangi malzemeyle, ne zaman teslim -->
  <div class="factStrip">
    <div class="fact"><div class="factL">İşlem</div><div class="factV">${escapeHtml(ops.length > 0 ? (ops[0].workType || ops[0].material || '—') : '—')}${ops.length > 0 ? ` <span style="font-weight:600;color:#64748B">· ${ops.length} diş</span>` : ''}</div></div>
    <div class="fact"><div class="factL">Materyal</div><div class="factV">${materyalList.length > 0 ? escapeHtml(materyalList.join(', ')) : '—'}</div></div>
    <div class="fact"><div class="factL">Teslim</div><div class="factV">${fmtDate(deliveryDate)}<br><span style="font-weight:600;font-size:8px;color:#64748B">${escapeHtml(teslimSekli)}</span></div></div>
    <div class="fact"><div class="factL">Öncelik</div><div class="factV"><span class="pill ${isUrgent ? 'pillUrgent' : ''}">${oncelikLabel}</span></div></div>
  </div>

  ${ops.length > 0 ? `<div class="card teethCard">
    <div class="ch">${ICONS.tooth} Dişler &amp; İşlemler <span class="chBadge">· ${ops.length} diş</span></div>
    <div class="teethBox">
      <div class="archCol">${archSVG}</div>
      <div class="tableCol">
        <div class="tHead"><div class="h1">Diş No</div><div class="h2">İşlem &amp; Açıklama</div></div>
        ${opTableRows}
      </div>
    </div>
  </div>` : ''}

  <div class="row4">
    <div class="card kv">
      <h>${ICONS.gear} Üretim Yöntemi</h>
      <div class="kvChips">${uretimList.map(u => `<span class="chip">${escapeHtml(u)}</span>`).join('')}</div>
    </div>
  </div>

  ${notes ? `<div class="notesBox">
    <div class="nh">Hekim Talimatı</div>
    ${escapeHtml(notes).replace(/\n/g, '<br>')}
  </div>` : ''}

  ${labNotes ? `<div class="notesBox">
    <div class="nh">Laboratuvar Notu (dahili)</div>
    ${escapeHtml(labNotes).replace(/\n/g, '<br>')}
  </div>` : ''}

  ${(textMsgs.length > 0 || attachMsgs.length > 0) ? `<div class="msgList">
    <div class="nh">Hekim Talepleri · Mesajlar</div>
    ${textMsgs.map(m => `
      <div class="msgItem">
        <span class="msgTs">${fmtShortStamp(m.timestamp)}</span>
        <span class="msgBody">${escapeHtml(m.text!).replace(/\n/g, '<br>')}</span>
      </div>`).join('')}
    ${attachMsgs.map(m => `
      <div class="msgItem msgItemAttach">
        <span class="msgTs">${fmtShortStamp(m.timestamp)}</span>
        <span class="msgBody"><em>${m.type === 'voice' ? 'Ses kaydı' : m.type === 'image' ? 'Görüntü' : 'Dosya'}</em>${m.fileName ? ` — ${escapeHtml(m.fileName)}` : ''}${m.duration ? ` (${Math.round(m.duration / 1000)}s)` : ''}</span>
      </div>`).join('')}
  </div>` : ''}

  <div class="sigFooter">
    <div class="sigItem">
      <div class="sigHead">${ICONS.pen}<h>Hekim İmza</h></div>
      <div class="sigLine"></div>
      <div class="sigDateLine">Tarih: <span>&nbsp;</span>/<span>&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
    </div>
    <div class="sigItem">
      <div class="sigHead">${ICONS.pen}<h>Lab Teslim Alan</h></div>
      <div class="sigLine"></div>
      <div class="sigDateLine">Tarih: <span>&nbsp;</span>/<span>&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
    </div>
  </div>

  <div class="brandFooter">
    ${ICONS.tooth.replace('width="14"','width="11"').replace('height="14"','height="11"')}
    <b>Siman</b> · Dijital İş Emri · QR kod ile vaka detaylarına ulaşın.
  </div>

</div>
</body></html>`;
}
