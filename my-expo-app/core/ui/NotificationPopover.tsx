// core/ui/NotificationPopover.tsx
// "Cards" tasarımıyla beyaz bildirim popover'ı.
// - Bell ikonuna tıklayınca açılır (üst köşeye anchored — LTR'de sağ, RTL'de sol)
// - Geciken iş emirlerini + atanmamış işleri listeler
// - Click-outside ile kapanır (Modal overlay)
// - Okunmamışlar için solunda küçük renk noktası

import React, { useMemo } from 'react';
import { isRTL } from '../i18n';
import { autoT } from '../i18n/autoTranslate';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from './AppIcon';
import { useOrders } from '../../modules/orders/hooks/useOrders';
import type { WorkOrder } from '../../modules/orders/types';
import { useNotifications, useNotificationsActions, type NotificationRow as DbNotifRow } from '../store/notificationsStore';
import { useThemeModeStore } from '../store/themeModeStore';

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
  /** Satır-sonu kenarından uzaklık: LTR'de sağdan, RTL'de soldan. Zil ikonu
   *  da aynalandığı için popover onunla aynı tarafta açılmalı. */
  anchorEnd?:    number;
  /** Hangi panelin route'larına yönlendirsin — default lab */
  panel?:       'lab' | 'admin' | 'doctor' | 'clinic';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NotificationPopover({
  visible,
  onClose,
  anchorTop   = 60,
  anchorEnd   = 16,
  panel       = 'lab',
}: NotificationPopoverProps) {
  const router = useRouter();
  const { orders } = useOrders(panel === 'doctor' ? 'doctor' : 'lab');
  const routePrefix = `/(${panel})` as const;
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const t = useMemo(() => paletteForTheme(isDark), [isDark]);

  // DB feed (yeni bildirimler — new_order / approval / payment / ...)
  const { items: dbItems, unreadCount: dbUnread } = useNotifications();
  const { markRead, markAllRead } = useNotificationsActions();

  // Badge davranışı: popover AÇILINCA okunmamışlar otomatik okundu sayılır
  // → rozet sıfırlanır. (Açılışta bir kez; kapanınca tekrar tetiklenebilsin diye
  // ref sıfırlanır.) Liste yine tüm bildirimleri gösterir.
  const didMarkRef = React.useRef(false);
  React.useEffect(() => {
    if (!visible) { didMarkRef.current = false; return; }
    if (!didMarkRef.current && dbUnread > 0) {
      didMarkRef.current = true;
      markAllRead();
    }
  }, [visible, dbUnread, markAllRead]);

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
          href:        `${routePrefix}/order/${o.id}`,
          unread:      true,
          tone:        'overdue',
        });
      }
    }
    // Planlama bekleyenler — yeni gelen, henüz triajı yapılmamış işler
    for (const o of orders ?? []) {
      if (o.status === 'alindi' && !(o as any).triaged_at) {
        const created = (o as any).created_at;
        const ageHours = created
          ? Math.floor((Date.now() - new Date(created).getTime()) / 3_600_000)
          : null;
        const ageLabel = ageHours == null ? '' :
          ageHours < 1 ? autoT('Az önce') :
          ageHours < 24 ? `${ageHours} ${autoT('saat önce')}` :
          `${Math.floor(ageHours / 24)} ${autoT('gün önce')}`;

        list.push({
          id:          `triage-${o.id}`,
          title:       `Planlama bekliyor: #${o.order_number}`,
          description: `${ageLabel} • ${o.patient_name ?? '—'} • ${o.work_type}`,
          href:        `${routePrefix}/order/${o.id}`,
          unread:      true,
          tone:        'warning',
        });
      }
    }
    return list.slice(0, 20);
  }, [orders, today]);

  const computedUnread = items.filter(i => i.unread).length;
  const totalUnread = dbUnread + computedUnread;
  const visibleDb = dbItems.slice(0, 30);
  const totalCount = visibleDb.length + items.length;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.backdrop, { backgroundColor: t.backdrop }]} onPress={onClose}>
        <Pressable
          style={[
            s.popover,
            { top: anchorTop, ...(isRTL() ? { left: anchorEnd } : { right: anchorEnd }),
              backgroundColor: t.surface, borderColor: t.hairline },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {/* Header */}
          <View style={[s.header, { borderBottomColor: t.hairline }]}>
            <View>
              <Text style={[s.title, { color: t.ink }]}>Bildirimler</Text>
              {totalUnread > 0 && (
                <Text style={[s.subtitle, { color: t.ink3 }]}>{totalUnread} okunmamış</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {dbUnread > 0 && (
                <TouchableOpacity onPress={() => markAllRead()} style={s.markAllBtn}>
                  <Text style={[s.markAllText, { color: t.link }]}>Tümünü okundu say</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: t.surfaceMuted }]} accessibilityLabel="Kapat">
                <AppIcon name={'close' as any} size={14} color={t.ink3} />
              </TouchableOpacity>
            </View>
          </View>

          {/* List */}
          {totalCount === 0 ? (
            <View style={s.empty}>
              <AppIcon name={'bell-off-outline' as any} size={28} color={t.ink3} />
              <Text style={[s.emptyText, { color: t.ink3 }]}>Yeni bildirim yok</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* DB feed bildirimleri — en üstte */}
              {visibleDb.map((n, i) => (
                <DbNotificationRow
                  key={n.id}
                  notif={n}
                  isLast={i === visibleDb.length - 1 && items.length === 0}
                  palette={t}
                  onPress={() => {
                    if (!n.read_at) markRead(n.id);
                    onClose();
                    if (n.action_url) router.push(n.action_url as any);
                  }}
                />
              ))}
              {/* Hesaplanan eski bildirimler — overdue/triage */}
              {items.map((it, i) => (
                <NotificationRow
                  key={it.id}
                  item={it}
                  isLast={i === items.length - 1}
                  palette={t}
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

// ─── DB Notification Row ─────────────────────────────────────────────────
function DbNotificationRow({ notif, isLast, onPress, palette }: {
  notif: DbNotifRow;
  isLast: boolean;
  onPress: () => void;
  palette: Palette;
}) {
  const unread = !notif.read_at;
  const accent = ACCENT_BY_CATEGORY[notif.category] ?? '#2563EB';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: palette.hairline },
        unread ? { backgroundColor: palette.unreadTint } : null,
      ]}
    >
      <View style={s.rowHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {unread && <View style={[s.dot, { backgroundColor: accent }]} />}
          <Text style={[s.rowTitle, { color: palette.ink, fontWeight: unread ? '600' : '500' }]} numberOfLines={1}>
            {notif.title}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: palette.ink3, letterSpacing: 0.2 }}>
          {fmtRelative(notif.created_at)}
        </Text>
      </View>
      {notif.body ? (
        <Text style={[s.rowDesc, { color: palette.ink2 }]} numberOfLines={2}>{notif.body}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const ACCENT_BY_CATEGORY: Record<string, string> = {
  new_order:        '#EA7A4C',
  order_status:     '#2563EB',
  chat:             '#7C3AED',
  approval:         '#059669',
  payment:          '#0891B2',
  stock:            '#D97706',
  delivery:         '#0D9488',
  paper_order:      '#9333EA',
  material_request: '#D97706',   // Malzeme talebi — Stok/Depo bölümüne ait
};

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const dd = Math.floor(hr / 24);
  if (dd < 7) return `${dd} gün`;
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function NotificationRow({
  item, isLast, onPress, palette,
}: {
  item: NotificationItemData;
  isLast: boolean;
  onPress: () => void;
  palette: Palette;
}) {
  const dotColor =
    item.tone === 'overdue' ? '#EF4444' :
    item.tone === 'warning' ? '#F59E0B' :
    '#2563EB';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[s.row, !isLast && { borderBottomWidth: 1, borderBottomColor: palette.hairline }]}
    >
      <View style={s.rowHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {item.unread && <View style={[s.dot, { backgroundColor: dotColor }]} />}
          <Text style={[s.rowTitle, { color: palette.ink }]} numberOfLines={1}>{item.title}</Text>
        </View>
        <AppIcon name={'chevron-right' as any} size={14} color={palette.ink3} />
      </View>
      <Text style={[s.rowDesc, { color: palette.ink2 }]} numberOfLines={2}>{item.description}</Text>
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
  markAllBtn: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
  },
  markAllText: {
    fontSize: 10.5, fontWeight: '600', color: '#2563EB', letterSpacing: -0.1,
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

// ─── Theme palette — dark/light aware ─────────────────────────────────
type Palette = {
  surface:      string;
  surfaceMuted: string;
  ink:          string;
  ink2:         string;
  ink3:         string;
  hairline:     string;
  link:         string;
  backdrop:     string;
  unreadTint:   string;
};

function paletteForTheme(isDark: boolean): Palette {
  if (isDark) {
    return {
      surface:      '#1B1916',
      surfaceMuted: '#141312',
      ink:          '#F7F2E9',
      ink2:         'rgba(247,242,233,0.78)',
      ink3:         'rgba(247,242,233,0.45)',
      hairline:     'rgba(255,255,255,0.08)',
      link:         '#7DAFFF',
      backdrop:     'rgba(0,0,0,0.45)',
      unreadTint:   'rgba(255,255,255,0.04)',
    };
  }
  return {
    surface:      '#FFFFFF',
    surfaceMuted: '#F8FAFC',
    ink:          '#0F172A',
    ink2:         '#64748B',
    ink3:         '#94A3B8',
    hairline:     '#F1F5F9',
    link:         '#2563EB',
    backdrop:     'rgba(15,23,42,0.10)',
    unreadTint:   'rgba(15,23,42,0.025)',
  };
}

export default NotificationPopover;
