/**
 * textCase.ts — Türkçe locale-aware metin normalizasyonu yardımcıları.
 *
 * Türkçe i/İ ı/I özel mapping için `toLocaleLowerCase('tr-TR')` ve
 * `toLocaleUpperCase('tr-TR')` kullanır.
 */

const TR_LOCALE = 'tr-TR';

/**
 * Türkçe Title Case: her kelimenin ilk harfi büyük + boşluk temizliği.
 *
 * Örnekler:
 *   "ayşe kaya"        → "Ayşe Kaya"
 *   "AYŞE KAYA"        → "Ayşe Kaya"
 *   "  ayşe   kaya  "  → "Ayşe Kaya"
 *   "ayşe kara-aydın"  → "Ayşe Kara-Aydın"
 *   "ışık özkan"       → "Işık Özkan"   (TR ı/I doğru)
 *   "dr ayşe"          → "Dr. Ayşe"     (kısaltma + nokta düzeltilir)
 */
export function titleCaseTR(raw: string): string {
  if (!raw) return raw;
  const cleaned = raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase(TR_LOCALE)
    // Noktadan sonra boşluksuz yazılmış ünvanı ayır: "dt.esra" → "dt. esra".
    // Ayrılmazsa ünvan tanınmıyor, normalizeDoctorName ikinci bir "Dt." ekliyordu
    // ("Dt. Dt.esra Güllüoğlu", 2026-10-19).
    .replace(/(^|\s)(dr|dt|prof|doç|opr|uzm)\.(?=\S)/g, '$1$2. ');
  // "Dr.", "Prof.", "Dt." gibi kısaltma önekleri
  const PREFIX_RE = /^(dr|dt|prof|doç|opr|uzm)\.?$/i;
  return cleaned
    .split(' ')
    .map((word) => {
      if (!word) return word;
      // Tireli kısımları ayrı ayrı capitalize: "kara-aydın" → "Kara-Aydın"
      return word.split('-').map(part => {
        if (!part) return part;
        // Kısaltma önekleri için ilk harf büyük + nokta korunur
        if (PREFIX_RE.test(part)) {
          const base = part.replace('.', '');
          return base.charAt(0).toLocaleUpperCase(TR_LOCALE) + base.slice(1) + '.';
        }
        return part.charAt(0).toLocaleUpperCase(TR_LOCALE) + part.slice(1);
      }).join('-');
    })
    .join(' ');
}

/**
 * Hekim ad-soyad normalizasyonu: titleCaseTR + "Dt." önek garantisi.
 *
 * Varsayılan önek "Dt." (Diş Tabibi) — bu bir diş laboratuvarı ürünü, sistemdeki
 * hekimlerin tamamı diş hekimi. Kullanıcı zaten bir ünvan yazdıysa (Dr./Dt./
 * Prof./Doç./Opr./Uzm.) ONA DOKUNULMAZ: "Prof. Dr. X" gibi gerçek ünvanları
 * "Dt."ye çevirmek yanlış olur.
 */
export const DOCTOR_TITLE_DEFAULT = 'Dt.';

export function normalizeDoctorName(raw: string): string {
  let cleaned = titleCaseTR(raw);
  if (!cleaned) return cleaned;
  // Baştaki AYNI ünvan tekrarını teke indir: "Dt. Dt. Ayşe" → "Dt. Ayşe".
  // ("Prof. Dr." gibi farklı ünvan zincirlerine dokunulmaz.)
  const words = cleaned.split(' ');
  while (words.length > 2 && /^(Dr|Dt|Prof|Doç|Opr|Uzm)\.$/.test(words[0]) && words[0] === words[1]) words.shift();
  cleaned = words.join(' ');
  const PREFIX_RE = /^(Dr\.?|Dt\.?|Prof\.?|Doç\.?|Opr\.?|Uzm\.?)\s/i;
  return PREFIX_RE.test(cleaned) ? cleaned : `${DOCTOR_TITLE_DEFAULT} ${cleaned}`;
}
