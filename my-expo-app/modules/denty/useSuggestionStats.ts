/**
 * useSuggestionStats — Simanty öneri kartlarındaki CANLI rakamlar.
 *
 * NEDEN: kartlar sabit birer etiketti ("Tahsilat", "Gecikmiş işler"). Asistan
 * bir şey biliyormuş gibi durmuyordu; kullanıcı ne çıkacağını görmeden tıklamak
 * zorundaydı. Rakamı kartın üstünde göstermek hem asistanı canlı hissettiriyor
 * hem de tıklamadan önce cevabın bir kısmını veriyor.
 *
 * TASARIM KARARLARI
 *   • Yalnız SAYIM sorguları (`head: true, count: 'exact'`) — satır çekilmez.
 *     Panel her açıldığında çalıştığı için ucuz olmak zorunda.
 *   • Tutar gereken tek kart (tahsilat) için sınırlı alan seçilir.
 *   • Sorgular RLS altında çalışır; lab_id filtresi ELLE eklenmez, politika
 *     zaten kiracıyı ayırıyor (fazladan filtre yanlış lab_id ile sessizce boş
 *     sonuç üretme riski taşırdı).
 *   • Hata YUTULUR: istatistik gelmezse kart eski sade hâline döner. Asistanın
 *     açılmaması, bir sayının gelmemesinden daha kötü.
 *   • Katı per-currency: tutarlar dövize göre ayrı toplanır, çevrilmez
 *     (bkz. finans çoklu-döviz kuralı).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../core/api/supabase';
import type { PanelGroup } from './context';

/** Bir öneri kartının altında gösterilecek canlı bilgi. */
export interface SuggestionStat {
  /** Ana rakam — "4 gecikmiş fatura" */
  primary: string;
  /** İkincil satır — "420 €" ya da "CAM Hazırlık" */
  secondary?: string;
  /** true → dikkat çeken ton (gecikme, kritik stok) */
  alert?: boolean;
}

export type StatKey =
  | 'overdue_orders'      // gecikmiş siparişler
  | 'overdue_invoices'    // vadesi geçmiş faturalar
  | 'unbilled'            // faturasız teslimatlar
  | 'low_stock'           // kritik stok
  | 'station_queue';      // istasyonda bekleyen aşama

/** Sipariş "kapandı" sayılan statüler — gecikme sayımından düşer. */
const FINAL_STATUSES = ['teslim_edildi', 'iptal', 'iptal_edildi', 'reddedildi', 'tamamlandi'];
/** Faturanın hâlâ tahsil edilebilir olduğu statüler (taslak alacak DEĞİL). */
const OPEN_INVOICE_STATUSES = ['kesildi', 'kismi_odendi'];

const CCY_SYMBOL: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };

function money(n: number, ccy: string): string {
  const sym = CCY_SYMBOL[ccy] ?? ccy;
  return `${sym}${(Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

export function useSuggestionStats(panel: PanelGroup | null, enabled: boolean) {
  const [stats, setStats] = useState<Partial<Record<StatKey, SuggestionStat>>>({});

  useEffect(() => {
    if (!enabled || !panel) return;
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);

    (async () => {
      const out: Partial<Record<StatKey, SuggestionStat>> = {};

      // Her sorgu kendi başına başarısız olabilir; biri patlarsa diğerleri
      // yine gösterilsin diye allSettled.
      const tasks: Promise<void>[] = [];

      // ── Gecikmiş siparişler ────────────────────────────────────────────
      tasks.push((async () => {
        const { count } = await supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .lt('delivery_date', today)
          .not('status', 'in', `(${FINAL_STATUSES.join(',')})`);
        if (count && count > 0) {
          out.overdue_orders = { primary: `${count} sipariş gecikti`, alert: true };
        }
      })());

      // ── Vadesi geçmiş faturalar (sayı + döviz bazlı bakiye) ────────────
      tasks.push((async () => {
        const { data } = await supabase
          .from('invoices')
          .select('total_amount, paid_amount, currency')
          .in('status', OPEN_INVOICE_STATUSES)
          .lt('due_date', today);
        const rows = (data ?? []) as { total_amount: number; paid_amount: number; currency: string }[];
        if (rows.length === 0) return;
        const byCcy = new Map<string, number>();
        for (const r of rows) {
          const bal = (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0);
          if (bal <= 0) continue;
          const c = r.currency || 'TRY';
          byCcy.set(c, (byCcy.get(c) ?? 0) + bal);
        }
        if (byCcy.size === 0) return;
        out.overdue_invoices = {
          primary: `${rows.length} fatura vadesi geçti`,
          // Katı per-currency — toplamlar ayrı gösterilir, çevrilmez.
          secondary: Array.from(byCcy).map(([c, v]) => money(v, c)).join(' · '),
          alert: true,
        };
      })());

      // ── Faturasız teslimatlar ──────────────────────────────────────────
      tasks.push((async () => {
        const { count } = await supabase
          .from('v_unbilled_work_orders')
          .select('id', { count: 'exact', head: true });
        if (count && count > 0) out.unbilled = { primary: `${count} teslimat faturasız` };
      })());

      // ── Kritik stok ────────────────────────────────────────────────────
      tasks.push((async () => {
        // PostgREST kolon-kolon karşılaştırmayı desteklemiyor; eşiği olan
        // kalemler çekilip istemcide süzülür (stok kalemi sayısı küçük).
        const { data } = await supabase
          .from('stock_items')
          .select('quantity, min_quantity')
          .not('min_quantity', 'is', null);
        const low = (data ?? []).filter(
          (r: any) => Number(r.quantity) <= Number(r.min_quantity),
        ).length;
        if (low > 0) out.low_stock = { primary: `${low} kalem kritik seviyede`, alert: true };
      })());

      // ── İstasyon kuyruğu ───────────────────────────────────────────────
      tasks.push((async () => {
        const { count } = await supabase
          .from('order_stages')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'bekliyor');
        if (count && count > 0) out.station_queue = { primary: `${count} aşama bekliyor` };
      })());

      await Promise.allSettled(tasks);
      if (!cancelled) setStats(out);
    })();

    return () => { cancelled = true; };
  }, [panel, enabled]);

  return stats;
}
