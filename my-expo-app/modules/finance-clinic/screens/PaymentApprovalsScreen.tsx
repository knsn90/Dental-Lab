/**
 * Mali İşlemler — Admin: Ödeme Onayları
 *
 * Klinikler tarafından bildirilen havale/EFT/nakit ödemelerin onay paneli.
 * Admin onayladığında payments tablosuna gerçek kayıt düşer (approve_payment_submission).
 *
 * Yapı (Çek / Senet · Giderler ile aynı dil):
 *   • BEYAZ HERO: onay bekleyen tutar (baş döviz) → bekleyen / 3+ gün bekleyen
 *   • Tek kart: Bekleyen · Onaylanan · Reddedilen sekmeleri (adetli) + arama
 *   • Onay ÖNCE özet penceresinde teyit edilir (cariye tahsilat olarak işlenir)
 *   • İşlem sonrası sayfa yeniden "yükleniyor"a düşmez; satır sessizce geçmişe taşınır
 *   • Dekont bağlantısı varsa satırda "Dekontu aç"
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal, Platform, ActivityIndicator,
  Linking, RefreshControl, useWindowDimensions,
} from 'react-native';
import {
  CheckCircle2, X, Building2, Banknote, CreditCard, FileText, ArrowDownToLine,
  RefreshCcw, Search, Inbox, Paperclip,
} from '../../../core/ui/icons';

import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI } from '../../../core/theme/inkScale';
import {
  fetchPendingSubmissions, fetchReviewedSubmissions, approveSubmission, rejectSubmission,
  type PaymentSubmissionRow,
} from '../api';
import { M, fmtDate } from '../components/atoms';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { useRates } from '../../../core/money/rateCache';
import { groupByCurrency } from '../../../core/money/aggregations';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz } from '../../../core/metrics/useLabToday';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';

type Row = PaymentSubmissionRow & { clinic_name?: string };
type TabKey = 'pending' | 'approved' | 'rejected';

/** Bu kadar gündür bekleyen bildirim hero'da kırmızı sayılır. */
const STALE_DAYS = 3;

const METHOD: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  kart:   { label: 'Kredi Kartı', icon: CreditCard,      color: '#8B5CB8' },
  nakit:  { label: 'Nakit',       icon: Banknote,        color: '#2D9A6B' },
  havale: { label: 'Havale',      icon: Building2,       color: '#4A8FC9' },
  eft:    { label: 'EFT',         icon: ArrowDownToLine, color: '#4A8FC9' },
  cek:    { label: 'Çek',         icon: FileText,        color: '#E89B2A' },
  diger:  { label: 'Diğer',       icon: Banknote,        color: '#9A9A9A' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending',  label: 'Bekleyen' },
  { key: 'approved', label: 'Onaylanan' },
  { key: 'rejected', label: 'Reddedilen' },
];

const ccyOf = (r: Row): Currency => ((r.currency || 'TRY') as Currency);
const fmt0 = (n: number, c: Currency) => formatMoney(Number(n) || 0, c, { fractionDigits: 0 });

/** YYYY-MM-DD iki gün arası (b − a), UTC gün aritmetiği — saat dilimi kayması yok. */
function dayDiff(a: string, b: string): number {
  const pa = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const pb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((pb - pa) / 86400000);
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as any) : {};

export function PaymentApprovalsScreen() {
  const theme = usePanelTheme();
  const U = useInkUI();
  const heroInk = useWhiteHeroInk(theme.primary);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  useRates();

  const [pending, setPending]   = useState<Row[]>([]);
  const [reviewed, setReviewed] = useState<Row[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab]           = useState<TabKey>('pending');
  const [search, setSearch]     = useState('');

  const [acting, setActing]             = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<Row | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [modalError, setModalError]       = useState<string | null>(null);

  // İlk açılışta yükleniyor gösterilir; sonraki yenilemeler listeyi yerinde günceller.
  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    setLoadError(null);
    try {
      const [p, r] = await Promise.all([fetchPendingSubmissions(), fetchReviewedSubmissions()]);
      setPending(p as Row[]);
      setReviewed(r);
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = labTodayOf(cachedLabTz());

  // ── Hero ──────────────────────────────────────────────────────────
  const pendingByCcy = useMemo(
    () => groupByCurrency(pending, r => ({ amount: Number(r.amount) || 0, currency: ccyOf(r) })),
    [pending],
  );
  const lead = pendingByCcy[0] ?? null;
  const rest = pendingByCcy.slice(1);
  const waitDays = (r: Row) => Math.max(0, dayDiff(r.submitted_at.slice(0, 10), today));
  const staleCount = pending.filter(r => waitDays(r) >= STALE_DAYS).length;
  const oldestWait = pending.reduce((m, r) => Math.max(m, waitDays(r)), 0);

  const description = pending.length === 0
    ? autoT('Klinikler havale, EFT veya nakit ödeme bildirdikçe burada onayınızı bekler.')
    : [
        `${pending.length} ${autoT('bildirim onay bekliyor')}`,
        oldestWait > 0 ? `${autoT('en eskisi')} ${oldestWait} ${autoT('gündür bekliyor')}` : autoT('hepsi bugün geldi'),
      ].join(' · ');

  // ── Liste ─────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    pending:  pending.length,
    approved: reviewed.filter(r => r.status === 'approved').length,
    rejected: reviewed.filter(r => r.status === 'rejected').length,
  }), [pending, reviewed]);

  const filtered = useMemo(() => {
    const base = tab === 'pending' ? pending : reviewed.filter(r => r.status === tab);
    const q = search.trim().toLocaleLowerCase(localeTag());
    if (!q) return base;
    return base.filter(r => [r.clinic_name, r.reference_no, r.sender_name, r.bank_name, r.invoice_no, r.patient_name]
      .some(v => (v ?? '').toLocaleLowerCase(localeTag()).includes(q)));
  }, [tab, pending, reviewed, search]);

  const filteredByCcy = useMemo(
    () => groupByCurrency(filtered, r => ({ amount: Number(r.amount) || 0, currency: ccyOf(r) })),
    [filtered],
  );

  // ── Eylemler ──────────────────────────────────────────────────────
  const moveToReviewed = (r: Row, status: 'approved' | 'rejected', reason?: string) => {
    setPending(list => list.filter(x => x.id !== r.id));
    setReviewed(list => [{ ...r, status, reviewed_at: new Date().toISOString(), reject_reason: reason ?? null }, ...list]);
  };

  const confirmApprove = async () => {
    const r = approveTarget;
    if (!r || acting) return;
    setActing(r.id); setModalError(null);
    try {
      await approveSubmission(r.id);
      moveToReviewed(r, 'approved');
      setApproveTarget(null);
      toast.success(autoT('Ödeme onaylandı ve klinik hesabına işlendi'));
      load(true);
    } catch (e: any) {
      setModalError(`${autoT('Onaylanamadı')}: ${e?.message ?? e}`);
    } finally { setActing(null); }
  };

  const confirmReject = async () => {
    const r = rejectTarget;
    if (!r || acting) return;
    const reason = rejectReason.trim();
    if (!reason) { setModalError(autoT('Red sebebi gerekli.')); return; }
    setActing(r.id); setModalError(null);
    try {
      await rejectSubmission(r.id, reason);
      moveToReviewed(r, 'rejected', reason);
      setRejectTarget(null); setRejectReason('');
      toast.success(autoT('Bildirim reddedildi'));
      load(true);
    } catch (e: any) {
      setModalError(`${autoT('Reddedilemedi')}: ${e?.message ?? e}`);
    } finally { setActing(null); }
  };

  const openApprove = (r: Row) => { setModalError(null); setApproveTarget(r); };
  const openReject  = (r: Row) => { setModalError(null); setRejectReason(''); setRejectTarget(r); };

  return (
    <View style={{ flex: 1 }}>
      <MobilePageTitle title="Ödeme Onayları" subtitle="Klinik ödeme bildirimleri" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── BEYAZ HERO ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
          <WhiteHero
            kicker={autoT('Ödeme Onayları')}
            accent={theme.primary}
            title={lead ? (
              <>{autoT('Onay bekleyen')} <Text style={{ color: heroInk.accentInk }}>{fmt0(lead.total, lead.currency)}</Text></>
            ) : autoT('Bekleyen bildirim yok')}
            description={description}
            stats={pending.length > 0 ? [
              { value: String(pending.length), label: autoT('Bekleyen') },
              { value: String(staleCount), label: `${STALE_DAYS}+ ${autoT('gün bekleyen')}`, ...(staleCount > 0 ? { color: '#D94B4B' } : {}) },
            ] : []}
            actions={
              <Pressable
                onPress={() => load(true)}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel={autoT('Yenile')}
                style={({ pressed, hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 36, paddingHorizontal: 14, borderRadius: 999,
                  backgroundColor: hovered ? U.rowHover : U.plainBtn.bg,
                  borderWidth: 1, borderColor: U.plainBtn.border,
                  opacity: pressed || refreshing ? 0.7 : 1, ...webPointer,
                })}
              >
                {refreshing
                  ? <ActivityIndicator size="small" color={U.plainBtn.fg} />
                  : <RefreshCcw size={14} color={U.plainBtn.fg} strokeWidth={1.8} />}
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Yenile')}</Text>
              </Pressable>
            }
          >
            {rest.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <MoneyMultiX slices={rest} variant="inline" onAccent={heroInk.moneyOnAccent} />
              </View>
            )}
          </WhiteHero>
        </View>

        {/* ── Liste kartı ──────────────────────────────────────────── */}
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
                        backgroundColor: active ? U.segActive : 'transparent', ...webPointer,
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>
                        {`${autoT(o.label)} · ${counts[o.key]}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                height: 40, paddingHorizontal: 14, borderRadius: 9999,
                borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
              }}>
                <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Klinik, referans, gönderen ara"
                  placeholderTextColor={U.ink[400]}
                  style={{ flex: 1, fontSize: 13.5, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} accessibilityLabel={autoT('Aramayı temizle')} style={webPointer}>
                    <X size={13} color={U.ink[400]} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            </View>

            {loadError ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16, gap: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Bildirimler yüklenemedi')}</Text>
                <Text style={{ fontSize: 12, color: U.ink[500], textAlign: 'center', maxWidth: 380 }}>{loadError}</Text>
                <Pressable
                  onPress={() => load(true)}
                  style={({ pressed }: any) => ({
                    marginTop: 4, height: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center',
                    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                    opacity: pressed ? 0.8 : 1, ...webPointer,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Tekrar dene')}</Text>
                </Pressable>
              </View>
            ) : !loaded ? (
              <View style={{ paddingVertical: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Yükleniyor…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
                {tab === 'pending' && !search
                  ? <CheckCircle2 size={36} strokeWidth={1.4} color={U.ink[300]} />
                  : <Inbox size={36} strokeWidth={1.4} color={U.ink[300]} />}
                <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
                  {search ? 'Sonuç bulunamadı' : tab === 'pending' ? 'Bekleyen bildirim yok' : 'Bu sekmede kayıt yok'}
                </Text>
                <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 360, lineHeight: 19 }}>
                  {search
                    ? 'Arama kriterini değiştirin.'
                    : tab === 'pending'
                      ? 'Tüm ödeme bildirimleri işlendi. Yeni bildirim geldikçe burada görünür.'
                      : 'Son 90 günde bu durumda bildirim yok.'}
                </Text>
              </View>
            ) : (
              <>
                {filtered.map((r, i) => (
                  <SubmissionRow
                    key={r.id}
                    row={r}
                    isLast={i === filtered.length - 1}
                    isDesktop={isDesktop}
                    waitDays={waitDays(r)}
                    busy={acting === r.id}
                    onApprove={() => openApprove(r)}
                    onReject={() => openReject(r)}
                  />
                ))}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                  borderTopWidth: 1, borderTopColor: U.hairline,
                }}>
                  <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${filtered.length} ${autoT('bildirim')}`}</Text>
                  <View style={{ flex: 1 }} />
                  <MoneyMultiX slices={filteredByCcy} variant="inline" />
                </View>
              </>
            )}
          </View>
          {tab !== 'pending' && loaded && !loadError && (
            <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 10, textAlign: 'center' }}>
              {autoT('Son 90 günün kayıtları gösteriliyor.')}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ── Onay penceresi ─────────────────────────────────────────── */}
      <Modal visible={!!approveTarget} animationType="fade" transparent onRequestClose={() => !acting && setApproveTarget(null)}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 460, width: '100%' }]}>
            {approveTarget && (
              <ApproveSummary
                row={approveTarget}
                busy={acting === approveTarget.id}
                error={modalError}
                onCancel={() => setApproveTarget(null)}
                onConfirm={confirmApprove}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Ret penceresi ──────────────────────────────────────────── */}
      <Modal visible={!!rejectTarget} animationType="fade" transparent onRequestClose={() => !acting && setRejectTarget(null)}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 460, width: '100%' }]}>
            {rejectTarget && (
              <>
                <View style={U.modalHeaderRow}>
                  <Text style={U.modalTitle}>Bildirimi reddet</Text>
                  <Pressable onPress={() => setRejectTarget(null)} disabled={!!acting} style={[U.modalCloseBtn, webPointer]} accessibilityLabel={autoT('Kapat')}>
                    <X size={16} color={U.ink[500]} strokeWidth={2} />
                  </Pressable>
                </View>
                <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900], marginTop: 4 }}>
                  {rejectTarget.clinic_name ?? autoT('Klinik')} · {M(rejectTarget.amount, rejectTarget.currency)}
                </Text>
                <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 6, lineHeight: 17 }}>
                  Klinik bu sebebi görür. Bildirim reddedildi olarak işaretlenir, klinik hesabına ödeme işlenmez.
                </Text>
                <TextInput
                  value={rejectReason}
                  onChangeText={(v) => { setRejectReason(v); if (modalError) setModalError(null); }}
                  placeholder="Örn: Dekont no eşleşmedi, banka kayıtlarında bulunamadı"
                  placeholderTextColor={U.ink[400]}
                  multiline
                  autoFocus
                  style={[U.inputStyle, { marginTop: 12, minHeight: 84, paddingTop: 10, textAlignVertical: 'top' }]}
                />
                {modalError ? <Text style={{ fontSize: 12, color: U.chipTones.danger.fg, marginTop: 8 }}>{modalError}</Text> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <PlainButton label="Vazgeç" onPress={() => setRejectTarget(null)} disabled={!!acting} />
                  <Pressable
                    onPress={confirmReject}
                    disabled={!rejectReason.trim() || acting === rejectTarget.id}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#D94B4B',
                      opacity: !rejectReason.trim() ? 0.5 : pressed ? 0.85 : 1, ...webPointer,
                    })}
                  >
                    {acting === rejectTarget.id
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <X size={14} color="#FFFFFF" strokeWidth={2} />}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Reddet</Text>
                  </Pressable>
                </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Satır ───────────────────────────────────────────────────────────
function SubmissionRow({ row: r, isLast, isDesktop, waitDays, busy, onApprove, onReject }: {
  row: Row; isLast: boolean; isDesktop: boolean; waitDays: number; busy: boolean;
  onApprove: () => void; onReject: () => void;
}) {
  const U = useInkUI();
  const cfg = METHOD[r.payment_method] ?? METHOD.diger;
  const Icon = cfg.icon;
  const isPending = r.status === 'pending';

  const meta = [
    r.patient_name,
    `${autoT('Ödeme tarihi')} ${fmtDate(r.payment_date)}`,
    r.reference_no ? `${autoT('Ref.')} ${r.reference_no}` : null,
    r.bank_name,
    r.sender_name ? `${autoT('Gönderen')}: ${r.sender_name}` : null,
  ].filter(Boolean).join(' · ');

  const waitTone = waitDays >= STALE_DAYS ? U.chipTones.danger : waitDays >= 1 ? U.chipTones.warning : U.chipTones.neutral;
  const statusChip = isPending
    ? { tone: waitTone, text: waitDays === 0 ? autoT('Bugün geldi') : `${autoT('Bekliyor')} · ${waitDays} ${autoT('gün')}` }
    : r.status === 'approved'
      ? { tone: U.chipTones.success, text: `${autoT('Onaylandı')}${r.reviewed_at ? ` · ${fmtDate(r.reviewed_at.slice(0, 10))}` : ''}` }
      : { tone: U.chipTones.danger, text: `${autoT('Reddedildi')}${r.reviewed_at ? ` · ${fmtDate(r.reviewed_at.slice(0, 10))}` : ''}` };

  const receiptUrl = r.receipt_url && /^https?:\/\//i.test(r.receipt_url) ? r.receipt_url : null;

  const actions = isPending ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <PlainButton label="Reddet" onPress={onReject} disabled={busy} small />
      <Pressable
        onPress={onApprove}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6,
          height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: U.ink[900],
          opacity: busy ? 0.6 : pressed ? 0.85 : 1, ...webPointer,
        })}
      >
        {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : <CheckCircle2 size={13} color={U.onDarkPill} strokeWidth={2} />}
        <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>Onayla</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 14,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairlineSoft,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: cfg.color + '22' }}>
        <Icon size={17} color={cfg.color} strokeWidth={1.8} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>
            {r.clinic_name ?? autoT('Klinik')}
          </Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: statusChip.tone.bg }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: statusChip.tone.fg }}>{statusChip.text}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={2}>
          {autoT(cfg.label)}
          {r.invoice_no ? ` · ${autoT('Hizmet bedeli')} ${r.invoice_no}` : ` · ${autoT('Cariye genel ödeme')}`}
        </Text>
        <Text style={{ fontSize: 12, color: U.ink[400] }} numberOfLines={2}>{meta}</Text>
        {r.notes ? <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={2}>{`${autoT('Not')}: ${r.notes}`}</Text> : null}
        {r.status === 'rejected' && r.reject_reason ? (
          <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }} numberOfLines={3}>{`${autoT('Red sebebi')}: ${r.reject_reason}`}</Text>
        ) : null}
        {receiptUrl && (
          <Pressable onPress={() => Linking.openURL(receiptUrl)} accessibilityRole="link"
                     style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 2, ...webPointer }}>
            <Paperclip size={13} color={U.ink[700]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700], textDecorationLine: 'underline' }}>Dekontu aç</Text>
          </Pressable>
        )}
        {!isDesktop && actions ? <View style={{ marginTop: 8 }}>{actions}</View> : null}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{M(r.amount, r.currency)}</Text>
        {isDesktop ? actions : null}
      </View>
    </View>
  );
}

// ── Onay özeti ──────────────────────────────────────────────────────
function ApproveSummary({ row: r, busy, error, onCancel, onConfirm }: {
  row: Row; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void;
}) {
  const U = useInkUI();
  const cfg = METHOD[r.payment_method] ?? METHOD.diger;
  const lines: [string, string][] = [
    [autoT('Klinik'), r.clinic_name ?? '—'],
    [autoT('Yöntem'), autoT(cfg.label)],
    [autoT('Ödeme tarihi'), fmtDate(r.payment_date)],
    [autoT('Hizmet bedeli'), r.invoice_no ?? autoT('Cariye genel ödeme')],
    ...(r.reference_no ? [[autoT('Referans / Dekont'), r.reference_no] as [string, string]] : []),
    ...(r.sender_name ? [[autoT('Gönderen'), r.sender_name] as [string, string]] : []),
  ];
  return (
    <>
      <View style={U.modalHeaderRow}>
        <Text style={U.modalTitle}>Ödemeyi onayla</Text>
        <Pressable onPress={onCancel} disabled={busy} style={[U.modalCloseBtn, webPointer]} accessibilityLabel={autoT('Kapat')}>
          <X size={16} color={U.ink[500]} strokeWidth={2} />
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 30, letterSpacing: -0.8, color: U.ink[900], marginTop: 4 }}>
        {M(r.amount, r.currency)}
      </Text>
      <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: U.hairline }}>
        {lines.map(([k, v], i) => (
          <View key={k} style={{
            flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft,
          }}>
            <Text style={{ fontSize: 12, color: U.ink[500] }}>{k}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900], flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 12, lineHeight: 17 }}>
        Ödeme klinik hesabına tahsilat olarak işlenir. Banka hesabınızda tutarın gerçekten geldiğini kontrol ettikten sonra onaylayın.
      </Text>
      {error ? <Text style={{ fontSize: 12, color: U.chipTones.danger.fg, marginTop: 8 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <PlainButton label="Vazgeç" onPress={onCancel} disabled={busy} />
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: U.ink[900],
            opacity: busy ? 0.7 : pressed ? 0.85 : 1, ...webPointer,
          })}
        >
          {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : <CheckCircle2 size={14} color={U.onDarkPill} strokeWidth={2} />}
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>{busy ? 'İşleniyor…' : 'Onayla ve hesaba işle'}</Text>
        </Pressable>
      </View>
      </ScrollView>
    </>
  );
}

function PlainButton({ label, onPress, disabled, small }: { label: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed, hovered }: any) => ({
        height: small ? 32 : 38, paddingHorizontal: small ? 12 : 16, borderRadius: 999, justifyContent: 'center',
        backgroundColor: hovered ? U.rowHover : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1, ...webPointer,
      })}
    >
      <Text style={{ fontSize: small ? 12 : 13, fontWeight: '600', color: U.plainBtn.fg }}>{label}</Text>
    </Pressable>
  );
}
