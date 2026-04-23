import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../../core/api/supabase';
import { useBreakpoint } from '../../../core/layout/Responsive';

interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

interface UpcomingDue {
  id: string;
  invoice_number: string;
  due_date: string;
  balance: number;
  clinic_name: string | null;
  days_until_due: number;
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

export function FinanceReportScreen() {
  const { px, isDesktop } = useBreakpoint();
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rapor' | 'hatirlatma'>('rapor');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [s1, s2] = await Promise.all([
        supabase.from('v_monthly_finance_summary').select('*').limit(12),
        supabase.from('v_upcoming_due_invoices').select('*').limit(20),
      ]);
      setSummary((s1.data ?? []) as MonthlySummary[]);
      setUpcoming((s2.data ?? []) as UpcomingDue[]);
      setLoading(false);
    };
    load();
  }, []);

  const totals = summary.reduce(
    (acc, m) => ({
      income: acc.income + Number(m.income),
      expense: acc.expense + Number(m.expense),
      profit: acc.profit + Number(m.profit),
    }),
    { income: 0, expense: 0, profit: 0 },
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Gelir / Gider Raporu</Text>
          <Text style={s.subtitle}>Son 12 aylık mali özet</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { paddingHorizontal: px }]}>
        {(['rapor', 'hatirlatma'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'rapor' ? '📊 Rapor' : `🔔 Hatırlatmalar${upcoming.length > 0 ? ` (${upcoming.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 64 }} color="#2563EB" />
      ) : tab === 'rapor' ? (
        <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }}
          contentContainerStyle={{ padding: px, paddingBottom: 48, gap: 16 }}
          showsVerticalScrollIndicator={false}>

          {/* KPI summary */}
          <View style={isDesktop ? s.kpiRowDesktop : s.kpiRowMobile}>
            <KpiCard label="Toplam Gelir" value={fmtMoney(totals.income)} color="#2563EB" icon="trending-up" />
            <KpiCard label="Toplam Gider" value={fmtMoney(totals.expense)} color="#EF4444" icon="trending-down" />
            <KpiCard
              label="Net Kâr"
              value={fmtMoney(totals.profit)}
              color={totals.profit >= 0 ? '#047857' : '#EF4444'}
              icon={totals.profit >= 0 ? 'check-circle-outline' : 'alert-circle-outline'}
            />
          </View>

          {/* Monthly breakdown */}
          <Text style={s.sectionTitle}>Aylık Döküm</Text>
          {summary.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name={'chart-bar' as any} size={40} color="#CBD5E1" />
              <Text style={s.emptyText}>Veri bulunamadı</Text>
            </View>
          ) : (
            summary.map(m => <MonthRow key={m.month} month={m} />)
          )}
        </ScrollView>
      ) : (
        /* Hatırlatmalar */
        <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }}
          contentContainerStyle={{ padding: px, paddingBottom: 48, gap: 10 }}
          showsVerticalScrollIndicator={false}>

          {upcoming.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name={'bell-check-outline' as any} size={40} color="#CBD5E1" />
              <Text style={s.emptyText}>14 gün içinde vadesi dolan fatura yok 🎉</Text>
            </View>
          ) : (
            upcoming.map(inv => <ReminderCard key={inv.id} inv={inv} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <View style={[kpi.card, { flex: 1 }]}>
      <View style={[kpi.iconWrap, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={kpi.label}>{label}</Text>
      <Text style={[kpi.value, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Month Row ─────────────────────────────────────────────────────────────────
function MonthRow({ month: m }: { month: MonthlySummary }) {
  const income = Number(m.income);
  const expense = Number(m.expense);
  const profit = Number(m.profit);
  const maxVal = Math.max(income, expense, 1);
  const incomeW = Math.round((income / maxVal) * 100);
  const expenseW = Math.round((expense / maxVal) * 100);

  return (
    <View style={mr.wrap}>
      <Text style={mr.month}>{fmtMonth(m.month)}</Text>
      <View style={mr.row}>
        {/* Income bar */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={mr.barTrack}>
            <View style={[mr.barFill, { width: `${incomeW}%` as any, backgroundColor: '#2563EB' }]} />
          </View>
          <Text style={mr.barLabel}>Gelir: {fmtMoney(income)}</Text>
        </View>
        {/* Expense bar */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={mr.barTrack}>
            <View style={[mr.barFill, { width: `${expenseW}%` as any, backgroundColor: '#EF4444' }]} />
          </View>
          <Text style={mr.barLabel}>Gider: {fmtMoney(expense)}</Text>
        </View>
        {/* Profit */}
        <View style={{ alignItems: 'flex-end', minWidth: 100 }}>
          <Text style={[mr.profit, { color: profit >= 0 ? '#047857' : '#EF4444' }]}>
            {profit >= 0 ? '+' : ''}{fmtMoney(profit)}
          </Text>
          <Text style={mr.profitLabel}>Kâr</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Reminder Card ─────────────────────────────────────────────────────────────
function ReminderCard({ inv }: { inv: UpcomingDue }) {
  const days = inv.days_until_due;
  const urgent = days <= 3;
  const color = urgent ? '#EF4444' : days <= 7 ? '#F59E0B' : '#2563EB';

  return (
    <View style={[rc.wrap, urgent && rc.wrapUrgent]}>
      <View style={[rc.badge, { backgroundColor: color + '15' }]}>
        <Text style={[rc.badgeDays, { color }]}>{days}</Text>
        <Text style={[rc.badgeLabel, { color }]}>gün</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rc.number}>{inv.invoice_number}</Text>
        {inv.clinic_name && <Text style={rc.clinic}>{inv.clinic_name}</Text>}
        <Text style={[rc.date, urgent && { color: '#EF4444' }]}>
          {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </Text>
      </View>
      <Text style={[rc.amount, { color }]}>
        {fmtMoney(inv.balance)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#fff' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 12 },
  title:         { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle:      { fontSize: 13, color: '#64748B', marginTop: 2 },
  tabRow:        { flexDirection: 'row', gap: 8, paddingBottom: 12 },
  tabBtn:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  tabBtnActive:  { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  tabText:       { fontSize: 13, fontWeight: '500', color: '#64748B' },
  tabTextActive: { color: '#2563EB', fontWeight: '700' },
  kpiRowDesktop: { flexDirection: 'row', gap: 16 },
  kpiRowMobile:  { flexDirection: 'column', gap: 10 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: 0.2 },
  empty:         { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText:     { fontSize: 14, color: '#94A3B8', fontWeight: '500', textAlign: 'center' },
});

const kpi = StyleSheet.create({
  card:    { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#F1F5F9', gap: 8 },
  iconWrap:{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 12, fontWeight: '600', color: '#64748B' },
  value:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});

const mr = StyleSheet.create({
  wrap:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', gap: 10 },
  month:     { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  row:       { flexDirection: 'row', gap: 12, alignItems: 'center' },
  barTrack:  { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: 6, borderRadius: 3 },
  barLabel:  { fontSize: 10, color: '#64748B', fontWeight: '500' },
  profit:    { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  profitLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
});

const rc = StyleSheet.create({
  wrap:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  wrapUrgent:{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: '#FEF2F2' },
  badge:     { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeDays: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  badgeLabel:{ fontSize: 10, fontWeight: '600' },
  number:    { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  clinic:    { fontSize: 12, color: '#64748B', marginTop: 1 },
  date:      { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  amount:    { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
});
