/**
 * Teslimat YÖNÜ — tek sözlük.
 *
 * Dört değer var ve ikisi "laboratuvara DOĞRU" akar:
 *   lab_to_clinic · clinic_to_lab   → siparişe bağlı bacaklar
 *   lab_to_other  · other_to_lab    → serbest gönderi (sipariş yok; karşı taraf
 *                                     klinik olmayabilir: tedarikçi, milling
 *                                     merkezi, şube, kargo şubesi…)
 *   other_to_other                  → serbest A → B (lab hiçbir uçta değil)
 *
 * Ekranlar uzun süre yalnız `clinic_to_lab`e baktı; serbest ALIM (`other_to_lab`)
 * bu yüzden "lab çıkışı" sanılıp gönderen sabit "Laboratuvar" yazıyordu —
 * oysa gönderen dışarıdaki alım noktasıdır (2026-09-19, GND-2026-0001).
 */
export function isIncomingLeg(direction?: string | null): boolean {
  return direction === 'clinic_to_lab' || direction === 'other_to_lab';
}

/** Serbest gönderi mi (siparişe bağlı olmayan yönler)? */
export function isFreeLeg(direction?: string | null): boolean {
  return direction === 'lab_to_other' || direction === 'other_to_lab' || direction === 'other_to_other';
}

/**
 * A → B (`other_to_other`): lab HİÇBİR uçta değil — ör. klinikten milling
 * merkezine. Gönderen `origin_*`, alıcı `destination_*`'dır; ikisi de dış nokta.
 * "Gelen" değildir (lab'a varmaz), "lab çıkışı" da değildir (lab'dan çıkmaz).
 */
export function isOutsideLeg(direction?: string | null): boolean {
  return direction === 'other_to_other';
}

/**
 * Bacağın iki ucunun KISA adı — sipariş lojistik kartındaki "X → Y" başlığı.
 * Eskiden yalnız clinic_to_lab'e bakılıyordu; dış servis (lab_to_other /
 * other_to_lab) ve A → B bacakları "Lab → Klinik" diye yanlış okunuyordu.
 * Dönen genel adlar (Lab, Klinik, Alım/Teslim noktası) çağıranda autoT'lenir.
 */
export function legEndLabels(leg: {
  direction?: string | null;
  origin_name?: string | null;
  destination_name?: string | null;
}): { from: string; to: string } {
  const o = leg.origin_name?.trim() || '';
  const d = leg.destination_name?.trim() || '';
  switch (leg.direction) {
    case 'clinic_to_lab':  return { from: 'Klinik', to: 'Lab' };
    case 'lab_to_other':   return { from: 'Lab', to: d || 'Teslim noktası' };
    case 'other_to_lab':   return { from: o || 'Alım noktası', to: 'Lab' };
    case 'other_to_other': return { from: o || 'Alım noktası', to: d || 'Teslim noktası' };
    default:               return { from: 'Lab', to: 'Klinik' };
  }
}
