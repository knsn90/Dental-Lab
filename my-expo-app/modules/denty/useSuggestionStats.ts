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
import { useAuthStore } from '../../core/store/authStore';
import { autoT } from '../../core/i18n/autoTranslate';

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
    (async () => {
      // Tek tanım (2026-10-26): sayılar order_metrics / alacak görünümünden (lab günüyle hesaplanır).
      const out: Partial<Record<StatKey, SuggestionStat>> = {};

      // Her sorgu kendi başına başarısız olabilir; biri patlarsa diğerleri
      // yine gösterilsin diye allSettled.
      const tasks: Promise<void>[] = [];

      // ── Gecikmiş siparişler ────────────────────────────────────────────
      tasks.push((async () => {
        const { data } = await supabase.rpc('order_metrics');
        const count = Number((data as any)?.overdue) || 0;
        if (count > 0) {
          out.overdue_orders = { primary: `${count} sipariş gecikti`, alert: true };
        }
      })());

      // ── Vadesi geçmiş alacak (klinik bazında, avans düşülmüş; Özet ve hatırlatmayla aynı) ──
      tasks.push((async () => {
        const labId = (useAuthStore.getState().profile as any)?.lab_id ?? null;
        let q = supabase.from('v_clinic_balance_ccy').select('clinic_id, currency, overdue_net').gt('overdue_net', 0);
        if (labId) q = q.eq('lab_id', labId);
        const { data } = await q;
        const rows = (data ?? []) as { clinic_id: string; currency: string; overdue_net: number }[];
        if (rows.length === 0) return;
        const byCcy = new Map<string, number>();
        for (const r of rows) byCcy.set(r.currency || 'TRY', (byCcy.get(r.currency || 'TRY') ?? 0) + (Number(r.overdue_net) || 0));
        out.overdue_invoices = {
          primary: `${new Set(rows.map(r => r.clinic_id)).size} ${autoT('klinik ödeme bekliyor')}`,
          // Katı per-currency — toplamlar ayrı gösterilir, çevrilmez.
          secondary: Array.from(byCcy).map(([c, v]) => money(v, c)).join(' · '),
          alert: true,
        };
      })());

      // ── Faturasız teslimatlar ──────────────────────────────────────────
      // Finans yetkisi yoksa fatura bağı RLS'te gizli: görünüm her teslimatı
      // faturasız sayardı. Kart hiç gösterilmez.
      tasks.push((async () => {
        const { data: canFin } = await supabase.rpc('lab_can_view_finance');
        if (canFin !== true) return;
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
