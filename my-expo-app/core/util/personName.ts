/**
 * Kişi adından hitap için kullanılacak parçayı çıkarır.
 *
 * Karşılama başlıkları `full_name.split(' ')[0]` kullanıyordu; "Mr. Farhagndoust"
 * gibi UNVANLA başlayan adlarda ilk kelime unvan olduğu için ekranda yalnız
 * "Mr." kalıyordu. Unvanlar baştan ayıklanır; geriye ad kalmazsa (ad SADECE
 * unvandan ibaretse) tam ad döndürülür — boş karşılamadansa iyidir.
 *
 * Türkçe (Dt./Dr./Doç./Prof./Op./Uzm.), İngilizce (Mr/Mrs/Ms/Miss/Dr/Prof) ve
 * Farsça (دکتر/آقای/خانم/مهندس) unvanları kapsar.
 */
const TITLE_RE =
  /^\s*(dt|dr|doktor|doç|doc|prof|op|uzm|md|mr|mrs|ms|miss|sn|sayın|دکتر|آقای|خانم|مهندس)\s*\.?\s*/i;

/** Unvanları ayıklanmış tam ad. */
export function stripTitles(fullName?: string | null): string {
  let n = String(fullName ?? '').trim();
  // Birden fazla unvan zincirlenebilir: "Prof. Dr. Ayşe"
  while (TITLE_RE.test(n)) {
    const next = n.replace(TITLE_RE, '').trim();
    if (!next || next === n) break;
    n = next;
  }
  return n;
}

/** Karşılamalarda kullanılan ilk ad. Ad yoksa fallback döner. */
export function firstName(fullName?: string | null, fallback = ''): string {
  const clean = stripTitles(fullName);
  const first = clean.split(/\s+/)[0] ?? '';
  if (first) return first;
  // Ad tamamen unvandan ibaretse tam adı göster ("Mr." → "Mr.")
  return String(fullName ?? '').trim() || fallback;
}
