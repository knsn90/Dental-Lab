/**
 * dentalIcons — Lucide'de karşılığı olmayan, dental sektöre özgü ikonlar.
 *
 * NEDEN `createLucideIcon`: Bu ikonlar elle yazılmış `<Svg>` bileşenleri DEĞİL,
 * gerçek Lucide ikonları. Fabrika, lucide-react-native'in kendi `Icon`'unu
 * (react-native-svg tabanlı — web + native aynı) sarar, dolayısıyla:
 *   • `size` · `color` · `strokeWidth` · `absoluteStrokeWidth` bedavaya gelir
 *   • viewBox 24, fill none, stroke 2, round cap/join varsayılanları otomatik
 *   • AppIcon haritasına Lucide ikonuyla birebir aynı şekilde takılır
 *
 * Bunun alternatifi `EquipmentIcons.tsx`'teki yol: orada ikonlar dışarıdan
 * trace edilmiş, viewBox 359.82 ve varsayılan strokeWidth 18. Çalışıyor ama
 * Lucide semantiğini taşımıyor — `strokeWidth={1.75}` geçen bir çağrı orada
 * neredeyse görünmez çizgi üretir. Buradaki ikonlar o tuzağa düşmez.
 *
 * ÇİZİM SÖZLEŞMESİ (yeni ikon eklerken uyulması zorunlu):
 *   viewBox 0 0 24 24 · çizim 2..22 arasında (1px kenar payı stroke için)
 *   2px grid'e otur · köşe yarıçapı ~2 · elemanlar arası en az 2px boşluk
 *   Yalnız stroke, fill YOK. Figma'da "Outline stroke" YAPMA — yaparsan
 *   strokeWidth prop'u ölür ve ikon küçük boyutta tıkanır.
 *
 * Her ikon 96/48/24/16 px'te ayrı ayrı denendi; 16px'te okunmayan varyantlar
 * (kubbe biçimli kron, dışa bakan tırtıklı çene) elendi.
 */
import { createLucideIcon } from 'lucide-react-native';

/** Azı dişi silueti — kron + iki kök. */
export const Tooth = createLucideIcon('Tooth', [
  ['path', {
    d: 'M4 8.5C4 5.2 6.2 3 9 3c1.2 0 2.2.4 3 1 .8-.6 1.8-1 3-1 2.8 0 5 2.2 5 5.5'
     + 'C20 11 19.4 12.6 19 14c-.4 1.6-.6 7-2.4 7C14.8 21 14.4 15 12 15s-2.8 6-4.6 6'
     + 'C5.6 21 5.4 15.6 5 14 4.6 12.6 4 11 4 8.5Z',
    key: 'tooth-body',
  }],
]);

/**
 * Kron — diş silueti + kron/kök sınırını gösteren yatay hat.
 * Kubbe biçimli "kapak" denemesi 16px'te mantar gibi okunduğu için elendi.
 */
export const Crown = createLucideIcon('Crown', [
  ['path', {
    d: 'M4 8.5C4 5.2 6.2 3 9 3c1.2 0 2.2.4 3 1 .8-.6 1.8-1 3-1 2.8 0 5 2.2 5 5.5'
     + 'C20 11 19.4 12.6 19 14c-.4 1.6-.6 7-2.4 7C14.8 21 14.4 15 12 15s-2.8 6-4.6 6'
     + 'C5.6 21 5.4 15.6 5 14 4.6 12.6 4 11 4 8.5Z',
    key: 'crown-body',
  }],
  ['path', { d: 'M4.6 11.5h14.8', key: 'crown-margin' }],
]);

/** İmplant — abutment platformu + yivli konik gövde. */
export const Implant = createLucideIcon('Implant', [
  ['path', { d: 'M8 2.5h8v3.5H8z', key: 'implant-abutment' }],
  ['path', { d: 'M16 6c0 5-1.2 10-4 15.5C9.2 16 8 11 8 6', key: 'implant-body' }],
  ['path', { d: 'M9.3 10.5h5.4', key: 'implant-thread-1' }],
  ['path', { d: 'M10.3 15h3.4', key: 'implant-thread-2' }],
]);

/** Zirkonyum / PMMA disk — dış çember, göbek, üstte yön kertiği. */
export const ZirconiaDisc = createLucideIcon('ZirconiaDisc', [
  ['path', { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', key: 'disc-rim' }],
  ['path', { d: 'M14.2 12a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z', key: 'disc-hub' }],
  ['path', { d: 'M10.2 3.3 12 5.8l1.8-2.5', key: 'disc-notch' }],
]);

/** Çene / diş arkı — çift konturlu U bandı (alt/üst çene seçimi için). */
export const DentalArch = createLucideIcon('DentalArch', [
  ['path', {
    d: 'M3.5 6.5c0 4 1 7.4 2.8 9.8C8 18.6 9.9 20 12 20s4-1.4 5.7-3.7c1.8-2.4 2.8-5.8 2.8-9.8',
    key: 'arch-outer',
  }],
  ['path', {
    d: 'M7.5 6.5c0 3 .6 5.5 1.7 7.2.9 1.4 1.8 2.1 2.8 2.1s1.9-.7 2.8-2.1c1.1-1.7 1.7-4.2 1.7-7.2',
    key: 'arch-inner',
  }],
]);
