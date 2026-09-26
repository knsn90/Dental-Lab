/**
 * Teslimat YÖNÜ — tek sözlük.
 *
 * Dört değer var ve ikisi "laboratuvara DOĞRU" akar:
 *   lab_to_clinic · clinic_to_lab   → siparişe bağlı bacaklar
 *   lab_to_other  · other_to_lab    → serbest gönderi (sipariş yok; karşı taraf
 *                                     klinik olmayabilir: tedarikçi, milling
 *                                     merkezi, şube, kargo şubesi…)
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
  return direction === 'lab_to_other' || direction === 'other_to_lab';
}
