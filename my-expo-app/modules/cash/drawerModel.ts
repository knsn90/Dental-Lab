// Nakit kasa (çekmece) saf kuralları — denetim yol haritası 2. dalga madde 8.
// İçe aktarma yok (node --test doğrudan çalıştırır). Sunucu tarafı: _cash_sync / cash_count_drawer.

export type DrawerCurrency = 'TRY' | 'EUR';
export const DRAWER_CURRENCIES: DrawerCurrency[] = ['TRY', 'EUR'];

export type MovementSource = 'tahsilat' | 'makbuz' | 'gider' | 'sayim' | 'elle';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** O para birimindeki aktif çekmece (lab + para birimi başına en fazla bir tane) */
export function drawerFor<A extends { currency: string; is_drawer?: boolean; is_active: boolean }>(
  accounts: A[],
  c: DrawerCurrency,
): A | null {
  return accounts.find((a) => a.is_drawer && a.is_active && a.currency === c) ?? null;
}

/** Sayım farkı: sayılan − beklenen, iki ondalığa yuvarlanmış; sıfırsa hareket yok */
export function countDiff(counted: number, expected: number): { diff: number; direction: 'giris' | 'cikis' | null } {
  const diff = round2(round2(counted) - round2(expected));
  if (diff === 0) return { diff: 0, direction: null };
  return { diff, direction: diff > 0 ? 'giris' : 'cikis' };
}

/** Hareketin kaynağı (sunucunun yazdığı ref_type'tan) */
export function movementSource(m: { ref_type: string | null }): MovementSource {
  switch (m.ref_type) {
    case 'payment': return 'tahsilat';
    case 'clinic_receipt_line': return 'makbuz';
    case 'expense': return 'gider';
    case 'cash_count': return 'sayim';
    default: return 'elle';
  }
}

/** Otomatik hareketler kasa ekranından silinmez/düzenlenmez; düzeltme kaynakta yapılır */
export function isEditable(m: { ref_type: string | null }): boolean {
  return m.ref_type == null;
}

/**
 * Para giriş alanı → sayı. İki ayraç birlikteyse SONDAKİ ondalıktır ("1.250,50" · "1,250.50").
 * Yalnız virgül varsa ondalıktır ("1,5"); yalnız nokta varsa 3'lü gruplar binlik sayılır
 * ("1.250" = 1250), diğer nokta ondalıktır ("12.50"). Geçersiz → NaN.
 */
export function parseAmount(s: string): number {
  const t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  let norm: string;
  if (t.includes(',') && t.includes('.')) {
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    const [intPart, frac, ...rest] = t.split(dec);
    if (rest.length || !/^\d{1,3}([.,]\d{3})*$/.test(intPart) || intPart.includes(dec)) return NaN;
    norm = `${intPart.split(thou).join('')}.${frac}`;
  } else if (t.includes(',')) {
    if ((t.match(/,/g) ?? []).length > 1) return NaN;
    norm = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    norm = t.replace(/\./g, '');
  } else {
    norm = t;
  }
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return NaN;
  return Number(norm);
}

/** Kasa tabloları RLS ile view_cash / manage_cash ister; ikisi de yoksa ekran "açılmadı" yerine yetki notu gösterir */
export function canSeeDrawers(p: { canView: boolean; canManage: boolean }): boolean {
  return p.canView || p.canManage;
}
