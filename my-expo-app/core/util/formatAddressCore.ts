// Adres biçimleme çekirdeği (saf, içe aktarma yok — test: formatAddressCore.test.mts).
// formatAddress.ts bunu ülke adlarıyla sarar. Adres JSON'u:
//   {"ulke":"TR","il":"İstanbul","ilce":"Ataşehir","mahalle":"Atatürk","sokak":"...","bina_no":"B Blok","daire_no":"3","posta_kodu":"34758"}
// ulke yoksa Türkiye (eski kayıtlar). Yurt dışında il = eyalet/bölge, ilce = şehir; "Mah." eklenmez,
// ülke adı sona yazılır. Düz metin aynen döner, bozuk JSON'da ham değer (asla çökmez).

export function formatAddressWith(raw: string | null | undefined, countryLabel: (code: string) => string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!(s.startsWith('{') && s.endsWith('}'))) return s;
  try {
    const o: any = JSON.parse(s);
    if (!o || typeof o !== 'object') return s;
    const str = (v: unknown) => String(v ?? '').trim();
    const sokak = str(o.sokak);
    const binaNo = str(o.bina_no);
    const daireNo = str(o.daire_no);
    const line1 = [sokak, binaNo && !sokak.includes(binaNo) ? 'No: ' + binaNo : null, daireNo ? 'D: ' + daireNo : null]
      .filter(Boolean).join(' ');
    const ulke = str(o.ulke).toUpperCase() || 'TR';
    if (ulke !== 'TR') {
      const out = [line1, str(o.mahalle), str(o.ilce), str(o.il), str(o.posta_kodu), countryLabel(ulke)]
        .filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
      return out || s;
    }
    const mahalle = str(o.mahalle);
    const line2 = [
      mahalle ? (/mah/i.test(mahalle) ? mahalle : mahalle + ' Mah.') : null,
      [o.ilce, o.il].filter(Boolean).join('/'),
      o.posta_kodu,
    ].filter(Boolean).join(', ');
    const out = [line1, line2].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
    return out || s;
  } catch { return s; }
}
