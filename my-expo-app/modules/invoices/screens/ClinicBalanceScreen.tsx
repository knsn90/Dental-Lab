import React, { useContext, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useClinicBalances } from '../hooks/useInvoices';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { HubContext } from '../../../core/ui/HubContext';

import { AppIcon } from '../../../core/ui/AppIcon';

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ClinicBalanceScreen() {
  const router = useRouter();
  const isEmbedded = useContext(HubContext);
  const { balances, loading, refetch } = useClinicBalances();
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(() => {
    return balances.filter(b => {
      if (overdueOnly && Number(b.overdue_amount) <= 0) return false;
      if (search) {
        return b.clinic_name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [balances, search, overdueOnly]);

  const totals = useMemo(() => {
    return balances.reduce((acc, b) => ({
      billed: acc.billed + Number(b.total_billed),
      paid:   acc.paid + Number(b.total_paid),
      balance: acc.balance + Number(b.balance),
      overdue: acc.overdue + Number(b.overdue_amount),
      current: acc.current + Number(b.aging_current ?? 0),
      d30:     acc.d30     + Number(b.aging_30 ?? 0),
      d60:     acc.d60     + Number(b.aging_60 ?? 0),
      d90:     acc.d90     + Number(b.aging_90 ?? 0),
    }), { billed: 0, paid: 0, balance: 0, overdue: 0, current: 0, d30: 0, d60: 0, d90: 0 });
  }, [balances]);

  const hasAging = totals.current + totals.d30 + totals.d60 + totals.d90 > 0;

  return (
    <SafeAreaView style={s.safe} edges={isEmbedded ? ([] as any) : (['top'] as any)}>
      {/* Header — yalnızca standalone modda */}
      {!isEmbedded && (
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconOnlyBtn}>
            <AppIcon name={'arrow-left' as any} size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Cari Hesap</Text>
            <Text style={s.subtitle}>Klinik bazlı bakiye özeti</Text>
          </View>
        </View>
      )}

      {/* Summary card */}
      <View style={s.summaryWrap}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Toplam Alacak</Text>
          <Text style={s.summaryTotal}>{fmtMoney(totals.balance)}</Text>
          <View style={s.summaryDetails}>
            <View style={s.summaryDetailCol}>
              <Text style={s.summaryDetailLabel}>Kesilen</Text>
              <Text style={s.summaryDetailValue}>{fmtMoney(totals.billed)}</Text>
            </View>
            <View style={s.summaryDetailCol}>
              <Text style={s.summaryDetailLabel}>Tahsil Edilen</Text>
              <Text style={[s.summaryDetailValue, { color: '#047857' }]}>{fmtMoney(totals.paid)}</Text>
            </View>
            <View style={s.summaryDetailCol}>
              <Text style={s.summaryDetailLabel}>Vadesi Geçen</Text>
              <Text style={[s.summaryDetailValue, { color: '#DC2626' }]}>{fmtMoney(totals.overdue)}</Text>
            </View>
          </View>

          {/* Aging buckets — yaşlandırma çubuğu */}
          {hasAging && (
            <View style={ag.wrap}>
              <Text style={ag.title}>Yaşlandırma</Text>
              <View style={ag.bar}>
                {[
                  { v: totals.current, color: '#10B981' },
                  { v: totals.d30,     color: '#F59E0B' },
                  { v: totals.d60,     color: '#F97316' },
                  { v: totals.d90,     color: '#DC2626' },
                ].map((seg, i) => {
                  const total = totals.current + totals.d30 + totals.d60 + totals.d90;
                  const w = total > 0 ? (seg.v / total) * 100 : 0;
                  if (w === 0) return null;
                  return <View key={i} style={[ag.seg, { width: `${w}%` as any, backgroundColor: seg.color }]} />;
                })}
              </View>
              <View style={ag.legend}>
                <AgingLegend label="Vadesi var" value={totals.current} color="#10B981" />
                <AgingLegend label="1–30 gün"   value={totals.d30}     color="#F59E0B" />
                <AgingLegend label="31–60 gün"  value={totals.d60}     color="#F97316" />
                <AgingLegend label="61+ gün"    value={totals.d90}     color="#DC2626" />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Search + Filter */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <AppIcon name={'magnify' as any} size={17} color={C.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Klinik ara..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <AppIcon name={'close-circle' as any} size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[s.filterChip, overdueOnly && s.filterChipActive]}
          onPress={() => setOverdueOnly(v => !v)}
        >
          <AppIcon
            name={'clock-alert-outline' as any}
            size={13}
            color={overdueOnly ? '#DC2626' : C.textMuted}
          />
          <Text style={[s.filterChipText, overdueOnly && { color: '#DC2626', fontWeight: '700' }]}>
            Gecikenler
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView
        style={tbl.page}
        contentContainerStyle={tbl.pageContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#AEAEB2" />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <AppIcon
              name={(search || overdueOnly ? 'magnify-close' : 'chart-line-variant') as any}
              size={36}
              color={C.textMuted}
            />
            <Text style={s.emptyTitle}>
              {search || overdueOnly ? 'Sonuç bulunamadı' : 'Henüz klinik yok'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map(b => (
              <BalanceCard
                key={b.clinic_id}
                clinicName={b.clinic_name}
                invoiceCount={Number(b.invoice_count)}
                billed={Number(b.total_billed)}
                paid={Number(b.total_paid)}
                balance={Number(b.balance)}
                overdueAmount={Number(b.overdue_amount)}
                oldestOverdue={b.oldest_overdue_date}
                aging={{
                  current: Number(b.aging_current ?? 0),
                  d30:     Number(b.aging_30 ?? 0),
                  d60:     Number(b.aging_60 ?? 0),
                  d90:     Number(b.aging_90 ?? 0),
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Aging Legend (compact) ────────────────────────────────────────────────
function AgingLegend({ label, value, color }: { label: string; value: number; color: string }) {
  if (value <= 0) return null;
  return (
    <View style={ag.legendItem}>
      <View style={[ag.dot, { backgroundColor: color }]} />
      <Text style={ag.legendLabel}>{label}</Text>
      <Text style={[ag.legendValue, { color }]}>{fmtMoney(value)}</Text>
    </View>
  );
}

// ─── Balance Card ──────────────────────────────────────────────────────────
interface AgingBreakdown { current: number; d30: number; d60: number; d90: number }
function BalanceCard({
  clinicName, invoiceCount, billed, paid, balance, overdueAmount, oldestOverdue, aging,
}: {
  clinicName: string; invoiceCount: number;
  billed: number; paid: number; balance: number;
  overdueAmount: number; oldestOverdue: string | null;
  aging?: AgingBreakdown;
}) {
  const hasOverdue = overdueAmount > 0;
  const hasBalance = balance > 0;
  const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;

  return (
    <View style={card.wrap}>
      <View style={[card.accentStrip, { backgroundColor: hasOverdue ? '#DC2626' : (hasBalance ? '#B45309' : '#10B981') }]} />
      <View style={card.body}>
        <View style={card.top}>
          {/* Klinik avatar (initials) */}
          <View style={[card.avatar, { backgroundColor: hasOverdue ? '#FEE2E2' : (hasBalance ? '#FEF3C7' : '#ECFDF5') }]}>
            <Text style={[card.avatarText, { color: hasOverdue ? '#B91C1C' : (hasBalance ? '#B45309' : '#047857') }]}>
              {clinicName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={card.name} numberOfLines={1}>{clinicName}</Text>
            <Text style={card.meta}>
              {invoiceCount} fatura
              {oldestOverdue && hasOverdue ? ` · en eski vade: ${new Date(oldestOverdue + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[card.balance, hasOverdue && { color: '#DC2626' }]}>
              {fmtMoney(balance)}
            </Text>
            <Text style={card.balanceLabel}>Bakiye</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={card.progressTrack}>
          <View style={[card.progressFill, { width: `${pct}%` }]} />
        </View>

        <View style={card.footer}>
          <View style={card.footerItem}>
            <Text style={card.footerLabel}>Kesilen</Text>
            <Text style={card.footerValue}>{fmtMoney(billed)}</Text>
          </View>
          <View style={card.footerDivider} />
          <View style={card.footerItem}>
            <Text style={card.footerLabel}>Tahsil</Text>
            <Text style={[card.footerValue, { color: '#047857' }]}>{fmtMoney(paid)}</Text>
          </View>
          {hasOverdue && (
            <>
              <View style={card.footerDivider} />
              <View style={card.footerItem}>
                <Text style={card.footerLabel}>Gecikmiş</Text>
                <Text style={[card.footerValue, { color: '#DC2626' }]}>{fmtMoney(overdueAmount)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Aging mini-bar (kart bazlı) */}
        {aging && (aging.d30 + aging.d60 + aging.d90 > 0) && (
          <View style={card.agingRow}>
            {aging.d30 > 0 && (
              <View style={[card.agingChip, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[card.agingChipText, { color: '#B45309' }]}>1–30g · {fmtMoney(aging.d30)}</Text>
              </View>
            )}
            {aging.d60 > 0 && (
              <View style={[card.agingChip, { backgroundColor: '#FFEDD5' }]}>
                <Text style={[card.agingChipText, { color: '#C2410C' }]}>31–60g · {fmtMoney(aging.d60)}</Text>
              </View>
            )}
            {aging.d90 > 0 && (
              <View style={[card.agingChip, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[card.agingChipText, { color: '#B91C1C' }]}>61+g · {fmtMoney(aging.d90)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8,
  },
  iconOnlyBtn: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },

  summaryWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  summaryCard: {
    backgroundColor: '#0F172A', borderRadius: 16,
    padding: 18, gap: 12,
  },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.3, textTransform: 'uppercase' },
  summaryTotal: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  summaryDetails: { flexDirection: 'row', marginTop: 6 },
  summaryDetailCol: { flex: 1 },
  summaryDetailLabel: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  summaryDetailValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.textPrimary },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
});

const tbl = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F9FB' },
  pageContent: { padding: 16, paddingBottom: 48 },
});

const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
    position: 'relative', borderWidth: 1, borderColor: '#EEF2F6',
    // @ts-ignore
    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
  },
  accentStrip: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
  body: { paddingTop: 14, paddingBottom: 14, paddingLeft: 18, paddingRight: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  name: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  balance: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  balanceLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressTrack: {
    height: 4, borderRadius: 999,
    backgroundColor: '#F1F5F9', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#10B981' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  footerItem: { flex: 1 },
  footerLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 },
  footerValue: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginTop: 1 },
  footerDivider: { width: 1, height: 22, backgroundColor: '#F1F5F9', marginHorizontal: 10 },
  agingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  agingChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  agingChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── Aging totals (top summary bar) ─────────────────────────────────────────
const ag = StyleSheet.create({
  wrap: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 8 },
  title: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.4, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#1E293B' },
  seg: { height: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  legendValue: { fontSize: 11, fontWeight: '700' },
});
