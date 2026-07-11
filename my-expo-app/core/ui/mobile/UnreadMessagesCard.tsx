// Dashboard "Mesajlar" kartı — okunmamış mesajları öne çıkarır.
// Panel-agnostik: accent prop'u ile her panel kendi rengini verir (belirgin ama sade).
// Veriyi useOrderChatInbox'tan çeker (realtime); mesaj yoksa hiç render etmez.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MessageCircle, ChevronRight } from 'lucide-react-native';
import { useMobileTokens } from '../../theme/mobileDesignTokens';
import { useOrderChatInbox } from '../../../modules/orders/hooks/useOrderChatInbox';

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
  return `${Math.floor(diff / 86400)} g`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UnreadMessagesCard({
  accent,
  onOpenOrder,
  onOpenInbox,
}: {
  accent: string;
  onOpenOrder?: (workOrderId: string) => void;
  onOpenInbox?: () => void;
}) {
  const T = useMobileTokens();
  const { items, totalUnread } = useOrderChatInbox();

  if (!items || items.length === 0) return null;

  // Okunmamışı olanlar önce, sonra en yeni mesaja göre — ilk 3'ü göster
  const sorted = [...items].sort((a, b) => {
    const ua = a.unread_for_me > 0 ? 1 : 0;
    const ub = b.unread_for_me > 0 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (b.last_created_at ?? '').localeCompare(a.last_created_at ?? '');
  });
  const top = sorted.slice(0, 3);
  const tint = `${accent}1A`;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ borderRadius: 22, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        {/* Başlık */}
        <Pressable
          onPress={onOpenInbox}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={16} color={accent} strokeWidth={2.2} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, letterSpacing: 0.2 }}>Mesajlar</Text>
          {totalUnread > 0 && (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <ChevronRight size={18} color={T.ink3} strokeWidth={2} />
        </Pressable>

        {/* Konuşmalar */}
        {top.map((it, i) => {
          const title = it.patient_name || it.order_number || 'Sipariş';
          const unread = it.unread_for_me > 0;
          return (
            <Pressable
              key={it.work_order_id}
              onPress={() => onOpenOrder?.(it.work_order_id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingHorizontal: 16, paddingVertical: 11,
                borderTopWidth: 1, borderTopColor: T.hairline,
                backgroundColor: unread ? tint : 'transparent',
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: unread ? accent : T.bgDeep, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: unread ? '#FFFFFF' : T.ink2 }}>{initials(it.last_sender_name || title)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: unread ? '700' : '600', color: T.ink, flex: 1 }} numberOfLines={1}>{title}</Text>
                  <Text style={{ fontSize: 10.5, color: T.ink3 }}>{relTime(it.last_created_at)}</Text>
                </View>
                <Text style={{ fontSize: 12, color: unread ? T.ink2 : T.ink3, marginTop: 1 }} numberOfLines={1}>
                  {it.last_attachment_type ? '📎 Ek' : (it.last_content || '—')}
                </Text>
              </View>
              {unread && (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{it.unread_for_me}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
