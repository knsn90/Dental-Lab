import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Platform } from 'react-native';

import { AppIcon } from '../../../core/ui/AppIcon';

interface Props {
  panelType: string;
  accentColor: string;
}

interface NotifToggle {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub: string;
}

const NOTIF_ITEMS: NotifToggle[] = [
  { key: 'new_order',    icon: 'clipboard',     label: 'Yeni Sipariş',         sub: 'Yeni iş emri geldiğinde bildirim al' },
  { key: 'order_status', icon: 'refresh-cw',    label: 'Sipariş Durumu',       sub: 'Sipariş durumu değiştiğinde bildirim al' },
  { key: 'chat',         icon: 'message-circle', label: 'Mesajlar',             sub: 'Yeni mesaj geldiğinde bildirim al' },
  { key: 'approval',     icon: 'check-circle',  label: 'Onay Bekleyenler',     sub: 'Onay gerektiren işlem olduğunda bildirim al' },
  { key: 'payment',      icon: 'credit-card',   label: 'Ödeme & Fatura',       sub: 'Ödeme ve fatura bildirimleri' },
  { key: 'stock',        icon: 'package',       label: 'Stok Uyarıları',       sub: 'Stok kritik seviyeye düştüğünde bildirim al' },
];

export function NotificationsSection({ accentColor }: Props) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIF_ITEMS.map((n) => [n.key, true]))
  );

  function toggle(key: string) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Bildirim Tercihleri</Text>
          <Text style={s.cardSub}>
            Hangi bildirimleri almak istediğinizi yönetin.
          </Text>
        </View>
        {NOTIF_ITEMS.map((item, i) => (
          <React.Fragment key={item.key}>
            <View style={s.row}>
              <View style={[s.iconBox, { backgroundColor: accentColor + '15' }]}>
                <AppIcon name={item.icon} size={15} color={accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{item.label}</Text>
                <Text style={s.rowSub}>{item.sub}</Text>
              </View>
              <Switch
                value={toggles[item.key]}
                onValueChange={() => toggle(item.key)}
                trackColor={{ false: '#FFFFFF', true: '#FFFFFF' }}
                thumbColor={toggles[item.key] ? accentColor : '#CBD5E1'}
                ios_backgroundColor="#FFFFFF"
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16 } as any}
              />
            </View>
            {i < NOTIF_ITEMS.length - 1 && <View style={s.divider} />}
          </React.Fragment>
        ))}
      </View>

      <View style={[s.notice, { borderColor: '#F59E0B40', backgroundColor: '#FFFBEB' }]}>
        <AppIcon name="alert-triangle" size={14} color="#D97706" style={{ marginTop: 1 }} />
        <Text style={[s.noticeText, { color: '#92400E' }]}>
          Bildirimler şu an yalnızca uygulama içi olarak desteklenmektedir. Push bildirimi altyapısı yakında eklenecektir.
        </Text>
      </View>
    </ScrollView>
  );
}

const CARD_SHADOW = Platform.select({
  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
});

const s = StyleSheet.create({
  container: {
    padding: 0,
    paddingBottom: 24,
    gap: 14,
  },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    paddingBottom: 6,
    ...CARD_SHADOW,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 62,
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
