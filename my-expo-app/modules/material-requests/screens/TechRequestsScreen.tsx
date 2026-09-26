/**
 * Teknisyen Malzeme Talepleri — kendi taleplerini görüntüleme + yeni talep.
 *
 * Sayfa yapısı:
 *  - F1 Hero (kicker + büyük başlık + 3 BigStat + Yeni Talep CTA)
 *  - 3 KPI tile (Açık / Onaylı / Teslim Alındı)
 *  - 3 sekmeli liste (Açık · Geçmiş · Reddedilen)
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import {
  Wrench, Plus, Clock, CheckCircle2, PackageCheck, XCircle,
  RefreshCcw, ChevronRight, Hourglass,
} from '../../../core/ui/icons';

import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  listRequests, cancelRequest,
  type MaterialRequestRow, type RequestStatus,
} from '../api';
import {
  DISPLAY, TRY, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, PillButton, MiniKPI,
  StatusChip, UrgencyChip,
} from '../components/atoms';
import { NewRequestModal } from '../components/NewRequestModal';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';

type TabKey = 'open' | 'history' | 'rejected';

const OPEN_STATUSES: RequestStatus[]    = ['submitted', 'forwarded_admin', 'approved', 'ordered'];
const HISTORY_STATUSES: RequestStatus[] = ['received', 'closed'];
const REJECT_STATUSES: RequestStatus[]  = ['rejected_manager', 'rejected_admin', 'cancelled'];

const TABS: { key: TabKey; label: string; statuses: RequestStatus[]; icon: any; accent: string }[] = [
  { key: 'open',     label: 'Açık',       statuses: OPEN_STATUSES,    icon: Hourglass,    accent: '#D97706' },
  { key: 'history',  label: 'Geçmiş',     statuses: HISTORY_STATUSES, icon: PackageCheck, accent: '#0EA5E9' },
  { key: 'rejected', label: 'Reddedilen', statuses: REJECT_STATUSES,  icon: XCircle,      accent: '#DC2626' },
];

export function TechRequestsScreen() {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  // Beyaz hero içi mürekkep/kutucuk renkleri (açık ve koyu temada ayrı).
  const heroInk = useWhiteHeroInk();
  const [items, setItems]     = useState<MaterialRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab]         = useState<TabKey>('open');

  // PatternsShell üst başlığı
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => {
    setTitle('Malzeme Talebi', 'Sarf ve alet talepleri');
    return clear;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listRequests({ mine: true })); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const g = { open: [] as MaterialRequestRow[], history: [] as MaterialRequestRow[], rejected: [] as MaterialRequestRow[] };
    for (const r of items) {
      if (OPEN_STATUSES.includes(r.status))    g.open.push(r);
      else if (HISTORY_STATUSES.includes(r.status)) g.history.push(r);
      else if (REJECT_STATUSES.includes(r.status))  g.rejected.push(r);
    }
    return g;
  }, [items]);

  const counts = useMemo(() => ({
    pending:  items.filter(r => r.status === 'submitted' || r.status === 'forwarded_admin').length,
    approved: items.filter(r => r.status === 'approved' || r.status === 'ordered').length,
    received: items.filter(r => r.status === 'received').length,
    rejected: items.filter(r => REJECT_STATUSES.includes(r.status)).length,
  }), [items]);

  const list = grouped[tab];

  const handleCancel = async (id: string) => {
    if (!confirm('Bu talebi iptal etmek istediğinizden emin misiniz?')) return;
    try { await cancelRequest(id, 'Teknisyen tarafından iptal edildi'); await load(); }
    catch (e: any) { alert(`İptal başarısız: ${e?.message ?? e}`); }
  };

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* BEYAZ HERO — eski F2 hero (dolu accent zemin + dekoratif daireler +
            beyaz kutucuk şeridi) kaldırıldı; uygulama genelindeki "beyaz hero"
            hiyerarşisi: kicker → lider sayı → bağlam cümlesi → sağda sayılar. */}
        <WhiteHero
          kicker="Çalışma Alanı · Malzeme Talebi"
          title={<>{grouped.open.length} <Text style={{ color: heroInk.accentInk }}>açık talep</Text></>}
          description="Eksilen sarf veya bozulan aleti buradan talep edersiniz. Talep önce mesul müdüre, onaylanırsa admin'e iletilir."
          stats={[
            { value: String(counts.pending),  label: 'Onay Bekleyen' },
            { value: String(counts.approved), label: 'Onaylı' },
            { value: String(counts.received), label: 'Teslim Alınan' },
            { value: String(counts.rejected), label: 'Reddedilen' },
          ]}
          cta={
            <Pressable
              onPress={() => setModalOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: heroInk.isDark ? '#FFFFFF' : TH.primary,
              }}
            >
              <Plus size={13} color={heroInk.isDark ? TH.primary : '#FFFFFF'} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: heroInk.isDark ? TH.primary : '#FFFFFF' }}>Yeni Talep</Text>
            </Pressable>
          }
          actions={
            <Pressable
              onPress={load}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: heroInk.tileBg, borderWidth: 1, borderColor: heroInk.tileBorder,
              }}
            >
              <RefreshCcw size={13} color={heroInk.ink} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: heroInk.ink }}>Yenile</Text>
            </Pressable>
          }
        />

        {/* Sekmeler — uygulama genelindeki kayan-cursor'lı SlideTabBar. */}
        <SlideTabBar
          items={TABS.map(tb => ({ key: tb.key, label: tb.label, count: grouped[tb.key].length }))}
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          accentColor={TH.primary}
          style={{ marginStart: -4 }}
        />

        {/* Liste */}
        {list.length === 0 ? (
          <EmptyCard
            icon={Wrench}
            title={tab === 'open' ? 'Açık talep yok' : tab === 'history' ? 'Geçmiş kayıt yok' : 'Reddedilen yok'}
            description={tab === 'open' ? 'Yeni bir malzeme talebi oluşturarak başlayın.' : 'Burada sonuçlanan talepleriniz görünür.'}
            cta={tab === 'open' ? { label: '+ Yeni Talep', onPress: () => setModalOpen(true) } : undefined}
          />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {list.map((r, i) => (
              <RequestRow
                key={r.id}
                row={r}
                isLast={i === list.length - 1}
                onCancel={
                  (r.status === 'submitted' || r.status === 'forwarded_admin')
                    ? () => handleCancel(r.id)
                    : undefined
                }
              />
            ))}
          </Card>
        )}
      </ScrollView>

      <NewRequestModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmitted={() => { void load(); }}
      />
    </>
  );
}

/* ─────────────── HeroMiniStat / RequestRow ─────────────── */

function HeroMiniStat({
  icon: Icon, label, value, onPress,
}: { icon: any; label: string; value: number | string; onPress?: () => void }) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        flexGrow: 1, flexBasis: 130, minWidth: 130,
        paddingVertical: 12, paddingHorizontal: 12,
        borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
        gap: 4,
        opacity: onPress && pressed ? 0.85 : 1,
        // @ts-ignore
        transform: [{ translateY: hovered && onPress ? -1 : 0 }],
        cursor: onPress ? ('pointer' as any) : ('default' as any),
        // @ts-ignore
        transition: 'transform 180ms ease',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={12} color="rgba(255,255,255,0.92)" strokeWidth={2} />
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)' }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, color: '#FFF', letterSpacing: -0.5, lineHeight: 26 }}>
        {value}
      </Text>
    </Wrapper>
  );
}

function RequestRow({
  row, isLast, onCancel,
}: { row: MaterialRequestRow; isLast: boolean; onCancel?: () => void }) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const itemCount = row.item_count ?? row.items?.length ?? 0;
  const est = row.est_total ?? 0;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: T.hairline,
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
      }}>
        <Wrench size={16} color={TH.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '600', letterSpacing: 0.4 }}>
            {row.request_no}
          </Text>
          <StatusChip status={row.status} size="sm" />
          <UrgencyChip urgency={row.urgency} size="sm" />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink, marginTop: 3 }} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>
          {itemCount} kalem
          {est > 0 ? `  ·  Tahmini ${TRY(est)}` : ''}
          {row.needed_by ? `  ·  İhtiyaç: ${fmtDate(row.needed_by)}` : ''}
        </Text>
        {row.status === 'rejected_manager' || row.status === 'rejected_admin' ? (
          row.reject_reason ? (
            <Text style={{ fontSize: 11, color: '#9C2E2E', marginTop: 4 }} numberOfLines={2}>
              Red sebebi: {row.reject_reason}
            </Text>
          ) : null
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 10, color: T.ink3 }}>{fmtDate(row.submitted_at?.slice(0, 10))}</Text>
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <XCircle size={10} color={T.ink3} />
            <Text style={{ fontSize: 10, color: T.ink3, fontWeight: '500' }}>İptal</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
