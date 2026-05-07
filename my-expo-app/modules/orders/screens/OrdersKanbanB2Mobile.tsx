/**
 * OrdersKanbanB2Mobile — Variant B B2 mobile orders view.
 * Horizontal swimlanes (Yeni / Üretimde / Kontrol / Yolda).
 * Mobile-only — desktop keeps the existing filter+table.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import type { WorkOrder } from '../types';

interface LaneDef {
  key: string;
  title: string;
  dot: string;
  /** work_orders status keys that belong to this lane */
  match: string[];
}

const LANES: LaneDef[] = [
  { key: 'yeni',     title: 'Yeni',     dot: '#E89B2A',           match: ['alindi'] },
  { key: 'uretimde', title: 'Üretimde', dot: 'PRIMARY',           match: ['uretimde'] },
  { key: 'qa',       title: 'Kontrol',  dot: '#4A8FC9',           match: ['kalite_kontrol'] },
  { key: 'teslimat', title: 'Yolda',    dot: '#2D9A6B',           match: ['teslimata_hazir'] },
];

interface Props {
  orders: WorkOrder[];
  loading?: boolean;
  refetch?: () => void;
  onOpenOrder: (order: WorkOrder) => void;
  onAddInLane?: (laneKey: string) => void;
}

export function OrdersKanbanB2Mobile({ orders, loading, refetch, onOpenOrder, onAddInLane }: Props) {
  const theme = useMobileTheme();
  const [search, setSearch] = useState('');

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o => {
      const num = String((o as any).order_number ?? o.id ?? '').toLowerCase();
      const type = String((o as any).work_type ?? '').toLowerCase();
      const doc = String((o as any).doctor_name ?? '').toLowerCase();
      const pat = String((o as any).patient_name ?? '').toLowerCase();
      return num.includes(q) || type.includes(q) || doc.includes(q) || pat.includes(q);
    });
  }, [orders, search]);

  const grouped = useMemo(() => {
    const m: Record<string, WorkOrder[]> = {};
    LANES.forEach(l => { m[l.key] = []; });
    filtered.forEach(o => {
      const lane = LANES.find(l => l.match.includes(o.status));
      if (lane) m[lane.key].push(o);
    });
    return m;
  }, [filtered]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={refetch
        ? <RefreshControl refreshing={!!loading} onRefresh={refetch} tintColor={theme.accent} />
        : undefined}
      showsVerticalScrollIndicator={false}
    >
      {/* ════ Header ════ */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ÜRETİM PANOSU</Text>
        <Text style={styles.h2}>Vakalar</Text>
        <Text style={styles.hint}>Kaydır → durumlar arası geçiş yap</Text>
      </View>

      {/* ════ Lanes (horizontal scroll) ════ */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lanesRow}
      >
        {LANES.map((lane) => {
          const laneOrders = grouped[lane.key] ?? [];
          const dot = lane.dot === 'PRIMARY' ? theme.primary : lane.dot;
          return (
            <View key={lane.key} style={styles.lane}>
              <View style={styles.laneHead}>
                <View style={styles.laneHeadLeft}>
                  <View style={[styles.laneDot, { backgroundColor: dot }]} />
                  <Text style={styles.laneTitle}>{lane.title}</Text>
                </View>
                <Text style={styles.laneCount}>{laneOrders.length}</Text>
              </View>

              <View style={{ gap: 8 }}>
                {laneOrders.map(o => (
                  <LaneCard key={o.id} order={o} onPress={() => onOpenOrder(o)} />
                ))}

                {/* Empty add slot */}
                {onAddInLane && (
                  <Pressable
                    onPress={() => onAddInLane(lane.key)}
                    style={styles.emptyAdd}
                  >
                    <Text style={styles.emptyAddText}>+ Vaka ekle</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* ════ Search bar (bottom-style, but here below lanes) ════ */}
      <View style={styles.searchWrap}>
        <View style={styles.searchPill}>
          <Search size={16} color={DS.ink[500]} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            placeholder="Sipariş, hasta, hekim ara"
            placeholderTextColor={DS.ink[400]}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={15} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {loading && filtered.length === 0 && (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      )}
    </ScrollView>
  );
}

function LaneCard({ order, onPress }: { order: WorkOrder; onPress: () => void }) {
  const orderNum = String((order as any).order_number ?? order.id ?? '').slice(-6);
  const workType = (order as any).work_type ?? 'Sipariş';
  const patient = (order as any).patient_name ?? (order as any).doctor_name ?? '—';
  const due = (order as any).delivery_date ? formatDue((order as any).delivery_date) : '—';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <Text style={styles.cardId}>{orderNum}</Text>
      <Text style={styles.cardType} numberOfLines={2}>{workType}</Text>
      <Text style={styles.cardPatient} numberOfLines={1}>{patient}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>{patient.slice(0, 2).toUpperCase()}</Text>
        </View>
        <Text style={styles.cardDue}>{due}</Text>
      </View>
    </Pressable>
  );
}

function formatDue(d: string): string {
  const date = new Date(d);
  if (isNaN(+date)) return d;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 16,
  },
  eyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.88,
  },
  h2: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 36,
    color: DS.ink[900],
    letterSpacing: -1.62,
    lineHeight: 38,
    marginTop: 6,
  },
  hint: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: DS.ink[500],
    marginTop: 8,
  },

  // Lanes
  lanesRow: {
    paddingHorizontal: 24,
    paddingTop: 4,
    gap: 14,
  },
  lane: {
    width: 240,
    flexShrink: 0,
  },
  laneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  laneHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  laneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  laneTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[900],
    letterSpacing: -0.14,
  },
  laneCount: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
  },

  // Card
  card: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  cardId: {
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    color: DS.ink[500],
    letterSpacing: 0.4,
  },
  cardType: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[900],
    letterSpacing: -0.14,
    marginTop: 4,
    lineHeight: 18,
  },
  cardPatient: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: DS.ink[500],
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderStyle: 'dashed',
  },
  cardAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 9,
    color: DS.ink[700],
  },
  cardDue: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
  },

  // Empty add slot
  emptyAdd: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  emptyAddText: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: DS.ink[500],
  },

  // Search
  searchWrap: {
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  searchInput: {
    flex: 1,
    fontFamily: MFONT.uiRegular,
    fontSize: 14,
    color: DS.ink[900],
  },
});
