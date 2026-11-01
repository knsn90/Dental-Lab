/**
 * Finans rakamlarının TEK kaynağı (20261026100000):
 *  - `finance_period_metrics(from, to)`: ciro (kesilmiş fatura, fatura tarihi) ve
 *    tahsilat (makbuz günü + makbuza bağlı olmayan ödeme), döviz başına.
 *  - `lab_receivables_summary()`: lab alacağı (pozitif bakiyeler), vadesi geçmiş
 *    (avans düşülmüş), avans fazlası ve taslak faturalar, döviz başına.
 * Finans yetkisi yoksa fonksiyonlar boş döner: boş dizi = yetki yok ya da veri yok.
 * Dövizler birbirine çevrilip toplanmaz.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';

export type FinancePeriodRow = { currency: string; revenue: number; invoice_count: number; collections: number };
export type LabReceivableRow = {
  currency: string;
  receivable: number;
  overdue: number;
  overdue_clinics: number;
  credit_surplus: number;
  draft_total: number;
  draft_count: number;
};

const num = (v: any) => Number(v) || 0;

export function useFinancePeriod(from: string, to: string): { rows: FinancePeriodRow[]; loading: boolean } {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [rows, setRows] = useState<FinancePeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId || !from || !to) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('finance_period_metrics', { p_from: from, p_to: to });
      if (!alive) return;
      setRows(error ? [] : ((data ?? []) as any[]).map((r) => ({
        currency: String(r.currency ?? 'TRY'),
        revenue: num(r.revenue),
        invoice_count: num(r.invoice_count),
        collections: num(r.collections),
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId, from, to]);
  return { rows, loading };
}

export function useLabReceivables(): { rows: LabReceivableRow[]; loading: boolean } {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [rows, setRows] = useState<LabReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('lab_receivables_summary');
      if (!alive) return;
      setRows(error ? [] : ((data ?? []) as any[]).map((r) => ({
        currency: String(r.currency ?? 'TRY'),
        receivable: num(r.receivable),
        overdue: num(r.overdue),
        overdue_clinics: num(r.overdue_clinics),
        credit_surplus: num(r.credit_surplus),
        draft_total: num(r.draft_total),
        draft_count: num(r.draft_count),
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);
  return { rows, loading };
}
