// İstasyon bazlı teknisyen yetkisi — tek kanonik model (user_station_skills).
// Yeniden Ata, kuyruk ve triyaj oto-atama bunu okur; İş Akışları → Personel yazar.
// Dayanıklı: tablo henüz yoksa (migration uygulanmadan) hata fırlatmaz, boş döner.
import { supabase } from './supabase';

/** Bir istasyona yetkili teknisyen user_id'leri. Hata/eksik tablo → null (= "bilinmiyor"). */
export async function fetchStationAuthorizedUserIds(stationId: string): Promise<string[] | null> {
  if (!stationId) return null;
  const { data, error } = await supabase
    .from('user_station_skills')
    .select('user_id')
    .eq('station_id', stationId);
  if (error) return null; // tablo yok / RLS → bilinmiyor (fallback davranışı çağırana ait)
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
}

/** Lab genelinde user_id → Set<station_id> haritası. Hata → boş Map. */
export async function fetchStationSkillsMap(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const { data, error } = await supabase
    .from('user_station_skills')
    .select('user_id, station_id');
  if (error || !data) return map;
  for (const r of data as any[]) {
    if (!map.has(r.user_id)) map.set(r.user_id, new Set());
    map.get(r.user_id)!.add(r.station_id);
  }
  return map;
}

/** Bir teknisyenin yetkili olduğu istasyon id'leri. */
export async function fetchUserStationIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_station_skills')
    .select('station_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return (data as any[]).map(r => r.station_id as string);
}

/**
 * Bir teknisyenin istasyon yetkilerini hedef listeyle eşitler (diff: ekle/sil).
 * İş Akışları → Personel editörü kullanır.
 */
export async function setUserStationSkills(
  userId: string,
  stationIds: string[],
  labId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const target = new Set(stationIds);
  const current = new Set(await fetchUserStationIds(userId));

  const toAdd = [...target].filter(id => !current.has(id));
  const toRemove = [...current].filter(id => !target.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('user_station_skills')
      .delete()
      .eq('user_id', userId)
      .in('station_id', toRemove);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length > 0) {
    const rows = toAdd.map(station_id => ({ user_id: userId, station_id, lab_id: labId }));
    const { error } = await supabase.from('user_station_skills').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Tek istasyon yetkisini aç/kapat (toggle). */
export async function toggleUserStationSkill(
  userId: string,
  stationId: string,
  currentlyHas: boolean,
  labId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (currentlyHas) {
    const { error } = await supabase
      .from('user_station_skills')
      .delete()
      .eq('user_id', userId)
      .eq('station_id', stationId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase
    .from('user_station_skills')
    .insert({ user_id: userId, station_id: stationId, lab_id: labId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
