export type ProvaStatus = 'planlandı' | 'gönderildi' | 'döndü' | 'tamamlandı';
export type ProvaType = 'bisküvi' | 'metal' | 'seramik' | 'bitmek' | 'teslim';

export const PROVA_TYPES: { value: ProvaType; label: string; emoji: string; color: string; bg: string }[] = [
  { value: 'bisküvi',  label: 'Bisküvi Prova',  emoji: '🟤', color: '#92400E', bg: '#FEF3C7' },
  { value: 'metal',    label: 'Metal Prova',     emoji: '⚙️',  color: '#374151', bg: '#F3F4F6' },
  { value: 'seramik',  label: 'Seramik Prova',   emoji: '💎',  color: '#1D4ED8', bg: '#EFF6FF' },
  { value: 'bitmek',   label: 'Bitmek Prova',    emoji: '🔍',  color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'teslim',   label: 'Teslim',          emoji: '✅',  color: '#059669', bg: '#ECFDF5' },
];

export interface Prova {
  id: string;
  work_order_id: string;
  order_item_id: string | null;
  order_item_name: string | null;
  prova_number: number;
  prova_type: ProvaType | null;
  scheduled_date: string | null;
  sent_date: string | null;
  return_date: string | null;
  quota: number | null;
  doctor_notes: string | null;
  lab_notes: string | null;
  status: ProvaStatus;
  created_by: string | null;
  created_at: string;
}
