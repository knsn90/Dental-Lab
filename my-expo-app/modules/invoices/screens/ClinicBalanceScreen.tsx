import { localeTag } from '../../../core/i18n';
/**
 * ClinicBalanceScreen — Cari Hesap (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 search input, Lucide icons.
 *
 * Klinik satırına tıklayınca /statement/[clinicId] sayfasına yönlendirir.
 */
import React, { useContext, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  TextInput, useWindowDimensions, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Search, X, Building2, AlertTriangle,
  Clock, Inbox, ChevronRight, FileText, Receipt, SlidersHorizontal, Check, Bell,
} from 'lucide-react-native';
import { SendReminderModal } from '../../finance-clinic/components/SendReminderModal';
import { sendBulkPaymentReminders } from '../../finance-clinic/api';

import { useClinicBalancesByCurrency, useUnbilledWorkOrders } from '../hooks/useInvoices';
import { createBulkInvoice } from '../api';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { HubContext } from '../../../core/ui/HubContext';
import { useBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';

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

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

// ── Helpers ──────────────────────────────────────────────────────────
// Katı per-currency: her tutar KENDİ para biriminde (base'e çevrilmez).
function fmtCur(n: number | string | null | undefined, currency?: string | null): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return formatMoney(Number(v) || 0, ((currency || 'TRY') as Currency), { fractionDigits: 2 });
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ClinicBalanceScreen() {
  useBaseCurrency();
  const theme = usePanelTheme();
  const router = useRouter();
  const isEmbedded = useContext(HubContext);
  const { rows, loading, refetch } = useClinicBalancesByCurrency();
  const { orders: unbilled, refetch: refetchUnbilled } = useUnbilledWorkOrders();

  // clinic_id → { count, total, work_order_ids[] }
  const unbilledByClinic = useMemo(() => {
    const map: Record<string, { count: number; total: number; ids: string[] }> = {};
    for (const o of (unbilled ?? [])) {
      const k = (o as any).clinic_id;
      if (!k) continue;
      if (!map[k]) map[k] = { count: 0, total: 0, ids: [] };
      map[k].count += 1;
      map[k].total += Number((o as any).estimated_total ?? 0);
      map[k].ids.push((o as any).work_order_id);
    }
    return map;
  }, [unbilled]);

  const [billingClinicId, setBillingClinicId] = useState<string | null>(null);
  const handleBulkBill = async (clinicId: string) => {
    const bucket = unbilledByClinic[clinicId];
    if (!bucket || bucket.count === 0) return;
    // Vade: klinikten oku
    let dueDays = 30;
    try {
      const { data } = await supabase.from('clinics').select('default_payment_terms_days').eq('id', clinicId).maybeSingle();
      if (data?.default_payment_terms_days != null) dueDays = Number(data.default_payment_terms_days);
    } catch { /* default 30 */ }

    setBillingClinicId(clinicId);
    const { error } = await createBulkInvoice({
      clinic_id: clinicId,
      work_order_ids: bucket.ids,
      due_days: dueDays,
      notes: `Toplu fatura — ${bucket.count} sipariş`,
    });
    setBillingClinicId(null);
    if (error) {
      toast.error('Toplu fatura: ' + ((error as any).message ?? 'hata'));
      return;
    }
    toast.success(`${bucket.count} sipariş tek faturada birleştirildi`);
    refetch();
    refetchUnbilled();
  };
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  type CBSortKey = 'balance_desc' | 'balance_asc' | 'overdue_desc' | 'name_asc';
  const [sortKey, setSortKey] = useState<CBSortKey>('balance_desc');
  const SORT_OPTIONS: { key: CBSortKey; label: string }[] = [
    { key: 'balance_desc', label: 'Bakiye ↓' },
    { key: 'balance_asc',  label: 'Bakiye ↑' },
    { key: 'overdue_desc', label: 'Gecikme ↓' },
    { key: 'name_asc',     label: 'İsim (A→Z)' },
  ];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Hatırlatma modal state
  const [reminderTarget, setReminderTarget] = useState<{
    clinicId: string;
    clinicName: string;
    totalDue: number;
    overdueCount: number;
  } | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  const handleBulkReminders = async () => {
    if (bulkSending) return;
    if (!confirm('Vadesi geçen tüm kliniklere hatırlatma gönderilecek. Onaylıyor musunuz?')) return;
    setBulkSending(true);
    try {
      const n = await sendBulkPaymentReminders({ severity: 'warning' });
      toast.success(`${n} kliniğe hatırlatma gönderildi.`);
    } catch (e: any) {
      toast.error(`Hata: ${e?.message ?? e}`);
    } finally { setBulkSending(false); }
  };

  // Her satır = (klinik, para birimi). Sıralama tek-para satır bazında (gösterilen
  // toplam değil, yalnız sıralama sezgisi — para birimleri toplanmaz).
  const filtered = useMemo(() => {
    const list = rows.filter(b => {
      if (overdueOnly && Number(b.overdue_amount) <= 0) return false;
      if (search) return b.clinic_name.toLowerCase().includes(search.toLowerCase());
      return true;
    });
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'balance_desc': return Number(b.balance ?? 0) - Number(a.balance ?? 0);
        case 'balance_asc':  return Number(a.balance ?? 0) - Number(b.balance ?? 0);
        case 'overdue_desc': return Number(b.overdue_amount ?? 0) - Number(a.overdue_amount ?? 0);
        case 'name_asc':     return (a.clinic_name ?? '').localeCompare(b.clinic_name ?? '', 'tr');
        default:             return 0;
      }
    });
  }, [rows, search, overdueOnly, sortKey]);

  // Hero & footer için per-currency gruplar (KATI — asla toplanmaz)
  const balanceByCcy = groupByCurrency(rows, b => ({ amount: Number(b.balance), currency: b.currency as Currency }), { keepZero: true });
  const billedByCcy  = groupByCurrency(rows, b => ({ amount: Number(b.total_billed), currency: b.currency as Currency }));
  const paidByCcy    = groupByCurrency(rows, b => ({ amount: Number(b.total_paid), currency: b.currency as Currency }));
  const overdueByCcy = groupByCurrency(rows, b => ({ amount: Number(b.overdue_amount), currency: b.currency as Currency }));
  const overdueExists = rows.some(b => Number(b.overdue_amount) > 0);

  // Yaşlandırma — para birimi başına (her döviz kendi bar'ı)
  const agingByCcy = useMemo(() => {
    const m = new Map<string, { currency: string; current: number; d30: number; d60: number; d90: number }>();
    for (const b of rows) {
      const c = b.currency || 'TRY';
      const g = m.get(c) ?? { currency: c, current: 0, d30: 0, d60: 0, d90: 0 };
      g.current += Number(b.aging_current ?? 0);
      g.d30 += Number(b.aging_30 ?? 0);
      g.d60 += Number(b.aging_60 ?? 0);
      g.d90 += Number(b.aging_90 ?? 0);
      m.set(c, g);
    }
    return Array.from(m.values()).filter(g => g.current + g.d30 + g.d60 + g.d90 > 0);
  }, [rows]);

  const hasAging = agingByCcy.length > 0;

  const openStatement = (clinicId: string) => {
    router.push(`/statement/${clinicId}` as any);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Standalone header ─────────────────────────────────── */}
      {!isEmbedded && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 58, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
            <ArrowLeft size={18} color={DS.ink[900]} strokeWidth={1.8} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Cari Hesap</Text>
            <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>Sağlık kurumu bazlı bakiye özeti</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 48, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — panel primary bg, white text ──────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: theme.primary,
          padding: 16,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 12 }}>
            Toplam Alacak
          </Text>
          {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
          <MoneyMultiX slices={balanceByCcy} variant="cards" size="lg" colorBySign accentColor={theme.primary} emptyText="—" />

          <View style={{ flexDirection: 'row', gap: isDesktop ? 40 : 24, marginTop: 20, flexWrap: 'wrap' }}>
            <HeroCcyStat label="Kesilen" slices={billedByCcy} />
            <HeroCcyStat label="Tahsil Edilen" slices={paidByCcy} />
            <HeroCcyStat label="Vadesi Geçen" slices={overdueByCcy} />
          </View>

          {hasAging && (
            <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', gap: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>Yaşlandırma</Text>
              {agingByCcy.map(g => {
                const total = g.current + g.d30 + g.d60 + g.d90;
                const sym = CURRENCY_META[(g.currency as Currency)]?.symbol ?? g.currency;
                return (
                  <View key={g.currency} style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 }}>{sym} {g.currency}</Text>
                    <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.18)' }}>
                      {[
                        { v: g.current, color: '#2D9A6B' },
                        { v: g.d30,     color: '#E89B2A' },
                        { v: g.d60,     color: '#F97316' },
                        { v: g.d90,     color: '#D94B4B' },
                      ].map((seg, i) => {
                        const w = total > 0 ? (seg.v / total) * 100 : 0;
                        if (w === 0) return null;
                        return <View key={i} style={{ width: `${w}%` as any, height: 6, backgroundColor: seg.color }} />;
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 }}>
                      {g.current > 0 && <AgingLegend label="Vadesi var" value={fmtCur(g.current, g.currency)} color="#2D9A6B" />}
                      {g.d30 > 0 && <AgingLegend label="1–30 gün" value={fmtCur(g.d30, g.currency)} color="#E89B2A" />}
                      {g.d60 > 0 && <AgingLegend label="31–60 gün" value={fmtCur(g.d60, g.currency)} color="#F97316" />}
                      {g.d90 > 0 && <AgingLegend label="61+ gün" value={fmtCur(g.d90, g.currency)} color="#D94B4B" />}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Search + Filter — §05.5 ─────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
            height: 44, paddingHorizontal: 14, borderRadius: 14,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
          }}>
            <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
              placeholder="Sağlık kurumu ara..."
              placeholderTextColor={DS.ink[400]}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                <X size={14} color={DS.ink[400]} strokeWidth={2} />
              </Pressable>
            )}
          </View>

          {/* Bulk hatırlatma butonu — sadece vadesi geçen varsa anlamlı */}
          {overdueExists && (
            <Pressable
              onPress={handleBulkReminders}
              disabled={bulkSending}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 44, paddingHorizontal: 14, borderRadius: 14,
                backgroundColor: bulkSending ? 'rgba(0,0,0,0.08)' : CHIP_TONES.danger.bg,
                borderWidth: 1, borderColor: 'rgba(217,75,75,0.30)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Bell size={14} color={CHIP_TONES.danger.fg} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>
                {bulkSending ? '...' : 'Vadesi Geçenleri Hatırlat'}
              </Text>
            </Pressable>
          )}

          {(() => {
            const activeCount = (overdueOnly ? 1 : 0) + (sortKey !== 'balance_desc' ? 1 : 0);
            const hasFilter = activeCount > 0;
            return (
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  backgroundColor: hasFilter ? DS.ink[900] : '#FFF',
                  borderWidth: hasFilter ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                  cursor: 'pointer' as any,
                }}
              >
                <SlidersHorizontal size={14} strokeWidth={1.8} color={hasFilter ? '#FFFFFF' : DS.ink[700]} />
                <Text style={{ fontSize: 12, fontWeight: hasFilter ? '700' : '600', color: hasFilter ? '#FFFFFF' : DS.ink[700] }}>
                  Filtre{hasFilter ? ` (${activeCount})` : ''}
                </Text>
              </Pressable>
            );
          })()}
        </View>

        {/* ── Clinic list ─────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              {search || overdueOnly ? 'Sonuç bulunamadı' : 'Henüz klinik yok'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: tableCard §09 ──────────────────────────── */
          <View style={tableCard}>
            {/* Toolbar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Sağlık Kurumu Bakiyeleri
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {filtered.length} kurum
              </Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {[
                { label: 'SAĞLIK KURUMU', flex: 2.4 },
                { label: 'FATURA',     flex: 0.7 },
                { label: 'KESİLEN',    flex: 1.2 },
                { label: 'TAHSİL',     flex: 1.2 },
                { label: 'BAKİYE',     flex: 1.2, align: 'right' as const },
                { label: 'GECİKMİŞ',   flex: 1.2, align: 'right' as const },
                { label: '',           flex: 1.6 },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {filtered.map((b, i) => {
              const balance = Number(b.balance);
              const overdue = Number(b.overdue_amount);
              const hasOverdue = overdue > 0;
              const billed = Number(b.total_billed);
              const paid = Number(b.total_paid);
              const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;

              return (
                <Pressable
                  key={`${b.clinic_id}-${b.currency}`}
                  onPress={() => openStatement(b.clinic_id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                    cursor: 'pointer' as any,
                  }}
                >
                  {/* Clinic name + avatar */}
                  <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: hasOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.info.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={14} color={hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900], flexShrink: 1 }} numberOfLines={1}>
                          {b.clinic_name}
                        </Text>
                        <CcyBadge currency={b.currency} />
                      </View>
                      {b.oldest_overdue_date && hasOverdue && (
                        <Text style={{ fontSize: 10, color: CHIP_TONES.danger.fg, marginTop: 1 }}>
                          vade: {fmtDateShort(b.oldest_overdue_date)}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text style={{ flex: 0.7, fontSize: 13, color: DS.ink[500] }}>
                    {Number(b.invoice_count)}
                  </Text>

                  <Text style={{ flex: 1.2, fontSize: 13, color: DS.ink[800] }}>
                    {fmtCur(billed, b.currency)}
                  </Text>

                  <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '500', color: CHIP_TONES.success.fg }}>
                    {fmtCur(paid, b.currency)}
                  </Text>

                  <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '600', color: hasOverdue ? CHIP_TONES.danger.fg : DS.ink[900], textAlign: 'right' }}>
                    {fmtCur(balance, b.currency)}
                  </Text>

                  <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                    {hasOverdue ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: CHIP_TONES.danger.bg }}>
                        <AlertTriangle size={10} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.danger.fg }}>
                          {fmtCur(overdue, b.currency)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: DS.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Action: Hatırlat + Faturala chip + ChevronRight */}
                  <View style={{ flex: 1.6, alignItems: 'flex-end', flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
                    {balance > 0 && (
                      <Pressable
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          setReminderTarget({
                            clinicId: b.clinic_id,
                            clinicName: b.clinic_name,
                            totalDue: balance,
                            overdueCount: Number(b.invoice_count ?? 0),
                          });
                        }}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                          backgroundColor: hasOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.info.bg,
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}
                      >
                        <Bell size={10} color={hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg }}>
                          Hatırlat
                        </Text>
                      </Pressable>
                    )}
                    {(() => {
                      const bucket = unbilledByClinic[b.clinic_id];
                      if (!bucket || bucket.count === 0) return null;
                      const busy = billingClinicId === b.clinic_id;
                      return (
                        <Pressable
                          onPress={(e: any) => { e?.stopPropagation?.(); handleBulkBill(b.clinic_id); }}
                          disabled={busy}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                            backgroundColor: busy ? 'rgba(0,0,0,0.08)' : CHIP_TONES.warning.bg,
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          <Receipt size={10} color={CHIP_TONES.warning.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.fg }}>
                            {busy ? '...' : `${bucket.count} faturala`}
                          </Text>
                        </Pressable>
                      );
                    })()}
                    <ChevronRight size={14} color={DS.ink[300]} strokeWidth={1.8} />
                  </View>
                </Pressable>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA', gap: 10 }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                {new Set(filtered.map(f => f.clinic_id)).size} sağlık kurumu
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>Toplam:</Text>
              <MoneyMultiX slices={balanceByCcy} variant="inline" colorBySign />
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ───────────────────────────── */
          <View style={{ gap: 10 }}>
            {filtered.map(b => {
              const balance = Number(b.balance);
              const overdue = Number(b.overdue_amount);
              const hasOverdue = overdue > 0;
              const billed = Number(b.total_billed);
              const paid = Number(b.total_paid);
              const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;

              return (
                <Pressable
                  key={`${b.clinic_id}-${b.currency}`}
                  onPress={() => openStatement(b.clinic_id)}
                  style={{ ...cardSolid, gap: 14, cursor: 'pointer' as any }}
                >
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: hasOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.info.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={18} color={hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900], flexShrink: 1 }} numberOfLines={1}>
                          {b.clinic_name}
                        </Text>
                        <CcyBadge currency={b.currency} />
                      </View>
                      <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                        {Number(b.invoice_count)} fatura
                        {b.oldest_overdue_date && hasOverdue
                          ? ` · vade: ${fmtDateShort(b.oldest_overdue_date)}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6 }}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: hasOverdue ? CHIP_TONES.danger.fg : DS.ink[900] }}>
                          {fmtCur(balance, b.currency)}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                          Bakiye
                        </Text>
                      </View>
                      <ChevronRight size={16} color={DS.ink[300]} strokeWidth={1.8} />
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={{ height: 4, borderRadius: 999, backgroundColor: DS.ink[100], overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%` as any, height: '100%', borderRadius: 999, backgroundColor: '#2D9A6B' }} />
                  </View>

                  {/* Stats */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Kesilen</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginTop: 2 }}>{fmtCur(billed, b.currency)}</Text>
                    </View>
                    <View style={{ width: 1, height: 24, backgroundColor: DS.ink[100], marginHorizontal: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Tahsil</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.success.fg, marginTop: 2 }}>{fmtCur(paid, b.currency)}</Text>
                    </View>
                    {hasOverdue && (
                      <>
                        <View style={{ width: 1, height: 24, backgroundColor: DS.ink[100], marginHorizontal: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Gecikmiş</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.danger.fg, marginTop: 2 }}>{fmtCur(overdue, b.currency)}</Text>
                        </View>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Filtre Sheet ──────────────────────────────────── */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable onPress={() => setFilterOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: '85%',
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: DS.ink[200], marginBottom: 14 }} />
            <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: DS.ink[900], flex: 1 }}>Filtrele</Text>
              <Pressable onPress={() => { setOverdueOnly(false); setSortKey('balance_desc'); }} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Temizle</Text>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                <X size={16} color={DS.ink[700]} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 18 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], paddingHorizontal: 4 }}>Sıralama</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                  {SORT_OPTIONS.map(opt => {
                    const active = sortKey === opt.key;
                    return (
                      <Pressable key={opt.key} onPress={() => setSortKey(opt.key)} style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                        borderWidth: active ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? DS.ink[900] : '#FFF',
                        cursor: 'pointer' as any,
                      }}>
                        <Text style={{ fontSize: 11.5, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }} numberOfLines={1}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], paddingHorizontal: 4 }}>Durum</Text>
                <Pressable onPress={() => setOverdueOnly(v => !v)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
                  backgroundColor: overdueOnly ? CHIP_TONES.danger.bg : '#FFF',
                  borderWidth: 1, borderColor: overdueOnly ? 'rgba(217,75,75,0.3)' : 'rgba(0,0,0,0.08)',
                  cursor: 'pointer' as any,
                }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: overdueOnly ? CHIP_TONES.danger.fg : DS.ink[100],
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Clock size={15} color={overdueOnly ? '#FFFFFF' : DS.ink[500]} strokeWidth={2} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Vadesi Geçen</Text>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: overdueOnly ? CHIP_TONES.danger.fg : 'transparent',
                    borderWidth: overdueOnly ? 0 : 1.5, borderColor: 'rgba(0,0,0,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {overdueOnly && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                </Pressable>
              </View>
            </ScrollView>

            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <Pressable onPress={() => setFilterOpen(false)} style={{
                height: 48, borderRadius: 14, backgroundColor: DS.ink[900],
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer' as any,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Uygula</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Ödeme Hatırlatması Modal ─────────────────────────── */}
      {reminderTarget && (
        <SendReminderModal
          visible={!!reminderTarget}
          clinicId={reminderTarget.clinicId}
          clinicName={reminderTarget.clinicName}
          totalDue={reminderTarget.totalDue}
          overdueCount={reminderTarget.overdueCount}
          onClose={() => setReminderTarget(null)}
        />
      )}
    </View>
  );
}

// ─── Hero Stat ───────────────────────────────────────────────────────
function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color, marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Aging Legend (hero bar) ─────────────────────────────────────────
function AgingLegend({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{value}</Text>
    </View>
  );
}

// Para birimi rozeti — her cari satırının hangi dövizde olduğunu gösterir.
function CcyBadge({ currency }: { currency: string }) {
  const sym = CURRENCY_META[(currency as Currency)]?.symbol ?? currency;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500] }}>{sym}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: DS.ink[400] }}>{currency}</Text>
    </View>
  );
}

// Hero alt-stat — per-currency, beyaz metin (renkli hero üstünde okunaklı).
function HeroCcyStat({ label, slices }: { label: string; slices: { currency: Currency; total: number }[] }) {
  return (
    <View>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
        {label}
      </Text>
      {slices.length === 0 ? (
        <Text style={{ ...DISPLAY, fontSize: 18, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>—</Text>
      ) : (
        <View style={{ marginTop: 4, gap: 1 }}>
          {slices.map(s => (
            <Text key={s.currency} style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: '#FFFFFF' }}>
              {formatMoney(s.total, s.currency, { fractionDigits: 0 })}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default ClinicBalanceScreen;
