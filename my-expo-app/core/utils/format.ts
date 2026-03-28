export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
}
export function formatOrderNumber(num: string): string {
  return num?.toUpperCase() ?? '';
}
