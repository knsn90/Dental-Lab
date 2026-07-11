/**
 * Malzeme Talepleri — Lab/Admin için Stok Hub'a takılan tab.
 *
 * Role-aware:
 *  - Lab manager  → "Onay Bekleyen" (submitted) varsayılan + forward/reject
 *  - Admin        → "Admin Onayında" (forwarded_admin) varsayılan + approve/reject/order/receive
 *
 * Ortak: arama, tab bar (status grupları), detay drawer, aksiyon modal'ı.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform } from 'react-native';
import {
  Wrench, Search, X, Hourglass, ShieldCheck, CheckCircle2, Truck, PackageCheck,
  XCircle, ArrowRight, RefreshCcw, Filter as FilterIcon,
  ChevronRight,
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useAuthStore } from '../../../core/store/authStore';
import {
  listRequests, getRequestCounts,
  type MaterialRequestRow, type RequestStatus, type RequestCounts,
} from '../api';
import {
  DISPLAY, TRY, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, EmptyCard, PillButton, MiniKPI,
  StatusChip, UrgencyChip,
} from '../components/atoms';
import { ApprovalActionsModal, type ApprovalAction } from '../components/ApprovalActionsModal';
import { RequestDetailDrawer } from '../components/RequestDetailDrawer';

type TabKey =
  | 'pending_manager'    // submitted (manager onayında)
  | 'pending_admin'      // forwarded_admin
  | 'approved'           // approved + ordered
  | 'received'           // received + closed
  | 'rejected';          // rejected_manager / rejected_admin / cancelled

const TAB_DEFS: { key: TabKey; label: string; statuses: RequestStatus[]; icon: any; accent: string }[] = [
  { key: 'pending_manager', label: 'Müdür Onayında', statuses: ['submitted'],                                      icon: Hourglass,    accent: '#D97706' },
  { key: 'pending_admin',   label: 'Admin Onayında', statuses: ['forwarded_admin'],                                icon: ShieldCheck,  accent: '#1D4ED8' },
  { key: 'approved',        label: 'Onaylı/Sipariş',  statuses: ['approved', 'ordered'],                          icon: CheckCircle2, accent: '#1F6B47' },
  { key: 'received',        label: 'Teslim Alınan',    statuses: ['received', 'closed'],                          icon: PackageCheck, accent: '#0EA5E9' },
  { key: 'rejected',        label: 'Reddedilen',       statuses: ['rejected_manager','rejected_admin','cancelled'], icon: XCircle,      accent: '#DC2626' },
];

export function MaterialRequestsScreen() {
  const TH = usePanelTheme();
  const { profile } = useAuthStore();

  const isAdmin   = profile?.user_type === 'admin';
  const isManager = profile?.user_type === 'lab' && (profile as any)?.role === 'manager';

  // Manager varsayılanı Müdür Onayında; admin varsayılanı Admin Onayında
  const [tab, setTab] = useState<TabKey>(isAdmin ? 'pending_admin' : 'pending_manager');
  const [items, setItems]     = useState<MaterialRequestRow[]>([]);
  const [counts, setCounts]   = useState<RequestCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  const [detailId,  setDetailId]  = useState<string | null>(null);
  const [actionState, setActionState] = useState<{ action: ApprovalAction; request: MaterialRequestRow } | null>(null);

  const activeTab = TAB_DEFS.find(t => t.key === tab)!;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [list, c] = await Promise.all([
        listRequests({ status: activeTab.statuses, search: search.trim() || undefined }),
        getRequestCounts(),
      ]);
      setItems(list); setCounts(c);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }, [activeTab, search]);
  useEffect(() => { load(); }, [load]);

  const totalOpen = counts?.total_open ?? 0;

  return (
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
              {isAdmin ? 'Admin Onay Kuyruğu' : 'Mesul Müdür Onay Kuyruğu'}
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 40, color: '#FFF', letterSpacing: -1.2, lineHeight: 44, marginTop: 8 }}>
              Malzeme Talepleri
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 10, maxWidth: 520, lineHeight: 19 }}>
              {isAdmin
                ? 'Mesul müdür tarafından yönlendirilen sarf/alet taleplerini onayla, sipariş ver ve teslim al.'
                : 'Teknisyen tarafından açılan sarf/alet talebini incele, admin\'e yönlendir veya reddet.'}
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
        {counts && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <HeroMiniStat icon={Hourglass}    label="Müdür Onay."  value={counts.submitted}                  onPress={() => setTab('pending_manager')} alert={counts.submitted > 0 && isManager} />
            <HeroMiniStat icon={ShieldCheck}  label="Admin Onay."  value={counts.forwarded_admin}            onPress={() => setTab('pending_admin')}   alert={counts.forwarded_admin > 0 && isAdmin} />
            <HeroMiniStat icon={Truck}        label="Sipariş"      value={counts.approved + counts.ordered}  onPress={() => setTab('approved')} />
            <HeroMiniStat icon={PackageCheck} label="Teslim"       value={counts.received}                   onPress={() => setTab('received')} />
          </View>
        )}
      </View>

      {/* Tab bar — segmented */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, backgroundColor: DS.ink[50], borderRadius: 12, borderWidth: 1, borderColor: DS.ink[200] }}>
        {TAB_DEFS.map(t => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8,
                backgroundColor: active ? '#FFF' : 'transparent',
                ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null),
              }}
            >
              <Icon size={12} color={active ? t.accent : DS.ink[500]} strokeWidth={2} />
              <Text style={{ fontSize: 11.5, fontWeight: active ? '700' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 7,
      }}>
        <Search size={13} color={DS.ink[400]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Talep no veya başlık ara…"
          placeholderTextColor={DS.ink[400]}
          style={{ flex: 1, fontSize: 13, color: DS.ink[900], paddingVertical: 4, outlineStyle: 'none' as any }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}><X size={13} color={DS.ink[400]} /></Pressable>
        )}
      </View>

      {/* Liste */}
      {loading ? <Loader />
       : error ? <ErrorBar message={error} />
       : items.length === 0 ? (
        <EmptyCard
          icon={Wrench}
          title="Bu sekmede talep yok"
          description="Arama veya filtreyi temizleyin."
        />
       ) : (
        <View style={{ gap: 10 }}>
          {items.map(r => (
            <RequestCard
              key={r.id}
              row={r}
              isAdmin={isAdmin}
              isManager={isManager}
              onOpenDetail={() => setDetailId(r.id)}
              onAction={(action) => setActionState({ action, request: r })}
            />
          ))}
        </View>
       )}

      {/* Detay drawer */}
      <RequestDetailDrawer
        visible={!!detailId}
        requestId={detailId}
        onClose={() => setDetailId(null)}
        onAction={(action, request) => setActionState({ action, request })}
        isAdmin={isAdmin}
        isManager={isManager}
      />

      {/* Aksiyon modal */}
      <ApprovalActionsModal
        visible={!!actionState}
        action={actionState?.action ?? null}
        request={actionState?.request ?? null}
        onClose={() => setActionState(null)}
        onDone={() => { setActionState(null); setDetailId(null); void load(); }}
      />
    </ScrollView>
  );
}

/* ──────────────────────  HeroMiniStat  ────────────────────── */

function HeroMiniStat({
  icon: Icon, label, value, onPress, alert,
}: { icon: any; label: string; value: number | string; onPress?: () => void; alert?: boolean }) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        flexGrow: 1, flexBasis: 130, minWidth: 130,
        paddingVertical: 12, paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: alert ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)',
        borderWidth: 1, borderColor: alert ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.20)',
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

/* ──────────────────────  RequestCard  ────────────────────── */

function RequestCard({
  row, isAdmin, isManager, onOpenDetail, onAction,
}: {
  row: MaterialRequestRow;
  isAdmin: boolean;
  isManager: boolean;
  onOpenDetail: () => void;
  onAction: (a: ApprovalAction) => void;
}) {
  const TH = usePanelTheme();
  const itemCount = row.item_count ?? row.items?.length ?? 0;
  const est = row.est_total ?? 0;

  // Hangi aksiyonlar aktif?
  const canManagerAct = isManager && row.status === 'submitted';
  const canAdminApprove = isAdmin && row.status === 'forwarded_admin';
  const canOrder = isAdmin && row.status === 'approved';
  const canReceive = isAdmin && (row.status === 'ordered' || row.status === 'approved');

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={onOpenDetail} style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 11,
            backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
          }}>
            <Wrench size={18} color={TH.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.4 }}>
                {row.request_no}
              </Text>
              <StatusChip status={row.status} size="sm" />
              <UrgencyChip urgency={row.urgency} size="sm" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900], marginTop: 4 }} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 3 }}>
              {row.requester?.full_name ?? '—'}
              {' · '}{itemCount} kalem
              {est > 0 ? `  ·  ${TRY(est)} tahmini` : ''}
              {row.needed_by ? `  ·  İhtiyaç: ${fmtDate(row.needed_by)}` : ''}
            </Text>
            {row.manager_note && (
              <Text style={{ fontSize: 10, color: DS.ink[500], marginTop: 4, fontStyle: 'italic' }} numberOfLines={1}>
                Müdür: {row.manager_note}
              </Text>
            )}
          </View>
          <ChevronRight size={14} color={DS.ink[300]} />
        </View>

        {/* Aksiyon barı — yetkiye göre */}
        {(canManagerAct || canAdminApprove || canOrder || canReceive) && (
          <View style={{
            flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end',
            borderTopWidth: 1, borderTopColor: DS.ink[100], paddingTop: 10, marginTop: 4,
          }}>
            {canManagerAct && (
              <>
                <PillButton size="sm" variant="ghost" onPress={() => onAction('manager_reject')}
                  leftIcon={<X size={11} color="#9C2E2E" />}>
                  Reddet
                </PillButton>
                <PillButton size="sm" variant="dark" onPress={() => onAction('manager_forward')}
                  leftIcon={<ArrowRight size={11} color="#FFF" />}>
                  Admin'e Yönlendir
                </PillButton>
              </>
            )}
            {canAdminApprove && (
              <>
                <PillButton size="sm" variant="ghost" onPress={() => onAction('admin_reject')}
                  leftIcon={<X size={11} color="#9C2E2E" />}>
                  Reddet
                </PillButton>
                <PillButton size="sm" variant="success" onPress={() => onAction('admin_approve')}
                  leftIcon={<CheckCircle2 size={11} color="#FFF" />}>
                  Onayla
                </PillButton>
              </>
            )}
            {canOrder && (
              <PillButton size="sm" variant="dark" onPress={() => onAction('admin_order')}
                leftIcon={<Truck size={11} color="#FFF" />}>
                Sipariş Ver
              </PillButton>
            )}
            {canReceive && (
              <PillButton size="sm" variant="success" onPress={() => onAction('admin_receive')}
                leftIcon={<PackageCheck size={11} color="#FFF" />}>
                Teslim Al
              </PillButton>
            )}
          </View>
        )}
      </Pressable>
    </Card>
  );
}
