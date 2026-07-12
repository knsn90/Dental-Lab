import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LayoutGrid, Building2, ScrollText, ShieldCheck, LogOut, LifeBuoy } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';

export const C = {
  bg: '#0B1220', card: '#131C2E', cardHover: '#18233A', line: 'rgba(255,255,255,0.07)',
  ink: '#EAF0FB', ink2: '#9FB0CC', ink3: '#63758F', accent: '#4F8DF7',
  green: '#37C285', amber: '#E6A23C', red: '#E5645B', violet: '#9B7BE6',
};
export const FONT = Platform.OS === 'web' ? ('Inter Tight, Inter, system-ui, sans-serif' as any) : undefined;

export const planTone = (p: string) =>
  p === 'active' || p === 'pro' || p === 'enterprise' ? C.green : p === 'suspended' ? C.red : C.amber;

const NAV = [
  { key: '', label: 'Genel Bakış', icon: LayoutGrid, href: '/(platform)' },
  { key: 'labs', label: "Lab'lar", icon: Building2, href: '/(platform)/labs' },
  { key: 'support', label: 'Destek', icon: LifeBuoy, href: '/(platform)/support' },
  { key: 'audit', label: 'Denetim', icon: ScrollText, href: '/(platform)/audit' },
  { key: 'admins', label: 'Yöneticiler', icon: ShieldCheck, href: '/(platform)/admins' },
];

/** Platform konsolu üst çubuğu — her üst-seviye ekranda kullanılır. */
export function PlatformNav({ active }: { active: string }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontFamily: FONT, fontSize: 17, fontWeight: '700', color: C.ink, marginRight: 12, letterSpacing: -0.3 }}>
          Siman <Text style={{ color: C.accent }}>Platform</Text>
        </Text>
        {NAV.map((n) => {
          const on = n.key === active;
          const Icon = n.icon;
          return (
            <Pressable key={n.key} onPress={() => router.replace(n.href as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                backgroundColor: on ? 'rgba(79,141,247,0.14)' : 'transparent', borderWidth: 1, borderColor: on ? 'rgba(79,141,247,0.35)' : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Icon size={15} color={on ? C.accent : C.ink3} strokeWidth={1.9} />
              <Text style={{ color: on ? C.ink : C.ink2, fontSize: 13, fontWeight: on ? '600' : '500' }}>{n.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => supabase.auth.signOut()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
        <LogOut size={15} color={C.ink3} strokeWidth={1.8} />
        <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Çıkış</Text>
      </Pressable>
    </View>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 }}>
      <Text style={{ fontFamily: FONT, fontSize: 30, fontWeight: '300', letterSpacing: -1, color: tone ?? C.ink }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: C.ink3, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export const usePlatformActive = () => {
  const p = usePathname();
  if (p?.includes('/labs')) return 'labs';
  if (p?.includes('/support')) return 'support';
  if (p?.includes('/audit')) return 'audit';
  if (p?.includes('/admins')) return 'admins';
  return '';
};

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
