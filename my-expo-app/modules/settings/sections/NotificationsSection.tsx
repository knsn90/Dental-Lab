/**
 * NotificationsSection — Patterns Design Language (NativeWind)
 * ─────────────────────────────────────────────────────────────
 * Ayarlar > Bildirimler sekmesi.
 * Her bildirim tipi için E-posta ve Uygulama toggle'ları.
 * Patterns FormToggle stili (custom View toggle).
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import {
  ClipboardList, RefreshCw, MessageCircle, CheckCircle,
  CreditCard, Package, AlertTriangle, Mail, Smartphone,
} from 'lucide-react-native';

// ── Types ───────────────────────────────────────────────────────────────
interface Props {
  panelType: string;
  accentColor: string;
}

interface NotifItem {
  key: string;
  icon: any;
  label: string;
  sub: string;
}

// ── Notification items ──────────────────────────────────────────────────
const NOTIF_ITEMS: NotifItem[] = [
  { key: 'new_order',    icon: ClipboardList, label: 'Yeni Sipariş',       sub: 'Yeni iş emri geldiğinde' },
  { key: 'order_status', icon: RefreshCw,     label: 'Sipariş Durumu',     sub: 'Sipariş durumu değiştiğinde' },
  { key: 'chat',         icon: MessageCircle, label: 'Mesajlar',           sub: 'Yeni mesaj geldiğinde' },
  { key: 'approval',     icon: CheckCircle,   label: 'Onay Bekleyenler',   sub: 'Onay gerektiren işlem olduğunda' },
  { key: 'payment',      icon: CreditCard,    label: 'Ödeme & Fatura',     sub: 'Ödeme ve fatura bildirimleri' },
  { key: 'stock',        icon: Package,       label: 'Stok Uyarıları',     sub: 'Stok kritik seviyeye düştüğünde' },
];

// ── Shadow (patterns cardSolid) ─────────────────────────────────────────
const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const THUMB_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});

// ── Patterns FormToggle ─────────────────────────────────────────────────
function PatternsToggle({ on, onPress, accentColor }: { on: boolean; onPress: () => void; accentColor: string }) {
  return (
    <Pressable onPress={onPress} style={{ width: 44, height: 24, borderRadius: 999, backgroundColor: on ? accentColor : 'rgba(0,0,0,0.12)', padding: 2, justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF', alignSelf: on ? 'flex-end' : 'flex-start', ...THUMB_SHADOW }} />
    </Pressable>
  );
}

// ── Toggle channels ─────────────────────────────────────────────────────
type Channel = 'email' | 'app';

// ── Component ───────────────────────────────────────────────────────────
export function NotificationsSection({ accentColor }: Props) {
  const [toggles, setToggles] = useState<Record<string, Record<Channel, boolean>>>(
    Object.fromEntries(NOTIF_ITEMS.map(n => [n.key, { email: true, app: true }]))
  );

  const toggle = (key: string, channel: Channel) => {
    setToggles(prev => ({
      ...prev,
      [key]: { ...prev[key], [channel]: !prev[key][channel] },
    }));
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 0, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Bildirim Tercihleri kartı */}
      <View className="bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
        <Text
          className="text-ink-900 mb-1"
          style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 18, letterSpacing: -0.3 }}
        >
          Bildirim Tercihleri
        </Text>
        <Text className="text-[13px] text-ink-400 mb-4">
          Her bildirim türü için e-posta ve uygulama kanallarını ayrı ayrı yönetin.
        </Text>

        {/* Kolon başlıkları */}
        <View className="flex-row items-center mb-1 pl-12">
          <View className="flex-1" />
          <View className="flex-row items-center gap-1.5 w-16 justify-center">
            <Mail size={12} color="#9A9A9A" strokeWidth={1.6} />
            <Text className="text-[10px] font-semibold text-ink-400 tracking-wider" numberOfLines={1}>E-posta</Text>
          </View>
          <View className="flex-row items-center gap-1.5 w-16 justify-center">
            <Smartphone size={12} color="#9A9A9A" strokeWidth={1.6} />
            <Text className="text-[10px] font-semibold text-ink-400 tracking-wider" numberOfLines={1}>Uygulama</Text>
          </View>
        </View>

        <View className="h-px bg-black/[0.04] mb-1" />

        {NOTIF_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const state = toggles[item.key];
          return (
            <React.Fragment key={item.key}>
              <View className="flex-row items-center gap-3 py-3">
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${accentColor}14` }}
                >
                  <Icon size={16} color={accentColor} strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-ink-900 mb-0.5">{item.label}</Text>
                  <Text className="text-[12px] text-ink-400">{item.sub}</Text>
                </View>
                {/* E-posta toggle */}
                <View className="w-16 items-center">
                  <PatternsToggle on={state.email} onPress={() => toggle(item.key, 'email')} accentColor={accentColor} />
                </View>
                {/* Uygulama toggle */}
                <View className="w-16 items-center">
                  <PatternsToggle on={state.app} onPress={() => toggle(item.key, 'app')} accentColor={accentColor} />
                </View>
              </View>
              {i < NOTIF_ITEMS.length - 1 && (
                <View className="h-px bg-black/[0.04]" style={{ marginLeft: 48 }} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Uyarı notu */}
      <View
        className="flex-row gap-3 rounded-2xl p-4 mt-4"
        style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' }}
      >
        <AlertTriangle size={15} color="#D97706" strokeWidth={1.8} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[13px] leading-5" style={{ color: '#92400E' }}>
          E-posta bildirimleri yakında aktif edilecektir. Şu an yalnızca uygulama içi bildirimler desteklenmektedir.
        </Text>
      </View>
    </ScrollView>
  );
}
