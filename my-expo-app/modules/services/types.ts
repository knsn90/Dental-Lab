export interface LabService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}
