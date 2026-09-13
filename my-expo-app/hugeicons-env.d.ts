/**
 * @hugeicons/core-free-icons tek-ikon alt yolları için tip bildirimi.
 *
 * Paket yalnız index için .d.ts yayınlıyor (dist/types/index.d.ts); tek tek
 * `@hugeicons/core-free-icons/BellIcon` import'ları tipsiz kalıyor. İkonları
 * index'ten almak 7 MB'lık paketin tamamını bundle'a sokacağı için alt yol
 * import'u şart → tip boşluğunu burada kapatıyoruz.
 *
 * Şekil, paketin kendi IconSvgObject tipiyle aynı: [etiket, öznitelikler][].
 */
declare module '@hugeicons/core-free-icons/*' {
  const icon: readonly (readonly [string, { readonly [key: string]: string | number }])[];
  export default icon;
}
