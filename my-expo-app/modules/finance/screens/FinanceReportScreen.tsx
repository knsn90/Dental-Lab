/**
 * FinanceReportScreen — Gelir / Gider Raporu (Patterns Design Language)
 *
 * Aylık döküm + yaklaşan vade hatırlatmaları.
 * cardSolid, DISPLAY font, DS tokens, CHIP_TONES, Lucide icons.
 */
import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  BarChart2, TrendingUp, TrendingDown, CheckCircle, AlertCircle,
  Bell, Calendar, Building2, FileText, Inbox,
} from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { DS } from '../../../core/theme/dsTokens';
import { supabase } from '../../../core/api/supabase';
import { getRangeBounds, type RangeKey } from '../components/DateRangePicker';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', text: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', text: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  text: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', text: '#1F5689' },
};

// ── Types ───────────────────────────────────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

// ── Period pills ────────────────────────────────────────────────────
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'this_month',     label: 'Bu Ay' },
  { key: 'last_month',     label: 'Geçen Ay' },
  { key: 'this_year',      label: 'Bu Yıl' },
  { key: 'last_12_months', label: 'Son 12 Ay' },
  { key: 'all',            label: 'Tümü' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function FinanceReportScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [tab, setTab] = useState<'rapor' | 'hatirlatma'>('rapor');
  const [range, setRange] = useState<RangeKey>('last_12_months');
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingDue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { from, to } = getRangeBounds(range);
      let q = supabase
        .from('v_monthly_finance_summary')
        .select('*')
        .order('month', { ascending: true });
      if (from) q = q.gte('month', from);
      if (to)   q = q.lte('month', to);
      const [s1, s2] = await Promise.all([
        q.limit(60),
        supabase.from('v_upcoming_due_invoices').select('*').limit(20),
      ]);
      setSummary((s1.data ?? []) as MonthlySummary[]);
      setUpcoming((s2.data ?? []) as UpcomingDue[]);
      setLoading(false);
    };
    load();
  }, [range]);

  const totals = summary.reduce(
    (acc, m) => ({
      income:  acc.income  + Number(m.income),
      expense: acc.expense + Number(m.expense),
      profit:  acc.profit  + Number(m.profit),
    }),
    { income: 0, expense: 0, profit: 0 },
  );

  const TAB_ITEMS: { key: 'rapor' | 'hatirlatma'; label: string; icon: React.ComponentType<any> }[] = [
    { key: 'rapor',      label: 'Rapor',        icon: BarChart2 },
    { key: 'hatirlatma', label: `Hatırlatmalar${upcoming.length > 0 ? ` (${upcoming.length})` : ''}`, icon: Bell },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header — only standalone ── */}
      {!isEmbedded && (
        <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 }}>
          <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: DS.ink[900] }}>
            Gelir / Gider Raporu
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[400], marginTop: 2 }}>Mali özet</Text>
        </View>
      )}

      {/* ── Toolbar: Tab pills + Period pills ── */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 12 }}>
        {/* Tab pills + range pills row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {/* Tab toggle pills */}
          <View style={{
            flexDirection: 'row', gap: 2,
            padding: 3, borderRadius: 9999,
            backgroundColor: DS.ink[100],
          }}>
            {TAB_ITEMS.map(t => {
              const active = t.key === tab;
              const Icon = t.icon;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 7,
                    borderRadius: 9999,
                    backgroundColor: active ? '#FFF' : 'transparent',
                    // @ts-ignore web
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={13} strokeWidth={active ? 2.2 : 1.6} color={active ? DS.ink[900] : DS.ink[400]} />
                  <Text style={{
                    fontSize: 12, fontWeight: active ? '600' : '500',
                    color: active ? DS.ink[900] : DS.ink[500],
                  }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Separator */}
          <View style={{ width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 4 }} />

          {/* Period range pills — only for rapor tab */}
          {tab === 'rapor' && RANGE_OPTIONS.map(opt => {
            const active = opt.key === range;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setRange(opt.key)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: active ? DS.ink[900] : 'transparent',
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? '#FFF' : DS.ink[500],
                }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
          <ActivityIndicator color={DS.ink[400]} />
        </View>
      ) : tab === 'rapor' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingBottom: 48, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── KPI Hero Cards ── */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 14 }}>
            <KpiHero
              label="Toplam Gelir"
              value={fmtMoney(totals.income)}
              icon={TrendingUp}
              bg={DS.lab.bg}
              decorColor={DS.lab.bgDeep}
              accentColor="#059669"
            />
            <KpiHero
              label="Toplam Gider"
              value={fmtMoney(totals.expense)}
              icon={TrendingDown}
              bg={DS.exec.bg}
              decorColor={DS.exec.bgDeep}
              accentColor={DS.exec.primary}
            />
            <KpiHero
              label="Net Kâr"
              value={fmtMoney(totals.profit)}
              icon={totals.profit >= 0 ? CheckCircle : AlertCircle}
              bg={totals.profit >= 0 ? DS.clinic.bg : DS.ink[900]}
              decorColor={totals.profit >= 0 ? DS.clinic.bgDeep : DS.ink[800]}
              accentColor={totals.profit >= 0 ? '#059669' : '#EF4444'}
              dark={totals.profit < 0}
            />
          </View>

          {/* ── Section: Aylık Döküm ── */}
          <SectionHeader icon={Calendar} label="Aylık Döküm" />

          {summary.length === 0 ? (
            <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
              <Inbox size={36} strokeWidth={1.4} color={DS.ink[300]} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>Veri bulunamadı</Text>
            </View>
          ) : (
            <View style={{ ...cardSolid, padding: 0, overflow: 'hidden' }}>
              {summary.map((m, i) => (
                <MonthRow key={m.month} month={m} isLast={i === summary.length - 1} isDesktop={isDesktop} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ── Hatırlatmalar Tab ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingBottom: 48, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader icon={Bell} label="Yaklaşan Vadeler" count={upcoming.length} />

          {upcoming.length === 0 ? (
            <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
              <CheckCircle size={36} strokeWidth={1.4} color={CHIP_TONES.success.text} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
                14 gün içinde vadesi dolan fatura yok
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {upcoming.map(inv => (
                <ReminderCard key={inv.id} inv={inv} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Section Header ─────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, count }: { icon: React.ComponentType<any>; label: string; count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Icon size={14} strokeWidth={1.8} color={DS.ink[400]} />
      <Text style={{
        fontSize: 11, fontWeight: '600', letterSpacing: 0.8,
        textTransform: 'uppercase', color: DS.ink[500],
      }}>
        {label}
      </Text>
      {count != null && count > 0 && (
        <View style={{
          paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: 9999, backgroundColor: CHIP_TONES.warning.bg,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: CHIP_TONES.warning.text }}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ─── KPI Hero Card ──────────────────────────────────────────────────
function KpiHero({
  label, value, icon: Icon, bg, decorColor, accentColor, dark = false,
}: {
  label: string; value: string; icon: React.ComponentType<any>;
  bg: string; decorColor: string; accentColor: string; dark?: boolean;
}) {
  const textColor = dark ? '#FFF' : DS.ink[900];
  const subColor  = dark ? 'rgba(255,255,255,0.6)' : DS.ink[500];

  return (
    <View style={{
      flex: 1, backgroundColor: bg, borderRadius: 24,
      padding: 22, overflow: 'hidden', position: 'relative',
    }}>
      {/* Decorative circles */}
      <View style={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: decorColor, opacity: 0.5,
      }} />
      <View style={{
        position: 'absolute', bottom: -20, right: 30,
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: decorColor, opacity: 0.3,
      }} />

      {/* Icon badge */}
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: dark ? 'rgba(255,255,255,0.12)' : accentColor + '15',
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>
        <Icon size={16} strokeWidth={1.8} color={dark ? 'rgba(255,255,255,0.8)' : accentColor} />
      </View>

      <Text style={{
        fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
        textTransform: 'uppercase', color: subColor, marginBottom: 6,
      }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.5, color: textColor }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Month Row ──────────────────────────────────────────────────────
function MonthRow({ month: m, isLast, isDesktop }: { month: MonthlySummary; isLast: boolean; isDesktop: boolean }) {
  const income  = Number(m.income);
  const expense = Number(m.expense);
  const profit  = Number(m.profit);
  const maxVal  = Math.max(income, expense, 1);
  const incomeW  = Math.round((income / maxVal) * 100);
  const expenseW = Math.round((expense / maxVal) * 100);

  const profitTone = profit >= 0 ? CHIP_TONES.success : CHIP_TONES.danger;

  return (
    <View style={{
      paddingHorizontal: 22, paddingVertical: 16,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: 'rgba(0,0,0,0.06)',
    }}>
      {/* Month title + profit chip */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
          {fmtMonth(m.month)}
        </Text>
        <View style={{
          paddingHorizontal: 10, paddingVertical: 4,
          borderRadius: 9999, backgroundColor: profitTone.bg,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: profitTone.text }}>
            {profit >= 0 ? '+' : ''}{fmtMoney(profit)}
          </Text>
        </View>
      </View>

      {/* Bars */}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 16 : 10 }}>
        {/* Income bar */}
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500] }}>Gelir</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{fmtMoney(income)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 9999, backgroundColor: '#2563EB', width: `${incomeW}%` as any }} />
          </View>
        </View>

        {/* Expense bar */}
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500] }}>Gider</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.exec.primary }}>{fmtMoney(expense)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 9999, backgroundColor: DS.exec.primary, width: `${expenseW}%` as any }} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Reminder Card ──────────────────────────────────────────────────
function ReminderCard({ inv }: { inv: UpcomingDue }) {
  const days = inv.days_until_due;
  const tone = days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'info';
  const chipTone = CHIP_TONES[tone];

  return (
    <View style={{
      ...cardSolid,
      flexDirection: 'row', alignItems: 'center', gap: 14,
      ...(days <= 3 ? {
        backgroundColor: 'rgba(217,75,75,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(217,75,75,0.15)',
      } : {}),
    }}>
      {/* Days badge */}
      <View style={{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: chipTone.bg,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: chipTone.text }}>
          {days}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '600', color: chipTone.text, marginTop: -2 }}>gün</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FileText size={12} strokeWidth={1.6} color={DS.ink[400]} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{inv.invoice_number}</Text>
        </View>
        {inv.clinic_name && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <Building2 size={11} strokeWidth={1.4} color={DS.ink[400]} />
            <Text style={{ fontSize: 12, color: DS.ink[500] }}>{inv.clinic_name}</Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 3 }}>
          {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('tr-TR', {
            day: '2-digit', month: 'long', year: 'numeric',
          })}
        </Text>
      </View>

      {/* Amount */}
      <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: chipTone.text }}>
        {fmtMoney(inv.balance)}
      </Text>
    </View>
  );
}

export default FinanceReportScreen;
