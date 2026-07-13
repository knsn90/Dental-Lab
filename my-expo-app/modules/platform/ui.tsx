import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LayoutGrid, Building2, ScrollText, ShieldCheck, LogOut, LifeBuoy, Activity, Megaphone, CreditCard, Users, Settings, ShieldAlert, Plug } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';

// Platform konsolu — Siman ışık teması, "exec/admin" (Kobalt) kimliği.
export const C = {
  bg: '#F7F9FC', card: '#FFFFFF', cardHover: '#F1F5F9', line: 'rgba(15,23,42,0.08)',
  ink: '#172235', ink2: '#4C5A70', ink3: '#8494AD', accent: '#4771AB', accentDeep: '#314F7E',
  soft: '#EAF2FB', green: '#2D9A6B', amber: '#E89B2A', red: '#D94B4B', violet: '#8B5CB8',
};
export const FONT = Platform.OS === 'web' ? ('Inter Tight, Inter, system-ui, sans-serif' as any) : undefined;
// Kart gölgesi (design system cardLite) — web'de yumuşak derinlik
export const CARD_SHADOW = Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 6px 16px rgba(15,23,42,0.05)' } as any) : {};

export const planTone = (p: string) =>
  p === 'active' || p === 'pro' || p === 'enterprise' ? C.green : p === 'suspended' ? C.red : C.amber;

const NAV = [
  { key: '', label: 'Genel Bakış', icon: LayoutGrid, href: '/(platform)' },
  { key: 'labs', label: "Lab'lar", icon: Building2, href: '/(platform)/labs' },
  { key: 'users', label: 'Kullanıcılar', icon: Users, href: '/(platform)/users' },
  { key: 'billing', label: 'Faturalama', icon: CreditCard, href: '/(platform)/billing' },
  { key: 'support', label: 'Destek', icon: LifeBuoy, href: '/(platform)/support' },
  { key: 'announcements', label: 'Duyuru', icon: Megaphone, href: '/(platform)/announcements' },
  { key: 'security', label: 'Güvenlik', icon: ShieldAlert, href: '/(platform)/security' },
  { key: 'health', label: 'Sağlık', icon: Activity, href: '/(platform)/health' },
  { key: 'integrations', label: 'Entegrasyonlar', icon: Plug, href: '/(platform)/integrations' },
  { key: 'audit', label: 'Denetim', icon: ScrollText, href: '/(platform)/audit' },
  { key: 'settings', label: 'Ayarlar', icon: Settings, href: '/(platform)/settings' },
  { key: 'admins', label: 'Yöneticiler', icon: ShieldCheck, href: '/(platform)/admins' },
];

// Gruplu sol menü yapısı
const SIDEBAR: { group: string | null; items: typeof NAV }[] = [
  { group: null, items: NAV.filter((n) => n.key === '') },
  { group: 'Yönetim', items: NAV.filter((n) => ['labs', 'users', 'billing'].includes(n.key)) },
  { group: 'Operasyon', items: NAV.filter((n) => ['support', 'announcements'].includes(n.key)) },
  { group: 'Sistem', items: NAV.filter((n) => ['security', 'health', 'integrations', 'settings', 'audit', 'admins'].includes(n.key)) },
];

/** Eski üst-çubuk artık no-op — navigasyon PlatformSidebar'a taşındı. */
export function PlatformNav(_: { active: string }) { return null; }

/** Platform konsolu sol menüsü — (platform)/_layout içinde kalıcı. */
export function PlatformSidebar() {
  const router = useRouter();
  const active = usePlatformActive();
  return (
    <View style={{ width: 216, backgroundColor: C.card, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 18, paddingHorizontal: 12, ...(Platform.OS === 'web' ? { height: '100vh' as any, position: 'sticky' as any, top: 0 } : {}) }}>
      <Text style={{ fontFamily: FONT, fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 20, marginLeft: 8, letterSpacing: -0.3 }}>
        Siman <Text style={{ color: C.accent }}>Platform</Text>
      </Text>
      {SIDEBAR.map((sec, si) => (
        <View key={si} style={{ marginBottom: 14 }}>
          {sec.group ? <Text style={{ color: C.ink3, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginLeft: 8, marginBottom: 6 }}>{sec.group}</Text> : null}
          {sec.items.map((n) => {
            const on = n.key === active;
            const Icon = n.icon;
            return (
              <Pressable key={n.key} onPress={() => router.replace(n.href as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, marginBottom: 2,
                  backgroundColor: on ? C.soft : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Icon size={16} color={on ? C.accent : C.ink3} strokeWidth={1.9} />
                <Text style={{ color: on ? C.accentDeep : C.ink2, fontSize: 13.5, fontWeight: on ? '600' : '500' }}>{n.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Pressable onPress={() => supabase.auth.signOut()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, marginTop: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
        <LogOut size={16} color={C.ink3} strokeWidth={1.8} />
        <Text style={{ color: C.ink2, fontSize: 13.5, fontWeight: '500' }}>Çıkış</Text>
      </Pressable>
    </View>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, ...CARD_SHADOW }}>
      <Text style={{ fontFamily: FONT, fontSize: 30, fontWeight: '300', letterSpacing: -1, color: tone ?? C.ink }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: C.ink3, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export const usePlatformActive = () => {
  const p = usePathname();
  if (p?.includes('/users')) return 'users';
  if (p?.includes('/labs')) return 'labs';
  if (p?.includes('/billing')) return 'billing';
  if (p?.includes('/support')) return 'support';
  if (p?.includes('/announcements')) return 'announcements';
  if (p?.includes('/security')) return 'security';
  if (p?.includes('/integrations')) return 'integrations';
  if (p?.includes('/health')) return 'health';
  if (p?.includes('/settings')) return 'settings';
  if (p?.includes('/audit')) return 'audit';
  if (p?.includes('/admins')) return 'admins';
  return '';
};

/** Para: kuruş (minor units) → biçimli metin */
export function fmtMoney(cents: number, currency = 'TRY') {
  const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
  const v = (Number(cents) || 0) / 100;
  return `${sym[currency] ?? ''}${v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Web JSON indirme */
export function downloadJson(filename: string, data: any) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Web CSV indirme */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
