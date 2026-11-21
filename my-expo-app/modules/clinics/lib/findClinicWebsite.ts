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
