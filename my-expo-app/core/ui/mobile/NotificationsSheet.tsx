// core/ui/mobile/NotificationsSheet.tsx
// Popover-style modal showing aggregated notifications:
//   • Onay bekleyen (pending design approvals)
//   • Geciken (overdue cases)
//   • Yaklaşan teslimler (upcoming due-soon)
//
// Each row is tappable → triggers `onOpenOrder(orderId)`.
// Empty state shown when no items at all.

import React from 'react';
import { autoT } from '../../i18n/autoTranslate';
import {
  View, Text, Pressable, ScrollView, Modal, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRTL } from '../../i18n';
import {
  X, FileCheck, Flame, Package, ChevronRight, ChevronLeft, BellOff,
  ShoppingCart, CreditCard, ClipboardCheck, MessageCircle, Truck, AlertCircle, Inbox, Wrench, AlarmClock, CheckCircle2, ClipboardList
} from 'lucide-react-native';
import { useMobileTokens, MOBILE_PANEL_THEMES, type MobilePanel } from '../../theme/mobileDesignTokens';
import { useNotifications, useNotificationsActions } from '../../store/notificationsStore';
import type { NotificationCategory } from '../../store/notificationPrefsStore';
import type { NotificationRow } from '../../store/notificationsStore';

export interface NotificationApproval {
  id: string;            // order_number or display id
  _id: string;           // db id for navigation
  patient: string;
  workType: string;
}

export interface NotificationOverdue {
  id: string;
  _id: string;
  patient: string;
  workType: string;
  /** days late, e.g. 2 → "2g geç" */
  daysLate: number;
}

export interface NotificationUpcoming {
  id: string;
  _id: string;
  patient: string;
  workType: string;
  /** "Bugün" / "Yarın" / "3g sonra" */
  remainLabel: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenOrder: (dbId: string) => void;
  panel?: MobilePanel;
  approvals?: NotificationApproval[];
  overdue?: NotificationOverdue[];
  upcoming?: NotificationUpcoming[];
  /** Custom section labels — defaults to "Onay bekleyen / Geciken / Yaklaşan teslimler" (doctor) */
  labels?: {
    approvals?: string;   // default: "Onay bekleyen"
    overdue?: string;     // default: "Geciken"
    upcoming?: string;    // default: "Yaklaşan teslimler"
  };
}

export function NotificationsSheet({
  visible, onClose, onOpenOrder,
  panel = 'doctor',
  approvals = [],
  overdue = [],
  upcoming = [],
  labels = {},
}: Props) {
  const approvalsLabel = labels.approvals ?? autoT('Onay bekleyen');
  const overdueLabel   = labels.overdue   ?? autoT('Geciken');
  const upcomingLabel  = labels.upcoming  ?? autoT('Yaklaşan teslimler');
  const T = useMobileTokens();
  const PANEL = MOBILE_PANEL_THEMES[panel];
  const insets = useSafeAreaInsets();

  // ── Real-time DB feed (yeni notifications altyapısı) ──────────────
  const { items: dbItems, unreadCount } = useNotifications();
  const { markRead, markAllRead } = useNotificationsActions();
  // Sadece okunmamışları üstte göster, son 30 ile sınırla
  const visibleDb = dbItems.slice(0, 30);
  const unreadDb  = visibleDb.filter(n => !n.read_at);

  const totalCount = unreadDb.length + approvals.length + overdue.length + upcoming.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Yarı saydam backdrop — tıklayınca kapanır */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.35)',
          paddingTop: Math.max(insets.top, 12) + 56, // bell ikonunun altına anchor
          paddingHorizontal: 12,
          alignItems: 'flex-end',
        }}
      >
        {/* İçeriğe tıklama backdrop'a propagate olmasın */}
        <Pressable
          onPress={(e: any) => e.stopPropagation?.()}
          style={{
            width: '100%',
            maxWidth: 380,
            maxHeight: '78%',
            borderRadius: 22,
            backgroundColor: T.bg,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: T.hairline,
            ...(Platform.OS === 'web' ? {
              boxShadow: '0 20px 48px rgba(15,23,42,0.22), 0 4px 12px rgba(15,23,42,0.08)',
            } as any : {}),
          }}
        >
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: T.hairline,
        }}>
          <View>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: T.ink3,
              letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.mono,
            }}>
              Bildirimler
            </Text>
            <Text style={{
              fontSize: 22, fontWeight: '500', color: T.ink, letterSpacing: -0.4, marginTop: 2,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }}>
              {totalCount > 0 ? `${totalCount} ${autoT('öğe')}` : autoT('Temiz')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {unreadCount > 0 ? (
              <Pressable
                onPress={() => { markAllRead(); }}
                hitSlop={8}
                style={({ pressed }: any) => ({
                  paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: pressed ? T.cardSoft : 'transparent',
                })}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: PANEL.primary, letterSpacing: -0.1 }}>
                  Tümünü okundu say
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }: any) => ({
                width: 36, height: 36, borderRadius: 12,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X size={18} color={T.ink} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── DB feed (yeni bildirimler — new_order / approval / payment / chat / ...) ── */}
          {visibleDb.length > 0 && (
            <Section
              icon={<Inbox size={14} color={PANEL.primary} strokeWidth={2} />}
              accent={PANEL.primary}
              label={autoT('Bildirimler')}
              count={unreadDb.length || visibleDb.length}
            >
              {visibleDb.map(n => {
                const cfg = CATEGORY_CFG[n.category as NotificationCategory] ?? CATEGORY_CFG.new_order;
                const Icon = cfg.icon;
                return (
                  <DbNotificationRow
                    key={n.id}
                    notif={n}
                    icon={<Icon size={18} color={cfg.color} strokeWidth={1.7} />}
                    iconBg={`${cfg.color}1A`}
                    onPress={() => {
                      if (!n.read_at) markRead(n.id);
                      onClose();
                      if (n.action_url) {
                        // resource_id'ye düş — eğer action_url order route'u ise dbId çıkar
                        if (n.resource_type === 'work_order' && n.resource_id) {
                          onOpenOrder(n.resource_id);
                          return;
                        }
                      }
                    }}
                  />
                );
              })}
            </Section>
          )}

          {/* Empty state */}
          {totalCount === 0 && (
            <View style={{
              marginTop: 40,
              alignItems: 'center',
              gap: 14,
              paddingHorizontal: 32,
            }}>
              <View style={{
                width: 64, height: 64, borderRadius: 22,
                backgroundColor: `${PANEL.primary}1A`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <BellOff size={28} color={PANEL.primary} strokeWidth={1.6} />
              </View>
              <Text style={{
                fontSize: 17, fontWeight: '600', color: T.ink, textAlign: 'center', letterSpacing: -0.2,
              }}>
                Şu an her şey yolunda
              </Text>
              <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', lineHeight: 18 }}>
                Bekleyen onay, geciken veya yaklaşan teslimat yok. Yeni bildirim olduğunda burada görünecek.
              </Text>
            </View>
          )}

          {/* ── Onay bekleyen ───────────────────────────────────────── */}
          {approvals.length > 0 && (
            <Section
              icon={<FileCheck size={14} color={PANEL.primary} strokeWidth={2} />}
              accent={PANEL.primary}
              label={approvalsLabel}
              count={approvals.length}
            >
              {approvals.map(a => (
                <NotificationRow
                  key={a.id}
                  patient={a.patient}
                  subtitle={a.workType}
                  trailing={autoT('Onay')}
                  trailingColor={PANEL.primary}
                  iconBg={`${PANEL.primary}1A`}
                  icon={<FileCheck size={18} color={PANEL.primary} strokeWidth={1.7} />}
                  onPress={() => { onClose(); onOpenOrder(a._id); }}
                />
              ))}
            </Section>
          )}

          {/* ── Geciken ─────────────────────────────────────────────── */}
          {overdue.length > 0 && (
            <Section
              icon={<Flame size={14} color={T.ruby} strokeWidth={2} />}
              accent={T.ruby}
              label={overdueLabel}
              count={overdue.length}
            >
              {overdue.map(o => (
                <NotificationRow
                  key={o.id}
                  patient={o.patient}
                  subtitle={o.workType}
                  trailing={`${o.daysLate}${autoT('g geç')}`}
                  trailingColor={T.ruby}
                  iconBg={T.rubySoft}
                  icon={<Flame size={18} color={T.ruby} strokeWidth={1.7} />}
                  onPress={() => { onClose(); onOpenOrder(o._id); }}
                />
              ))}
            </Section>
          )}

          {/* ── Yaklaşan teslimler ──────────────────────────────────── */}
          {upcoming.length > 0 && (
            <Section
              icon={<Package size={14} color={T.ink2} strokeWidth={2} />}
              accent={T.ink2}
              label={upcomingLabel}
              count={upcoming.length}
            >
              {upcoming.map(u => (
                <NotificationRow
                  key={u.id}
                  patient={u.patient}
                  subtitle={u.workType}
                  trailing={u.remainLabel}
                  trailingColor={T.ink}
                  iconBg={T.cardSoft}
                  icon={<Package size={18} color={T.ink2} strokeWidth={1.7} />}
                  onPress={() => { onClose(); onOpenOrder(u._id); }}
                />
              ))}
            </Section>
          )}
        </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Section header + container ────────────────────────────────────────────
function Section({
  icon, accent, label, count, children,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const T = useMobileTokens();
  return (
    <View>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 6, marginBottom: 8,
      }}>
        {icon}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: T.ink2,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {label}
        </Text>
        <View style={{
          backgroundColor: `${accent}1F`,
          paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: 999,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.3 }}>
            {count}
          </Text>
        </View>
      </View>
      <View style={{
        backgroundColor: T.card,
        borderRadius: 18,
        borderWidth: 1, borderColor: T.hairline,
        overflow: 'hidden',
      }}>
        {children}
      </View>
    </View>
  );
}

// ── Individual notification row ───────────────────────────────────────────
function NotificationRow({
  icon, iconBg, patient, subtitle, trailing, trailingColor, onPress,
}: {
  icon: React.ReactNode;
  iconBg: string;
  patient: string;
  subtitle: string;
  trailing: string;
  trailingColor: string;
  onPress: () => void;
}) {
  const T = useMobileTokens();
  // Satır sonu chevron'u yön bildirir → RTL'de aynalanır
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }: any) => (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          opacity: pressed ? 0.6 : 1,
          borderBottomWidth: 1,
          borderBottomColor: T.hairline,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: iconBg,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ fontSize: 14, fontWeight: '600', color: T.ink, letterSpacing: -0.1, flexShrink: 1 }}
              numberOfLines={1}
            >
              {patient}
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: trailingColor, letterSpacing: -0.1 }}>
              {trailing}
            </Text>
            <Chevron size={14} color={T.ink3} strokeWidth={1.8} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ── Category config — DB feed bildirimleri için icon + renk ────────────────
const CATEGORY_CFG: Record<NotificationCategory, { icon: any; color: string; label: string }> = {
  new_order:    { icon: ShoppingCart,    color: '#EA7A4C', label: 'Yeni Sipariş' },
  order_status: { icon: ClipboardCheck,  color: '#2563EB', label: 'Durum'        },
  chat:         { icon: MessageCircle,   color: '#7C3AED', label: 'Mesaj'        },
  approval:     { icon: FileCheck,       color: '#059669', label: 'Onay'         },
  payment:      { icon: CreditCard,      color: '#0891B2', label: 'Ödeme'        },
  stock:        { icon: AlertCircle,     color: '#D97706', label: 'Stok'         },
  delivery:     { icon: Truck,           color: '#0D9488', label: 'Kurye'        },
  paper_order:      { icon: Package,    color: '#9333EA', label: 'Kağıt İş'   },
  material_request: { icon: Wrench,     color: '#D97706', label: 'Malzeme'    },
  order_watch:      { icon: AlarmClock, color: '#DC2626', label: 'İş Takibi'  },
  stage_critical:   { icon: CheckCircle2, color: '#0C8F56', label: 'Kritik Aşama' },
  stock_count:      { icon: ClipboardList, color: '#7C3AED', label: 'Stok Sayımı'  },
};

// ── DB feed satırı — okunmamış vurgusu + relative time ─────────────────────
function DbNotificationRow({ notif, icon, iconBg, onPress }: {
  notif: NotificationRow;
  icon: React.ReactNode;
  iconBg: string;
  onPress: () => void;
}) {
  const T = useMobileTokens();
  const unread = !notif.read_at;
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }: any) => (
        <View style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          opacity: pressed ? 0.6 : 1,
          backgroundColor: unread ? `${T.ink}05` : 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: T.hairline,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: iconBg,
            alignItems: 'center', justifyContent: 'center',
            marginTop: 1,
          }}>
            {icon}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 14, fontWeight: unread ? '500' : '400',
                  color: T.ink, letterSpacing: -0.1, flexShrink: 1,
                }}
                numberOfLines={2}
              >
                {notif.title}
              </Text>
              {unread ? (
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#EA7A4C', flexShrink: 0 }} />
              ) : null}
            </View>
            {notif.body ? (
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 3, lineHeight: 16 }} numberOfLines={2}>
                {notif.body}
              </Text>
            ) : null}
            <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 5, letterSpacing: 0.2 }}>
              {fmtRelative(notif.created_at)}
            </Text>
          </View>
          <Chevron size={14} color={T.ink3} strokeWidth={1.8} style={{ marginTop: 14 }} />
        </View>
      )}
    </Pressable>
  );
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min  = Math.floor(diff / 60_000);
  if (min < 1)    return autoT('Az önce');
  if (min < 60)   return `${min} ${autoT('dk önce')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24)    return `${hr} ${autoT('sa önce')}`;
  const dd = Math.floor(hr / 24);
  if (dd < 7)     return `${dd} ${autoT('gün önce')}`;
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
