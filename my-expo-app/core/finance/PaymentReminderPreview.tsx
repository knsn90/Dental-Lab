// SADECE GELİŞTİRME — ödeme hatırlatma popup'ının admin panelinde önizlemesi.
//
// Admin bu popup'ı normalde HİÇ görmez (klinik/hekim panelinde çıkar). Tasarımı
// gerçek rakamlarla görebilmek için burada laboratuvarın gerçekten vadesi geçmiş
// bir müşterisinin faturaları okunup aynı bileşene veriliyor — uydurma veri yok.
//
// __DEV__ guard'ı şart: canlıda admin'e müşterisinin ödeme uyarısı gösterilemez.
import React, { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { PaymentReminderModal, type ReminderRow } from './PaymentReminderModal';

type Inv = { clinic_id: string | null; lab_id: string | null; currency: string | null; due_date: string | null; total: number | null; paid_amount: number | null };

export function PaymentReminderPreview() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      // NOT: `.not('status','in','("a","b")')` KULLANMA — tırnaklı biçim PostgREST'te
      // hata döndürür, supabase-js data=null verir ve liste sessizce boşalır.
      // Ayrıca `labs(name)` gömmesi FK yoksa tüm sorguyu düşürür; lab adı ayrı çekilir.
      const OPEN = ['kesildi', 'kismi_odendi'];
      const { data, error } = await supabase
        .from('invoices')
        .select('clinic_id, lab_id, currency, due_date, total, paid_amount')
        .lt('due_date', today)
        .in('status', OPEN);
      if (error) { console.warn('[payment-reminder:preview] vadesi geçen sorgusu:', error.message); return; }
      if (!alive || !data?.length) { console.info('[payment-reminder:preview] vadesi geçmiş fatura yok'); return; }

      // İlk vadesi geçmiş kliniği seç, o kliniğin TÜM açık faturalarını topla.
      const first = data[0] as any;
      const clinicId = first.clinic_id;
      if (!clinicId) return;
      const { data: all, error: allErr } = await supabase
        .from('invoices')
        .select('clinic_id, lab_id, currency, due_date, total, paid_amount')
        .eq('clinic_id', clinicId)
        .in('status', OPEN);
      if (allErr) { console.warn('[payment-reminder:preview] klinik faturaları:', allErr.message); return; }
      if (!alive || !all?.length) return;

      // Lab adı ayrı sorguda (gömme yerine) — FK adı değişse bile popup çalışır.
      let labName: string | null = null;
      if (first.lab_id) {
        const { data: lab } = await supabase.from('labs').select('name').eq('id', first.lab_id).maybeSingle();
        labName = lab?.name ?? null;
      }

      // RPC ile aynı gruplama: para birimi başına, toplama yok.
      const byCcy = new Map<string, ReminderRow>();
      for (const i of all as Inv[]) {
        const kalan = (Number(i.total) || 0) - (Number(i.paid_amount) || 0);
        if (kalan <= 0) continue;
        const ccy = i.currency ?? 'TRY';
        const late = !!i.due_date && i.due_date < today;
        const r = byCcy.get(ccy) ?? {
          lab_id: i.lab_id, lab_name: labName, currency: ccy,
          overdue_amount: 0, total_balance: 0, overdue_count: 0, oldest_due_date: null, days_late: 0,
        };
        r.total_balance += kalan;
        if (late) {
          r.overdue_amount += kalan;
          r.overdue_count += 1;
          if (!r.oldest_due_date || (i.due_date && i.due_date < r.oldest_due_date)) r.oldest_due_date = i.due_date!;
        }
        byCcy.set(ccy, r);
      }
      const list = [...byCcy.values()].filter(r => r.overdue_amount > 0);
      for (const r of list) {
        r.days_late = r.oldest_due_date
          ? Math.max(0, Math.round((Date.parse(today) - Date.parse(r.oldest_due_date)) / 86400000))
          : 0;
      }
      if (!list.length) return;
      setRows(list);
      setOpen(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!open) return null;
  return <PaymentReminderModal visible={open} rows={rows} onClose={() => setOpen(false)} />;
}
