/**
 * Mali İşlemler — Özet (Overview)
 *
 * F1 Glass Hero (gradient blob + sparkline)
 *  + KPI Shelf (4 responsive tile)
 *  + 3 Grafik kartı: Aylık Akış · Yaşlandırma · Tahsilat Yöntemleri
 *  + Acil & Yaklaşan vade listeleri
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import {
  Wallet, AlertCircle, Clock, CheckCircle2, FileText, ArrowRight, ArrowLeft, CreditCard,
  PieChart, TrendingUp,
} from '../../../core/ui/icons';

import { DS } from '../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { isRTL } from '../../../core/i18n';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { autoT } from '../../../core/i18n/autoTranslate';
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
  onJump: (tab: 'statement' | 'open' | 'overdue' | 'payments') => void;
};

export function OverviewScreen({ clinicId, onJump }: Props) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const MT = useMobileTableText();
  const overdueInk = isDark ? '#F3A0A0' : '#9C2E2E';
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
        /* Ödeme fatura bazında: Bekleyen listesine gider, her satırda "Öde". */
        onPay={() => onJump('open')}
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
            text: collectionRate >= 70 ? `↑ %${collectionRate} ödendi` : `%${collectionRate} ödendi`,
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
                <SecHeader eyebrow="Trend" title="Aylık Akış · Son 6 Ay" desc="Kesilen fatura vs. ödenen tutar"
                  action={{ label: 'Ekstre →', onPress: () => onJump('statement'),
                    hint: 'Aynı dönemin fatura ve ödeme hareketlerini satır satır gör' }} />
                <Card style={{ padding: 16, paddingTop: 12 }}>
                  {/* Kartın konusu ORAN: en büyük öğe o olmalı. Yanındaki
                      ikon kutusu aynı satırda ondan daha fazla yer kaplıyordu.
                      Tipografi ölçüye göre: büyük rakam negatif tracking,
                      küçük etiket hafif pozitif (Apple tipografi kuralı). */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{
                        fontSize: 10.5, letterSpacing: 0.3, fontWeight: '500',
                        color: isDark ? (T.ink3 as string) : DS.ink[500],
                      }}>
                        Ödeme oranı
                      </Text>
                      <Text style={{
                        ...DISPLAY, fontSize: 30, lineHeight: 34, letterSpacing: -0.9,
                        color: isDark ? T.ink : DS.ink[900], marginTop: 1,
                      }}>
                        %{rate}
                      </Text>
                    </View>
                    {/* Durum rozeti: renk + metin birlikte (renk körlüğünde
                        yalnız renk yetmez). */}
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: rate >= 70
                        ? (isDark ? 'rgba(5,150,105,0.22)' : 'rgba(5,150,105,0.10)')
                        : (isDark ? 'rgba(217,119,6,0.22)' : 'rgba(217,119,6,0.10)'),
                    }}>
                      <TrendingUp size={11} color={rate >= 70 ? '#059669' : '#D97706'} strokeWidth={2.2} />
                      <Text style={{ fontSize: 10.5, letterSpacing: 0.2, color: rate >= 70 ? '#059669' : '#D97706', fontWeight: '700' }}>
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
                <SecHeader eyebrow="Dağılım" title="Ödeme Yöntemleri" desc="Son 90 gün" />
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

      {/* ── Vadesi Geçen — ekstre / giderler mobil tablosuyla aynı kalıp ── */}
      {overdueItems.length > 0 ? (
        <MobileTableX title="Vadesi Geçen Faturalar" count={overdueItems.length} countLabel="fatura" accent="#D94B4B"
          right={
            <GlassTooltip title={autoT('Tümü')} text={autoT('Vadesi geçen faturaları açar')}>
              <Pressable onPress={() => onJump('overdue')} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: onAccentInk('#D94B4B') }}>Tümü →</Text>
              </Pressable>
            </GlassTooltip>
          }>
          {overdueItems.map((inv, i) => (
            <MobileTableRowX key={inv.id} isLast={i === overdueItems.length - 1} onPress={() => onJump('overdue')}>
              <MobileTableIconX icon={AlertCircle} tone={{ bg: isDark ? 'rgba(217,75,75,0.24)' : 'rgba(217,75,75,0.10)', fg: overdueInk }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={MT.title} numberOfLines={1}>{inv.invoice_no ?? '—'}</Text>
                {/* Hekim isteği: hangi hastanın faturası olduğu özet listelerinde de görünsün. */}
                {!!inv.patient_name && (
                  <Text style={MT.sub} numberOfLines={1}>
                    {[inv.patient_name, inv.order_no].filter(Boolean).join(' · ')}
                  </Text>
                )}
                <Text style={[MT.meta, { marginTop: 2, color: overdueInk, fontWeight: '600' }]}>
                  {inv.days_overdue} {autoT('gün gecikmiş')} · {autoT('vade')} {fmtDate(inv.due_date)}
                </Text>
              </View>
              <Text style={[MT.amount, { color: overdueInk }]}>
                {Mnat(inv.remaining, inv.currency)}
              </Text>
            </MobileTableRowX>
          ))}
        </MobileTableX>
      ) : null}

      {/* ── Yaklaşan Vade ── */}
      {upcomingItems.length > 0 ? (
        <MobileTableX title="Vadesi Yaklaşan" count={upcomingItems.length} countLabel="fatura"
          right={
            <GlassTooltip title={autoT('Tümü')} text={autoT('Tüm açık faturaları açar')}>
              <Pressable onPress={() => onJump('open')} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: onAccentInk(TH.primary) }}>Tümü →</Text>
              </Pressable>
            </GlassTooltip>
          }>
          {upcomingItems.map((inv, i) => (
            <MobileTableRowX key={inv.id} isLast={i === upcomingItems.length - 1} onPress={() => onJump('open')}>
              <MobileTableIconX icon={FileText} tone={{ bg: isDark ? 'rgba(90,169,230,0.16)' : TH.bgSoft, fg: isDark ? '#93C5FD' : TH.primary }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={MT.title} numberOfLines={1}>{inv.invoice_no ?? '—'}</Text>
                {/* Hekim isteği: hangi hastanın faturası olduğu özet listelerinde de görünsün. */}
                {!!inv.patient_name && (
                  <Text style={MT.sub} numberOfLines={1}>
                    {[inv.patient_name, inv.order_no].filter(Boolean).join(' · ')}
                  </Text>
                )}
                <Text style={[MT.meta, { marginTop: 2 }]}>
                  {autoT('Vade')} {fmtDate(inv.due_date)} · {Math.abs(inv.days_overdue)} {autoT('gün kaldı')}
                </Text>
              </View>
              <Text style={MT.amount}>
                {Mnat(inv.remaining, inv.currency)}
              </Text>
            </MobileTableRowX>
          ))}
        </MobileTableX>
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
  onPay, onStatement,
}: {
  totalDue: number; overdue: number; thisMonthPaid: number;
  dueCcy: CurrencyTotal[]; overdueCcy: CurrencyTotal[]; paidCcy: CurrencyTotal[];
  openCount: number; overdueCount: number; upcomingCount: number;
  collectionRate: number;
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

          {/* ── Ana blok ──
              Tutar, ALAN gibi görünen beyaz kutunun içindeydi; okuyan kişi
              "buraya yazacak mıyım?" diye duraksıyordu. Tek para biriminde
              rakam artık başlık olarak durur (kutu yok), çok döviz varsa her
              biri kendi kutusunda kalır — para birimleri asla toplanmaz. */}
          <View style={{ gap: 6 }}>
            <Text style={{
              fontSize: 10.5, letterSpacing: 0.3, fontWeight: '500',
              color: isDark ? (T.ink3 as string) : DS.ink[500],
            }}>
              Toplam borç
            </Text>

            {dueCcy.length === 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{
                  ...DISPLAY, fontSize: 40, lineHeight: 44, letterSpacing: -1.2,
                  color: isDark ? T.ink : DS.ink[900],
                }}>
                  {formatMoney(dueCcy[0].total, dueCcy[0].currency as Currency, { fractionDigits: 0 })}
                </Text>
                <Text style={{
                  fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
                  color: isDark ? (T.ink3 as string) : DS.ink[400],
                }}>
                  {dueCcy[0].currency}
                </Text>
              </View>
            ) : (
              <MoneyMultiX
                slices={dueCcy}
                variant="cards"
                onAccent={isDark ? '#FFFFFF' : undefined}
                size="lg"
                accentColor={TH.primary}
                emptyText="—"
              />
            )}

            {/* Vadesi geçen sayısı buradan çıktı: aşağıdaki kutucukta hem
                tutarı hem adedi veriliyor, iki yerde söylemek gürültü. */}
            <Text style={{ fontSize: 12.5, color: isDark ? (T.ink3 as string) : DS.ink[500], lineHeight: 18, maxWidth: 520 }}>
              {totalDue === 0
                ? 'Şu anda ödenmemiş fatura yok. Tüm hesaplar güncel.'
                : `${openCount} açık fatura · ${upcomingCount} yaklaşan vade`}
            </Text>
          </View>

          {/* ── İki kutucuk ──
              Eskiden sağda havada duran iki rakamdı; hizası kartın gridine
              oturmuyor, sıfır değer "—" olarak çizilip veri yokmuş gibi
              görünüyordu. Artık eşit genişlikte, aynı taban çizgisinde. */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              {
                key: 'overdue',
                label: overdueCount > 0 ? `Geciken · ${overdueCount} fatura` : 'Geciken',
                slices: overdueCcy,
                danger: overdue > 0,
              },
              { key: 'paid', label: 'Bu ay ödenen', slices: paidCcy, danger: false },
            ]).map(tile => (
              <View
                key={tile.key}
                style={{
                  flex: 1, minWidth: 0,
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.70)',
                  borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(255,255,255,0.85)',
                }}
              >
                <Text numberOfLines={1} style={{
                  ...DISPLAY, fontSize: 19, letterSpacing: -0.4,
                  color: tile.danger ? (isDark ? '#F3A0A0' : '#9C2E2E') : (isDark ? T.ink : DS.ink[900]),
                }}>
                  {tile.slices.length
                    ? tile.slices.map(x => formatMoney(x.total, x.currency as Currency, { fractionDigits: 0 })).join(' · ')
                    : formatMoney(0, (dueCcy[0]?.currency ?? 'TRY') as Currency, { fractionDigits: 0 })}
                </Text>
                <Text numberOfLines={1} style={{
                  fontSize: 10, letterSpacing: 0.4, fontWeight: '600', marginTop: 3,
                  color: isDark ? (T.ink3 as string) : DS.ink[500],
                }}>
                  {tile.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(overdue > 0 || upcomingCount > 0) && (
              <GlassTooltip
                title="Online Ödeme Yap"
                text="Kartla ödeme: tüm bakiyeyi ya da kısmi tutarı tek seferde öde">
                <PillButton variant="primary" leftIcon={<CreditCard size={13} color="#FFF" />} onPress={onPay}>
                  Online Ödeme Yap
                </PillButton>
              </GlassTooltip>
            )}
            <GlassTooltip
              title="Cari Ekstre"
              text="Fatura ve ödeme hareketlerinin tamamı; yazdırılabilir ve Excel'e aktarılabilir">
              <PillButton variant="light" leftIcon={<FileText size={13} color={isDark ? T.ink : DS.ink[800]} />} onPress={onStatement}>
                Cari Ekstre
              </PillButton>
            </GlassTooltip>
          </View>
        </View>
      </View>
    </View>
  );
}
