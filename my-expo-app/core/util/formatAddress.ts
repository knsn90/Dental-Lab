// core/util/formatAddress.ts
// Adresler bazı kayıtlarda JSON string olarak tutuluyor:
//   {"il":"İstanbul","ilce":"Ataşehir","mahalle":"Atatürk","sokak":"...","bina_no":"B Blok","posta_kodu":"34758"}
// Ekranda ham basılınca kullanıcıya küme parantezli/tırnaklı çöp görünüyor.
//
// Bu fonksiyon JSON ise okunabilir tek satıra çevirir, düz metinse aynen döner,
// bozuk JSON'da ham değeri döndürür (asla çökmez).
//
// Not: aynı mantığın kopyaları modules/invoices ve modules/clinics içinde de var;
// çıktı biçimi onlarla birebir aynı tutuldu. İleride onlar da buraya bağlanabilir.

export function formatAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!(s.startsWith('{') && s.endsWith('}'))) return s;
  try {
    const o: any = JSON.parse(s);
    if (!o || typeof o !== 'object') return s;
    const sokak = String(o.sokak ?? '').trim();
    const binaNo = String(o.bina_no ?? '').trim();
    const line1 = [sokak, binaNo && !sokak.includes(binaNo) ? 'No: ' + binaNo : null].filter(Boolean).join(' ');
    const mahalle = String(o.mahalle ?? '').trim();
    const line2 = [
      mahalle ? (/mah/i.test(mahalle) ? mahalle : mahalle + ' Mah.') : null,
      [o.ilce, o.il].filter(Boolean).join('/'),
      o.posta_kodu,
    ].filter(Boolean).join(', ');
    const out = [line1, line2].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
    return out || s;
  } catch { return s; }
}
