/**
 * findClinicWebsite — "Simanty ile Logo" için klinik web sitesini kendiliğinden bulur.
 *
 * NEDEN: logo araması yalnız klinik adıyla Brandfetch'e soruyordu; Brandfetch
 * büyük markaları bilir, mahalle polikliniklerini bilmez → aday çıkmıyor,
 * kullanıcı siteyi elle yazmak zorunda kalıyordu. Site bilinince edge function
 * sitenin kendi logosunu (og:image / apple-touch-icon / <img …logo…>) çeker.
 *
 * Sıra (ucuzdan pahalıya):
 *   1. Kliniğin kurumsal e-posta alan adı (info@allianoi.com → allianoi.com) — ücretsiz.
 *   2. Google Places metin araması → websiteUri (ölçüldü: "Allianoi Ağız ve Diş
 *      Sağlığı Polikliniği" → https://allianoi.com/).
 * Bulunamazsa '' döner; arama yalnız adla sürer (eski davranış).
 */
import { supabase } from '../../../core/api/supabase';
import { findPlaceWebsite } from '../../auth/api/places';
import { corporateDomainOf } from './corporateDomain';
import { autoT } from '../../../core/i18n/autoTranslate';

export { corporateDomainOf };

export async function findClinicWebsite(clinicId: string | null | undefined, name: string): Promise<string> {
  if (clinicId) {
    try {
      const { data } = await supabase.from('clinics').select('email').eq('id', clinicId).maybeSingle();
      const d = corporateDomainOf((data as any)?.email);
      if (d) return d;
    } catch { /* e-posta okunamadı — Places'a geç */ }
  }
  return name.trim() ? findPlaceWebsite(name) : '';
}

/**
 * Logo aramasının Instagram sonucu için alanın altındaki kısa not.
 * Edge function `instagramStatus` döner: 'ok' | 'no_token' | 'not_found' | null.
 */
export function igNoteOf(status: unknown, handle: unknown): string | null {
  if (status === 'no_token') return autoT('Instagram araması henüz etkin değil.');
  if (status === 'not_found') return autoT('Instagram profili bulunamadı ya da işletme hesabı değil.') + (handle ? ` (@${String(handle)})` : '');
  return null;
}
