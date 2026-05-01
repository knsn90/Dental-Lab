/**
 * SectionHeader — Liste içinde tarih grubu başlığı (sticky görünüm)
 *
 *  Bugün · Dün · Bu Hafta · Geçen Hafta · Bu Ay · Geçen Ay · Eski
 *
 *  Kullanım:
 *    <SectionHeader label="Bugün" count={3} subtotal={1250} />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label:    string;
  count?:   number;
  subtotal?:number;
  accent?:  string;
}

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function SectionHeader({ label, count, subtotal, accent = '#64748B' }: Props) {
  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: accent }]} />
      <Text style={s.label}>{label}</Text>
      {count !== undefined && (
        <View style={s.countBadge}>
          <Text style={s.countText}>{count}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {subtotal !== undefined && (
        <Text style={[s.subtotal, { color: accent }]}>{fmtMoney(subtotal)}</Text>
      )}
    </View>
  );
}

/**
 * Bir ISO tarihi grup label'ına dönüştürür.
 *   Bugün → "Bugün"
 *   1 gün önce → "Dün"
 *   Bu hafta → "Bu Hafta"
 *   Geçen hafta → "Geçen Hafta"
 *   Bu ay → "Bu Ay"
 *   Geçen ay → "Geçen Ay"
 *   Daha eski → "MMM YYYY" (örn. "Mar 2026")
 */
export function dateBucket(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Eski';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400 * 1000;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((today - dayStart) / dayMs);

  if (diffDays === 0)   return 'Bugün';
  if (diffDays === 1)   return 'Dün';
  if (diffDays < 7)     return 'Bu Hafta';
  if (diffDays < 14)    return 'Geçen Hafta';

  // Bu ay / geçen ay
  const sameYear  = d.getFullYear() === now.getFullYear();
  const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (monthDiff === 0)  return 'Bu Ay';
  if (monthDiff === 1)  return 'Geçen Ay';

  // Daha eski → "Mar 2026"
  return d.toLocaleDateString('tr-TR', { month: 'short', year: sameYear ? undefined : 'numeric' });
}

/**
 * Bir array'i bucket → items map'ine grupla.
 * dateAccessor: her satırın tarih alanını döner.
 * amountAccessor: opsiyonel, subtotal hesaplaması için.
 *
 * Sıralama: bucket içinde yeni → eski; bucket sırası: Bugün, Dün, Bu Hafta, ...
 */
const BUCKET_ORDER = ['Bugün', 'Dün', 'Bu Hafta', 'Geçen Hafta', 'Bu Ay', 'Geçen Ay'];

export function groupByDate<T>(
  items: T[],
  dateAccessor: (item: T) => string,
  amountAccessor?: (item: T) => number,
): { bucket: string; items: T[]; subtotal: number }[] {
  const map: Record<string, { items: T[]; subtotal: number }> = {};
  for (const it of items) {
    const b = dateBucket(dateAccessor(it));
    if (!map[b]) map[b] = { items: [], subtotal: 0 };
    map[b].items.push(it);
    if (amountAccessor) map[b].subtotal += Number(amountAccessor(it)) || 0;
  }
  // Sırala: known bucket'lar önce, sonra alfabetik (ay isimleri)
  const known = BUCKET_ORDER.filter(k => k in map).map(k => ({ bucket: k, ...map[k] }));
  const others = Object.keys(map)
    .filter(k => !BUCKET_ORDER.includes(k))
    .sort()
    .reverse()
    .map(k => ({ bucket: k, ...map[k] }));
  return [...known, ...others];
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10, marginTop: 14, marginBottom: 6,
  },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '800', color: '#0F172A', letterSpacing: 0.6, textTransform: 'uppercase' },
  countBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  countText:  { fontSize: 10, fontWeight: '700', color: '#64748B' },
  subtotal:   { fontSize: 12, fontWeight: '800', letterSpacing: -0.2 },
});
