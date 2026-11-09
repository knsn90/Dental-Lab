/**
 * PDF çıkış yolu seçimi (saf; node --test ile çalışır).
 *  - native (iOS/Android): expo-print + paylaşım
 *  - tab: masaüstü web (>=1024) yeni sekmede yazdır
 *  - file: dar ekran / PWA — iframe + html2canvas + jsPDF dosyası (window.open iOS PWA'da çalışmaz)
 */
export type PdfExportMode = 'native' | 'tab' | 'file';

export function pdfExportMode(platform: string, winW: number): PdfExportMode {
  if (platform !== 'web') return 'native';
  return winW >= 1024 ? 'tab' : 'file';
}
