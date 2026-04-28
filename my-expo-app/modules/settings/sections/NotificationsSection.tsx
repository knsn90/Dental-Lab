import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';

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
      <Text style={s.sectionTitle}>Bildirim Tercihleri</Text>
      <Text style={s.sectionSub}>
        Hangi bildirimleri almak istediğinizi yönetin.
      </Text>

      <View style={s.card}>
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
                trackColor={{ false: '#E2E8F0', true: accentColor + '60' }}
                thumbColor={toggles[item.key] ? accentColor : '#94A3B8'}
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

const s = StyleSheet.create({
  container: {
    padding: 28,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 20,
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
