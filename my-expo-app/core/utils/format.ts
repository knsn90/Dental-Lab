export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
}
export function formatOrderNumber(num: string): string {
  return num?.toUpperCase() ?? '';
}

/**
 * Telefon numarasını E.164 biçimine normalize eder (varsayılan ülke: Türkiye, +90).
 *
 *   '05342649620'      → '+905342649620'
 *   '5342649620'       → '+905342649620'
 *   '0090 534 264...'  → '+90534264...'
 *   '+90 552 680 83 57'→ '+905526808357'
 *   '905342649620'     → '+905342649620'
 *
 * Geçerli bir numara çıkaramazsa null döner. defaultCc rakam-only ülke kodu.
 */
export function toE164(raw: string | null | undefined, defaultCc = '90'): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;

  let e164: string;
  if (hasPlus) {
    e164 = '+' + digits;                                   // zaten uluslararası
  } else if (digits.startsWith('00')) {
    e164 = '+' + digits.slice(2);                          // 00 → +
  } else if (digits.length === 11 && digits.startsWith('0')) {
    e164 = '+' + defaultCc + digits.slice(1);              // 0XXXXXXXXXX → +90XXXXXXXXXX
  } else if (digits.length === 10 && digits.startsWith('5')) {
    e164 = '+' + defaultCc + digits;                       // 5XXXXXXXXX → +905XXXXXXXXX
  } else if (digits.startsWith(defaultCc) && digits.length === 2 + 10) {
    e164 = '+' + digits;                                   // 90XXXXXXXXXX → +90XXXXXXXXXX
  } else {
    e164 = '+' + digits;                                   // en iyi tahmin
  }

  // Genel E.164 doğrulama: + ve 8–15 rakam, ilk rakam 0 değil
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
