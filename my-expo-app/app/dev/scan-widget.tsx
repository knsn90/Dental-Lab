// /dev/scan-widget — ağsız görsel kontrol: Özet ızgarası (DashGrid, 4 → 2 → 1 sütun), tarama widget'ı (sahte
// veriyle ScanWidgetView) ve alan içinde açılan saat tekerleği (TimeField). Gerçek kişi adı / tutar yok.
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInkUI } from '../../core/theme/inkScale';
import { DS } from '../../core/theme/dsTokens';
import { DashRow, DashHalf, DashCell } from '../../modules/dashboard/components/DashGrid';
import { ScanWidgetView } from '../../modules/scans/components/ScanCalendarCard';
import { TimeField } from '../../modules/scans/components/WheelTimePicker';
import { addDays, addMonths, labLocalParts, labLocalToIso } from '../../modules/scans/scanModel';
import type { ScanAppointmentRow } from '../../modules/scans/types';
import { ApptCard } from '../../modules/scans/components/ScanApptCard';
import { LabMobileDashboard } from '../../modules/dashboard/components/LabMobileDashboard';
import { WhiteHero } from '../../core/ui/WhiteHero';
import { DrawerCard } from '../../modules/cash/components/DrawerCard';
import { DrawerMovementList } from '../../modules/cash/components/DrawerMovementList';
import { CountDrawerModal } from '../../modules/cash/components/CountDrawerModal';
import { DepositModal } from '../../modules/cash/components/DepositModal';
import { OpenDrawerModal } from '../../modules/cash/components/OpenDrawerModal';
import { CashNote } from '../../modules/cash/components/CashModalShell';
import type { Drawer, CashMovement } from '../../modules/cash/api';
import { ExpenseMobileTable } from '../../modules/expenses/components/ExpenseMobileTable';
import { InvoiceMobileTable } from '../../modules/invoices/components/InvoiceMobileTable';
import type { Invoice } from '../../modules/invoices/types';
import type { Expense } from '../../modules/expenses/api';
import { groupByCurrency } from '../../core/money/aggregations';

const TZ = 'Europe/Istanbul';

function fakeRows(today: string): ScanAppointmentRow[] {
  const plan: [number, number, number, 'intraoral' | 'photogrammetry' | 'both', string][] = [
    [0, 9 * 60 + 30, 90, 'intraoral', 'Klinik A'], [0, 13 * 60, 60, 'photogrammetry', 'Klinik B'],
    [0, 16 * 60, 90, 'both', 'Klinik C'], [0, 18 * 60, 45, 'intraoral', 'Klinik D'],
    [1, 10 * 60, 90, 'intraoral', 'Klinik B'], [2, 11 * 60, 60, 'intraoral', 'Klinik A'], [2, 15 * 60, 60, 'photogrammetry', 'Klinik E'],
    [4, 9 * 60, 90, 'intraoral', 'Klinik C'], [7, 14 * 60, 90, 'intraoral', 'Klinik A'], [-2, 10 * 60, 60, 'intraoral', 'Klinik D'],
    [9, 9 * 60, 60, 'photogrammetry', 'Klinik B'], [9, 12 * 60, 60, 'intraoral', 'Klinik F'], [9, 16 * 60, 60, 'intraoral', 'Klinik A'],
  ];
  return plan.map(([d, min, dur, kind, clinic], i) => ({
    id: `demo-${i}`, starts_at: labLocalToIso(addDays(today, d), min, TZ), duration_min: dur,
    status: d < 0 ? 'yapildi' : 'planlandi', clinic: { name: clinic },
    services: (kind === 'both' ? ['intraoral', 'photogrammetry'] : [kind]).map((k) => ({ scan_kind: k })),
    patients: [],
  }) as unknown as ScanAppointmentRow);
}

function Placeholder({ label, h = 220, dark }: { label: string; h?: number; dark?: boolean }) {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, minHeight: h, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: U.hairline, padding: 18,
      backgroundColor: dark ? '#333333' : U.surface }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: dark ? '#FFFFFF' : U.ink[900] }}>{label}</Text>
    </View>
  );
}

export default function ScanWidgetDemo() {
  const U = useInkUI();
  const q = useLocalSearchParams<{ w?: string; open?: string; view?: string }>();   // ?w=820&open=1 — temiz yüklemeyle her durum
  const today = labLocalParts(new Date().toISOString(), TZ).date;
  const rows = useMemo(() => fakeRows(today), [today]);
  const [sel, setSel] = useState(today);
  const [month, setMonth] = useState(today);
  const [width, setWidth] = useState<number | null>(q.w ? Number(q.w) : null);
  const [t, setT] = useState<number | null>(9 * 60);
  const [open, setOpen] = useState(q.open === '1');

  const widget = (
    <ScanWidgetView
      style={{ flex: 1 }} today={today} sel={sel} month={month} rows={rows} tz={TZ} workdays={[1, 2, 3, 4, 5, 6]}
      pending={2} canManage
      onPick={(d, inMonth) => { setSel(d); if (!inMonth) setMonth(d); }}
      onStep={(n) => setMonth(addMonths(month, n))}
      onToday={() => { setSel(today); setMonth(today); }}
      onNav={() => {}} onNew={() => {}} onOpenRow={() => {}}
    />
  );

  if (q.view === 'cash') {
    // Nakit kasa (madde 8) — sahte veri: açık TL kasası + açılmamış EUR kasası, hareket listesi, pencereler.
    // ?open=count | deposit | open — pencereyi açık yükler (düğmeye basılmaz; RPC çağrılmaz).
    const dr = {
      id: 'demo-try', lab_id: 'demo', name: 'Nakit Kasa · TRY', account_type: 'kasa', bank_name: null, iban: null,
      currency: 'TRY', opening_balance: 1000, is_active: true, notes: null, created_at: today, is_drawer: true,
      opened_at: `${today}T08:00:00Z`, total_in: 400, total_out: 150, balance: 1250,
      last_count: { counted_at: `${today}T17:00:00Z`, diff: -50 },
    } as Drawer;
    const mv = (id: string, ref_type: string | null, direction: 'giris' | 'cikis', amount: number, category: string, description: string) =>
      ({ id, lab_id: 'demo', account_id: dr.id, direction, amount, movement_date: today, category, description, ref_type, ref_id: ref_type ? 'x' : null, created_at: today }) as CashMovement;
    const moves = [
      mv('m1', 'payment', 'giris', 300, 'tahsilat', 'Tahsilat · FTR-2026-00001'),
      mv('m2', 'clinic_receipt_line', 'giris', 100, 'tahsilat', 'Makbuz · Klinik A'),
      mv('m3', 'expense', 'cikis', 40, 'kira', 'Gider · Kira'),
      mv('m4', null, 'cikis', 60, 'transfer', 'Bankaya yatırıldı'),
      mv('m5', 'cash_count', 'cikis', 50, 'sayim', 'Sayım farkı · 28.10.2026'),
    ];
    return (
      <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#F5F1EB' }}
        contentContainerStyle={{ padding: 16, gap: 16, maxWidth: q.w ? Number(q.w) : undefined }}>
        <WhiteHero kicker="Nakit Kasa" description="Bu kasa, Siman'a girilen nakit tahsilat ve giderlerden hesaplanır. Nakit kayıtları Siman'a girildikçe doğru kalır.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 }}>
            <DrawerCard currency="TRY" drawer={dr} selected canManage onSelect={() => {}} onOpen={() => {}} onCount={() => {}} onDeposit={() => {}} />
            <DrawerCard currency="EUR" drawer={null} selected={false} canManage onSelect={() => {}} onOpen={() => {}} onCount={() => {}} onDeposit={() => {}} />
          </View>
          <View style={{ marginTop: 12 }}><CashNote tone="warning">Kasası olmayan nakit: USD 2 kayıt</CashNote></View>
        </WhiteHero>
        <DrawerMovementList drawer={dr} movements={moves} loading={false} canManage onChanged={() => {}} />
        <CountDrawerModal visible={q.open === 'count'} drawer={dr} onClose={() => {}} onDone={() => {}} />
        <DepositModal visible={q.open === 'deposit'} drawer={dr} onClose={() => {}} onDone={() => {}} />
        <OpenDrawerModal visible={q.open === 'open'} currency="EUR" onClose={() => {}} onDone={() => {}} />
      </ScrollView>
    );
  }

  if (q.view === 'expenses') {
    // Giderler mobil tablosu (sahte veri) — ekstre tablosuyla aynı kalıp; düğmeler bir şey yapmaz
    const ex = (id: string, category: string, description: string, payment_method: string, amount: number, currency: string) =>
      ({ id, category, description, payment_method, amount, currency, expense_date: today }) as unknown as Expense;
    const list = [
      ex('e1', 'kira', 'Atölye kirası · Ekim', 'havale', 18500, 'TRY'),
      ex('e2', 'kurye', 'Kurye ücreti · NEX-2026-0210', 'nakit', 350, 'TRY'),
      ex('e3', 'malzeme', 'Zirkonya disk 98 mm (uzun açıklama satırı kesilmeli)', 'kart', 240, 'EUR'),
      ex('e4', 'vergi', 'KDV ödemesi', 'havale', 7200, 'TRY'),
    ];
    const totals = groupByCurrency(list, e => ({ amount: Number(e.amount) || 0, currency: ((e as any).currency ?? 'TRY') }));
    return (
      <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#F5F1EB' }}
        contentContainerStyle={{ padding: 16, maxWidth: q.w ? Number(q.w) : undefined }}>
        <ExpenseMobileTable rows={list} totals={totals} accent={DS.exec.primary} onOpen={() => {}} onEdit={() => {}} onDelete={() => {}} />
      </ScrollView>
    );
  }

  if (q.view === 'invoices') {
    // Faturalar mobil tablosu (sahte veri) — gecikmiş, kısmi, ödenmiş, e-Fatura rozetli, taslak
    const inv = (id: string, invoice_number: string, status: string, total: number, paid_amount: number, currency: string, due_date: string | null, efatura: string | null) =>
      ({ id, invoice_number, status, total, paid_amount, currency, issue_date: addDays(today, -20), due_date,
         efatura_uuid: efatura ? 'x' : null, efatura_status: efatura,
         clinic: { name: 'Klinik A' }, doctor: { full_name: 'Hekim B' }, work_order: { patient_name: 'Hasta C' } }) as unknown as Invoice;
    const list = [
      inv('i1', 'F-NEX-2026-0210', 'kesildi', 6380, 0, 'TRY', addDays(today, -5), 'accepted'),
      inv('i2', 'FTR-2026-00071', 'kismi_odendi', 840, 300, 'EUR', addDays(today, 10), null),
      inv('i3', 'F-NEX-2026-0192-2', 'odendi', 1815, 1815, 'TRY', addDays(today, 3), 'sent'),
      inv('i4', 'FTR-2026-00069', 'taslak', 0, 0, 'TRY', null, null),
    ];
    return (
      <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#F5F1EB' }}
        contentContainerStyle={{ padding: 16, maxWidth: q.w ? Number(q.w) : undefined }}>
        <InvoiceMobileTable invoices={list} accent={DS.exec.primary} onOpen={() => {}} />
      </ScrollView>
    );
  }

  if (q.view === 'labmobile') {
    // Lab mobil Özet (sahte veri): halka = teslim oranı, sipariş trendi, mesajlar kartı yok
    return (
      <LabMobileDashboard
        liveActive={3} liveTotal={63} liveDelivered={60} livePercent={95}
        liveStages={{ alindi: 1, uretim: 2, kk: 0, hazir: 0 }}
        activeOrders={3} todayCompleted={1} weekCompleted={4} overdueCount={1} pendingApprovalsCount={0}
        orderTrend={[{ label: 'May', count: 0 }, { label: 'Haz', count: 36 }, { label: 'Tem', count: 59 }, { label: 'Ağu', count: 91 }, { label: 'Eyl', count: 148 }, { label: 'Eki', count: 86, teeth: 212 }]}
        delayed={[]} recentOrders={[]}
      />
    );
  }

  if (q.view === 'tech') {
    // Teknisyen "Randevularım" kartları (375px) — adresli, cihazlı, yapılmış hâller
    const demo = rows.slice(0, 3).map((r, i) => ({
      ...r, technician_id: 'demo',
      clinic: { ...(r.clinic as any), address: i === 1 ? null : '{"mahalle":"Caferağa","cadde":"Moda Cad.","no":"12","ilce":"Kadıköy","il":"İstanbul"}' },
      services: (r.services as any[]).map((sv) => ({ ...sv, equipment_id: 'dev1' })),
      patients: i === 0 ? [{ id: 'p1' }, { id: 'p2' }] as any : [],
      status: i === 2 ? 'yapildi' : 'planlandi',
    }) as ScanAppointmentRow);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#F5F9FD' }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 420 }}>
        {demo.map((r, i) => (
          <ApptCard key={r.id} row={r} startMin={[810, 975, 600][i]} devices={[{ id: 'dev1', name: 'Medit i900' }]} onOpen={() => {}} />
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#F5F1EB' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {[null, 1100, 820, 470].map((w) => (
          <Pressable key={String(w)} nativeID={`w-${w ?? 'full'}`} onPress={() => setWidth(w)}
            style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, justifyContent: 'center',
              backgroundColor: width === w ? U.ink[900] : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: width === w ? U.surface : U.plainBtn.fg }}>{w ? `${w}px` : 'tam'}</Text>
          </Pressable>
        ))}
      </View>

      <View nativeID="grid" style={{ width: width ?? '100%', gap: 0 }}>
        <DashRow gap={14} style={{ marginBottom: 14 }}>
          <DashHalf gap={14}>
            <DashCell><Placeholder label="Kart 1" /></DashCell>
            <DashCell><Placeholder label="Kart 2" /></DashCell>
          </DashHalf>
          <DashHalf gap={14}>
            <DashCell><Placeholder label="Kart 3" /></DashCell>
            <DashCell><Placeholder label="Kart 4" /></DashCell>
          </DashHalf>
        </DashRow>
        <DashRow gap={14}>
          <DashHalf gap={14}>
            <DashCell><Placeholder label="Bu hafta" /></DashCell>
          </DashHalf>
          <DashHalf gap={14}>
            <DashCell><Placeholder label="Bugünkü görevler" dark /></DashCell>
            <DashCell>{widget}</DashCell>
          </DashHalf>
        </DashRow>
      </View>

      <View nativeID="timefield" style={{ maxWidth: 420, padding: 18, borderRadius: 20, backgroundColor: U.surface }}>
        <TimeField label="Saat (öneri dışında seçebilirsiniz)" value={t} onChange={setT} fallback={540} open={open} onToggle={() => setOpen((o) => !o)} />
        <Text style={{ marginTop: 10, fontSize: 12, color: U.ink[500] }}>{t != null ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '—'}</Text>
      </View>
    </ScrollView>
  );
}
