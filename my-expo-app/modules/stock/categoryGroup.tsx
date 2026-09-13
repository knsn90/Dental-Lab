/**
 * Kategori gruplama — stok listeleri için ortak yardımcı.
 *
 * 90+ kalemlik düz liste taranamıyor; raf düzeni kategoriye göre olduğu için
 * sayım ve eşleştirme de kategoriye göre ilerliyor. Bu yardımcı listeyi
 * "Reçineler · Alçı · Seramik…" başlıkları altında gruplar.
 *
 * Düz bir dizi döndürür (başlık + satır karışık) — mevcut .map() render
 * döngüleri neredeyse hiç değişmeden çalışsın diye.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { DS } from '../../core/theme/dsTokens';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

export type GroupEntry<T> =
  | { kind: 'header'; label: string; count: number; key: string }
  | { kind: 'row'; item: T; indexInGroup: number; key: string };

const UNCATEGORIZED = 'Diğer';

/**
 * Kategoriye göre gruplar. Kategorisiz kalemler "Diğer" başlığı altında ve
 * her zaman en sonda toplanır — boş kategori adı listeyi baş tarafta bölmesin.
 */
export function groupByCategory<T>(
  items: T[],
  getCategory: (x: T) => string | null | undefined,
  getKey: (x: T, i: number) => string,
): GroupEntry<T>[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const raw = (getCategory(it) ?? '').trim();
    const cat = raw === '' ? UNCATEGORIZED : raw;
    const arr = buckets.get(cat);
    if (arr) arr.push(it); else buckets.set(cat, [it]);
  }

  const names = [...buckets.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b, 'tr');
  });

  const out: GroupEntry<T>[] = [];
  for (const name of names) {
    const rows = buckets.get(name)!;
    out.push({ kind: 'header', label: name, count: rows.length, key: `h:${name}` });
    rows.forEach((item, i) => out.push({
      kind: 'row', item, indexInGroup: i, key: `r:${getKey(item, i)}`,
    }));
  }
  return out;
}

/** Grup başlığı satırı — liste kartının içinde, satırlarla aynı yatay hizada */
export function CategoryHeaderRow({
  label, count, first,
}: { label: string; count: number; first?: boolean }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 18, paddingTop: first ? 12 : 18, paddingBottom: 8,
      backgroundColor: (isDark ? T.cardSoft : DS.ink[50]),
      borderTopWidth: first ? 0 : 1, borderTopColor: (isDark ? T.hairline : DS.ink[100]),
    }}>
      <Text style={{
        fontSize: 10, fontWeight: '600', letterSpacing: 1.2,
        textTransform: 'uppercase', color: (isDark ? T.ink3 : DS.ink[500]),
      }}>
        {label}
      </Text>
      <Text style={{ fontSize: 10, color: (isDark ? T.ink3 : DS.ink[400]) }}>{count}</Text>
    </View>
  );
}
