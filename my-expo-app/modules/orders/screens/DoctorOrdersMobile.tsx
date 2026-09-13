// modules/orders/screens/DoctorOrdersMobile.tsx
// Aydın Lab Mobile handoff — hekim vakalar sayfası.
// Sections: header → stats banner → search/filter → chip strip → grouped list
//   • Acil & Geciken (öncelik) — kırmızı şerit
//   • Bu hafta teslim
//   • Önümüzdeki haftalar
//   • Tamamlananlar

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, RefreshControl, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search, SlidersHorizontal, Plus, AlertTriangle, ChevronRight, ChevronLeft, Inbox,
  Flame, Clock, CheckCircle2, ClipboardList, CornerDownRight, CornerDownLeft,
} from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, type StatusKind, useMobileTokens, useStatusTokens } from '../../../core/theme/mobileDesignTokens';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { WorkOrder, WorkOrderStatus } from '../types';
import { buildRevisionCases } from '../revisionGroups';

const DOCTOR = MOBILE_PANEL_THEMES.doctor;

interface Props {
  orders: WorkOrder[];
  loading: boolean;
  refetch: () => void;
  onOpenOrder: (o: WorkOrder) => void;
  onNewOrder?: () => void;
}

type FilterKey = 'all' | 'active' | 'production' | 'ready' | 'delivered' | 'overdue';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tümü' },
  { key: 'active',      label: 'Aktif' },
  { key: 'production',  label: 'Üretimde' },
  { key: 'ready',       label: 'Hazır' },
  { key: 'overdue',     label: 'Geciken' },
  { key: 'delivered',   label: 'Teslim' },
];

const STATUS_TO_KIND: Record<string, StatusKind> = {
  atama_bekleniyor: 'wait',
  alindi:           'wait',
  asamada:          'prod',
  uretimde:         'prod',
  kalite_kontrol:   'qc',
  teslimata_hazir:  'ready',
  kurye_bekleniyor: 'ready',
  kuryede:          'ready',
  teslim_edildi:    'done',
  iptal:            'wait',
};

const STATUS_LABEL: Record<string, string> = {
  atama_bekleniyor: 'Atama Bekliyor',
  alindi:           'Alındı',
  asamada:          'Üretimde',
  uretimde:         'Üretimde',
  kalite_kontrol:   'Kalite Kontrol',
  teslimata_hazir:  'Hazır',
  kurye_bekleniyor: 'Kurye Bekleniyor',
  kuryede:          'Kuryede',
  teslim_edildi:    'Teslim Edildi',
  iptal:            'İptal',
};

// Status → 5 aşamalı progress (0-4 index)
const STATUS_STEP: Record<string, number> = {
  atama_bekleniyor: 0,
  alindi:           0,
  asamada:          1,
  uretimde:         1,
  kalite_kontrol:   2,
  teslimata_hazir:  3,
  kurye_bekleniyor: 3,
  kuryede:          3,
  teslim_edildi:    4,
  iptal:            0,
};

export function DoctorOrdersMobile({ orders, loading, refetch, onOpenOrder, onNewOrder }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const rtl = isRTL();
  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const isOverdue = (o: WorkOrder) => {
    if (o.status === 'teslim_edildi' || o.status === 'iptal') return false;
    const d = new Date(o.delivery_date + 'T00:00:00');
    return d.getTime() < new Date().setHours(0, 0, 0, 0);
  };

  const counts = useMemo(() => ({
    all: orders.length,
    active:     orders.filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal').length,
    production: orders.filter(o => o.status === 'uretimde' || o.status === 'kalite_kontrol').length,
    ready:      orders.filter(o => o.status === 'teslimata_hazir').length,
    overdue:    orders.filter(isOverdue).length,
    delivered:  orders.filter(o => o.status === 'teslim_edildi').length,
  } as Record<FilterKey, number>), [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter === 'active')     list = list.filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal');
    if (filter === 'production') list = list.filter(o => o.status === 'uretimde' || o.status === 'kalite_kontrol');
    if (filter === 'ready')      list = list.filter(o => o.status === 'teslimata_hazir');
    if (filter === 'overdue')    list = list.filter(isOverdue);
    if (filter === 'delivered')  list = list.filter(o => o.status === 'teslim_edildi');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(o =>
        (o.patient_name?.toLowerCase().includes(q)) ||
        (o.order_number?.toLowerCase().includes(q)) ||
        (o.work_type?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, filter, query]);

  // Grupla: urgent/overdue → thisWeek → later → delivered
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);

    const urgent: WorkOrder[] = [];
    const thisWeek: WorkOrder[] = [];
    const later: WorkOrder[] = [];
    const delivered: WorkOrder[] = [];

    // Revizyonlar: vaka grubu tek satır olur; gruba YALNIZ en güncel üye girer,
    // eskiler onun altında alt-liste olarak çizilir (bkz. revisionGroups).
    // YALNIZ revizyon gruplanır: devam siparişi asıl işin yerine geçmez, ayrı
    // (bağlantılı) bir iştir → masaüstündeki gibi kendi kartı olur. 'all' bağıyla
    // asıl işin altına katlanıyor ve yeni kayıt listede görünmüyordu.
    const { anchors, children } = buildRevisionCases(filtered as any[], { linkBy: 'revision' });
    for (const o of anchors as WorkOrder[]) {
      if (o.status === 'teslim_edildi') { delivered.push(o); continue; }
      if (isOverdue(o) || o.is_urgent)  { urgent.push(o);    continue; }
      const d = new Date(o.delivery_date + 'T00:00:00');
      if (d.getTime() <= in7.getTime()) thisWeek.push(o);
      else later.push(o);
    }
    // En yeni sipariş her zaman üstte — bucket-içi created_at desc (teslim-bazlı gruplama korunur)
    const byNewest = (a: WorkOrder, b: WorkOrder) =>
      String((b as any).created_at ?? '').localeCompare(String((a as any).created_at ?? ''));
    urgent.sort(byNewest); thisWeek.sort(byNewest); later.sort(byNewest);
    delivered.sort(byNewest);
    return { urgent, thisWeek, later, delivered, revChildren: children };
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* ═══ F1 HeroCard — Vakalar özeti (paddingTop clears floating header) ═══ */}
      <View style={{ paddingHorizontal: 12, paddingTop: Math.max(insets.top, 8) + 72, paddingBottom: 12 }}>
        <View style={{
          borderRadius: 20, overflow: 'hidden',
          backgroundColor: DOCTOR.primary, padding: 18, position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, ...(rtl ? { left: -40 } : { right: -40 }), width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View style={{ position: 'absolute', bottom: -50, ...(rtl ? { right: -20 } : { left: -20 }), width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                Toplam Vaka
              </Text>
              <Text
                style={{
                  fontSize: 36, color: '#FFFFFF', letterSpacing: -1, lineHeight: 40,
                  fontWeight: '300',
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              >
                {counts.all}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
                {counts.active} {autoT('aktif')}{counts.delivered > 0 ? ` · ${counts.delivered} ${autoT('teslim edildi')}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={onNewOrder ?? (() => router.push('/(doctor)/new-order' as any))}
              style={({ pressed }: any) => ({
                width: 44, height: 44, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Plus size={20} color={DOCTOR.primary} strokeWidth={2.4} />
            </Pressable>
          </View>

          {/* Mini stat triplet — beyaz şeffaf */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {([
              { label: 'Aktif',   value: counts.active,  icon: ClipboardList },
              { label: 'Geciken', value: counts.overdue, icon: AlertTriangle },
              { label: 'Hazır',   value: counts.ready,   icon: CheckCircle2 },
            ] as const).map(stat => {
              const Icon = stat.icon;
              return (
                <View key={stat.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                      {autoT(stat.label)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 20, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 22, fontWeight: '300',
                      ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                    }}
                  >
                    {stat.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* ═══ Search + filter ═══ */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 14, paddingVertical: 11,
          backgroundColor: T.card, borderRadius: 16,
          borderWidth: 1, borderColor: T.hairline,
        }}>
          <Search size={15} color={T.ink3} strokeWidth={1.8} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Hasta, sipariş no veya iş tipi…"
            placeholderTextColor={T.ink3}
            style={{
              flex: 1, fontSize: 13, color: T.ink,
              // @ts-ignore web outline reset
              outlineWidth: 0,
            }}
          />
        </View>
        <Pressable
          style={{
            width: 44, height: 44, borderRadius: 14,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SlidersHorizontal size={16} color={T.ink} strokeWidth={1.8} />
        </Pressable>
      </View>

      {/* ═══ Filter chip strip ═══ */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16, paddingBottom: 12,
          gap: 6,
          flexDirection: 'row',
          alignItems: 'center',
        }}
        style={{ flexGrow: 0, maxHeight: 48 }}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          const n = counts[f.key] ?? 0;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? DOCTOR.primary : T.card,
                borderWidth: 1, borderColor: active ? DOCTOR.primary : T.hairline,
                alignSelf: 'center',
                flexShrink: 0,
              }}
            >
              <Text style={{
                fontSize: 12.5, fontWeight: '500',
                color: active ? '#FFFFFF' : T.ink,
              }}>
                {autoT(f.label)}
              </Text>
              <View style={{
                minWidth: 18, paddingHorizontal: 5, height: 18,
                borderRadius: 9,
                backgroundColor: active ? 'rgba(255,255,255,0.22)' : T.bgDeep,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{
                  fontSize: 10, fontWeight: '600',
                  color: active ? '#FFFFFF' : T.ink2,
                  fontFamily: T.mono,
                }}>
                  {n}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ═══ Grouped list ═══ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DOCTOR.primary} />}
      >
        {filtered.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            <Group title={autoT('Acil & Geciken')} icon={Flame} iconColor={T.ruby} items={groups.urgent}
              renderItem={o => <OrderCard key={o.id} order={o} overdue={isOverdue(o)} onPress={() => onOpenOrder(o)} history={groups.revChildren.get(String(o.id)) as WorkOrder[] | undefined} onOpenOrder={onOpenOrder} />}
            />
            <Group title={autoT('Bu hafta teslim')} icon={Clock} iconColor={DOCTOR.primary} items={groups.thisWeek}
              renderItem={o => <OrderCard key={o.id} order={o} overdue={false} onPress={() => onOpenOrder(o)} history={groups.revChildren.get(String(o.id)) as WorkOrder[] | undefined} onOpenOrder={onOpenOrder} />}
            />
            <Group title={autoT('Yaklaşan')} icon={Clock} iconColor={T.ink3} items={groups.later}
              renderItem={o => <OrderCard key={o.id} order={o} overdue={false} onPress={() => onOpenOrder(o)} history={groups.revChildren.get(String(o.id)) as WorkOrder[] | undefined} onOpenOrder={onOpenOrder} />}
            />
            <Group title={autoT('Tamamlanan')} icon={CheckCircle2} iconColor={T.jade} items={groups.delivered}
              renderItem={o => <OrderCard key={o.id} order={o} overdue={false} onPress={() => onOpenOrder(o)} history={groups.revChildren.get(String(o.id)) as WorkOrder[] | undefined} onOpenOrder={onOpenOrder} />}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ marginTop: 40, alignItems: 'center', paddingHorizontal: 32, gap: 12 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 22,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Inbox size={28} color={T.ink3} strokeWidth={1.5} />
      </View>
      <Text style={{
        fontSize: 16, fontWeight: '500', color: T.ink, textAlign: 'center',
        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
      }}>
        {query ? 'Sonuç bulunamadı' : 'Bu filtrede sipariş yok'}
      </Text>
      <Text style={{ fontSize: 12, color: T.ink3, textAlign: 'center', lineHeight: 17 }}>
        {query ? 'Farklı bir anahtar kelime deneyin.' : 'Yeni bir sipariş açmak için + butonuna dokunun.'}
      </Text>
    </View>
  );
}

// ─── Group (date band) ───────────────────────────────────────────────────

function Group<X>({ title, icon: Icon, iconColor, items, renderItem }:
  { title: string; icon: any; iconColor: string; items: X[]; renderItem: (i: X) => React.ReactNode }) {
  const T = useMobileTokens();
  if (items.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 }}>
        <Icon size={13} color={iconColor} strokeWidth={2} />
        <Text style={{
          fontSize: 11, fontWeight: '600', color: T.ink,
          letterSpacing: 1.2, textTransform: 'uppercase',
          fontFamily: T.mono,
        }}>
          {title}
        </Text>
        <View style={{
          minWidth: 20, paddingHorizontal: 5, height: 18,
          borderRadius: 9,
          backgroundColor: T.bgDeep,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink2, fontFamily: T.mono }}>
            {items.length}
          </Text>
        </View>
        <View style={{ flex: 1, height: 1, backgroundColor: T.hairline }} />
      </View>
      <View style={{ gap: 10 }}>
        {items.map(renderItem)}
      </View>
    </View>
  );
}

// ─── Metric pill ─────────────────────────────────────────────────────────

function MetricPill({ label, value, accent, dark, dim }:
  { label: string; value: number; accent: string; dark?: boolean; dim?: boolean }) {
  const T = useMobileTokens();
  return (
    <View style={{
      flex: 1, padding: 12, borderRadius: T.r3,
      backgroundColor: dark ? T.ink : T.card,
      borderWidth: dark ? 0 : 1, borderColor: T.hairline,
      opacity: dim ? 0.55 : 1,
    }}>
      <Text style={{
        fontSize: 10, fontWeight: '600',
        color: dark ? T.onDark2 : T.ink3,
        letterSpacing: 1, textTransform: 'uppercase',
      }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <Text style={{
          fontSize: 22, fontWeight: '400',
          color: dark ? T.onDark : T.ink,
          letterSpacing: -0.5,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          {value}
        </Text>
        <View style={{
          width: 6, height: 6, borderRadius: 4,
          backgroundColor: accent,
          ...(isRTL() ? { marginRight: 2 } : { marginLeft: 2 }),
          marginBottom: 4,
        }} />
      </View>
    </View>
  );
}

// ─── Order card ──────────────────────────────────────────────────────────

function OrderCard({ order, overdue, onPress, history, onOpenOrder }:
  { order: WorkOrder; overdue: boolean; onPress: () => void;
    /** Aynı vakanın eski revizyonları — kartın altında girintili alt-liste */
    history?: WorkOrder[]; onOpenOrder?: (o: WorkOrder) => void }) {
  const T = useMobileTokens();
  const rtl = isRTL();
  const STATUS = useStatusTokens();
  const statusKind = overdue
    ? 'delay'
    : (STATUS_TO_KIND[order.status] ?? 'wait');
  const status = STATUS[statusKind];
  const statusLabel = autoT(overdue ? 'Geciken' : (STATUS_LABEL[order.status] ?? ''));
  const step = STATUS_STEP[order.status] ?? 0;
  const progressPct = ((step) / 4) * 100;
  const due = formatDue(order.delivery_date, order.status);
  const created = formatCreatedAt(order.created_at);
  const teethStr = order.tooth_numbers?.length ? order.tooth_numbers.join(', ') : '—';
  const initial = (order.patient_name ?? '?').charAt(0).toUpperCase();

  return (
    <>
    <Pressable onPress={onPress}>
      {({ pressed }: any) => (
      <View style={{
        backgroundColor: T.card, borderRadius: 22,
        padding: 14, gap: 12,
        borderWidth: 1, borderColor: overdue ? `${T.ruby}40` : T.hairline,
        opacity: pressed ? 0.94 : 1,
      }}>
      {/* Top row — avatar + name + order_no + chevron */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: overdue ? T.rubySoft : DOCTOR.bgDeep,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{
            fontSize: 16, fontWeight: '500',
            color: overdue ? T.ruby : DOCTOR.accentDark,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 15, fontWeight: '600', color: T.ink, letterSpacing: -0.2,
                flexShrink: 1,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {order.patient_name ?? 'Hasta belirtilmemiş'}
            </Text>
            {order.is_urgent && (
              <AlertTriangle size={11} color={T.ruby} strokeWidth={2.2} />
            )}
            {/* Devam siparişi — masaüstü listesiyle aynı mavi kimlik */}
            {!(order as any).revision_of_id && !!(order as any).continues_order_id && (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(53,99,168,0.14)', flexShrink: 0 }}>
                <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#3563A8', letterSpacing: 0.4 }}>{autoT('DEVAM')}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Text
              style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono, letterSpacing: 0.3, flexShrink: 0 }}
              numberOfLines={1}
            >
              #{order.order_number}
            </Text>
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: T.ink3, flexShrink: 0 }} />
            <Text
              style={{ fontSize: 11, color: T.ink3, flexShrink: 1, flex: 1, textAlign: rtl ? 'right' : undefined }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {order.work_type ?? autoT('Sipariş')}
            </Text>
          </View>
        </View>
        {rtl
          ? <ChevronLeft  size={15} color={T.ink3} strokeWidth={1.8} />
          : <ChevronRight size={15} color={T.ink3} strokeWidth={1.8} />}
      </View>

      {/* Spec row — teeth + shade */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 3,
          borderRadius: 6,
          backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
        }}>
          <Text style={{ fontSize: 10.5, color: T.ink2, fontWeight: '500' }}>
            Diş {teethStr}
          </Text>
        </View>
        {!!order.shade && (
          <View style={{
            paddingHorizontal: 8, paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
          }}>
            <Text style={{ fontSize: 10.5, color: T.ink2, fontFamily: T.mono, fontWeight: '600' }}>
              {order.shade}
            </Text>
          </View>
        )}
      </View>

      {/* Progress + due */}
      <View style={{ gap: 8 }}>
        {/* 5-step micro-progress bar */}
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0, 1, 2, 3, 4].map(i => {
            const done = i <= step;
            return (
              <View
                key={i}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  backgroundColor: done
                    ? (overdue ? T.ruby : DOCTOR.primary)
                    : T.hairline,
                }}
              />
            );
          })}
        </View>

        {/* Status pill + due */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: status.bg,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: status.dot }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: status.fg, letterSpacing: 0.3 }}>
              {statusLabel}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: overdue ? T.ruby : T.ink,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>
                {due.value}
              </Text>
              {!!due.label && (
                <Text style={{ fontSize: 10, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {due.label}
                </Text>
              )}
            </View>
            {!!created && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Clock size={9} color={T.ink3} strokeWidth={1.8} />
                <Text style={{ fontSize: 9.5, color: T.ink3, fontFamily: T.mono, letterSpacing: 0.2 }}>
                  {created}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
      </View>
      )}
    </Pressable>

    {/* Vakanın eski revizyonları — ayrı kart değil, girintili alt satır */}
    {(history ?? []).map(h => (
      <Pressable
        key={h.id}
        onPress={() => onOpenOrder?.(h)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          ...(rtl ? { marginRight: 20 } : { marginLeft: 20 }),
          marginTop: 6,
          paddingHorizontal: 12, paddingVertical: 9,
          borderRadius: 12,
          backgroundColor: `${DOCTOR.primary}0D`,
          borderWidth: 1, borderColor: `${DOCTOR.primary}1F`,
        }}
      >
        {rtl
          ? <CornerDownLeft  size={13} color={T.ink3} strokeWidth={2} />
          : <CornerDownRight size={13} color={T.ink3} strokeWidth={2} />}
        <Text style={{ flex: 1, fontSize: 11.5, color: T.ink2, fontFamily: T.mono, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
          #{String((h as any).order_number ?? h.id).slice(-6)}
        </Text>
        <Text style={{ fontSize: 10.5, color: h.status === 'teslim_edildi' ? T.jade : T.ink3, fontWeight: '600' }}>
          {h.status === 'teslim_edildi' ? 'Teslim edildi' : 'Önceki'}
        </Text>
      </Pressable>
    ))}
    </>
  );
}

// Sipariş oluşturma tarihi + saati — "25.06 14:32"
function formatCreatedAt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}

function formatDue(dateStr: string, status: WorkOrderStatus): { value: string; label: string } {
  if (status === 'teslim_edildi') {
    return { value: 'Teslim', label: '' };
  }
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { value: String(Math.abs(diff)), label: 'gün geç' };
  if (diff === 0) return { value: 'Bugün', label: '' };
  if (diff === 1) return { value: 'Yarın', label: '' };
  if (diff <= 7)  return { value: String(diff), label: 'gün' };
  return {
    value: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: '',
  };
}
