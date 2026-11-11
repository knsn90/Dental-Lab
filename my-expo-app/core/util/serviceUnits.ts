/**
 * Hizmet birimi (lab_services.unit) farkındalığı — TEK KAYNAK.
 *
 * NEDEN VAR: bir diş laboratuvarında her iş aynı birimle sayılmaz.
 *   • Üye   → diş başına (kron, köprü, inlay, lamine…)   1 diş = 1 üye
 *   • Çene  → çene başına (gece plağı, şeffaf plak…)      bir plak = 1-2 çene
 *   • Vaka / Seans → iş başına 1 (ekspres teslim, photogrammetri)
 *   • Adet  → kalem başına (model baskısı, cerrahi guide, gülüş tasarımı)
 *
 * Bunları toplamak anlamsız bir sayı üretir: admin panosundaki "İş Tipi
 * Dağılımı" kartı gece plağını da diş sayarak topluyordu; tek bir plak
 * 16 "üye" görünüp listenin başına geçiyordu (ölçüm: 32 üye = 2 plak).
 *
 * Mantık daha önce NewOrderScreen içinde yereldi; panolar göremediği için
 * buraya taşındı. Yeni bir yerde miktar hesaplayacaksan BURAYI kullan.
 */

/** Diş numaralarından çene sayısı (üst 11–28, alt 31–48). */
export function archCountOf(teeth: number[]): number {
  const up = teeth.some((t) => t >= 11 && t <= 28);
  const lo = teeth.some((t) => t >= 31 && t <= 48);
  return (up ? 1 : 0) + (lo ? 1 : 0);
}

/**
 * Birime göre miktar: Çene→çene sayısı, Vaka/Seans→1, Adet→1, diğer→diş sayısı.
 * `Adet` de 1 döner çünkü kalem başına sayılır (model baskısı, guide…).
 */
export function serviceUnitQty(unit: string | null | undefined, teeth: number[]): number {
  const u = (unit ?? '').toLocaleLowerCase('tr-TR');
  if (u === 'çene') return Math.max(1, archCountOf(teeth));
  if (u === 'vaka' || u === 'seans' || u === 'adet') return 1;
  return teeth.length;
}

/** Birimin tekil gösterim etiketi ("üye", "çene", "adet"…). */
export function serviceUnitLabel(unit: string | null | undefined): string {
  const u = (unit ?? '').toLocaleLowerCase('tr-TR');
  if (u === 'çene')  return 'çene';
  if (u === 'vaka')  return 'vaka';
  if (u === 'seans') return 'seans';
  if (u === 'adet')  return 'adet';
  return 'üye';
}

/**
 * Virgülle birleştirilmiş iş tipi metninden ("Inlay / Onlay, Ti-Base Zirkon")
 * ortak birimi çözer. Bileşenlerin hepsi aynı birimdeyse onu, karışıksa
 * `null` döner — çağıran taraf o zaman varsayılan (üye) davranışa düşer.
 *
 * NOT: hizmet adı ile eşleşme yapılıyor çünkü order_items.service_id üretimde
 * boş (23 kalemin 23'ü null — ölçüldü 2026-08-04). service_id doldurulmaya
 * başlanırsa FK üzerinden çözmek daha sağlam olur.
 */
export function resolveUnitForWorkType(
  workType: string | null | undefined,
  unitByServiceName: Map<string, string | null>,
): string | null {
  if (!workType) return null;
  const parts = String(workType)
    .split(',')
    .map((s) => s.trim().toLocaleLowerCase('tr-TR'))
    .filter(Boolean);
  if (!parts.length) return null;

  const units = new Set<string>();
  for (const p of parts) {
    const u = unitByServiceName.get(p) ?? unitByBaseName(p, unitByServiceName);
    if (u) units.add(u.toLocaleLowerCase('tr-TR'));
    else return null;              // tanınmayan hizmet → varsayılana düş
  }
  return units.size === 1 ? Array.from(units)[0] : null;
}

/** Hizmet adının parantez ekleri atılmış çekirdeği:
 *  "3D baskı Gece Plağı ( Sprint Ray )" → "3D baskı Gece Plağı". Eski siparişler
 *  ekin eklenmesinden önceki adla kayıtlı; birebir eşleşmeyince birim kayboluyordu
 *  (gece plağı 3 sipariş × 16 diş = 48 "üye" görünüyordu). */
export function baseServiceName(name: string): string {
  return String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Birebir eşleşme yoksa: çekirdek adı aynı olan hizmetlerin TEK ortak birimi. */
function unitByBaseName(part: string, unitByServiceName: Map<string, string | null>): string | null {
  const want = baseServiceName(part).toLocaleLowerCase('tr-TR');
  if (!want) return null;
  const found = new Set<string>();
  for (const [name, unit] of unitByServiceName) {
    if (unit && baseServiceName(name).toLocaleLowerCase('tr-TR') === want) found.add(unit.toLocaleLowerCase('tr-TR'));
  }
  return found.size === 1 ? Array.from(found)[0] : null;
}

/** Dağılım kartının satır etiketi: bileşenler çekirdek ada indirilir, büyük/küçük
 *  harf farkı gözetmeden tekilleştirilir (ilk görülen yazım korunur). Böylece
 *  "X ( Sprint Ray )" ile "X" ve "X, X, X…" aynı satırda toplanır. */
export function workTypeGroupLabel(workType: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(workType ?? '').split(',')) {
    const base = baseServiceName(raw);
    const key = base.toLocaleLowerCase('tr-TR');
    if (!base || seen.has(key)) continue;
    seen.add(key);
    out.push(base);
  }
  return out.join(', ');
}

/** Her satırın payı yalnız KENDİ biriminin toplamına göre (üye üyeye, çene çeneye). */
export function unitShares(rows: { count: number; unit?: string | null }[]): number[] {
  const tot = new Map<string, number>();
  for (const r of rows) {
    const u = serviceUnitLabel(r.unit);
    tot.set(u, (tot.get(u) ?? 0) + (Number(r.count) || 0));
  }
  return rows.map((r) => {
    const t = tot.get(serviceUnitLabel(r.unit)) ?? 0;
    return t > 0 ? (Number(r.count) || 0) / t : 0;
  });
}

/**
 * Üye Trendi kovası: bir siparişin miktarı hangi sayaca yazılır?
 * "1 diş = 1 üye" yalnız üye birimli işler için doğrudur. Gece plağı / tam çene
 * gibi ÇENE birimli işler diş sayısıyla toplanınca tek plak 16 "üye" görünüyordu
 * (2026-11-11: 6 ayda 523 görünen, gerçekte 281 üye + 17 çene + 2 adet).
 * Birimi çözülemeyen (null / karışık) iş varsayılan olarak üyedir.
 */
export type MemberBucket = 'uye' | 'cene' | 'adet';
export function memberBucketOf(unit: string | null | undefined): MemberBucket {
  const u = (unit ?? '').toLocaleLowerCase('tr-TR');
  if (u === 'çene') return 'cene';
  if (u === 'vaka' || u === 'seans' || u === 'adet') return 'adet';
  return 'uye';
}
