/**
 * Stok miktarı gösterimi.
 *
 * Paketli kalemlerde tüketim bir bölme sonucudur ve periyodik ondalık üretir:
 * 0.06 ml ÷ 2.6 ml/şişe = 0.023076923076923078. Ham hâliyle ekrana basıldığında
 * satır okunmaz oluyordu — bu yardımcı her yerde aynı kısaltmayı uygular.
 *
 * Kural: en fazla 4 ondalık, gereksiz sıfırlar atılır. Sıfıra yuvarlanacak
 * kadar küçük ama sıfır OLMAYAN değerler "<0,0001" gösterilir — "0" yazıp
 * "hiç kullanılmamış" izlenimi vermesin.
 */
export function formatQty(n: number | null | undefined, maxDigits = 4): string {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  const eps = Math.pow(10, -maxDigits);
  if (v !== 0 && Math.abs(v) < eps) return `<0,${'0'.repeat(maxDigits - 1)}1`;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: maxDigits });
}

/** Miktar + birim: "0,0231 Adet" */
export function formatQtyUnit(
  n: number | null | undefined,
  unit?: string | null,
  maxDigits = 4,
): string {
  return unit ? `${formatQty(n, maxDigits)} ${unit}` : formatQty(n, maxDigits);
}

/**
 * Paketli kalemlerde çift gösterim: "1,5 gr · 0,03 Adet".
 *
 * Stok paket biriminde tutulur (fatura "1 adet kavanoz" der, sayımda kavanoz
 * sayılır) ama tüketim içerik biriminde olur. "0,03 Adet" tek başına insana
 * hiçbir şey söylemiyor; önce anlamlı olan içerik miktarı, sonra paket
 * karşılığı yazılır.
 *
 * Paketsiz kalemde tek birim döner — zorlama ikinci sayı üretmez.
 */
export function formatQtyDual(
  n: number | null | undefined,
  itemUnit?: string | null,
  packSize?: number | null,
  contentUnit?: string | null,
  maxDigits = 4,
): string {
  const pack = Number(packSize);
  if (!isFinite(pack) || pack <= 0 || !contentUnit) {
    return formatQtyUnit(n, itemUnit, maxDigits);
  }
  const v = Number(n) || 0;
  return `${formatQty(v * pack, maxDigits)} ${contentUnit} · ${formatQty(v, maxDigits)} ${itemUnit ?? ''}`.trim();
}
