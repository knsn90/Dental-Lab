// Kabuk geçişinde (masaüstü PatternsShell <Slot/> ↔ mobil <Tabs>) geri dönülecek adres.
// GRUP ÖNEKİ ŞART: /statement/:id gibi yollar birden çok panel grubunda tanımlı;
// öneksiz replace belirsiz eşleşip başka panele düşebilir. Saf yardımcılar (node --test).

export function groupHref(group: string, pathname: string, search: string): string {
  const q = !search || search === '?' ? '' : (search.startsWith('?') ? search : `?${search}`);
  const path = pathname && pathname !== '/' ? pathname : '';
  if (!group || path.startsWith(`/${group}`)) return `${path || '/'}${q}`;
  return `/${group}${path}${q}`;
}

/** expo-router genel adresini (unstable_globalHref) yol + sorgu olarak ayırır. */
export function splitHref(href: string): [string, string] {
  const i = href.indexOf('?');
  if (i < 0) return [href || '/', ''];
  return [href.slice(0, i) || '/', href.slice(i)];
}

/**
 * Geçişten sonra ne yapılacak:
 *  track   — bekleyen geri dönüş yok; adresi "son kararlı adres" olarak izle
 *  hold    — yeni navigator henüz kurulmadı (geçiş karesi); dokunma
 *  settle  — adres hedefle aynı; sıfırlama gecikmiş olabilir, kısa süre bekle
 *  replace — yeni navigator adresi sıfırladı; hedefe geri dön
 */
export function restoreStep(target: string | null, href: string, mounted: boolean): 'track' | 'hold' | 'settle' | 'replace' {
  if (!target) return 'track';
  if (!mounted) return 'hold';
  return href === target ? 'settle' : 'replace';
}

/**
 * Panel düzeninin bu karede çizeceği navigator:
 *  slot — <Slot/> (yığın): masaüstü kabuğu (profil yüklenirken de)
 *  tabs — mobil <Tabs>
 *  none — hiçbiri (boş <View/>): geçiş karesi ya da mobilde profil yüklenirken
 *
 * Mobilde profil yüklenirken <Slot/> ÇİZİLMEZ: profil gelince aynı karede <Tabs>'a
 * geçiliyordu (Y5 boş karesi atlanıyordu). Yükleme Slot'u yığın durumunu grup
 * rotasına yazıp parametreleri tükettiyse (iyimser "/" → panel yönlendirmesi +
 * yüklenirken gezinme) TabRouter o yığın durumunu olduğu gibi alıyor →
 * `state.history.filter` → "Cannot read properties of undefined (reading 'filter')".
 */
export function panelNavigator(hasProfile: boolean, shellDesktop: boolean | null): 'slot' | 'tabs' | 'none' {
  if (shellDesktop === null) return 'none';
  if (shellDesktop) return 'slot';
  return hasProfile ? 'tabs' : 'none';
}
