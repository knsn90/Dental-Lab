/**
 * useOverdueClinics — "bugün kime ödeme hatırlatayım" (kullanıcının sabah kararı).
 *
 * Kaynak: v_clinic_balance_ccy.overdue_net (20261026100000) — vadesi geçmiş borç,
 * kliniğin dağıtılmamış avansı düşülmüş. Otomatik ve elle hatırlatma da bu tutara
 * göre gider (Task 5); kliniğin kendi ekranındaki rakamla aynıdır.
 * Görünüm çağıranın yetkisiyle çalışır: finans yetkisi yoksa boş döner.
 * Dövizler birbirine çevrilmez; klinik başına döviz satırları ayrı tutulur.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useLabToday } from '../../../core/metrics/useLabToday';

export type OverdueClinic = {
  clinic_id: string;
  clinic_name: string;
  byCurrency: { currency: string; overdue: number; balance: number }[];
  daysLate: number;
  lastReminderAt: string | null;
};

function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function useOverdueClinics(): { rows: OverdueClinic[]; loading: boolean; refetch: () => void } {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const labId = useAuthStore((s) => (s.profile as any)?.lab_id ?? null);
  const today = useLabToday();
  const [rows, setRows] = useState<OverdueClinic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      let q = supabase
        .from('v_clinic_balance_ccy')
        .select('clinic_id, clinic_name, currency, overdue_net, balance, oldest_overdue_date')
        .gt('overdue_net', 0);
      // Platform yöneticisi başka lab'ların satırlarını da görebilir → kendi lab'ı.
      if (labId) q = q.eq('lab_id', labId);
      const { data, error } = await q;
      if (error || !data) { setRows([]); return; }
      const byClinic = new Map<string, OverdueClinic & { oldest: string | null }>();
      for (const r of data as any[]) {
        const id = String(r.clinic_id);
        const cur = byClinic.get(id) ?? { clinic_id: id, clinic_name: String(r.clinic_name ?? ''), byCurrency: [], daysLate: 0, lastReminderAt: null, oldest: null };
        cur.byCurrency.push({ currency: String(r.currency ?? 'TRY'), overdue: Number(r.overdue_net) || 0, balance: Number(r.balance) || 0 });
        const od = r.oldest_overdue_date ? String(r.oldest_overdue_date).slice(0, 10) : null;
        if (od && (!cur.oldest || od < cur.oldest)) cur.oldest = od;
        byClinic.set(id, cur);
      }
      const ids = Array.from(byClinic.keys());
      if (ids.length) {
        const { data: rem } = await supabase
          .from('payment_reminders')
          .select('clinic_id, sent_at')
          .in('clinic_id', ids)
          .order('sent_at', { ascending: false })
          .limit(500);
        for (const r of (rem ?? []) as any[]) {
          const c = byClinic.get(String(r.clinic_id));
          if (c && !c.lastReminderAt && r.sent_at) c.lastReminderAt = String(r.sent_at);
        }
      }
      const out = Array.from(byClinic.values()).map(({ oldest, ...c }) => ({
        ...c,
        daysLate: oldest ? dayDiff(oldest, today) : 0,
      }));
      out.sort((a, b) => b.daysLate - a.daysLate);
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, [userId, labId, today]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, refetch: load };
}
