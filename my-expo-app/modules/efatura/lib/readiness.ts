// Kliniğin e-faturaya hazır olup olmadığı (saf — test: readiness.test.mts).
// Kurallar sunucuyla (supabase/functions/_shared/lucaInvoice.ts buildLucaInput) AYNIDIR;
// burada yalnız göndermeden ÖNCE eksiği göstermek için tekrarlanır — asıl kapı sunucuda.

export type EFaturaGap = 'vkn' | 'vkn_invalid' | 'tax_office' | 'address' | 'foreign';

/** Ekranda autoT ile çevrilir. */
export const EFATURA_GAP_LABELS: Record<EFaturaGap, string> = {
  vkn: 'Vergi numarası',
  vkn_invalid: 'Vergi numarası (10 ya da 11 hane)',
  tax_office: 'Vergi dairesi',
  address: 'Adres (il / ilçe)',
  foreign: 'Yurt dışı klinik — ihracat faturası henüz desteklenmiyor',
};

const blank = (s: unknown) => !String(s ?? '').trim();

function addressOk(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.startsWith('{')) {
    try {
      const a = JSON.parse(s) as Record<string, unknown>;
      return !blank(a?.il) && !blank(a?.ilce);
    } catch {
      return false;
    }
  }
  // Düz metin: "…, İlçe / İl" — tam bir '/', sağda il, solda ilçe
  if ((s.match(/\//g) ?? []).length !== 1) return false;
  const [left, right] = s.split('/');
  return !blank(right) && !right.includes(',') && !blank(left.split(',').pop());
}

function foreignAddress(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s.startsWith('{')) return false;
  try {
    const u = String((JSON.parse(s) as Record<string, unknown>)?.ulke ?? '').trim().toUpperCase();
    return !!u && u !== 'TR';
  } catch {
    return false;
  }
}

export function clinicEFaturaGaps(c: { vkn?: string | null; tax_office?: string | null; address?: string | null } | null): EFaturaGap[] {
  // Yurt dışı klinik: yurt içi e-fatura kesilmez (ihracat faturası gerekir) → tek neden bu
  if (foreignAddress(c?.address)) return ['foreign'];
  const gaps: EFaturaGap[] = [];
  const v = String(c?.vkn ?? '').replace(/\s+/g, '');
  if (!v) gaps.push('vkn');
  else if (!/^(\d{10}|\d{11})$/.test(v)) gaps.push('vkn_invalid');
  if (blank(c?.tax_office)) gaps.push('tax_office');
  if (!addressOk(c?.address)) gaps.push('address');
  return gaps;
}
