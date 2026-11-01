// Google Places adres parçaları → ayrı "Cadde / Sokak", "Bina No" ve "Daire No" (saf — test: addressParts.test.mts).
// Eskiden bina no caddeyle birleştiriliyordu ("Atatürk Cd. No:12") → formdaki Bina No boş kalıyordu.

/** "Atatürk Cd. No:12" / "Vatan Caddesi No: 21/3" → { street, no }; numara yoksa no = ''. */
export function splitStreetNumber(text: string | null | undefined): { street: string; no: string } {
  const s = String(text ?? '').trim();
  const m = /^(.*?)[,\s]*\bNo\s*[:.]?\s*([0-9][\w/-]*)\s*$/i.exec(s);
  return m ? { street: m[1].trim(), no: m[2].trim() } : { street: s, no: '' };
}

/** Sondaki "D:3" / "D. 3" / "Daire 3" → { rest, daire }. "21/3" bölünmez (bina no da olabilir). */
export function splitDaire(text: string | null | undefined): { rest: string; daire: string } {
  const s = String(text ?? '').trim();
  const m = /^(.*?)[,\s]*\b(?:Daire|D)\s*[:.]?\s*([0-9][\w-]*)\s*$/i.exec(s);
  return m && m[1].trim() ? { rest: m[1].trim(), daire: m[2].trim() } : { rest: s, daire: '' };
}

/** Google bileşenleri (route, street_number, premise, subpremise) ya da birleşik yedek metinden cadde + bina no + daire no. */
export function streetAndNumber(p: { route: string; streetNumber: string; premise: string; subpremise?: string; fallback?: string }): { cadde: string; binaNo: string; daireNo: string } {
  const sub = String(p.subpremise ?? '').trim();
  if (p.route) {
    return { cadde: p.route.trim(), binaNo: [p.streetNumber, p.premise].map((x) => x.trim()).filter(Boolean).join(' '), daireNo: sub };
  }
  if (p.fallback) {
    const d = splitDaire(p.fallback);
    const f = splitStreetNumber(d.rest);
    return { cadde: f.street, binaNo: f.no || p.streetNumber.trim(), daireNo: sub || d.daire };
  }
  return { cadde: '', binaNo: [p.streetNumber, p.premise].map((x) => x.trim()).filter(Boolean).join(' '), daireNo: sub };
}
