/** Saf kural — test edilebilsin diye supabase'siz ayrı dosyada. */
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|yandex|mail|aol|proton|protonmail|gmx|web|windowslive)\./i;

/** Kurumsal e-posta adresinden alan adı; ücretsiz posta servislerinde null. */
export function corporateDomainOf(email: string | null | undefined): string | null {
  const m = String(email ?? '').trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  const d = m[1].replace(/^www\./, '');
  return FREE_MAIL.test(d) ? null : d;
}
