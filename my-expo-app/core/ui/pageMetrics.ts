// core/ui/pageMetrics.ts
//
// Sayfa kenar boşluğu — TEK kaynak.
//
// NEDEN VAR: DESIGN_LANGUAGE.md §3 "16px kuralı"nı zorunlu kılıyor ama kod
// tabanında bu değer her ekranda elle yazılan çıplak bir sayıydı. Sonuç: aynı
// ekranda üç farklı kenar (başlık 24 · sekmeler 16 · kartlar 12), toplamda 17
// farklı değer. Yeni ekran yazan da (insan ya da AI) sözleşmeye değil komşu
// dosyaya bakıp kopyaladığı için hata kendini çoğaltıyordu.
//
// Aynı yardımcı `modules/payroll/bonus/components/atoms.tsx` içinde zaten
// vardı — ama prim modülünün içinde durduğu için 5 ekran dışında kimse
// bulamadı. Doğru yerde olmayan bir standart, standart değildir. Buraya taşındı.
//
// KULLANIM
//   import { PAGE_PADDING } from 'core/ui/pageMetrics';
//   <ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, ... }}>
//
// Bir ekranda sayfa kenarı için 16 DIŞINDA bir değer gerekiyorsa sebebini
// yorumda yaz — yoksa bir sonraki dokunan kişi onu hata sanıp düzeltir.

/** Sayfa kenarı → içerik. Mobil ve masaüstünde aynı. */
export const PAGE_PADDING = 16;

/**
 * Tam-genişlik (full-bleed) bir şeridi sayfa kenarına taşırmak için negatif
 * telafi. `PAGE_PADDING` değişirse bu da kendiliğinden düzelir — elle yazılan
 * `marginHorizontal: -12` gibi değerler sayfa kenarıyla senkronu kaybediyordu.
 */
export const PAGE_BLEED = -PAGE_PADDING;

/** Kart–kart arası dikey/yatay boşluk (DESIGN_LANGUAGE.md §3 istisnası). */
export const CARD_GAP = 12;

/** Kart iç dolgusu (DESIGN_LANGUAGE.md §3 istisnası — atom standardı). */
export const CARD_PADDING = 18;

/**
 * Mobilde yüzen üst başlığın (logo + QR/mesaj/bildirim/profil düğmeleri)
 * kapladığı yükseklik. İçerik bunun ALTINDAN başlamalı — yoksa sayfa başlığı
 * logonun altına girer.
 *
 * `Math.max(insets.top, 8) + 72` kalıbı 10+ ekranda elle yazılmıştı; istasyon
 * panelinin üç ekranı (İşlerim, Geçmiş, İstatistik) bunu kaçırıp `insets.top + 16`
 * kullanıyordu ve başlık logoyla çakışıyordu.
 */
export const MOBILE_HEADER_OFFSET = 72;

/** Yüzen başlığın altından başlayan güvenli üst boşluk. */
export function mobileTopPad(insetTop: number): number {
  return Math.max(insetTop, 8) + MOBILE_HEADER_OFFSET;
}

/**
 * Sağ-altta yüzen Simanty FAB'ının (DentyFAB) kapladığı dikey alan.
 *
 * FAB `bottom: 24` + yükseklik 48 = alttan 72px'i kaplar ve `zIndex: 9999` ile
 * her şeyin ÜSTÜNE çizilir. Sayfanın en altındaki içerik — özellikle sağa
 * yaslı toplam/özet satırları — onun altında kalır ve okunamaz.
 *
 * Kaydırılabilir her sayfanın içerik kabı bu kadar alt boşluk bırakmalı ki son
 * satır FAB'ın üstüne kaydırılabilsin.
 *
 *   <ScrollView contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}>
 *
 * Yapışkan bir aksiyon çubuğu olan ekranlarda bunun yerine
 * `useBottomActionBar(h)` kullanılır — o, FAB'ı çubuğun üstüne taşır.
 */
export const FAB_CLEARANCE = 96;
