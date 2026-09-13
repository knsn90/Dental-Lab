/**
 * Mali İşlemler — Özet (Overview)
 *
 * F1 Glass Hero (gradient blob + sparkline)
 *  + KPI Shelf (4 responsive tile)
 *  + 3 Grafik kartı: Aylık Akış · Yaşlandırma · Tahsilat Yöntemleri
 *  + Acil & Yaklaşan vade listeleri
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';
import {
  Wallet, AlertCircle, Clock, CheckCircle2, FileText, ArrowRight, ArrowLeft, CreditCard,
  BarChart3, PieChart, TrendingUp,
} from '../../../core/ui/icons';

import { DS } from '../../../core/theme/dsTokens';
import { isRTL } from '../../../core/i18n';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  fetchOverview, fetchOpenInvoices, fetchOverviewCharts,
  type FinanceOverview, type ClinicInvoiceRow, type OverviewCharts,
} from '../api';
import {
  DISPLAY, TRY, M, Mnat, fmtDate, PAGE_PADDING,
  PillButton, KPI, ErrorBar, Loader, Card, SecHeader,
} from '../components/atoms';
import { MonthlyFlowChart, AgingBarChart, MethodDonut } from '../components/charts';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import type { CurrencyTotal } from '../../../core/money/aggregations';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';
import { useRates } from '../../../core/money/rateCache';

type Props = {
  clinicId: string;
  onJump: (tab: 'statement' | 'open' | 'overdue' | 'pos' | 'payments') => void;
};

export function OverviewScreen({ clinicId, onJump }: Props) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  useRates();
  const [data, setData]     = useState<FinanceOverview | null>(null);
  const [items, setItems]   = useState<ClinicInvoiceRow[]>([]);
  const [charts, setCharts] = useState<OverviewCharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, ops, ch] = await Promise.all([
        fetchOverview(clinicId),
        fetchOpenInvoices(clinicId),
        fetchOverviewCharts(clinicId),
      ]);
      setData(ov); setItems(ops); setCharts(ch);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  // ⚠️ Hook'lar her zaman aynı sırayla çağrılmalı — early return'lerden ÖNCE.
  const collectionRate = useMemo(() => {
    if (!charts) return 0;
    const inv = charts.monthly_flow.reduce((s, m) => s + m.invoiced, 0);
    const paid = charts.monthly_flow.reduce((s, m) => s + m.paid, 0);
    return inv > 0 ? Math.min(100, Math.round((paid / inv) * 100)) : 0;
  }, [charts]);

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;
  if (!data)   return null;

  const overdueItems  = items.filter(i => i.days_overdue > 0).slice(0, 3);
  const upcomingItems = items.filter(i => i.days_overdue <= 0).slice(0, 3);

  const totalDue = data.total_due;
  const overduePct = totalDue > 0 ? Math.round((data.overdue / totalDue) * 100) : 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── F1 HERO (gradient + sparkline) ── */}
      <PremiumHero
        totalDue={totalDue}
        overdue={data.overdue}
        thisMonthPaid={data.this_month_paid}
        dueCcy={data.total_due_ccy}
        overdueCcy={data.overdue_ccy}
        paidCcy={data.this_month_paid_ccy}
        openCount={data.open_invoices_count}
        overdueCount={data.overdue_count}
        upcomingCount={data.upcoming_count}
        collectionRate={collectionRate}
        monthly={charts?.monthly_flow ?? []}
        onPay={() => onJump('pos')}
        onStatement={() => onJump('statement')}
      />

      {/* ── KPI Shelf — patterns.tsx Senaryo 1 yatay kart ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <KPI
          icon={Wallet}
          label="Toplam Borç"
          slices={data.total_due_ccy}
          sub={`${data.open_invoices_count} açık fatura`}
          accent="#0F172A"
          percent={Math.min(100, collectionRate)}
          trend={{
            text: collectionRate >= 70 ? `↑ %${collectionRate} tahsil` : `%${collectionRate} tahsil`,
            tone: collectionRate >= 70 ? 'success' : 'neutral',
          }}
          onPress={() => onJump('open')}
        />
        <KPI
          icon={AlertCircle}
          label="Vadesi Geçen"
          slices={data.overdue_ccy}
          sub={`${data.overdue_count} fatura geciken`}
          accent="#DC2626"
          alert={data.overdue > 0}
          percent={overduePct}
          trend={data.overdue_count > 0 ? { text: `${data.overdue_count} fat.`, tone: 'danger' } : undefined}
          onPress={() => onJump('overdue')}
        />
        <KPI
          icon={Clock}
          label="7 Gün İçinde"
          value={String(data.upcoming_count)}
          sub="Vadesi yaklaşan"
          accent="#D97706"
          percent={data.open_invoices_count > 0
            ? Math.round((data.upcoming_count / data.open_invoices_count) * 100)
            : 0}
          trend={data.upcoming_count > 0 ? { text: 'Hatırlat', tone: 'neutral' } : undefined}
          onPress={() => onJump('open')}
        />
        <KPI
          icon={CheckCircle2}
          label="Bu Ay Ödenen"
          slices={data.this_month_paid_ccy}
          sub={`${data.this_month_invoiced_count} fatura kesildi`}
          accent="#059669"
          percent={collectionRate}
          trend={{ text: `%${collectionRate}`, tone: collectionRate >= 70 ? 'success' : 'neutral' }}
          onPress={() => onJump('payments')}
        />
      </View>

      {/* ── Grafikler — KATI per-currency: her para birimi için ayrı seri ── */}
      {charts && charts.byCurrency.map(cc => {
        const inv  = cc.monthly_flow.reduce((s, m) => s + m.invoiced, 0);
        const pd   = cc.monthly_flow.reduce((s, m) => s + m.paid, 0);
        const rate = inv > 0 ? Math.round((pd / inv) * 100) : 0;
        const risk = cc.aging.filter(b => b.key === 'd90' || b.key === 'd90p').reduce((s, b) => s + b.amount, 0);
        const multi = charts.byCurrency.length > 1;
        const sym = CURRENCY_META[(cc.currency as Currency)]?.symbol ?? cc.currency;
        return (
          <View key={cc.currency} style={{ gap: 14 }}>
            {multi && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: TH.bgSoft }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: TH.primary }}>{sym}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? (T.ink2 as string) : DS.ink[700], letterSpacing: 0.3 }}>{cc.currency}</Text>
                </View>
              </View>
            )}

            {/* Aylık Akış */}
            {cc.monthly_flow.length > 0 && (
              <View>
                <SecHeader eyebrow="Trend" title="Aylık Akış · Son 6 Ay" desc="Kesilen fatura vs. tahsil edilen tutar"
                  action={{ label: 'Ekstre →', onPress: () => onJump('statement') }} />
                <Card style={{ padding: 16, paddingTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <BarChart3 size={14} color={TH.primary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500], fontWeight: '500' }}>Tahsilat oranı</Text>
                      <Text style={{ ...DISPLAY, fontSize: 20, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.4 }}>%{rate}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TrendingUp size={11} color={rate >= 70 ? '#059669' : '#D97706'} />
                      <Text style={{ fontSize: 10, color: rate >= 70 ? '#059669' : '#D97706', fontWeight: '700' }}>
                        {rate >= 70 ? 'İyi' : 'Düşük'}
                      </Text>
                    </View>
                  </View>
                  <MonthlyFlowChart data={cc.monthly_flow} height={200} currency={cc.currency} />
                </Card>
              </View>
            )}

            {/* Yaşlandırma + Yöntem ikilisi */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <View style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
                <SecHeader eyebrow="Risk" title="Yaşlandırma" desc="Açık faturaların vade dağılımı" />
                <Card style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(217,75,75,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                      <AlertCircle size={14} color="#9C2E2E" strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500], fontWeight: '500' }}>Riskli (60+ gün)</Text>
                      <Text style={{ ...DISPLAY, fontSize: 18, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.3 }}>
                        {formatMoney(risk, (cc.currency as Currency), { fractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                  <AgingBarChart buckets={cc.aging} currency={cc.currency} />
                </Card>
              </View>

              <View style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
                <SecHeader eyebrow="Dağılım" title="Tahsilat Yöntemleri" desc="Son 90 gün" />
                <Card style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <PieChart size={14} color={TH.primary} strokeWidth={2} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, color: isDark ? (T.ink2 as string) : DS.ink[700], fontWeight: '500' }}>Yöntem analizi</Text>
                  </View>
                  <MethodDonut slices={cc.payment_methods} size={140} currency={cc.currency} />
                </Card>
              </View>
            </View>
          </View>
        );
      })}

      {/* ── Vadesi Geçen — uyarı kartı ── */}
      {overdueItems.length > 0 ? (
        <View>
          <SecHeader
            eyebrow="Acil"
            title="Vadesi Geçen Faturalar"
            action={{ label: 'Tümü →', onPress: () => onJump('overdue') }}
          />
          <Card style={{ padding: 0, borderColor: 'rgba(217,75,75,0.30)' }}>
            {overdueItems.map((inv, i) => (
              <View
                key={inv.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: i < overdueItems.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? T.hairline : DS.ink[100],
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(217,75,75,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={16} color="#9C2E2E" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? T.ink : DS.ink[900] }} numberOfLines={1}>
                    Fatura {inv.invoice_no ?? '—'}
                  </Text>
                  {/* Hekim isteği: hangi hastanın faturası olduğu özet listelerinde de görünsün. */}
                  {!!inv.patient_name && (
                    <Text style={{ fontSize: 11.5, color: isDark ? (T.ink2 as string) : DS.ink[700], marginTop: 2 }} numberOfLines={1}>
                      {[inv.patient_name, inv.order_no].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: '#9C2E2E', marginTop: 2 }}>
                    {inv.days_overdue} gün gecikmiş · vade {fmtDate(inv.due_date)}
                  </Text>
                </View>
                <Text style={{ ...DISPLAY, fontSize: 18, color: '#9C2E2E', letterSpacing: -0.5 }}>
                  {Mnat(inv.remaining, inv.currency)}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* ── Yaklaşan Vade ── */}
      {upcomingItems.length > 0 ? (
        <View>
          <SecHeader
            eyebrow="Önümüzdeki Hafta"
            title="Vadesi Yaklaşan"
            action={{ label: 'Tümü →', onPress: () => onJump('open') }}
          />
          <Card style={{ padding: 0 }}>
            {upcomingItems.map((inv, i) => (
              <Pressable
                key={inv.id}
                onPress={() => onJump('open')}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: i < upcomingItems.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? T.hairline : DS.ink[100],
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={16} color={TH.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? T.ink : DS.ink[900] }} numberOfLines={1}>
                    Fatura {inv.invoice_no ?? '—'}
                  </Text>
                  {/* Hekim isteği: hangi hastanın faturası olduğu özet listelerinde de görünsün. */}
                  {!!inv.patient_name && (
                    <Text style={{ fontSize: 11.5, color: isDark ? (T.ink2 as string) : DS.ink[700], marginTop: 2 }} numberOfLines={1}>
                      {[inv.patient_name, inv.order_no].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500], marginTop: 2 }}>
                    Vade {fmtDate(inv.due_date)} · {Math.abs(inv.days_overdue)} gün kaldı
                  </Text>
                </View>
                <Text style={{ ...DISPLAY, fontSize: 18, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.5 }}>
                  {Mnat(inv.remaining, inv.currency)}
                </Text>
                {isRTL() ? <ArrowLeft size={14} color={isDark ? (T.ink3 as string) : DS.ink[400]} /> : <ArrowRight size={14} color={isDark ? (T.ink3 as string) : DS.ink[400]} />}
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  Premium F1 Hero — gradient blob + glass card + sparkline
 * ═════════════════════════════════════════════════════════════════════ */

function PremiumHero({
  totalDue, overdue, thisMonthPaid,
  dueCcy, overdueCcy, paidCcy,
  openCount, overdueCount, upcomingCount, collectionRate,
  monthly, onPay, onStatement,
}: {
  totalDue: number; overdue: number; thisMonthPaid: number;
  dueCcy: CurrencyTotal[]; overdueCcy: CurrencyTotal[]; paidCcy: CurrencyTotal[];
  openCount: number; overdueCount: number; upcomingCount: number;
  collectionRate: number;
  monthly: { label: string; invoiced: number; paid: number }[];
  onPay: () => void; onStatement: () => void;
}) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const hasDebt = totalDue > 0;

  return (
    <View style={{
      borderRadius: 28, overflow: 'hidden',
      backgroundColor: isDark ? T.bg : TH.bg, padding: 14,
      marginBottom: 4,
    }}>
      {/* Outer container shows panel theme; inner glass card sits on top */}
      <View style={{ position: 'relative', borderRadius: 22, overflow: 'hidden' }}>
        {/* Decorative gradient blob */}
        <Svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', top: 0, start: 0 }}
          // @ts-ignore
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="heroBlob" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={TH.primary} stopOpacity="0.18" />
              <Stop offset="1" stopColor={TH.primary} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Circle cx="92%" cy="20%" r="160" fill="url(#heroBlob)" />
          <Circle cx="10%" cy="100%" r="180" fill="url(#heroBlob)" />
        </Svg>

        <View style={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
          borderRadius: 22, padding: 22,
          borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(255,255,255,0.7)',
          gap: 18,
        }}>
          {/* Top row: kicker + status chip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: isDark ? (T.ink3 as string) : DS.ink[500] }}>
              Mali İşlemler · Anlık Durum
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
              backgroundColor: hasDebt && overdue > 0
                ? (isDark ? 'rgba(217,75,75,0.22)' : 'rgba(217,75,75,0.10)')
                : (isDark ? 'rgba(5,150,105,0.24)' : 'rgba(5,150,105,0.10)'),
            }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: hasDebt && overdue > 0 ? (isDark ? '#F3A0A0' : '#9C2E2E') : (isDark ? '#6EE7B7' : '#059669'),
              }} />
              <Text style={{
                fontSize: 10, fontWeight: '700', letterSpacing: 0.4,
                color: hasDebt && overdue > 0 ? (isDark ? '#F3A0A0' : '#9C2E2E') : (isDark ? '#6EE7B7' : '#059669'),
              }}>
                {hasDebt && overdue > 0 ? 'GECİKEN ÖDEME' : hasDebt ? 'GÜNCEL' : 'TEMİZ'}
              </Text>
            </View>
          </View>

          {/* Main: big number + side stats */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <View style={{ flex: 1, minWidth: 260 }}>
              <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500], fontWeight: '500', marginBottom: 4 }}>
                Toplam Borç
              </Text>
              <MoneyMultiX slices={dueCcy} variant="cards" size="lg" accentColor={TH.primary} emptyText="—" />
              <View style={{ height: 4 }} />
              <Text style={{ fontSize: 13, color: isDark ? (T.ink3 as string) : DS.ink[500], marginTop: 6, lineHeight: 19, maxWidth: 520 }}>
                {totalDue === 0
                  ? 'Şu anda ödenmemiş fatura yok. Tüm hesaplar güncel.'
                  : `${openCount} açık fatura · ${overdueCount} vadesi geçen · ${upcomingCount} yaklaşan vade`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 22 }}>
              <View style={{ alignItems: 'flex-end' }}>
                <MoneyMultiX slices={overdueCcy} variant="inline" />
                <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2, fontWeight: '600' }}>
                  Geciken
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <MoneyMultiX slices={paidCcy} variant="inline" />
                <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2, fontWeight: '600' }}>
                  Bu Ay Öden.
                </Text>
              </View>
            </View>
          </View>

          {/* Sparkline (mini bar) — son 6 ay paid */}
          {monthly.length > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end',
              height: 36, gap: 4, marginTop: -4,
            }}>
              {(() => {
                const max = Math.max(...monthly.flatMap(m => [m.invoiced, m.paid]), 1);
                return monthly.map((m, i) => {
                  const hP = Math.max(2, (m.paid / max) * 32);
                  const hI = Math.max(2, (m.invoiced / max) * 32);
                  return (
                    <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                      <View style={{ flex: 1, height: hI, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)', borderRadius: 2 }} />
                      <View style={{ flex: 1, height: hP, backgroundColor: TH.primary, borderRadius: 2 }} />
                    </View>
                  );
                });
              })()}
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(overdue > 0 || upcomingCount > 0) && (
              <PillButton variant="dark" leftIcon={<CreditCard size={13} color="#FFF" />} onPress={onPay}>
                Online Ödeme Yap
              </PillButton>
            )}
            <PillButton variant="light" leftIcon={<FileText size={13} color={isDark ? T.ink : DS.ink[800]} />} onPress={onStatement}>
              Cari Ekstre
            </PillButton>
          </View>
        </View>
      </View>
    </View>
  );
}
