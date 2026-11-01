// Klinik adresi → kargo alıcı adres parçaları (saf — test: shipinkAddress.test.ts).
//
// clinics.address METİN sütunudur; içinde çoğunlukla JSON durur:
//   {"ulke","il","ilce","mahalle","sokak","bina_no","daire_no","posta_kodu"}
// Eskiden yalnız nesne beklendiği için metin JSON olduğu gibi sokak satırına gidiyor,
// bina/daire no hiç eklenmiyordu. Sokak satırı: "Atatürk Mah. Vatan Cad. No: 21 D: 3".

export interface AddressParts { street: string; city: string; state: string; zip: string; country: string }

export function clinicAddressParts(raw: unknown): AddressParts | null {
  let a: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object') a = raw as Record<string, unknown>;
  else if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    if (s.startsWith('{')) {
      try { const o = JSON.parse(s); if (o && typeof o === 'object') a = o; } catch { /* düz metin say */ }
    }
    if (!a) return { street: s, city: '', state: '', zip: '', country: '' };
  }
  if (!a) return null;

  const str = (...keys: string[]) => {
    for (const k of keys) { const v = String(a![k] ?? '').trim(); if (v) return v; }
    return '';
  };
  const country = (str('ulke') || 'TR').toUpperCase();
  const mahalle = str('mahalle');
  const bina = str('bina_no');
  const daire = str('daire_no');
  const street = [
    mahalle ? (country !== 'TR' || /\bmah/i.test(mahalle) ? mahalle : `${mahalle} Mah.`) : '',
    str('sokak', 'adres', 'street'),
    bina ? `No: ${bina}` : '',
    daire ? `D: ${daire}` : '',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  return { street, city: str('ilce', 'district'), state: str('il', 'city'), zip: str('posta_kodu', 'zip'), country };
}
