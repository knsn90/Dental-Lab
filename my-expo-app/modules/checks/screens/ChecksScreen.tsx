import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * ChecksScreen — Çek / Senet
 *
 * Yapı (Giderler / Tedarikçiler ile aynı dil):
 *   • BEYAZ HERO: bekleyen tutar (baş döviz) → gecikmiş / 7 gün → vade takvimi
 *     şeridi (gecikmiş · bu hafta · bu ay · sonrası) → düğme şeridi
 *   • Tek kart: durum sekmeleri (adetli) + arama + sıralama → satırlar → döviz
 *     döviz alt toplam
 *   • Satır eylemleri tek ⋯ menüsünde: Tahsil et · Düzenle · İade · İptal · Sil
 *   • "Tahsil et" çeki klinik tahsilat makbuzu olarak cariye işler
 *     (record_clinic_receipt, ödeme yöntemi 'cek'); geri alınca makbuz silinir.
 */
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, RefreshControl, Platform, useWindowDimensions,
} from 'react-native';

import { useChecks } from '../hooks/useChecks';
import {
  createCheck, updateCheck, updateCheckStatus, deleteCheck, findCheckReceiptId, checkReceiptKey,
  CHECK_STATUS_LABELS,
  type Check, type CheckStatus, type CreateCheckParams,
} from '../api';
import { recordClinicReceipt, setClinicReceiptAccount, deleteClinicReceipt } from '../../invoices/api';
import { fetchDepositAccounts } from '../../cash/api';
import { useClinics } from '../../clinics/hooks/useClinics';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { useInkUI } from '../../../core/theme/inkScale';
import { confirmAsync } from '../../../core/util/confirm';
import { DatePicker } from '../../../core/ui/DatePicker';
import { groupByCurrency } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, getRate, CURRENCY_META, SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz } from '../../../core/metrics/useLabToday';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { toast } from '../../../core/ui/Toast';
import { FilterMenu } from '../../../core/ui/FilterMenu';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { AnchorMenu } from '../../invoices/components/AnchorMenu';
import {
  Plus, FileText, Search, X, Inbox, Pencil, Trash2, MoreHorizontal,
  FileSpreadsheet, CircleCheck, Undo2, Ban, RotateCcw, Check as CheckIcon,
} from '../../../core/ui/icons';

// ── Tokens ──────────────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

/** Makbuz satırlarının kabul ettiği dövizler (IRT çek cariye işlenemez). */
const RECEIPT_CCY = ['TRY', 'EUR', 'USD', 'GBP'] as const;

/** Vade şeridi renkleri — status paletinden (iki temada da okunur). */
const DUE_COLORS = { overdue: '#D94B4B', week: '#E89B2A', month: '#4A8FC9' } as const;

type TabKey = CheckStatus | 'all';
type SortKey = 'due_asc' | 'due_desc' | 'amount_desc' | 'amount_asc';
type RowMenuItem = { key: string; label: string; icon?: React.ComponentType<any>; onPress: () => void };

const TABS: { key: TabKey; label: string }[] = [
  { key: 'beklemede',     label: 'Beklemede' },
  { key: 'tahsil_edildi', label: 'Tahsil edildi' },
  { key: 'iade',          label: 'İade' },
  { key: 'iptal',         label: 'İptal' },
  { key: 'all',           label: 'Tümü' },
];

// ── Helpers ─────────────────────────────────────────────────────────
const ccyOf = (c: Check): Currency => ((c.currency ?? 'TRY') as Currency);
const fmt2 = (n: number, ccy: Currency) => formatMoney(Number(n) || 0, ccy, { fractionDigits: 2 });
const fmt0 = (n: number, ccy: Currency) => formatMoney(Number(n) || 0, ccy, { fractionDigits: 0 });

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}

/** İki 'YYYY-MM-DD' arasındaki gün farkı — saat dilimi kaymasız (UTC gün). */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

function dueText(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${autoT('gün gecikti')}`;
  if (days === 0) return autoT('Bugün');
  return `${days} ${autoT('gün kaldı')}`;
}

function rowStyle(fn: (state: any) => any): any {
  return Platform.OS === 'web' ? fn : fn({ hovered: false, pressed: false });
}

function useStatusChip(): Record<CheckStatus, { bg: string; fg: string }> {
  const U = useInkUI();
  return {
    beklemede:     U.chipTones.warning,
    tahsil_edildi: U.chipTones.success,
    iade:          U.chipTones.danger,
    iptal:         { bg: U.chipNeutral, fg: U.ink[500] },
  };
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ChecksScreen() {
  const theme = usePanelTheme();
  const U = useInkUI();
  const heroInk = useWhiteHeroInk(theme.primary);
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Hepsi tek seferde yüklenir: hero rakamları sekmeden bağımsız kalsın diye
  // durum süzgeci istemcide uygulanır.
  const { checks, loading, refetch } = useChecks();
  const [tab, setTab] = useState<TabKey>('beklemede');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due_asc');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Check | null>(null);
  const [collecting, setCollecting] = useState<Check | null>(null);

  const today = labTodayOf(cachedLabTz());

  // ── Hero rakamları (yalnız bekleyenler) ─────────────────────────────
  const pending = useMemo(() => checks.filter(c => c.status === 'beklemede'), [checks]);
  const pendingByCcy = useMemo(
    () => groupByCurrency(pending, c => ({ amount: Number(c.amount) || 0, currency: ccyOf(c) })),
    [pending],
  );
  const lead = pendingByCcy[0] ?? null;
  const rest = pendingByCcy.slice(1);
  const overdueCount = pending.filter(c => dayDiff(today, c.due_date) < 0).length;
  const weekCount = pending.filter(c => { const d = dayDiff(today, c.due_date); return d >= 0 && d <= 7; }).length;

  // Vade şeridi — baş dövizdeki bekleyenler; döviz TOPLANMAZ.
  const dueBuckets = useMemo(() => {
    if (!lead) return null;
    const b = { overdue: 0, week: 0, month: 0, later: 0 };
    for (const c of pending) {
      if (ccyOf(c) !== lead.currency) continue;
      const d = dayDiff(today, c.due_date);
      const amt = Number(c.amount) || 0;
      if (d < 0) b.overdue += amt;
      else if (d <= 7) b.week += amt;
      else if (d <= 30) b.month += amt;
      else b.later += amt;
    }
    return b;
  }, [pending, lead, today]);

  // ── Liste ───────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const m: Record<TabKey, number> = { beklemede: 0, tahsil_edildi: 0, iade: 0, iptal: 0, all: checks.length };
    for (const c of checks) m[c.status] += 1;
    return m;
  }, [checks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(localeTag());
    const list = checks.filter(c => {
      if (tab !== 'all' && c.status !== tab) return false;
      if (!q) return true;
      return [c.clinic?.name, c.bank_name, c.check_number, c.notes]
        .some(v => (v ?? '').toLocaleLowerCase(localeTag()).includes(q));
    });
    const amt = (c: Check) => Number(c.amount) || 0;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'due_desc':    return b.due_date.localeCompare(a.due_date);
        case 'amount_desc': return amt(b) - amt(a);
        case 'amount_asc':  return amt(a) - amt(b);
        default:            return a.due_date.localeCompare(b.due_date);
      }
    });
    return list;
  }, [checks, tab, search, sortKey]);

  const listByCcy = useMemo(
    () => groupByCurrency(filtered, c => ({ amount: Number(c.amount) || 0, currency: ccyOf(c) })),
    [filtered],
  );

  // ── Eylemler (hatalar görünür: toast) ───────────────────────────────
  const setStatus = async (ck: Check, status: CheckStatus, okMsg: string) => {
    const { error } = await updateCheckStatus(ck.id, status);
    if (error) { toast.error(`${autoT('Güncellenemedi:')} ${error.message}`); return; }
    toast.success(autoT(okMsg));
    refetch();
  };

  const markReturned = async (ck: Check) => {
    const ok = await confirmAsync(autoT('İade edildi'), autoT('Çek karşılıksız / iade olarak işaretlensin mi?'), { confirmText: autoT('İade et') });
    if (ok) await setStatus(ck, 'iade', 'Çek iade olarak işaretlendi');
  };

  const markCancelled = async (ck: Check) => {
    const ok = await confirmAsync(autoT('İptal et'), autoT('Çek iptal edilsin mi? Kayıt silinmez, İptal sekmesinde kalır.'), { confirmText: autoT('İptal et') });
    if (ok) await setStatus(ck, 'iptal', 'Çek iptal edildi');
  };

  const reopen = (ck: Check) => setStatus(ck, 'beklemede', 'Çek yeniden beklemede');

  const undoCollect = async (ck: Check) => {
    const ok = await confirmAsync(
      autoT('Tahsilatı geri al'),
      autoT('Çek yeniden beklemeye alınır; cariye işlenen tahsilat makbuzu silinir.'),
      { confirmText: autoT('Geri al'), destructive: true },
    );
    if (!ok) return;
    try {
      const rid = await findCheckReceiptId(ck.id);
      if (rid) await deleteClinicReceipt(rid);
    } catch (e: any) {
      toast.error(`${autoT(String(e?.message ?? 'Hata oluştu.'))} · ${autoT('Önce makbuzun fatura dağıtımını kaldırın.')}`);
      return;
    }
    await setStatus(ck, 'beklemede', 'Tahsilat geri alındı');
  };

  const remove = async (ck: Check) => {
    const ok = await confirmAsync(autoT('Çek sil'), autoT('Bu çek kaydı kalıcı olarak silinsin mi?'), { confirmText: autoT('Sil'), destructive: true });
    if (!ok) return;
    const { error } = await deleteCheck(ck.id);
    if (error) { toast.error(`${autoT('Silinemedi:')} ${error.message}`); return; }
    toast.success(autoT('Çek silindi'));
    refetch();
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (ck: Check) => { setEditing(ck); setFormOpen(true); };

  const rowMenu = (ck: Check): RowMenuItem[] => {
    switch (ck.status) {
      case 'beklemede': return [
        { key: 'collect', label: autoT('Tahsil et'),    icon: CircleCheck, onPress: () => setCollecting(ck) },
        { key: 'edit',    label: autoT('Düzenle'),      icon: Pencil,      onPress: () => openEdit(ck) },
        { key: 'return',  label: autoT('İade edildi'),  icon: Undo2,       onPress: () => { void markReturned(ck); } },
        { key: 'cancel',  label: autoT('İptal et'),     icon: Ban,         onPress: () => { void markCancelled(ck); } },
        { key: 'delete',  label: autoT('Sil'),          icon: Trash2,      onPress: () => { void remove(ck); } },
      ];
      case 'tahsil_edildi': return [
        { key: 'undo', label: autoT('Tahsilatı geri al'), icon: RotateCcw, onPress: () => { void undoCollect(ck); } },
      ];
      default: return [
        { key: 'reopen', label: autoT('Beklemeye al'), icon: RotateCcw, onPress: () => { void reopen(ck); } },
        { key: 'delete', label: autoT('Sil'),          icon: Trash2,    onPress: () => { void remove(ck); } },
      ];
    }
  };

  const handleExcel = async () => {
    const res = await downloadCsv(
      `Cek-Senet-${today}`,
      filtered,
      [
        { header: 'Vade',        value: c => csvDate(c.due_date) },
        { header: 'Düzenleme',   value: c => csvDate(c.issue_date) },
        { header: 'Klinik',      value: c => c.clinic?.name ?? '' },
        { header: 'Banka',       value: c => c.bank_name ?? '' },
        { header: 'Çek no',      value: c => c.check_number ?? '' },
        { header: 'Tutar',       value: c => csvMoney(c.amount) },
        { header: 'Para birimi', value: c => ccyOf(c) },
        { header: 'Durum',       value: c => CHECK_STATUS_LABELS[c.status] },
        { header: 'Not',         value: c => c.notes ?? '' },
      ],
    );
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success(autoT('CSV indirildi'));
  };

  const heroButtons: (RowMenuItem & { primary?: boolean })[] = [
    { key: 'add', label: autoT('Çek ekle'), icon: Plus, primary: true, onPress: openAdd },
    ...(checks.length > 0 ? [{ key: 'csv', label: autoT("Excel'e aktar"), icon: FileSpreadsheet, onPress: () => { void handleExcel(); } }] : []),
  ];

  const description = [
    `${pending.length} ${autoT('çek beklemede')}`,
    ...(overdueCount ? [`${overdueCount} ${autoT('gecikmiş')}`] : []),
  ].join(' · ');

  const bucketTotal = dueBuckets ? dueBuckets.overdue + dueBuckets.week + dueBuckets.month + dueBuckets.later : 0;
  const laterColor = heroInk.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  const buckets = dueBuckets ? [
    { key: 'overdue', label: autoT('Gecikmiş'),   value: dueBuckets.overdue, color: DUE_COLORS.overdue },
    { key: 'week',    label: autoT('Bu hafta'),   value: dueBuckets.week,    color: DUE_COLORS.week },
    { key: 'month',   label: autoT('30 gün'),     value: dueBuckets.month,   color: DUE_COLORS.month },
    { key: 'later',   label: autoT('Sonrası'),    value: dueBuckets.later,   color: laterColor },
  ].filter(b => b.value > 0) : [];

  return (
    <View style={{ flex: 1 }}>
      <MobilePageTitle title="Çek & Senet" subtitle="Tahsilat ve ödeme takibi" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── BEYAZ HERO ─────────────────────────────────────────────
            Bekleyen tutar (baş döviz) → sağda gecikmiş / 7 gün → vade
            takvimi şeridi → düğme şeridi. Döviz TOPLANMAZ. */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
          <WhiteHero
            kicker={autoT('Çek / Senet')}
            accent={theme.primary}
            title={lead ? (
              <>{autoT('Bekleyen')} <Text style={{ color: heroInk.accentInk }}>{fmt0(lead.total, lead.currency)}</Text></>
            ) : autoT('Bekleyen çek yok')}
            description={description}
            stats={pending.length > 0 ? [
              { value: String(overdueCount), label: autoT('Gecikmiş'), ...(overdueCount > 0 ? { color: DUE_COLORS.overdue } : {}) },
              { value: String(weekCount),    label: autoT('7 gün içinde') },
            ] : []}
            actions={
              <>
                {heroButtons.map(it => (
                  <Pressable
                    key={it.key}
                    onPress={it.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={it.label}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 36, paddingHorizontal: 14, borderRadius: 999,
                      backgroundColor: it.primary ? U.ink[900] : (hovered ? U.rowHover : U.plainBtn.bg),
                      borderWidth: it.primary ? 0 : 1, borderColor: U.plainBtn.border,
                      opacity: pressed ? 0.8 : 1,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                    })}
                  >
                    {it.icon ? <it.icon size={15} color={it.primary ? U.onDarkPill : U.plainBtn.fg} strokeWidth={1.8} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: it.primary ? U.onDarkPill : U.plainBtn.fg }}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            }
          >
            {rest.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <MoneyMultiX slices={rest} variant="inline" onAccent={heroInk.moneyOnAccent} />
              </View>
            )}
            {lead && buckets.length > 0 && (
              <View style={{ marginTop: 16, gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                  {autoT('Vade takvimi')}
                </Text>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg, gap: 2 }}>
                  {buckets.map(b => <View key={b.key} style={{ flex: b.value / bucketTotal, backgroundColor: b.color }} />)}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
                  {buckets.map(b => (
                    <HeroLegend key={b.key} color={b.color} label={b.label} value={fmt0(b.value, lead.currency)} />
                  ))}
                </View>
              </View>
            )}
          </WhiteHero>
        </View>

        {/* ── Liste kartı: durum sekmeleri + arama + sıralama ───────── */}
        <View style={{ paddingHorizontal: PAGE_PADDING }}>
          <View style={U.tableCard}>
            <View style={{
              paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
              borderBottomWidth: 1, borderBottomColor: U.hairline,
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                          contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
                {TABS.map(o => {
                  const active = tab === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setTab(o.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={{
                        paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: active ? U.segActive : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>
                        {`${autoT(o.label)} · ${counts[o.key]}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
                <View style={{
                  flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  height: 40, paddingHorizontal: 14, borderRadius: 9999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }}>
                  <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Klinik, banka, çek no ara"
                    placeholderTextColor={U.ink[400]}
                    style={{ flex: 1, fontSize: 13.5, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} accessibilityLabel={autoT('Aramayı temizle')} style={{ cursor: 'pointer' as any }}>
                      <X size={13} color={U.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
                <FilterMenu
                  label={autoT('Sırala')}
                  items={[
                    { key: 'due_asc',     label: autoT('Vade (yakın)') },
                    { key: 'due_desc',    label: autoT('Vade (uzak)') },
                    { key: 'amount_desc', label: autoT('Tutar (yüksek)') },
                    { key: 'amount_asc',  label: autoT('Tutar (düşük)') },
                  ]}
                  active={sortKey}
                  onChange={(k) => setSortKey(k as SortKey)}
                />
              </View>
            </View>

            {loading && checks.length === 0 ? (
              <View style={{ paddingVertical: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Yükleniyor…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
                <Inbox size={36} strokeWidth={1.4} color={U.ink[300]} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
                  {search ? 'Sonuç bulunamadı' : checks.length === 0 ? 'Henüz çek / senet yok' : 'Bu sekmede kayıt yok'}
                </Text>
                <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 340, lineHeight: 19 }}>
                  {search
                    ? 'Arama kriterini değiştirin.'
                    : checks.length === 0
                      ? 'Klinikten aldığınız çeki ekleyin; vadesi gelince tahsil ettiğinizde cariye kendiliğinden işlenir.'
                      : 'Başka bir sekme seçin.'}
                </Text>
                {checks.length === 0 && !search && (
                  <Pressable
                    onPress={openAdd}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
                      height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: U.ink[900],
                      opacity: pressed ? 0.8 : 1, cursor: 'pointer' as any,
                    })}
                  >
                    <Plus size={14} color={U.onDarkPill} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>Çek ekle</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                {isDesktop ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
                    <Text style={{ ...U.colHeader, flex: 1 }}>Çek</Text>
                    <Text style={{ ...U.colHeader, width: COL.due }}>Vade</Text>
                    <Text style={{ ...U.colHeader, width: COL.amt, textAlign: 'right' }}>Tutar</Text>
                    <View style={{ width: COL.menu }} />
                  </View>
                ) : null}
                {filtered.map((ck, i) => (
                  <CheckRow
                    key={ck.id}
                    check={ck}
                    today={today}
                    desktop={isDesktop}
                    isLast={i === filtered.length - 1}
                    menu={rowMenu(ck)}
                    onPress={() => (ck.status === 'beklemede' ? openEdit(ck) : undefined)}
                  />
                ))}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                  paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                  borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
                }}>
                  <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${filtered.length} ${autoT('kayıt')}`}</Text>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {listByCcy.map(d => (
                      <Text key={d.currency} style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>
                        {`${autoT('Toplam')} `}<Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmt0(d.total, d.currency)}</Text>
                      </Text>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <CheckFormModal
        visible={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); refetch(); }}
      />

      <CollectCheckModal
        check={collecting}
        today={today}
        onClose={() => setCollecting(null)}
        onDone={() => { setCollecting(null); refetch(); }}
      />
    </View>
  );
}

// ─── Satır (masaüstü: sütunlu · mobil: iki kolonlu) ─────────────────
const COL = { due: 180, amt: 160, menu: 36 };

function CheckRow({ check: ck, today, desktop, isLast, menu, onPress }: {
  check: Check; today: string; desktop: boolean; isLast: boolean; menu: RowMenuItem[]; onPress: () => void;
}) {
  const U = useInkUI();
  const statusChip = useStatusChip();
  const sc = statusChip[ck.status];
  const pendingRow = ck.status === 'beklemede';
  const days = dayDiff(today, ck.due_date);
  const overdue = pendingRow && days < 0;
  const soon = pendingRow && days >= 0 && days <= 7;
  const dueColor = overdue ? U.chipTones.danger.fg : soon ? U.chipTones.warning.fg : U.ink[400];
  const title = ck.clinic?.name ?? autoT('Klinik seçilmedi');
  const sub = [ck.bank_name, ck.check_number ? `${autoT('No')} ${ck.check_number}` : null].filter(Boolean).join(' · ');
  const money = fmt2(Number(ck.amount) || 0, ccyOf(ck));

  const menuBtn = (
    <AnchorMenu
      width={220}
      items={menu}
      renderTrigger={(open) => (
        <Pressable
          onPress={(ev: any) => { ev?.stopPropagation?.(); open(); }}
          accessibilityRole="button"
          accessibilityLabel={autoT('Çek işlemleri')}
          style={({ pressed, hovered }: any) => ({
            width: desktop ? 32 : 44, height: desktop ? 32 : 44, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <MoreHorizontal size={16} color={U.ink[500]} strokeWidth={1.8} />
        </Pressable>
      )}
    />
  );

  const iconTone = overdue ? U.chipTones.danger : pendingRow ? { bg: U.ink[100], fg: U.ink[700] } : sc;
  const icon = (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: iconTone.bg }}>
      <FileText size={15} color={iconTone.fg} strokeWidth={1.8} />
    </View>
  );

  const chip = (
    <View style={{ alignSelf: 'flex-end', paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 999, backgroundColor: sc.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: sc.fg }}>{autoT(CHECK_STATUS_LABELS[ck.status])}</Text>
    </View>
  );

  const tint = overdue ? (U.isDark ? 'rgba(217,75,75,0.10)' : 'rgba(217,75,75,0.035)') : 'transparent';

  if (!desktop) {
    return (
      <Pressable
        onPress={onPress}
        style={rowStyle(({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingStart: 16, paddingEnd: 6, paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
          backgroundColor: pressed ? U.rowHover : tint,
        }))}
      >
        {icon}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{title}</Text>
          {sub ? <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>{sub}</Text> : null}
          <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>
            {`${autoT('Vade')} ${fmtDate(ck.due_date)}`}
            {pendingRow ? <Text style={{ color: dueColor, fontWeight: overdue || soon ? '600' : '400' }}>{` · ${dueText(days)}`}</Text> : null}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: overdue ? U.chipTones.danger.fg : U.ink[900], fontVariant: ['tabular-nums'] }}>{money}</Text>
          {chip}
        </View>
        {menuBtn}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={rowStyle(({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingStart: 20, paddingEnd: 14, paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
        backgroundColor: hovered ? U.rowHover : tint,
        cursor: pendingRow ? 'pointer' as any : 'default' as any,
      }))}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {icon}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontSize: 12, color: U.ink[400] }} numberOfLines={1}>
            {sub || `${autoT('Düzenleme')} ${fmtDate(ck.issue_date)}`}
          </Text>
        </View>
      </View>
      <View style={{ width: COL.due, gap: 2 }}>
        <Text style={{ fontSize: 13, color: overdue ? U.chipTones.danger.fg : U.ink[800], fontWeight: overdue ? '600' : '500' }}>{fmtDate(ck.due_date)}</Text>
        {pendingRow ? <Text style={{ fontSize: 11.5, color: dueColor, fontWeight: overdue || soon ? '600' : '400' }}>{dueText(days)}</Text> : null}
      </View>
      <View style={{ width: COL.amt, alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: overdue ? U.chipTones.danger.fg : U.ink[900], fontVariant: ['tabular-nums'] }}>{money}</Text>
        {chip}
      </View>
      <View style={{ width: COL.menu, alignItems: 'center' }}>{menuBtn}</View>
    </Pressable>
  );
}

function HeroLegend({ color, label, value }: { color: string; label: string; value: string }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 280 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ fontSize: 11.5, color: heroInk.inkSoft }}>
        {label} <Text style={{ fontWeight: '700', color: heroInk.ink }}>{value}</Text>
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// TAHSİL ET — tarih + yatırılan hesap → klinik tahsilat makbuzu
// ═════════════════════════════════════════════════════════════════════
function CollectCheckModal({ check, today, onClose, onDone }: {
  check: Check | null; today: string; onClose: () => void; onDone: () => void;
}) {
  const U = useInkUI();
  const [date, setDate] = useState(today);
  const [accounts, setAccounts] = useState<{ id: string; name: string; currency: string }[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toCari, setToCari] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ccy = check ? ccyOf(check) : 'TRY';
  const canCari = !!check?.clinic_id && (RECEIPT_CCY as readonly string[]).includes(ccy);

  useEffect(() => {
    if (!check) return;
    setDate(today); setAccountId(null); setError(''); setSaving(false);
    setToCari(!!check.clinic_id && (RECEIPT_CCY as readonly string[]).includes(ccyOf(check)));
    fetchDepositAccounts().then(a => setAccounts(a as any)).catch(() => setAccounts([]));
  }, [check, today]);

  if (!check) return null;

  const save = async () => {
    if (!date) { setError(autoT('Tahsil tarihi seçin.')); return; }
    setSaving(true); setError('');
    try {
      if (toCari && canCari) {
        const base = getBaseCurrency() as Currency;
        const rate = await getRate(ccy, base, date);
        if (!rate || !(rate > 0)) throw new Error(autoT('Kur alınamadı; daha sonra tekrar deneyin.'));
        const res = await recordClinicReceipt({
          clinicId: check.clinic_id!,
          lines: [{ currency: ccy as any, amount: Number(check.amount) || 0, rate }],
          receiptDate: date,
          method: 'cek',
          referenceNo: [check.bank_name, check.check_number].filter(Boolean).join(' · ') || null,
          notes: check.notes ? `${autoT('Çek tahsilatı')} · ${check.notes}` : autoT('Çek tahsilatı'),
          idempotencyKey: checkReceiptKey(check.id),
        });
        const acc = accounts.find(a => a.id === accountId) ?? null;
        if (acc && res?.receipt_id) {
          try { await setClinicReceiptAccount(res.receipt_id, { id: acc.id, name: acc.name }); } catch { /* hesap sonra seçilebilir */ }
        }
      }
      const { error: stErr } = await updateCheckStatus(check.id, 'tahsil_edildi');
      if (stErr) throw new Error(stErr.message);
      toast.success(autoT(toCari && canCari ? 'Çek tahsil edildi · cariye işlendi' : 'Çek tahsil edildi'));
      onDone();
    } catch (e: any) {
      setError(autoT(String(e?.message ?? 'Hata oluştu.')));
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={{ ...U.modalCard, maxWidth: 460 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 6 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Çeki tahsil et</Text>
            <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: U.chipNeutral, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>
          <Text style={{ paddingHorizontal: 24, fontSize: 13, color: U.ink[500] }} numberOfLines={2}>
            {`${check.clinic?.name ?? autoT('Klinik seçilmedi')} · `}
            <Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmt2(Number(check.amount) || 0, ccy)}</Text>
          </Text>

          <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 6 }}>
              <FL>Tahsil tarihi</FL>
              <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
            </View>

            {accounts.length > 0 && toCari && canCari && (
              <View style={{ gap: 6 }}>
                <FL>Yatırıldığı hesap (opsiyonel)</FL>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {accounts.map(a => {
                    const on = accountId === a.id;
                    return (
                      <Pressable key={a.id} onPress={() => setAccountId(on ? null : a.id)} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                        borderColor: on ? U.ink[900] : U.plainBtn.border,
                        backgroundColor: on ? U.ink[900] : U.plainBtn.bg,
                        cursor: 'pointer' as any,
                      }}>
                        {on ? <CheckIcon size={12} color={U.onDarkPill} strokeWidth={2.2} /> : null}
                        <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? U.onDarkPill : U.plainBtn.fg }} numberOfLines={1}>
                          {`${a.name} · ${a.currency}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {canCari ? (
              <Pressable
                onPress={() => setToCari(v => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: toCari }}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, backgroundColor: U.surfaceSoft, cursor: 'pointer' as any }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, marginTop: 1, alignItems: 'center', justifyContent: 'center',
                  borderWidth: toCari ? 0 : 1.5, borderColor: U.fieldBorder, backgroundColor: toCari ? U.ink[900] : 'transparent',
                }}>
                  {toCari ? <CheckIcon size={13} color={U.onDarkPill} strokeWidth={2.4} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>Klinik carisine tahsilat olarak işle</Text>
                  <Text style={{ fontSize: 12, color: U.ink[500], lineHeight: 17 }}>
                    Tahsilat makbuzu oluşur, açık faturalara en eskiden başlayarak dağıtılır; kalan tutar alacak olarak bekler.
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View style={{ padding: 12, borderRadius: 14, backgroundColor: U.chipTones.info.bg }}>
                <Text style={{ fontSize: 12, color: U.chipTones.info.fg, lineHeight: 17 }}>
                  {check.clinic_id
                    ? autoT('Bu para biriminde tahsilat makbuzu kesilemiyor; çek yalnız tahsil edildi olarak işaretlenir.')
                    : autoT('Çeke klinik bağlı değil; yalnız tahsil edildi olarak işaretlenir. Cariye işlemek için önce çeki düzenleyip klinik seçin.')}
                </Text>
              </View>
            )}

            {error ? <Text style={{ fontSize: 12.5, color: U.chipTones.danger.fg }}>{error}</Text> : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 20, borderTopWidth: 1, borderTopColor: U.hairline }}>
            <Pressable onPress={onClose} disabled={saving} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[500] }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
              backgroundColor: U.ink[900], opacity: saving ? 0.5 : 1, cursor: 'pointer' as any,
            }}>
              <CircleCheck size={14} color={U.onDarkPill} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>{saving ? 'Kaydediliyor...' : 'Tahsil et'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// EKLE / DÜZENLE
// ═════════════════════════════════════════════════════════════════════
function CheckFormModal({ visible, editing, onClose, onSaved }: {
  visible: boolean; editing: Check | null; onClose: () => void; onSaved: () => void;
}) {
  const U = useInkUI();
  const { clinics } = useClinics();
  const [clinicId, setClinicId] = useState('');
  const [clinicQuery, setClinicQuery] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    const e = editing;
    setClinicId(e?.clinic_id ?? ''); setClinicQuery('');
    setCheckNumber(e?.check_number ?? ''); setBankName(e?.bank_name ?? '');
    setAmount(e ? String(e.amount).replace('.', ',') : '');
    setCurrency(e ? ccyOf(e) : 'TRY');
    setIssueDate(e?.issue_date ?? labTodayOf(cachedLabTz()));
    setDueDate(e?.due_date ?? ''); setNotes(e?.notes ?? ''); setError(''); setSaving(false);
  }, [visible, editing]);

  const selectedClinic = clinics.find(c => c.id === clinicId) ?? null;
  const matches = useMemo(() => {
    const q = clinicQuery.trim().toLocaleLowerCase(localeTag());
    const list = q ? clinics.filter(c => (c.name ?? '').toLocaleLowerCase(localeTag()).includes(q)) : clinics;
    return list.slice(0, 8);
  }, [clinics, clinicQuery]);

  const handleSave = async () => {
    const raw = amount.trim();
    // TR yazımı (1.234,56) ya da nokta ondalık (1234.56) — ikisi de kabul.
    const amt = parseFloat(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
    if (!amt || amt <= 0) { setError(autoT('Geçerli tutar girin.')); return; }
    if (!dueDate)         { setError(autoT('Vade tarihi zorunludur.')); return; }
    if (issueDate && dueDate < issueDate) { setError(autoT('Vade, düzenleme tarihinden önce olamaz.')); return; }

    setSaving(true);
    const params: CreateCheckParams = {
      clinic_id: clinicId || null,
      check_number: checkNumber.trim() || undefined,
      bank_name: bankName.trim() || undefined,
      amount: amt, currency,
      issue_date: issueDate || undefined, due_date: dueDate,
      notes: notes.trim() || undefined,
    };
    const { error: apiErr } = editing
      ? await updateCheck(editing.id, {
          ...params,
          // Düzenlemede boşaltılan alan gerçekten silinsin (undefined güncellemeye girmez).
          check_number: params.check_number ?? (null as any),
          bank_name: params.bank_name ?? (null as any),
          notes: params.notes ?? (null as any),
        })
      : await createCheck(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? autoT('Hata oluştu.')); return; }
    toast.success(autoT(editing ? 'Çek güncellendi' : 'Çek eklendi'));
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={U.modalCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>
              {editing ? 'Çeki düzenle' : 'Çek / Senet ekle'}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: U.chipNeutral, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Klinik — aranabilir seçici */}
            <View style={{ gap: 6 }}>
              <FL>Klinik</FL>
              {selectedClinic ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingStart: 14, paddingEnd: 6, borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder, backgroundColor: U.surfaceSoft }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{selectedClinic.name}</Text>
                  <Pressable onPress={() => setClinicId('')} accessibilityLabel={autoT('Kliniği kaldır')} style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
                    <X size={14} color={U.ink[500]} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <View style={{ ...U.inputStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                    <TextInput
                      value={clinicQuery}
                      onChangeText={setClinicQuery}
                      placeholder="Klinik ara..."
                      placeholderTextColor={U.ink[300]}
                      style={{ flex: 1, fontSize: 14, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                    />
                  </View>
                  {matches.length > 0 && (
                    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: U.hairline, overflow: 'hidden' }}>
                      {matches.map((c, i) => (
                        <Pressable key={c.id} onPress={() => { setClinicId(c.id); setClinicQuery(''); }}
                          style={rowStyle(({ hovered }: any) => ({
                            paddingHorizontal: 14, paddingVertical: 10,
                            borderBottomWidth: i < matches.length - 1 ? 1 : 0, borderBottomColor: U.hairline,
                            backgroundColor: hovered ? U.rowHover : 'transparent', cursor: 'pointer' as any,
                          }))}>
                          <Text style={{ fontSize: 13, color: U.ink[800] }} numberOfLines={1}>{c.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Text style={{ fontSize: 11.5, color: U.ink[400] }}>Klinik seçilirse tahsilatta cariye işlenir.</Text>
                </View>
              )}
            </View>

            {/* Para birimi */}
            <View style={{ gap: 6 }}>
              <FL>Para birimi</FL>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SUPPORTED_CURRENCIES.map(cur => {
                  const active = currency === cur;
                  return (
                    <Pressable key={cur} onPress={() => setCurrency(cur)} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                      borderColor: active ? U.ink[900] : U.plainBtn.border,
                      backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
                      cursor: 'pointer' as any,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? U.onDarkPill : U.ink[500] }}>{CURRENCY_META[cur].symbol}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? U.onDarkPill : U.plainBtn.fg }}>{cur}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <View style={{ flexGrow: 1, flexBasis: 180, gap: 6 }}>
                <FL>{`${autoT('Tutar')} (${CURRENCY_META[currency].symbol})`}</FL>
                <FI value={amount} onChangeText={setAmount} placeholder="0,00"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 180, gap: 6 }}>
                <FL>Vade tarihi</FL>
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="Tarih seç" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <View style={{ flexGrow: 1, flexBasis: 180, gap: 6 }}>
                <FL>Banka</FL>
                <FI value={bankName} onChangeText={setBankName} placeholder="Banka adı..." />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 180, gap: 6 }}>
                <FL>Çek no</FL>
                <FI value={checkNumber} onChangeText={setCheckNumber} placeholder="Çek numarası..." />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <FL>Düzenleme tarihi</FL>
              <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Tarih seç" />
            </View>

            <View style={{ gap: 6 }}>
              <FL>Not (opsiyonel)</FL>
              <FI value={notes} onChangeText={setNotes} placeholder="..." multiline
                style={{ minHeight: 56, paddingTop: 12, textAlignVertical: 'top' as any }} />
            </View>

            {error ? <Text style={{ fontSize: 12.5, color: U.chipTones.danger.fg }}>{error}</Text> : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 20, borderTopWidth: 1, borderTopColor: U.hairline }}>
            <Pressable onPress={onClose} disabled={saving} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[500] }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} style={{
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
              backgroundColor: U.ink[900], opacity: saving ? 0.5 : 1, cursor: 'pointer' as any,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  const U = useInkUI();
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const U = useInkUI();
  const { style: extra, ...rest } = props;
  return <TextInput placeholderTextColor={U.ink[300]} {...rest} style={[U.inputStyle, extra]} />;
}

export default ChecksScreen;
