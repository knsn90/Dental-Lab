/**
 * csvExport — Cross-platform CSV indirme
 *
 *  Web    → Blob + a[download] tıklatma
 *  Native → expo-file-system ile dosyaya yaz, expo-sharing ile paylaş
 *
 *  UTF-8 BOM ekler → Excel Türkçe karakterleri doğru gösterir.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface CsvColumn<T> {
  header: string;
  /** Bir satır için string değer döner; sayılar 'tr-TR' locale ile formatlanmalı */
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/[",\n;]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[], separator = ';'): string {
  const head = columns.map(c => escapeCell(c.header)).join(separator);
  const body = rows.map(r => columns.map(c => escapeCell(c.value(r))).join(separator)).join('\n');
  // UTF-8 BOM (Excel Türkçe karakter desteği için)
  return '﻿' + head + '\n' + body;
}

export async function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  opts?: { separator?: string },
): Promise<{ ok: boolean; error?: string }> {
  const csv = rowsToCsv(rows, columns, opts?.separator ?? ';');
  const safeName = filename.endsWith('.csv') ? filename : filename + '.csv';

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return { ok: false, error: 'window yok' };
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'CSV indirme başarısız' };
    }
  }

  // Native
  try {
    const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
    const uri = dir + safeName;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: safeName, UTI: 'public.comma-separated-values-text' });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'CSV oluşturulamadı' };
  }
}

// ─── Türkçe sayı formatı yardımcısı ──────────────────────────────────────
export function csvMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '';
  // Excel TR için virgül ondalık, nokta yok (binlik ayraç eklenmez — sayı olarak okunsun)
  return v.toFixed(2).replace('.', ',');
}

export function csvDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR');
}
