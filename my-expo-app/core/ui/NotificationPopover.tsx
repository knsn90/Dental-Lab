// core/ui/NotificationPopover.tsx
// "Cards" tasarımıyla beyaz bildirim popover'ı.
// - Bell ikonuna tıklayınca açılır (sağ üst köşeye anchored)
// - Geciken iş emirlerini + atanmamış işleri listeler
// - Click-outside ile kapanır (Modal overlay)
// - Okunmamışlar için solunda küçük renk noktası

import React from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from './AppIcon';
import { useOrders } from '../../modules/orders/hooks/useOrders';
import type { WorkOrder } from '../../modules/orders/types';

export interface NotificationItemData {
  id:        string;
  title:     string;
  description: string;
  href?:     string;
  unread:    boolean;
  tone:      'overdue' | 'warning' | 'info';
}

interface NotificationPopoverProps {
  visible:    boolean;
  onClose:    () => void;
  /** Anchor için viewport-rel pozisyon — bell ikonunun yaklaşık konumu */
  anchorTop?:    number;
  anchorRight?:  number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NotificationPopover({
  visible,
  onClose,
  anchorTop   = 60,
  anchorRight = 16,
}: NotificationPopoverProps) {
  const router = useRouter();
  const { orders } = useOrders('lab');

  // ── Bildirim listesi: geciken + atanmamış + KK'da çok bekleyenler
  const today = new Date().toISOString().split('T')[0];
  const items: NotificationItemData[] = React.useMemo(() => {
    const list: NotificationItemData[] = [];
    for (const o of orders ?? []) {
      const isDelivered = o.status === 'teslim_edildi';
      if (!o.delivery_date || isDelivered) continue;
      const isOverdue = o.delivery_date < today;
      if (isOverdue) {
        const days = Math.ceil((new Date().getTime() - new Date(o.delivery_date + 'T00:00:00').getTime()) / 86_400_000);
        list.push({
          id:          `overdue-${o.id}`,
          title:       `Gecikmiş: #${o.order_number}`,
          description: `${days} gün gecikti · ${o.patient_name ?? '—'}`,
          href:        `/(lab)/order/${o.id}`,
          unread:      true,
          tone:        'overdue',
        });
      }
    }
    // Atanmamış işler
    for (const o of orders ?? []) {
      if (o.status === 'alindi' && !(o as any).assigned_to) {
        list.push({
          id:          `unassigned-${o.id}`,
          title:       `Atanmamış: #${o.order_number}`,
          description: `Teknisyen ataması bekliyor · ${o.patient_name ?? '—'}`,
          href:        `/(lab)/order/${o.id}`,
          unread:      true,
          tone:        'warning',
        });
      }
    }
    return list.slice(0, 20);
  }, [orders, today]);

  const unreadCount = items.filter(i => i.unread).length;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.popover, { top: anchorTop, right: anchorRight }]} onPress={(e) => e.stopPropagation?.()}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>Bildirimler</Text>
              {unreadCount > 0 && (
                <Text style={s.subtitle}>{unreadCount} okunmamış</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Kapat">
              <AppIcon name={'close' as any} size={14} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* List */}
          {items.length === 0 ? (
            <View style={s.empty}>
              <AppIcon name={'bell-off-outline' as any} size={28} color="#CBD5E1" />
              <Text style={s.emptyText}>Yeni bildirim yok</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {items.map((it, i) => (
                <NotificationRow
                  key={it.id}
                  item={it}
                  isLast={i === items.length - 1}
                  onPress={() => {
                    onClose();
                    if (it.href) router.push(it.href as any);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function NotificationRow({
  item, isLast, onPress,
}: {
  item: NotificationItemData;
  isLast: boolean;
  onPress: () => void;
}) {
  const dotColor =
    item.tone === 'overdue' ? '#EF4444' :
    item.tone === 'warning' ? '#F59E0B' :
    '#2563EB';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[s.row, !isLast && s.rowDivider]}
    >
      <View style={s.rowHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {item.unread && <View style={[s.dot, { backgroundColor: dotColor }]} />}
          <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <AppIcon name={'chevron-right' as any} size={14} color="#CBD5E1" />
      </View>
      <Text style={s.rowDesc} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.10)',
  },
  popover: {
    position: 'absolute',
    width: 360,
    maxHeight: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: '0 12px 40px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.06)',
      } as any,
      default: {
        shadowColor:   '#0F172A',
        shadowOpacity: 0.15,
        shadowRadius:  24,
        shadowOffset:  { width: 0, height: 8 },
        elevation:     12,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  subtitle: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    paddingVertical: 40, alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 12, color: '#94A3B8' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    flexShrink: 0,
  },
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#0F172A', letterSpacing: -0.1 },
  rowDesc:  { fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 15 },
});

export default NotificationPopover;
