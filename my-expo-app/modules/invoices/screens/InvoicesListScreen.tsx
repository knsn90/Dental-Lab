import React, { useMemo, useState, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvoices, useInvoiceStats, useUnbilledWorkOrders } from '../hooks/useInvoices';
import { createBulkInvoice, bulkRecordPayment } from '../api';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  type InvoiceStatus, type Invoice, type UnbilledWorkOrder,
} from '../types';
import { useClinics } from '../../clinics/hooks/useClinics';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { useBreakpoint } from '../../../core/layout/Responsive';

import { AppIcon } from '../../../core/ui/AppIcon';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';

const STATUS_FILTERS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all',          label: 'Tümü' },
  { value: 'taslak',       label: 'Taslak' },
  { value: 'kesildi',      label: 'Kesildi' },
  { value: 'kismi_odendi', label: 'Kısmi' },
  { value: 'odendi',       label: 'Ödendi' },
  { value: 'iptal',        label: 'İptal' },
];

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '₺' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return '₺' + (n / 1_000).toFixed(1) + 'K';
  return fmtMoney(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function InvoicesListScreen() {
  const router = useRouter();
  const { isDesktop, px, gap } = useBreakpoint();
  const isEmbedded = useContext(HubContext);
  const safeEdges = isEmbedded ? ([] as any) : (['top'] as any);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);

  const { invoices, loading, refetch } = useInvoices();
  const { stats, refetch: refetchStats } = useInvoiceStats();

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (overdueOnly) {
        const isOverdue = inv.due_date && inv.due_date < today
          && inv.status !== 'odendi' && inv.status !== 'iptal';
        if (!isOverdue) return false;
      }
      if (search) {
        const sl = search.toLowerCase();
        const match =
          inv.invoice_number.toLowerCase().includes(sl) ||
          (inv.clinic?.name ?? '').toLowerCase().includes(sl) ||
          (inv.doctor?.full_name ?? '').toLowerCase().includes(sl) ||
          (inv.work_order?.patient_name ?? '').toLowerCase().includes(sl);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search, overdueOnly, today]);

  const onRefresh = () => { refetch(); refetchStats(); };

  // ─── Shared sub-components ──────────────────────────────────────────────────
  const kpiSection = stats && (
    isDesktop ? (
      /* Desktop: 4-col grid, fills full width */
      <View style={[d.kpiGrid, { gap }]}>
        <KpiCard label="BU AY KESİLEN"          value={fmtShort(stats.thisMonthBilled)}    color="#0F172A" sub="↑ Son 30 gün"        flex />
        <KpiCard label="TOPLAM BAKİYE"           value={fmtShort(stats.outstandingBalance)} color="#0F172A" sub={`${stats.invoiceCount} bekleyen fatura`} flex />
        <KpiCard label="VADESİ GEÇEN"            value={fmtShort(stats.overdueAmount)}      color="#EF4444" sub="Kritik gecikme" danger pressable onPress={() => setOverdueOnly(v => !v)} active={overdueOnly} flex />
        <KpiCard label="TOPLAM TAHSİLAT (30 GÜN)" value={fmtShort(stats.totalPaid)}        color="#047857" sub="Hedefe yakın"         flex />
      </View>
    ) : (
      /* Mobile: horizontal scroll */
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiRow}>
        <KpiCard label="BU AY KESİLEN"          value={fmtShort(stats.thisMonthBilled)}    color="#0F172A" sub="↑ Son 30 gün" />
        <KpiCard label="TOPLAM BAKİYE"           value={fmtShort(stats.outstandingBalance)} color="#0F172A" sub={`${stats.invoiceCount} fatura`} />
        <KpiCard label="VADESİ GEÇEN"            value={fmtShort(stats.overdueAmount)}      color="#EF4444" sub="Kritik gecikme" danger pressable onPress={() => setOverdueOnly(v => !v)} active={overdueOnly} />
        <KpiCard label="TAHSİLAT (30 GÜN)"       value={fmtShort(stats.totalPaid)}          color="#047857" sub="Hedefe yakın" />
      </ScrollView>
    )
  );

  const tabsSection = isDesktop ? (
    /* Desktop: underline tab strip */
    <View style={d.tabStrip}>
      {STATUS_FILTERS.map(f => {
        const active = statusFilter === f.value;
        return (
          <TouchableOpacity
            key={f.value}
            style={[d.tab, active && d.tabActive]}
            onPress={() => setStatusFilter(f.value)}
            activeOpacity={0.75}
          >
            <Text style={[d.tabText, active && d.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  ) : (
    /* Mobile: pill chips */
    <View style={s.toolbarRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        contentContainerStyle={{ paddingLeft: 16, paddingRight: 4, alignItems: 'center' }}>
        <SlideTabBar
          items={STATUS_FILTERS.map(f => ({ key: String(f.value), label: f.label }))}
          activeKey={String(statusFilter)}
          onChange={(k) => setStatusFilter(k as any)}
          accentColor="#2563EB"
        />
      </ScrollView>
    </View>
  );

  const searchSection = (
    <View style={isDesktop ? d.searchRow : s.searchRow}>
      <View style={isDesktop ? d.searchWrap : s.searchWrap}>
        <AppIcon name={'magnify' as any} size={17} color={C.textMuted} />
        <TextInput
          style={isDesktop ? d.searchInput : s.searchInput}
          placeholder="Fatura no, klinik, hekim, hasta..."
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
      {isDesktop && (
        <Text style={d.countText}>
          <Text style={{ color: '#0F172A', fontWeight: '700' }}>{filtered.length}</Text>
          {' '}fatura
        </Text>
      )}
    </View>
  );

  const listSection = (
    <View style={{ gap: gap }}>
      {filtered.length === 0
        ? <EmptyState hasFilter={!!search || overdueOnly || statusFilter !== 'all'} />
        : filtered.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onPress={() => router.push(`/(lab)/invoice/${inv.id}` as any)}
            />
          ))
      }
    </View>
  );

  const modal = (
    <>
      <BulkInvoiceModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCreated={(id) => { setBulkOpen(false); router.push(`/(lab)/invoice/${id}` as any); }}
      />
      <BulkPaymentModal
        visible={bulkPayOpen}
        invoices={invoices.filter(inv =>
          inv.status !== 'odendi' && inv.status !== 'iptal' && inv.status !== 'taslak'
        )}
        onClose={() => setBulkPayOpen(false)}
        onDone={() => { setBulkPayOpen(false); onRefresh(); }}
      />
    </>
  );

  // ─── Desktop layout ─────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <SafeAreaView style={d.safe} edges={safeEdges}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#AEAEB2" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Content constrained to maxWidth 1180 */}
          <View style={[d.canvas, { paddingHorizontal: px }]}>

            {/* Page header */}
            <View style={d.pageHeader}>
              <View style={{ flex: 1 }}>
                <Text style={d.title}>Faturalar</Text>
                <Text style={d.subtitle}>
                  {stats ? `Kestiğiniz faturalar ve tahsilatlar` : '…'}
                </Text>
              </View>
              <TouchableOpacity style={d.outlineBtn} onPress={() => router.push('/(lab)/balance' as any)} activeOpacity={0.85}>
                <AppIcon name={'chart-line' as any} size={16} color="#0F172A" />
                <Text style={d.outlineBtnText}>Cari Hesap</Text>
              </TouchableOpacity>
              <TouchableOpacity style={d.outlineBtn} onPress={() => setBulkPayOpen(true)} activeOpacity={0.85}>
                <AppIcon name={'cash-multiple' as any} size={16} color="#047857" />
                <Text style={[d.outlineBtnText, { color: '#047857' }]}>Toplu Tahsilat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={d.outlineBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  const res = await downloadCsv(
                    `Faturalar-${new Date().toISOString().slice(0,10)}`,
                    filtered,
                    [
                      { header: 'Fatura No',     value: r => r.invoice_number },
                      { header: 'Tarih',         value: r => csvDate(r.issue_date) },
                      { header: 'Vade',          value: r => csvDate(r.due_date) },
                      { header: 'Klinik',        value: r => r.clinic?.name ?? '' },
                      { header: 'Hekim',         value: r => r.doctor?.full_name ?? '' },
                      { header: 'Tutar',         value: r => csvMoney(r.total) },
                      { header: 'Tahsil Edilen', value: r => csvMoney(r.paid_amount) },
                      { header: 'Bakiye',        value: r => csvMoney(Number(r.total) - Number(r.paid_amount)) },
                      { header: 'Durum',         value: r => INVOICE_STATUS_LABELS[r.status] ?? r.status },
                    ],
                  );
                  if (!res.ok && res.error) toast.error(res.error);
                  else toast.success('CSV indirildi');
                }}
              >
                <AppIcon name={'file-excel-outline' as any} size={16} color="#0F172A" />
                <Text style={d.outlineBtnText}>Excel'e Aktar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={d.primaryBtn} onPress={() => setBulkOpen(true)} activeOpacity={0.85}>
                <AppIcon name={'layers-plus' as any} size={16} color="#FFFFFF" />
                <Text style={d.primaryBtnText}>Toplu Fatura</Text>
              </TouchableOpacity>
            </View>

            {/* KPI grid */}
            {kpiSection}

            {/* Tabs */}
            {tabsSection}

            {/* Search + count */}
            {searchSection}

            {/* Invoice list */}
            {listSection}
          </View>
        </ScrollView>
        {modal}
      </SafeAreaView>
    );
  }

  // ─── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      {/* Mobile header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Faturalar</Text>
          <Text style={s.subtitle}>
            {stats ? `${stats.invoiceCount} fatura · ${fmtMoney(stats.outstandingBalance)} bakiye` : '…'}
          </Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/(lab)/balance' as any)} activeOpacity={0.85}>
          <AppIcon name={'chart-line' as any} size={15} color="#0F172A" />
          <Text style={s.newBtnText}>Cari</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.newBtn} onPress={() => setBulkPayOpen(true)} activeOpacity={0.85}>
          <AppIcon name={'cash-multiple' as any} size={15} color="#047857" />
          <Text style={[s.newBtnText, { color: '#047857' }]}>Tahsilat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bulkBtn} onPress={() => setBulkOpen(true)} activeOpacity={0.85}>
          <AppIcon name={'layers-plus' as any} size={15} color="#FFFFFF" />
          <Text style={s.bulkBtnText}>Toplu Fatura</Text>
        </TouchableOpacity>
      </View>

      {kpiSection}
      {tabsSection}
      {searchSection}

      <ScrollView
        style={tbl.page}
        contentContainerStyle={tbl.pageContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#AEAEB2" />}
        showsVerticalScrollIndicator={false}
      >
        {listSection}
      </ScrollView>

      {modal}
    </SafeAreaView>
  );
}

// ─── Kpi Card ──────────────────────────────────────────────────────────────
function KpiCard({
  label, value, color, sub, pressable, onPress, active, danger, flex,
}: {
  label: string; value: string; color: string; sub?: string;
  pressable?: boolean; onPress?: () => void; active?: boolean; danger?: boolean;
  /** Desktop grid: fill available width */
  flex?: boolean;
}) {
  const Wrap: any = pressable ? TouchableOpacity : View;
  return (
    <Wrap
      style={[
        kpi.card,
        flex && { flex: 1 },
        danger && { borderColor: '#EF4444' },
        active && { borderColor: color, borderWidth: 2 },
      ]}
      activeOpacity={pressable ? 0.85 : 1}
      onPress={onPress}
    >
      <Text style={kpi.label} numberOfLines={1}>{label}</Text>
      <Text style={[kpi.value, { color }]} numberOfLines={1}>{value}</Text>
      {sub ? (
        <Text
          style={[kpi.sub, { color: danger ? '#EF4444' : color === '#047857' ? '#047857' : '#64748B' }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </Wrap>
  );
}

// ─── Invoice Card ──────────────────────────────────────────────────────────
function InvoiceCard({ invoice, onPress }: { invoice: Invoice; onPress: () => void }) {
  const statusColor = INVOICE_STATUS_COLORS[invoice.status];
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';

  return (
    <TouchableOpacity
      style={[card.wrap, isOverdue && card.wrapOverdue]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Row layout */}
      <View style={card.row}>

        {/* Col 1: Fatura no + tarih */}
        <View style={card.col1}>
          <Text style={card.number} numberOfLines={1}>{invoice.invoice_number}</Text>
          <Text style={[card.date, isOverdue && { color: '#DC2626' }]} numberOfLines={1}>
            {fmtDate(invoice.issue_date)}
          </Text>
        </View>

        <View style={[card.divider, isOverdue && { backgroundColor: '#FECACA' }]} />

        {/* Col 2: Klinik + doktor */}
        <View style={card.col2}>
          <Text style={card.clinic} numberOfLines={1}>{invoice.clinic?.name ?? '—'}</Text>
          {invoice.doctor?.full_name && (
            <Text style={card.doctor} numberOfLines={1}>Dr. {invoice.doctor.full_name}</Text>
          )}
        </View>

        {/* Col 3: İş emri (gizle küçük ekranda) */}
        {invoice.work_order && (
          <>
            <View style={[card.divider, card.dividerHidden, isOverdue && { backgroundColor: '#FECACA' }]} />
            <View style={[card.col3, card.col3Hidden]}>
              <Text style={[card.metaLabel, isOverdue && { color: '#F87171' }]}>İŞ EMRİ</Text>
              <Text style={card.metaValue} numberOfLines={1}>{invoice.work_order.order_number}</Text>
            </View>
          </>
        )}

        {/* Col 4: Tutar + status + chevron */}
        <View style={card.col4}>
          <Text style={[card.amount, isOverdue && { color: '#EF4444' }]}>
            {fmtMoney(invoice.total)}
          </Text>
          <View style={[card.statusPill, { backgroundColor: isOverdue ? '#EF4444' : statusColor.bg }]}>
            <Text style={[card.statusText, { color: isOverdue ? '#FFFFFF' : statusColor.fg }]}>
              {isOverdue ? 'VADESİ GEÇTİ' : INVOICE_STATUS_LABELS[invoice.status].toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Chevron */}
        <View style={[card.chevronWrap, isOverdue && card.chevronWrapDanger]}>
          <AppIcon name={'chevron-right' as any} size={18} color={isOverdue ? '#EF4444' : '#94A3B8'} />
        </View>
      </View>

      {/* Bottom: vade bilgisi varsa */}
      {invoice.due_date && (
        <View style={[card.dueRow, isOverdue && { borderTopColor: '#FECACA' }]}>
          <AppIcon name={'calendar-clock' as any} size={11} color={isOverdue ? '#DC2626' : '#94A3B8'} />
          <Text style={[card.dueText, isOverdue && { color: '#DC2626', fontWeight: '700' }]}>
            Son ödeme: {fmtDate(invoice.due_date)}{isOverdue ? ' · gecikmiş' : ''}
          </Text>
          {balance > 0 && (
            <>
              <View style={card.dot} />
              <Text style={[card.dueText, { fontWeight: '700', color: isOverdue ? '#DC2626' : '#0F172A' }]}>
                Kalan: {fmtMoney(balance)}
              </Text>
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <AppIcon
          name={(hasFilter ? 'magnify-close' : 'receipt-text-outline') as any}
          size={36}
          color={C.textMuted}
        />
      </View>
      <Text style={s.emptyTitle}>
        {hasFilter ? 'Sonuç bulunamadı' : 'Henüz fatura yok'}
      </Text>
      <Text style={s.emptySub}>
        {hasFilter
          ? 'Filtre kriterlerini değiştirmeyi deneyin.'
          : 'Bir iş emrini teslim ettiğinde oradan "Fatura Oluştur" butonuyla fatura kesebilirsin.'}
      </Text>
    </View>
  );
}

// ─── Mobile styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, gap: 10,
  },
  title:    { fontSize: 20, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  newBtnText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#2563EB',
  },
  bulkBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  kpiRow: { gap: 10, paddingHorizontal: 16, paddingVertical: 8 },

  toolbarRow: { flexDirection: 'row', alignItems: 'center', height: 48, backgroundColor: '#FFFFFF' },

  searchRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.textPrimary },

  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary, marginBottom: 6 },
  emptySub: {
    fontSize: 14, fontFamily: F.regular, color: C.textSecondary,
    textAlign: 'center', maxWidth: 300, lineHeight: 20,
  },
});

// ─── Desktop styles ────────────────────────────────────────────────────────
const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  // All content constrained to maxWidth 1180, centered
  canvas: { maxWidth: 1180, alignSelf: 'center', width: '100%', paddingTop: 8, paddingBottom: 48 },

  // Page header: title + action buttons
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  title:    { fontSize: 28, fontWeight: '700', color: '#0F172A', letterSpacing: -0.5, flex: 1 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 3 },

  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#2563EB',
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // KPI: 4-col flex row
  kpiGrid: { flexDirection: 'row', marginBottom: 32 },

  // Tab strip: underline style
  tabStrip: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 12, paddingHorizontal: 4, marginRight: 32,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#2563EB' },
  tabText:   { fontSize: 14, fontWeight: '500', color: '#64748B' },
  tabTextActive: { color: '#2563EB', fontWeight: '700' },

  // Search row: search input left, count right
  searchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, marginBottom: 16,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  countText:   { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});

const tbl = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F9FB' },
  pageContent: { padding: 16, paddingBottom: 48 },
});

const kpi = StyleSheet.create({
  card: {
    minWidth: 180, paddingHorizontal: 18, paddingVertical: 16,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 10, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
  },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 11, fontWeight: '600', marginTop: 6 },
});

// ─── Toplu Fatura Modal ────────────────────────────────────────────────────
function BulkInvoiceModal({
  visible, onClose, onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}) {
  const { clinics, loading: loadingClinics } = useClinics();
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [orderSearch, setOrderSearch] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { orders, loading: loadingOrders } = useUnbilledWorkOrders(
    selectedClinicId ?? undefined,
  );

  const selectedClinic = useMemo(
    () => clinics.find(c => c.id === selectedClinicId) ?? null,
    [clinics, selectedClinicId],
  );

  const visibleOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    const sl = orderSearch.toLowerCase();
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(sl) ||
      (o.patient_name ?? '').toLowerCase().includes(sl) ||
      (o.work_type ?? '').toLowerCase().includes(sl),
    );
  }, [orders, orderSearch]);

  const selectedTotal = useMemo(() => {
    return orders
      .filter(o => selectedOrders.has(o.work_order_id))
      .reduce((sum, o) => sum + Number(o.estimated_total ?? 0), 0);
  }, [orders, selectedOrders]);

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allSel = visibleOrders.every(o => selectedOrders.has(o.work_order_id));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      visibleOrders.forEach(o => allSel ? next.delete(o.work_order_id) : next.add(o.work_order_id));
      return next;
    });
  };

  const handleClose = () => {
    setSelectedClinicId(null);
    setSelectedOrders(new Set());
    setOrderSearch('');
    setDueDays('30');
    setNotes('');
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedClinicId || selectedOrders.size === 0) return;
    const dueDaysNum = parseInt(dueDays, 10);
    if (Number.isNaN(dueDaysNum) || dueDaysNum < 0 || dueDaysNum > 365) {
      toast.warning('Vade gün sayısı 0–365 arasında olmalı.');
      return;
    }
    setSaving(true);
    const { data, error } = await createBulkInvoice({
      clinic_id: selectedClinicId,
      work_order_ids: Array.from(selectedOrders),
      due_days: dueDaysNum,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error || !data) {
      toast.error((error as any)?.message ?? 'Fatura oluşturulamadı.');
      return;
    }
    onCreated(data.id);
  };

  const allSel = visibleOrders.length > 0 &&
    visibleOrders.every(o => selectedOrders.has(o.work_order_id));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={bm.backdrop}>
        <View style={bm.card}>
          {/* Header */}
          <View style={bm.header}>
            <View>
              <Text style={bm.title}>Toplu Fatura</Text>
              <Text style={bm.subtitle}>Birden fazla siparişi tek faturada topla</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={bm.closeBtn}>
              <AppIcon name={'close' as any} size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Klinik seçici */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Text style={bm.fieldLabel}>Klinik</Text>
            <TouchableOpacity
              style={bm.clinicPicker}
              onPress={() => setClinicPickerOpen(true)}
              activeOpacity={0.85}
            >
              <AppIcon
                name={'hospital-building' as any}
                size={18}
                color={selectedClinic ? '#2563EB' : C.textMuted}
              />
              <Text style={[bm.clinicPickerText, !selectedClinic && { color: C.textMuted }]} numberOfLines={1}>
                {selectedClinic ? selectedClinic.name : 'Klinik seçin...'}
              </Text>
              <AppIcon name={'chevron-down' as any} size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Sipariş listesi */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {!selectedClinicId ? (
              <View style={bm.emptyHint}>
                <AppIcon name={'gesture-tap' as any} size={32} color={C.textMuted} />
                <Text style={bm.emptyText}>Klinik seçerek başlayın</Text>
              </View>
            ) : loadingOrders ? (
              <View style={bm.emptyHint}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16 }}>
                {/* Arama + seç tümü */}
                <View style={bm.toolRow}>
                  <View style={bm.searchWrap}>
                    <AppIcon name={'magnify' as any} size={15} color={C.textMuted} />
                    <TextInput
                      style={bm.searchInput}
                      placeholder="İş no, hasta..."
                      placeholderTextColor={C.textMuted}
                      value={orderSearch}
                      onChangeText={setOrderSearch}
                    />
                    {orderSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setOrderSearch('')}>
                        <AppIcon name={'close-circle' as any} size={14} color={C.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {visibleOrders.length > 0 && (
                    <TouchableOpacity style={bm.selAllBtn} onPress={toggleAll} activeOpacity={0.8}>
                      <AppIcon
                        name={(allSel ? 'checkbox-multiple-marked' : 'checkbox-multiple-blank-outline') as any}
                        size={15}
                        color="#2563EB"
                      />
                      <Text style={bm.selAllText}>{allSel ? 'Kaldır' : 'Tümü'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {visibleOrders.length === 0 ? (
                  <View style={[bm.emptyHint, { marginTop: 0 }]}>
                    <AppIcon name={'file-check-outline' as any} size={32} color="#10B981" />
                    <Text style={bm.emptyText}>
                      {orderSearch ? 'Sonuç yok' : 'Faturalanmamış sipariş yok'}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {visibleOrders.map(order => (
                      <BulkOrderRow
                        key={order.work_order_id}
                        order={order}
                        selected={selectedOrders.has(order.work_order_id)}
                        onToggle={() => toggleOrder(order.work_order_id)}
                      />
                    ))}
                  </View>
                )}

                {/* Seçim varsa vade + not */}
                {selectedOrders.size > 0 && (
                  <View style={bm.optBox}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 100 }}>
                        <Text style={bm.fieldLabel}>Vade (gün)</Text>
                        <TextInput
                          style={bm.fieldInput}
                          value={dueDays}
                          onChangeText={setDueDays}
                          keyboardType="number-pad"
                          placeholder="30"
                          placeholderTextColor={C.textMuted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={bm.fieldLabel}>Not (opsiyonel)</Text>
                        <TextInput
                          style={bm.fieldInput}
                          value={notes}
                          onChangeText={setNotes}
                          placeholder="Ör: Mart 2026 toplu"
                          placeholderTextColor={C.textMuted}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={bm.footer}>
            <View style={{ flex: 1 }}>
              <Text style={bm.footerCount}>
                {selectedOrders.size > 0 ? `${selectedOrders.size} sipariş` : 'Seçim yok'}
              </Text>
              <Text style={bm.footerTotal}>
                {selectedTotal > 0
                  ? '₺' + selectedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '—'}
              </Text>
            </View>
            <TouchableOpacity
              style={[bm.createBtn, (selectedOrders.size === 0 || saving) && { opacity: 0.45 }]}
              onPress={handleCreate}
              disabled={selectedOrders.size === 0 || saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <>
                    <AppIcon name={'receipt' as any} size={16} color="#FFFFFF" />
                    <Text style={bm.createBtnText}>Fatura Oluştur</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Klinik seçim inner modal */}
      <Modal
        visible={clinicPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setClinicPickerOpen(false)}
      >
        <View style={bm.backdrop}>
          <View style={[bm.card, { maxHeight: 420 }]}>
            <View style={bm.header}>
              <Text style={bm.title}>Klinik Seç</Text>
              <TouchableOpacity onPress={() => setClinicPickerOpen(false)} style={bm.closeBtn}>
                <AppIcon name={'close' as any} size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {loadingClinics ? (
              <ActivityIndicator color="#2563EB" style={{ padding: 24 }} />
            ) : (
              <ScrollView>
                {clinics.map(cl => (
                  <TouchableOpacity
                    key={cl.id}
                    style={[bm.clinicRow, selectedClinicId === cl.id && { backgroundColor: '#EFF6FF' }]}
                    onPress={() => {
                      setSelectedClinicId(cl.id);
                      setSelectedOrders(new Set());
                      setClinicPickerOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <AppIcon
                      name={'hospital-building' as any}
                      size={17}
                      color={selectedClinicId === cl.id ? '#2563EB' : C.textMuted}
                    />
                    <Text style={[bm.clinicRowText, selectedClinicId === cl.id && { color: '#2563EB', fontWeight: '700' }]} numberOfLines={1}>
                      {cl.name}
                    </Text>
                    {selectedClinicId === cl.id && (
                      <AppIcon name={'check' as any} size={17} color="#2563EB" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Toplu fatura sipariş satırı ──────────────────────────────────────────
function BulkOrderRow({
  order, selected, onToggle,
}: { order: UnbilledWorkOrder; selected: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      style={[brow.wrap, selected && brow.wrapSel]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={[brow.cb, selected && brow.cbActive]}>
        {selected && <AppIcon name={'check' as any} size={12} color="#FFFFFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={brow.no}>{order.order_number}</Text>
        <Text style={brow.name} numberOfLines={1}>
          {order.patient_name ?? '—'}
          {order.work_type ? ` · ${order.work_type}` : ''}
        </Text>
        <Text style={brow.meta}>
          Teslim: {order.delivered_at
            ? new Date(order.delivered_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
            : '—'}
        </Text>
      </View>
      <Text style={brow.amt}>
        {Number(order.estimated_total) > 0
          ? '₺' + Number(order.estimated_total).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—'}
      </Text>
    </TouchableOpacity>
  );
}

const bm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    overflow: 'hidden',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: '#64748B',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  clinicPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  clinicPickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },
  emptyHint: {
    alignItems: 'center', paddingVertical: 32, gap: 8,
  },
  emptyText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  toolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A' },
  selAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  selAllText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  optBox: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fieldInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  footerCount: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  footerTotal: {
    fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 18, paddingVertical: 13,
    borderRadius: 12, backgroundColor: '#2563EB',
    minWidth: 140, justifyContent: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  clinicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  clinicRowText: { flex: 1, fontSize: 14, color: '#0F172A' },
});

const brow = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  wrapSel: { borderColor: '#2563EB', backgroundColor: '#F0F5FF' },
  cb: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  cbActive: { borderColor: '#2563EB', backgroundColor: '#2563EB' },
  no: { fontSize: 12, fontWeight: '700', color: '#2563EB', letterSpacing: 0.2 },
  name: { fontSize: 13, fontWeight: '600', color: '#0F172A', marginTop: 1 },
  meta: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  amt: { fontSize: 13, fontWeight: '700', color: '#0F172A', fontVariant: ['tabular-nums'] },
});

const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  wrapOverdue: {
    backgroundColor: '#FEF2F2', borderColor: 'rgba(239,68,68,0.3)',
  },

  // Row layout
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 0,
  },
  divider: { width: 1, height: 36, backgroundColor: '#F1F5F9', marginHorizontal: 14 },
  dividerHidden: {},   // on mobile stays visible, used for work order col

  // Col 1: invoice number + date
  col1: { width: 110 },
  number: { fontSize: 12, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 },
  date: { fontSize: 11, color: '#64748B', marginTop: 3 },

  // Col 2: clinic + doctor
  col2: { flex: 1, minWidth: 0 },
  clinic: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  doctor: { fontSize: 11, color: '#64748B', marginTop: 2 },

  // Col 3: work order (hidden on small screens — we keep it always for now)
  col3: { width: 110 },
  col3Hidden: {},
  metaLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  metaValue: { fontSize: 11, fontWeight: '600', color: '#0F172A' },

  // Col 4: amount + status pill
  col4: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, color: '#0F172A' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Chevron
  chevronWrap: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center', marginLeft: 10,
  },
  chevronWrapDanger: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },

  // Due row at bottom
  dueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  dueText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' },
});

// ─── Toplu Tahsilat Modal ──────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { v: 'nakit',  l: 'Nakit',   icon: 'cash' },
  { v: 'kart',   l: 'Kart',    icon: 'credit-card-outline' },
  { v: 'havale', l: 'Havale',  icon: 'bank-outline' },
  { v: 'cek',    l: 'Çek',     icon: 'file-document-outline' },
] as const;

function BulkPaymentModal({
  visible, invoices, onClose, onDone,
}: {
  visible: boolean;
  invoices: Invoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'nakit' | 'kart' | 'havale' | 'cek'>('nakit');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setAmount('');
      setMethod('nakit');
      setNotes('');
    }
  }, [visible]);

  const sortedInvoices = useMemo(() =>
    [...invoices].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }), [invoices]);

  const totalBalance = useMemo(() =>
    sortedInvoices
      .filter(inv => selected.has(inv.id))
      .reduce((s, inv) => s + Number(inv.total) - Number(inv.paid_amount), 0),
    [sortedInvoices, selected]);

  const toggleAll = () => {
    if (selected.size === sortedInvoices.length) setSelected(new Set());
    else setSelected(new Set(sortedInvoices.map(i => i.id)));
  };

  const handlePay = async () => {
    if (selected.size === 0) return;
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Geçerli bir tutar girin.');
      return;
    }
    setSaving(true);
    const { error } = await bulkRecordPayment({
      invoice_ids: Array.from(selected),
      total_amount: amt,
      payment_method: method,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error((error as any)?.message ?? 'İşlem gerçekleştirilemedi.');
      return;
    }
    onDone();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={bp.backdrop}>
        <View style={bp.card}>
          {/* Header */}
          <View style={bp.header}>
            <View style={bp.headerIcon}>
              <AppIcon name={'cash-multiple' as any} size={18} color="#047857" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={bp.title}>Toplu Tahsilat</Text>
              <Text style={bp.subtitle}>Birden fazla faturayı tek seferde tahsil et</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={bp.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Fatura listesi */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={bp.listHeader}>
              <TouchableOpacity onPress={toggleAll} style={bp.selAllBtn} activeOpacity={0.8}>
                <AppIcon
                  name={(selected.size === sortedInvoices.length && sortedInvoices.length > 0
                    ? 'checkbox-marked'
                    : 'checkbox-blank-outline') as any}
                  size={16} color="#2563EB"
                />
                <Text style={bp.selAllText}>
                  {selected.size === sortedInvoices.length && sortedInvoices.length > 0
                    ? 'Tümünü kaldır' : 'Tümünü seç'}
                </Text>
              </TouchableOpacity>
              <Text style={bp.countText}>{sortedInvoices.length} fatura</Text>
            </View>

            <View style={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
              {sortedInvoices.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <AppIcon name={'check-circle-outline' as any} size={36} color="#10B981" />
                  <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B' }}>Bekleyen fatura yok</Text>
                </View>
              ) : sortedInvoices.map(inv => {
                const bal = Number(inv.total) - Number(inv.paid_amount);
                const sel = selected.has(inv.id);
                const today = new Date().toISOString().slice(0, 10);
                const overdue = inv.due_date && inv.due_date < today;
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={[bp.row, sel && bp.rowSel, overdue && !sel && bp.rowOverdue]}
                    onPress={() => setSelected(prev => {
                      const n = new Set(prev);
                      n.has(inv.id) ? n.delete(inv.id) : n.add(inv.id);
                      return n;
                    })}
                    activeOpacity={0.85}
                  >
                    <View style={[bp.cb, sel && bp.cbActive]}>
                      {sel && <AppIcon name={'check' as any} size={11} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={bp.invNo}>{inv.invoice_number}</Text>
                      <Text style={bp.invClinic} numberOfLines={1}>{inv.clinic?.name ?? '—'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[bp.invBal, overdue && { color: '#EF4444' }]}>
                        {fmtMoney(bal)}
                      </Text>
                      {inv.due_date && (
                        <Text style={[bp.invDue, overdue && { color: '#EF4444' }]}>
                          {overdue ? 'geçti · ' : ''}{fmtDate(inv.due_date)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Ödeme formu */}
            {selected.size > 0 && (
              <View style={bp.formBox}>
                <View style={bp.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={bp.label}>Ödeme Tutarı (₺)</Text>
                    <TextInput
                      style={bp.input}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder={totalBalance.toFixed(2)}
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                    />
                    <Text style={bp.hint}>
                      Seçili toplam: {fmtMoney(totalBalance)}
                    </Text>
                  </View>
                </View>
                <Text style={bp.label}>Yöntem</Text>
                <View style={bp.chipRow}>
                  {PAYMENT_METHODS.map(m => (
                    <TouchableOpacity
                      key={m.v}
                      style={[bp.chip, method === m.v && bp.chipActive]}
                      onPress={() => setMethod(m.v)}
                    >
                      <AppIcon name={m.icon as any} size={13} color={method === m.v ? '#047857' : '#94A3B8'} />
                      <Text style={[bp.chipText, method === m.v && bp.chipTextActive]}>{m.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={bp.label}>Not (opsiyonel)</Text>
                <TextInput
                  style={bp.input}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Ödeme notu…"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={bp.footer}>
            <View style={{ flex: 1 }}>
              <Text style={bp.footerSel}>{selected.size} fatura seçili</Text>
              {totalBalance > 0 && (
                <Text style={bp.footerBal}>{fmtMoney(totalBalance)} toplam bakiye</Text>
              )}
            </View>
            <TouchableOpacity
              style={[bp.payBtn, (selected.size === 0 || saving) && { opacity: 0.4 }]}
              onPress={handlePay}
              disabled={selected.size === 0 || saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <AppIcon name={'cash-check' as any} size={16} color="#fff" />
                    <Text style={bp.payBtnText}>Tahsil Et</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const bp = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 580, maxHeight: '90%', overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  selAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selAllText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  countText: { fontSize: 11, color: '#94A3B8' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  rowSel: { borderColor: '#047857', backgroundColor: '#F0FDF4' },
  rowOverdue: { backgroundColor: '#FEF2F2' },
  cb: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  cbActive: { borderColor: '#047857', backgroundColor: '#047857' },
  invNo: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  invClinic: { fontSize: 11, color: '#64748B', marginTop: 2 },
  invBal: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  invDue: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  formBox: {
    margin: 16, marginTop: 8,
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E2E8F0', gap: 2,
  },
  formRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#0F172A', backgroundColor: '#fff' },
  hint: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  chipActive: { borderColor: '#047857', backgroundColor: '#ECFDF5' },
  chipText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  chipTextActive: { color: '#047857', fontWeight: '700' },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  footerSel: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  footerBal: { fontSize: 11, color: '#64748B', marginTop: 2 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#047857' },
  payBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
