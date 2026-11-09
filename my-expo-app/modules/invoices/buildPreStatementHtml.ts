/**
 * Ön ekstre PDF HTML üreticileri (özet + ayrıntılı).
 *
 * Kullanıcı kararı (plan 4 Task 1b): ön ekstre PDF'i mevcut cari hesap ekstresiyle
 * (buildStatementHtml → buildCariStatementHtml) BİREBİR aynı tasarımdadır. Burası yalnız ince
 * bir sarmalayıcıdır: satırlar lib/preStatementPdf.ts::preStatementLines'tan gelir, şablona
 * eklemeli seçenekler (başlık, bant, karekod, açılışsız) geçirilir. Çeviri autoT/printLocale ile.
 *
 * KVKK: hasta yalnız `patient_initials`; not içerikleri PDF'e girmez.
 */
import type { PreStatement } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { buildStatementHtml, type StatementLine } from './buildStatementHtml';
import { preStatementLines } from './lib/preStatementPdf';
import { autoT } from '../../core/i18n/autoTranslate';
import { printLocale } from '../../core/i18n/printLocale';

export type PreStatementPdfInput = {
  clinicName: string;
  lab: LabLetterhead;
  data: PreStatement;
  /** PDF'in para birimi (ekstre katı tek para birimlidir) */
  currency: string;
  generatedAt: string;
  /** Yalnız lab'ın ürettiği, bağlantılı PDF'te (R5/R7) */
  approve?: { url: string; qrSvg?: string; expiresAt: string };
};

function fmtDate(iso: string): string {
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(printLocale(), { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

const money = (n: number): string =>
  (Number(n) || 0).toLocaleString(printLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Şablonun satır görünümü: hasta varsa üst satıra hastayı, yoksa açıklamayı yazar; alt satıra sipariş no.
 * Ayrıntılıda üst satır iş (açıklama · adet × fiyat) olsun diye hasta alt satıra taşınır;
 * hekim her iki biçimde alt satırdadır. Yalnız görünüm — tutarlar ve bakiye değişmez.
 */
function displayLine(l: StatementLine, mode: 'ozet' | 'ayrintili'): StatementLine {
  if (mode === 'ayrintili') {
    return { ...l, patientName: null, orderNo: [l.orderNo, l.patientName, l.doctorName].filter(Boolean).join(' · ') || null };
  }
  // Özet: çok kalemli faturada listeler kısaltılır ("S-1, S-2, S-3 +47") — satır uzamasın
  return {
    ...l,
    patientName: compact(l.patientName, 4),
    orderNo: [compact(l.orderNo, 3), compact(l.doctorName, 2)].filter(Boolean).join(' · ') || null,
  };
}

function compact(list: string | null | undefined, max: number): string | null {
  const parts = (list ?? '').split(', ').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length <= max ? parts.join(', ') : `${parts.slice(0, max).join(', ')} +${parts.length - max}`;
}

function build(input: PreStatementPdfInput, mode: 'ozet' | 'ayrintili'): string {
  const r = preStatementLines(input.data, input.currency, mode, { money });
  const lines = r.lines.map((l) => displayLine(l, mode));
  const approve = input.approve
    ? {
      url: input.approve.url,
      qrSvg: input.approve.qrSvg,
      caption: `${autoT('Onaylamak için karekodu okutun')} · ${autoT('Son geçerlilik')}: ${fmtDate(input.approve.expiresAt)}`,
    }
    : undefined;
  return buildStatementHtml(
    input.clinicName,
    lines,
    input.lab,
    undefined,
    input.currency,
    { opening: r.opening, closing: r.closing },
    {
      vat: true,
      // ClinicStatementScreen.handlePrint gibi: özet toplamı KDV dahil borç (kapanış = açılış + borç)
      sums: { debit: r.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0) / 100, credit: 0 },
      discountMode: 'amount',
      documentTitle: autoT('Ön Ekstre'),
      notice: {
        title: autoT('Ön ekstre — onay bekliyor'),
        text: autoT('Bu belgedeki faturalar henüz kesinleşmedi; onaylandığında kesinleşir.'),
      },
      ...(approve ? { approve } : {}),
      ...(r.hideOpening ? { hideOpening: true } : {}),
      paper: true,
    },
  );
}

/** Özet: fatura başına bir satır (mevcut ekstre gibi). */
export function buildPreStatementSummaryHtml(input: PreStatementPdfInput): string {
  return build(input, 'ozet');
}

/** Ayrıntılı: aynı tasarımda kalem başına bir satır. */
export function buildPreStatementDetailHtml(input: PreStatementPdfInput): string {
  return build(input, 'ayrintili');
}
