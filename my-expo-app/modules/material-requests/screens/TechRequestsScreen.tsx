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
} from 'lucide-react-native';

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
        {/* F2 Hero — full-bleed accent + dekoratif daireler + alt mini-stat şeridi */}
        <View style={{
          borderRadius: 28, padding: 28, backgroundColor: TH.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Dekoratif daireler */}
          <View style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} pointerEvents="none" />
          <View style={{ position: 'absolute', bottom: -60, left: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} pointerEvents="none" />

          {/* Üst satır — kicker + title + ikon kapsülü */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 260 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                Çalışma Alanı · Malzeme Talebi
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 40, color: '#FFF', letterSpacing: -1.2, lineHeight: 44, marginTop: 8 }}>
                Taleplerim
              </Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 10, maxWidth: 520, lineHeight: 19 }}>
                Eksilen sarf veya bozulan aleti buradan talep edersiniz. Talep önce mesul müdüre, onaylanırsa admin'e iletilir.
              </Text>
            </View>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.20)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Wrench size={26} color="#FFF" strokeWidth={1.7} />
            </View>
          </View>

          {/* Aksiyonlar */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            <Pressable
              onPress={() => setModalOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: '#FFF',
              }}
            >
              <Plus size={13} color={TH.primary} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: TH.primary }}>Yeni Talep</Text>
            </Pressable>
            <Pressable
              onPress={load}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
              }}
            >
              <RefreshCcw size={13} color="#FFF" strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>Yenile</Text>
            </Pressable>
          </View>

          {/* Alt mini-stat şeridi — 4 tile */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <HeroMiniStat icon={Clock}        label="Onay Bekleyen" value={counts.pending}  onPress={() => setTab('open')} />
            <HeroMiniStat icon={CheckCircle2} label="Onaylı"         value={counts.approved} onPress={() => setTab('open')} />
            <HeroMiniStat icon={PackageCheck} label="Teslim Alınan"  value={counts.received} onPress={() => setTab('history')} />
            <HeroMiniStat icon={XCircle}      label="Reddedilen"     value={counts.rejected} onPress={() => setTab('rejected')} />
          </View>
        </View>

        {/* Tab bar */}
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline, alignSelf: 'flex-start' }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            const n = grouped[t.key].length;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                  backgroundColor: active ? T.card : 'transparent',
                  ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null),
                }}
              >
                <Icon size={12} color={active ? t.accent : T.ink3} strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? T.ink : T.ink3 }}>
                  {t.label} ({n})
                </Text>
              </Pressable>
            );
          })}
        </View>

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
