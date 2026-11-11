// İş İstatistikleri dışa aktarma — platform dağıtımı (PDF + Excel).
import { Platform } from 'react-native';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportHtmlPdf } from '../../../core/print/exportHtmlPdf';

/** `build` AWAIT EDİLMEDEN geçirilir: web'de pencere tıklama jesti içinde açılmalı. */
export async function exportWorkStatsPdf(build: Promise<string>, fileBase: string): Promise<void> {
  await exportHtmlPdf(build, `${fileBase}.pdf`);
}

export async function exportWorkStatsXls(html: string, fileBase: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('XLS_NO_WINDOW');
    // BOM: Excel karakter setini doğru algılasın
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new FSFile(Paths.cache, `${fileBase}.xls`);
  if (file.exists) file.delete();
  file.create();
  file.write('﻿' + html);
  if (!(await Sharing.isAvailableAsync())) throw new Error('SHARE_UNAVAILABLE');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.ms-excel',
    UTI: 'com.microsoft.excel.xls',
    dialogTitle: `${fileBase}.xls`,
  });
}
