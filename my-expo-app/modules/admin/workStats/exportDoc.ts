// İş İstatistikleri dışa aktarma belgeleri — saf (React/i18n yok; yalnız `import type`).
// Metinler Türkçe kaynak olarak WORK_STATS_TEXTS'te toplanır; çağıran `t` (autoT) verir.
// `.ts` uzantılı yollar: aggregate.ts'teki not geçerli (type import silinir, yine de tutarlı).
import type { WorkStats, HeatRow, Qty } from './aggregate.ts';
import type { MonthKey } from './months.ts';

/** Çağıran tarafın (Task 5/8) çeviri sözlüğüne eklemesi gereken tüm düz metinler. */
export const WORK_STATS_TEXTS: Record<string, string> = {
  title: 'İş İstatistikleri',
  clinic: 'Klinik',
  month: 'Ay',
  compare: 'Kıyas',
  generated: 'Oluşturulma',
  summary: 'Özet',
  totalMembers: 'Toplam üye',
  totalJaws: 'Toplam çene',
  totalUnits: 'Toplam adet',
  avg6: 'Son 6 ay ortalaması (üye)',
  compareMonth: 'Kıyas ayı',
  workTypeTable: 'İş tipine göre',
  workType: 'İş tipi',
  unit: 'Birim',
  thisMonth: 'Bu ay',
  diff: 'Fark',
  clinicTable: 'Kliniğe göre',
  members: 'Üye',
  jaws: 'Çene',
  units: 'Adet',
  compareMembers: 'Kıyas üye',
  trendTable: 'Son 12 ay · iş tipine göre',
  unknownClinic: 'Kliniği bilinmeyen',
  noRecord: 'Kayıt yok',
};

export interface ExportDocInput {
  stats: WorkStats; heat: HeatRow[]; lab: LabInfo; clinicLabel: string;
  monthLabel: string; compareLabel: string; generatedAt: Date;
  t: (s: string) => string; locale: string; monthLabels: string[];
}
/** LabLetterhead'in bu belgenin kullandığı alt kümesi (yapısal uyumlu). */
export interface LabInfo { name: string; logo_url?: string | null; tax_number?: string | null }

const DASH = '—';
const RTL = /^(fa|ar|he|ur)\b/i;

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Mode = 'pdf' | 'xls';

function build(i: ExportDocInput, mode: Mode): string {
  const tx = (k: string) => esc(i.t(WORK_STATS_TEXTS[k]));
  const xls = mode === 'xls';
  const num = (v: number | null, fmt: '0' | '0.0' = '0') => {
    if (v === null || v === undefined || !Number.isFinite(v)) return `<td class="n">${DASH}</td>`;
    const txt = fmt === '0' ? String(v) : v.toFixed(1);
    return `<td class="n"${xls ? ` style="mso-number-format:'${fmt}'"` : ''}>${txt}</td>`;
  };
  const diff = (cur: number | null, cmp: number | null) => {
    if (cur === null || cmp === null || !Number.isFinite(cur) || !Number.isFinite(cmp)) {
      return `<td class="diff">${DASH}</td>`;
    }
    const d = cur - cmp;
    const txt = d > 0 ? `+${d}` : String(d);
    return `<td class="diff"${xls ? ` style="mso-number-format:'0'"` : ''}>${txt}</td>`;
  };
  const th = (s: string) => `<th>${esc(s)}</th>`;
  const thT = (k: string) => `<th>${tx(k)}</th>`;

  const s = i.stats;
  const sel: Qty | null = s.selectedQty;
  const cmp: Qty | null = s.compareQty;
  const dir = RTL.test(i.locale) ? 'rtl' : 'ltr';
  const title = i.t(WORK_STATS_TEXTS.title);
  const gen = i.generatedAt.toLocaleDateString(i.locale);

  const summary = `
<h2>${tx('summary')}</h2>
<table><thead><tr>${th('')}${thT('totalMembers')}${thT('totalJaws')}${thT('totalUnits')}${thT('avg6')}</tr></thead><tbody>
<tr><th>${esc(i.monthLabel)}</th>${num(sel ? sel.uye : null)}${num(sel ? sel.cene : null)}${num(sel ? sel.adet : null)}${num(s.avg6Uye, '0.0')}</tr>
<tr><th>${esc(i.compareLabel)}</th>${num(cmp ? cmp.uye : null)}${num(cmp ? cmp.cene : null)}${num(cmp ? cmp.adet : null)}<td class="n">${DASH}</td></tr>
<tr><th>${tx('diff')}</th>${diff(sel ? sel.uye : null, cmp ? cmp.uye : null)}${diff(sel ? sel.cene : null, cmp ? cmp.cene : null)}${diff(sel ? sel.adet : null, cmp ? cmp.adet : null)}<td class="diff">${DASH}</td></tr>
</tbody></table>`;

  const wtRows = s.workTypes.map((w) =>
    `<tr><td>${esc(w.label)}</td><td>${esc(w.unitLabel)}</td>${num(w.qty)}${num(w.compare)}${diff(w.qty, w.compare)}</tr>`).join('');
  const workTypes = `
<h2>${tx('workTypeTable')}</h2>
<table><thead><tr>${thT('workType')}${thT('unit')}${th(i.monthLabel)}${th(i.compareLabel)}${thT('diff')}</tr></thead><tbody>${wtRows}</tbody></table>`;

  const clRows = s.clinics.map((c) => {
    const name = c.id === '__unknown__' ? i.t(WORK_STATS_TEXTS.unknownClinic) : c.name;
    return `<tr><td>${esc(name)}</td>${num(c.qty.uye)}${num(c.qty.cene)}${num(c.qty.adet)}${num(c.compare ? c.compare.uye : null)}${diff(c.qty.uye, c.compare ? c.compare.uye : null)}</tr>`;
  }).join('');
  const clinics = `
<h2>${tx('clinicTable')}</h2>
<table><thead><tr>${thT('clinic')}${thT('members')}${thT('jaws')}${thT('units')}${thT('compareMembers')}${thT('diff')}</tr></thead><tbody>${clRows}</tbody></table>`;

  const trendRows: { label: string; unit: string; cells: (number | null)[] }[] = i.heat.length > 0
    ? i.heat.map((h) => ({ label: h.label, unit: h.unitLabel, cells: h.cells }))
    : s.workTypes.map((w) => ({ label: w.label, unit: w.unitLabel, cells: w.series }));
  const trend = `
<h2>${tx('trendTable')}</h2>
<table><thead><tr>${thT('workType')}${thT('unit')}${i.monthLabels.map(th).join('')}</tr></thead><tbody>${
    trendRows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.unit)}</td>${i.monthLabels.map((_, k) => num(r.cells[k] ?? null)).join('')}</tr>`).join('')
  }</tbody></table>`;

  const head = `
<div class="hdr">
  <div>
    <div class="ttl">${esc(title)}</div>
    <div class="meta">${tx('clinic')}: <b>${esc(i.clinicLabel)}</b> · ${tx('month')}: <b>${esc(i.monthLabel)}</b> · ${tx('compare')}: <b>${esc(i.compareLabel)}</b></div>
    <div class="meta">${tx('generated')}: ${esc(gen)}</div>
  </div>
  <div class="brand">${!xls && i.lab.logo_url ? `<img src="${esc(i.lab.logo_url)}" alt="${esc(i.lab.name)}" />` : `<div class="bn">${esc(i.lab.name)}</div>`}</div>
</div>`;

  const css = `
  body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#0F172A;margin:0;padding:${xls ? '8px' : '0'};font-size:11px}
  .hdr{display:flex;justify-content:space-between;align-items:center;background:#F1F5F9;border-radius:12px;padding:14px 18px;margin-bottom:16px}
  .ttl{font-size:18px;font-weight:700}.meta{font-size:11px;color:#475569;margin-top:4px}
  .brand img{height:40px;max-width:200px;object-fit:contain}.bn{font-size:15px;font-weight:700}
  h2{font-size:13px;margin:18px 0 6px}
  table{border-collapse:collapse;width:182mm;max-width:182mm}
  th,td{border:1px solid #CBD5E1;padding:5px 7px;text-align:start}
  thead th{background:#E2E8F0}
  .n,.diff{text-align:end}
  tr{page-break-inside:avoid}`;

  return `<!DOCTYPE html>
<html lang="${esc(i.locale)}" dir="${dir}"${xls ? ' xmlns:x="urn:schemas-microsoft-com:office:excel"' : ''}>
<head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head>
<body>${head}${summary}${workTypes}${clinics}${trend}</body></html>`;
}

export function buildWorkStatsPdfHtml(i: ExportDocInput): string { return build(i, 'pdf'); }
export function buildWorkStatsXlsHtml(i: ExportDocInput): string { return build(i, 'xls'); }

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function workStatsFileBase(month: MonthKey, clinicName: string | null): string {
  const base = `is-istatistikleri-${month}`;
  if (!clinicName) return base;
  const slug = clinicName.toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug ? `${base}-${slug}` : base;
}
