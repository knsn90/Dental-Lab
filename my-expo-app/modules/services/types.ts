export type PriceType = 'fixed' | 'percent' | 'free';

export interface LabService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  production_days: number | null;
  price_type: PriceType;
  unit: string | null;
  /** Tarama randevuları: bu hizmet bir tarama hizmeti mi (ağız içi / fotogrametri) */
  scan_kind?: 'intraoral' | 'photogrammetry' | null;
  /** Tarama siparişe dönerse ücretsiz mi (lab ayarı) */
  scan_free_if_order?: boolean;
  created_at: string;
}
