export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function isOverdue(deliveryDate: string, status: string): boolean {
  if (status === 'teslim_edildi') return false;
  return new Date(deliveryDate) < new Date(new Date().toDateString());
}
export function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
