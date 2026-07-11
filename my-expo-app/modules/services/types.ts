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
  created_at: string;
}
