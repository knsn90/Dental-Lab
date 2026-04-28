// modules/station/screens/ProductionKanbanScreen.tsx
// Lab mesul müdürü — istasyon bazlı üretim panosu (gerçek zamanlı)

import React, { useMemo, useState, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { useKanbanData, type KanbanCard, type KanbanColumn } from '../hooks/useKanbanData';
import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';

const ACCENT      = '#2563EB';
const COL_WIDTH   = 240;
const COL_GAP     = 12;
const BOARD_PAD   = 14;

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function elapsed(startedAt: string | null): string {
  if (!startedAt) return '—';
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}s ${m}dk`;
  return `${m}dk`;
}

function daysLabel(deliveryDate: string): { text: string; color: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return { text: `${Math.abs(diff)}g gecikti`, color: '#EF4444' };
  if (diff === 0) return { text: 'Bugün teslim',              color: '#8B5CF6' };
  if (diff === 1) return { text: 'Yarın teslim',              color: '#F59E0B' };
  if (diff <= 3)  return { text: `${diff} gün kaldı`,         color: '#F59E0B' };
  return {
    text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
    color: '#94A3B8',
  };
}

const STAGE_COLORS: Record<string, string> = {
  aktif:      '#2563EB',
  bekliyor:   '#F59E0B',
  tamamlandi: '#16A34A',
};

const STAGE_LABELS: Record<string, string> = {
  aktif:      'Devam',
  bekliyor:   'Bekliyor',
  tamamlandi: 'Bitti',
};

// ── Kanban Kartı ──────────────────────────────────────────────────────────────

interface CardProps {
  card: KanbanCard;
  onPress: () => void;
  onRoute?: () => void;
  isManager: boolean;
}

function KanbanCardView({ card, onPress, onRoute, isManager }: CardProps) {
  const { text: dLabel, color: dColor } = daysLabel(card.delivery_date);
  const stageColor = STAGE_COLORS[card.stage_status ?? ''] ?? '#94A3B8';
  const stageLabel = STAGE_LABELS[card.stage_status ?? ''] ?? '—';
  const isActive   = card.stage_status === 'aktif';
  const isOverdue  = new Date(card.delivery_date + 'T00:00:00') < new Date() && card.stage_status !== 'tamamlandi';

  return (
    <TouchableOpacity
      style={[
        cs.card,
        isOverdue && cs.cardOverdue,
        isActive  && cs.cardActive,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* ACİL bandı */}
      {card.is_rush && (
        <View style={cs.rushBand}>
          <Text style={cs.rushText}>⚡ ACİL</Text>
        </View>
      )}

      {/* Üst meta: durum + sipariş no */}
      <View style={cs.topRow}>
        <View style={[cs.stagePill, { backgroundColor: stageColor + '20' }]}>
          <View style={[cs.stageDot, { backgroundColor: stageColor }]} />
          <Text style={[cs.stageLabel, { color: stageColor }]}>{stageLabel}</Text>
        </View>
        <Text style={cs.orderNum}>#{card.order_number}</Text>
      </View>

      {/* İş türü */}
      <Text style={cs.workType} numberOfLines={1}>{card.work_type}</Text>

      {/* Hekim */}
      {card.doctor_name && (
        <Text style={cs.doctorLine} numberOfLines={1}>{card.doctor_name}</Text>
      )}

      {/* Teknisyen */}
      <View style={cs.techRow}>
        <AppIcon name="account-outline" set="mci" size={13} color="#64748B" />
        <Text style={cs.techName} numberOfLines={1}>
          {card.technician_name ?? 'Atanmadı'}
        </Text>
        {isActive && (
          <Text style={cs.timer}>{elapsed(card.stage_started_at)}</Text>
        )}
      </View>

      {/* Alt kısım: kutu + teslim tarihi */}
      <View style={cs.footer}>
        {card.box_code ? (
          <View style={cs.boxPill}>
            <AppIcon name="cube-outline" set="mci" size={11} color="#475569" />
            <Text style={cs.boxCode}>{card.box_code}</Text>
          </View>
        ) : <View />}

        <Text style={[cs.daysLabel, { color: isOverdue ? '#EF4444' : dColor }]}>
          {dLabel}
        </Text>
      </View>

      {/* Rota Ata butonu — sadece mesul müdür */}
      {isManager && (
        <TouchableOpacity
          style={cs.routeBtn}
          onPress={(e) => { (e as any).stopPropagation?.(); onRoute?.(); }}
          activeOpacity={0.75}
        >
          <AppIcon name="sitemap-outline" set="mci" size={12} color="#16A34A" />
          <Text style={cs.routeBtnText}>Rotayı Düzenle</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Kolon ─────────────────────────────────────────────────────────────────────

function KanbanColumnView({
  column,
  colWidth,
  isWide,
  isManager,
  onCardPress,
  onRoutePress,
}: {
  column: KanbanColumn;
  colWidth: number;
  isWide: boolean;
  isManager: boolean;
  onCardPress: (card: KanbanCard) => void;
  onRoutePress: (card: KanbanCard) => void;
}) {
  const activeCount = column.cards.filter(c => c.stage_status === 'aktif').length;

  return (
    <View style={[cols.column, isWide ? { flex: 1 } : { width: colWidth }]}>
      {/* Kolon başlığı */}
      <View style={cols.header}>
        <View style={[cols.colorBar, { backgroundColor: column.station_color }]} />
        <Text style={cols.title} numberOfLines={1}>{column.station_name}</Text>
        <View style={cols.badges}>
          {activeCount > 0 && (
            <View style={cols.activeBadge}>
              <Text style={cols.activeBadgeText}>{activeCount} aktif</Text>
            </View>
          )}
          <View style={[cols.countBadge, { backgroundColor: column.station_color + '20' }]}>
            <Text style={[cols.countText, { color: column.station_color }]}>
              {column.cards.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Renkli çizgi */}
      <View style={[cols.divider, { backgroundColor: column.station_color }]} />

      {/* Kartlar */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cols.cards}
        style={isWide ? { flex: 1 } : undefined}
      >
        {column.cards.length === 0 ? (
          <View style={cols.empty}>
            <Text style={cols.emptyText}>Boş istasyon</Text>
          </View>
        ) : (
          column.cards.map(card => (
            <KanbanCardView
              key={card.id}
              card={card}
              isManager={isManager}
              onPress={() => onCardPress(card)}
              onRoute={() => onRoutePress(card)}
            />
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function ProductionKanbanScreen() {
  const router  = useRouter();
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktopWidth = width >= 900;
  const isEmbedded = useContext(HubContext);

  const { columns, loading, error, lastSync, refresh } = useKanbanData(profile?.lab_id);
  const [refreshing, setRefreshing] = useState(false);

  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  const totalActive = useMemo(
    () => columns.reduce((s, c) => s + c.cards.filter(x => x.stage_status === 'aktif').length, 0),
    [columns],
  );
  const totalOrders = useMemo(
    () => columns.reduce((s, c) => s + c.cards.length, 0),
    [columns],
  );

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function onCardPress(card: KanbanCard) {
    router.push(`/(lab)/order/${card.id}` as any);
  }

  function onRoutePress(card: KanbanCard) {
    router.push(`/(lab)/order/route/${card.id}` as any);
  }

  // Kolon genişliği hesabı
  const available = width - BOARD_PAD * 2 - COL_GAP * Math.max(columns.length - 1, 0);
  const isWide    = columns.length > 0 && available / columns.length >= COL_WIDTH;
  const colWidth  = isWide ? available / columns.length : COL_WIDTH;

  return (
    <SafeAreaView style={s.container} edges={isEmbedded ? ([] as any) : ['top']}>
      {/* ── Başlık ── */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Üretim Panosu</Text>
          <Text style={s.subtitle}>
            {totalOrders} iş emri · {totalActive} aktif
            {lastSync && (
              <Text style={s.syncTime}>
                {' '}· {lastSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
          <AppIcon name="refresh-cw" size={18} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* ── İçerik ── */}
      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={s.loadingText}>Yükleniyor…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <AppIcon name="alert-circle-outline" set="mci" size={40} color="#EF4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={refresh}>
            <Text style={s.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : columns.length === 0 ? (
        <View style={s.center}>
          <AppIcon name="clipboard-list-outline" set="mci" size={48} color="#CBD5E1" />
          <Text style={s.emptyTitle}>Aktif İş Emri Yok</Text>
          <Text style={s.emptySubtitle}>
            İş emirleri istasyonlara atandığında burada görünür.
          </Text>
        </View>
      ) : isWide ? (
        // ── Masaüstü: yatay flex ──
        <View
          style={[s.board, { flexDirection: 'row', padding: BOARD_PAD, gap: COL_GAP }]}
        >
          {columns.map(col => (
            <KanbanColumnView
              key={col.station_name}
              column={col}
              colWidth={colWidth}
              isWide={isWide}
              isManager={isManager}
              onCardPress={onCardPress}
              onRoutePress={onRoutePress}
            />
          ))}
        </View>
      ) : (
        // ── Mobil: yatay scroll ──
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === 'web'}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: BOARD_PAD, gap: COL_GAP, flexDirection: 'row' }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />
          }
        >
          {columns.map(col => (
            <KanbanColumnView
              key={col.station_name}
              column={col}
              colWidth={colWidth}
              isWide={false}
              isManager={isManager}
              onCardPress={onCardPress}
              onRoutePress={onRoutePress}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title:     { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  subtitle:  { fontSize: 13, color: '#64748B', marginTop: 2 },
  syncTime:  { color: '#CBD5E1' },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },

  board: { flex: 1 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  loadingText: { fontSize: 14, color: '#94A3B8' },
  errorText:   { fontSize: 14, color: '#EF4444', textAlign: 'center' },
  retryBtn: {
    backgroundColor: ACCENT, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText:    { color: '#fff', fontWeight: '700' },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: '#475569' },
  emptySubtitle:{ fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },
});

// Kolon stilleri
const cols = StyleSheet.create({
  column:  { flexShrink: 0, gap: 0 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: 8,
  },
  colorBar: { width: 4, height: 18, borderRadius: 2 },
  title: { fontSize: 13, fontWeight: '700', color: '#1E293B', flex: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeBadge: {
    backgroundColor: '#2563EB15', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 3, borderRadius: 2, marginBottom: 10, opacity: 0.5 },
  cards:  { gap: 8 },
  empty: {
    alignItems: 'center', paddingVertical: 32,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderStyle: 'dashed', borderRadius: 12,
  },
  emptyText: { fontSize: 13, color: '#94A3B8' },
});

// Kart stilleri
const cs = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    gap: 4,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardActive: {
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB', shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardOverdue: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },

  // ACİL bandı
  rushBand: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start', marginBottom: 2,
  },
  rushText: { fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.3 },

  // Üst satır
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 6,
  },
  stagePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  stageDot:   { width: 6, height: 6, borderRadius: 3 },
  stageLabel: { fontSize: 10, fontWeight: '700' },
  orderNum:   { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // İçerik
  workType:   { fontSize: 12, color: '#64748B', fontWeight: '500' },
  doctorLine: { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  // Teknisyen satırı
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  techName: { fontSize: 12, color: '#64748B', flex: 1 },
  timer:    { fontSize: 12, fontWeight: '700', color: '#2563EB', fontVariant: ['tabular-nums'] },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 4,
  },
  boxPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F1F5F9', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  boxCode:   { fontSize: 10, fontWeight: '700', color: '#475569' },
  daysLabel: { fontSize: 11, fontWeight: '600' },

  // Rota butonu
  routeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, paddingVertical: 5,
    backgroundColor: '#F0FDF4', borderRadius: 7,
    justifyContent: 'center',
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  routeBtnText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
});
