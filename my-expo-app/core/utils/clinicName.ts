// Klinik adından yaygın ekleri at (sidebar/hero gösteriminde sığsın).
// Örn: "Luna Dente Diş Polikliniği" → "Luna Dente", "Melis Ağız ve Diş Sağlığı Polikliniği" → "Melis".
const CLINIC_SUFFIXES = [
  'ağız ve diş sağlığı polikliniği', 'ağız ve diş sağlığı merkezi', 'ağız ve diş polikliniği',
  'diş sağlığı polikliniği', 'diş sağlığı merkezi', 'ağız diş polikliniği', 'ağız diş kliniği',
  // Lab ekleri (NexaDent dijital Diş Laboratuvarı → NexaDent)
  'dijital diş laboratuvarı', 'diş protez laboratuvarı', 'diş laboratuvarı', 'dental laboratuvarı',
  'dental laboratuvar', 'protez laboratuvarı', 'laboratuvarı', 'laboratuvar', 'dental lab',
  'diş polikliniği', 'diş kliniği', 'dental klinik', 'dental clinic', 'polikliniği', 'poliklinik',
  'kliniği', 'klinik', 'merkezi', 'dijital', 'dental', 'lab',
];

export function shortClinicName(raw?: string | null): string {
  let s = (raw ?? '').trim();
  if (!s) return s;
  // Çok-varyantlı adları ayır ("Melis … Polikliniği | Melis Dental Clinic | …") → ilk parça.
  const first = s.split(/[|/·]|\s[–—-]\s/)[0]?.trim();
  if (first) s = first;
  s = s.replace(/^özel\s+/i, '');
  const lower = s.toLocaleLowerCase('tr');
  for (const suf of CLINIC_SUFFIXES) {
    if (lower.endsWith(suf)) { s = s.slice(0, s.length - suf.length); break; }
  }
  s = s.replace(/[\s\-–—|·,]+$/u, '').trim();
  return s || (raw ?? '').trim();
}
