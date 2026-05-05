/**
 * KanbanBoard — Patterns design language (NativeWind)
 *
 * Stage-based kanban — her kolon bir üretim aşaması.
 * Cream page bg + beyaz kolon kartları + Patterns tipografi.
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Flame, ChevronRight, Clock } from 'lucide-react-native';
import { WorkOrder, WorkOrderStatus } from '../types';
import { STATUS_CONFIG, isOrderOverdue, getNextStatus } from '../constants';
import { STAGE_LABEL, STAGE_COLOR, legacyStatusToStage, type Stage } from '../stages';

// ── Display font ────────────────────────────────────────────────────
const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const };

// ── Stage columns ───────────────────────────────────────────────────
const STAGE_COLUMNS: Stage[] = [
  'TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC', 'SHIPPED',
];

function getOrderStage(order: WorkOrder): Stage {
  const stageName = (order as any).current_stage_name as string | null | undefined;
  if (stageName) {
    const upper = stageName.toUpperCase();
    const found = STAGE_COLUMNS.find(s => upper.includes(s));
    if (found) return found;
  }
  return legacyStatusToStage(order.status);
}

// ── Helpers ──────────────────────────────────────────────────────────
function deliveryText(d: string, status: WorkOrderStatus): { text: string; color: string } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', color: '#6B6B6B' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(d + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)   return { text: `${Math.abs(diff)}g gecikti`, color: '#DC2626' };
  if (diff === 0) return { text: 'Bugün',       color: '#D97706' };
  if (diff === 1) return { text: 'Yarın',       color: '#D97706' };
  if (diff <= 3)  return { text: `${diff} gün`,  color: '#D97706' };
  if (diff <= 7)  return { text: `${diff} gün`,  color: '#1A1A1A' };
  return { text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), color: '#6B6B6B' };
}

function getInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

// ── Props ────────────────────────────────────────────────────────────
interface Props {
  orders: WorkOrder[];
  userGroup: '(lab)' | '(doctor)' | '(admin)';
  onStatusAdvance?: (order: WorkOrder) => void;
}

// ═══════════════════════════════════════════════════════════════════════
// BOARD
// ═══════════════════════════════════════════════════════════════════════
export function KanbanBoard({ orders, userGroup, onStatusAdvance }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const BOARD_PAD = 12;
  const COL_GAP   = 8;
  const MIN_COL_W = 220;
  const numCols   = STAGE_COLUMNS.length;
  const available = width - BOARD_PAD * 2 - COL_GAP * (numCols - 1);
  const colWidth  = Math.max(MIN_COL_W, available / numCols);
  const isWide    = available / numCols >= MIN_COL_W;

  const byStage = STAGE_COLUMNS.reduce<Record<Stage, WorkOrder[]>>(
    (acc, s) => { acc[s] = orders.filter(o => getOrderStage(o) === s); return acc; },
    {} as Record<Stage, WorkOrder[]>,
  );

  const columnViews = STAGE_COLUMNS.map(stage => {
    const col    = byStage[stage] ?? [];
    const accent = STAGE_COLOR[stage];
    const label  = STAGE_LABEL[stage];

    return (
      <View
        key={stage}
        className="bg-white rounded-2xl overflow-hidden"
        style={[
          isWide ? { flex: 1 } : { width: colWidth },
          { borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
        ]}
      >
        {/* Column header */}
        <View className="flex-row items-center justify-between px-3 pt-3 pb-2">
          <View className="flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
            <Text
              className="uppercase"
              style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: '#6B6B6B' }}
            >
              {label}
            </Text>
          </View>
          <View
            className="px-1.5 py-0.5 rounded"
            style={{ backgroundColor: accent + '18' }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>
              {col.length}
            </Text>
          </View>
        </View>

        {/* Accent bar */}
        <View style={{ height: 2, backgroundColor: accent, opacity: 0.3 }} />

        {/* Cards */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 6, gap: 6, paddingBottom: 16 }}
          style={isWide ? { flex: 1 } : undefined}
        >
          {col.length === 0 ? (
            <View
              className="items-center py-8 rounded-xl border border-dashed"
              style={{ borderColor: 'rgba(0,0,0,0.1)' }}
            >
              <Text className="text-[12px] text-ink-400">Sipariş yok</Text>
            </View>
          ) : (
            col.map(order => (
              <KanbanCard
                key={order.id}
                order={order}
                userGroup={userGroup}
                accent={accent}
                onPress={() => router.push(`/${userGroup}/order/${order.id}` as any)}
                onAdvance={onStatusAdvance ? () => onStatusAdvance(order) : undefined}
              />
            ))
          )}
        </ScrollView>
      </View>
    );
  });

  if (isWide) {
    return (
      <View
        className="flex-1 flex-row"
        style={{ padding: BOARD_PAD, gap: COL_GAP }}
      >
        {columnViews}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ padding: BOARD_PAD, gap: COL_GAP, alignItems: 'flex-start' }}
    >
      {columnViews}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// KANBAN CARD — Patterns tasarım dili
// ═══════════════════════════════════════════════════════════════════════
function KanbanCard({
  order, userGroup, accent, onPress, onAdvance,
}: {
  order: WorkOrder;
  userGroup: string;
  accent: string;
  onPress: () => void;
  onAdvance?: () => void;
}) {
  const overdue    = isOrderOverdue(order.delivery_date, order.status);
  const nextStatus = getNextStatus(order.status);
  const { text: dateText, color: dateColor } = deliveryText(order.delivery_date, order.status);
  const doctorName = order.doctor?.full_name ?? '';
  const initials   = doctorName ? getInitials(doctorName) : '?';
  const patientName = order.patient_name ?? '—';

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-xl p-3 gap-2"
      style={[
        { borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
        // @ts-ignore web hover
        Platform.OS === 'web' ? { cursor: 'pointer', transition: 'box-shadow 0.15s' } as any : undefined,
      ]}
    >
      {/* Top row: order number + urgent + delivery */}
      <View className="flex-row items-center gap-1.5">
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B6B6B' }}>
          #{order.order_number}
        </Text>
        {order.is_urgent && (
          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(217,119,6,0.12)' }}>
            <Flame size={9} color="#D97706" strokeWidth={2.4} />
          </View>
        )}
        <View className="flex-1" />
        <View className="flex-row items-center gap-1">
          <Clock size={10} color={dateColor} strokeWidth={1.8} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: dateColor }}>
            {dateText}
          </Text>
        </View>
      </View>

      {/* Patient name — primary */}
      <Text
        className="text-[13px] font-medium text-ink-900"
        style={overdue ? { color: '#DC2626' } : undefined}
        numberOfLines={1}
      >
        {patientName}
      </Text>

      {/* Work type — secondary */}
      <Text className="text-[11px] text-ink-500" numberOfLines={1}>
        {order.work_type}
      </Text>

      {/* Footer: doctor avatar + teeth count */}
      <View className="flex-row items-center justify-between mt-0.5">
        <View className="flex-row items-center gap-2">
          {doctorName ? (
            <View className="flex-row items-center gap-1.5">
              <View
                className="w-5 h-5 rounded-full items-center justify-center"
                style={{ backgroundColor: accent + '20' }}
              >
                <Text style={{ fontSize: 8, fontWeight: '600', color: accent }}>
                  {initials}
                </Text>
              </View>
              <Text className="text-[10px] text-ink-500" numberOfLines={1}>
                {doctorName.split(' ')[0]}
              </Text>
            </View>
          ) : null}
        </View>

        {order.tooth_numbers.length > 0 && (
          <View className="flex-row items-center gap-1">
            <View className="px-1.5 py-0.5 rounded bg-ink-50">
              <Text className="text-[9px] font-semibold text-ink-500">
                {order.tooth_numbers.length} diş
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Advance button */}
      {(userGroup === '(lab)' || userGroup === '(admin)') && nextStatus && onAdvance && (
        <Pressable
          onPress={e => { (e as any).stopPropagation?.(); onAdvance(); }}
          className="flex-row items-center justify-center gap-1 py-1.5 rounded-lg mt-0.5"
          style={{ backgroundColor: accent + '12' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>
            {order.status === 'alindi' ? 'Başlat' : 'İlerlet'}
          </Text>
          <ChevronRight size={12} color={accent} strokeWidth={2} />
        </Pressable>
      )}
    </Pressable>
  );
}
