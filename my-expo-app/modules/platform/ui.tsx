import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform, ScrollView, TextInput } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LayoutGrid, Building2, ScrollText, ShieldCheck, LogOut, LifeBuoy, Activity, Megaphone, CreditCard, Users, Settings, ShieldAlert, Plug, Search, ChevronDown } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { SimanWordmark } from '../../core/ui/SimanWordmark';
import { DS } from '../../core/theme/dsTokens';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
import { listLabs } from './api';

// Platform konsolu — "exec/admin" (Kobalt) kimliği. Accent + zemin + statü
// renkleri DS token'larından çözülür (CLAUDE.md §7); tinted nötr ink'ler
// (ink2/ink3/hover/line) panelden bağımsız kalır. Değerler değişmedi, kaynak
// hardcode hex'ten token'a taşındı.
const X = DS.exec;
export const C = {
  bg: MOBILE_PANEL_THEMES.exec.bgPage, // #F7F9FC — sayfa zemini (shell ile aynı)
  card: X.surface, cardHover: '#F1F5F9', line: 'rgba(15,23,42,0.08)',
  ink: X.accent, ink2: '#4C5A70', ink3: '#8494AD', accent: X.primary, accentDeep: X.primaryDeep,
  soft: X.bg, green: X.success, amber: X.warning, red: X.danger, violet: DS.plum.primary,
};
export const FONT = Platform.OS === 'web' ? ('Inter Tight, Inter, system-ui, sans-serif' as any) : undefined;
// İnce (300) display — tasarım dilinin imzası: büyük başlık/metrikler
export const SERIF = { fontFamily: FONT, fontWeight: '300' as const };
// Sayısal hizalama — metrik/sayı sütunları satırlar arası zıplamaz
export const NUM = { fontVariant: ['tabular-nums'] as any };
// Kart gölgesi (design system) — web'de yumuşak ambient derinlik
export const CARD_SHADOW = Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.06)' } as any) : {};

/** Hex → rgba (accent yumuşak tonları için) */
export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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
    <View style={{ width: 232, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, margin: 14, paddingVertical: 22, paddingHorizontal: 14, flexDirection: 'column', ...CARD_SHADOW, ...(Platform.OS === 'web' ? { height: 'calc(100vh - 28px)' as any, position: 'sticky' as any, top: 14 } : {}) }}>
      {/* Marka */}
      <View style={{ marginBottom: 26, marginStart: 6, gap: 8 }}>
        <SimanWordmark height={17} color={C.ink} />
        <Text style={{ color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' }}>Platform Konsolu</Text>
      </View>

      {/* Navigasyon */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {SIDEBAR.map((sec, si) => (
          <View key={si} style={{ marginBottom: 16 }}>
            {sec.group ? <Text style={{ color: C.ink3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginStart: 12, marginBottom: 7 }}>{sec.group}</Text> : null}
            {sec.items.map((n) => {
              const on = n.key === active;
              const Icon = n.icon;
              // Aktif = yumuşak accent dolgu + accent ikon/metin (uygulamanın
              // TabButton deseni). Renkli sol-kenar çubuğu KALDIRILDI (anti-pattern).
              return (
                <Pressable key={n.key} onPress={() => router.replace(n.href as any)}
                  style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingStart: 12, paddingEnd: 10, paddingVertical: 9, borderRadius: 10, marginBottom: 2,
                    backgroundColor: on ? hexA(C.accent, 0.10) : (hovered ? C.cardHover : 'transparent'),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                  <Icon size={16} color={on ? C.accent : C.ink3} strokeWidth={1.9} />
                  <Text style={{ color: on ? C.accent : C.ink2, fontSize: 13.5, fontWeight: on ? '600' : '500' }}>{n.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Alt: çıkış */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 8 }}>
        <Pressable onPress={() => supabase.auth.signOut()}
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: hovered ? C.cardHover : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
          <LogOut size={16} color={C.ink3} strokeWidth={1.8} />
          <Text style={{ color: C.ink2, fontSize: 13.5, fontWeight: '500' }}>Çıkış</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Üst-bar — sağ üstte lab arama + profil kartı (siman shell deseni). */
export function PlatformTopBar() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [labs, setLabs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [me, setMe] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [homeBase, setHomeBase] = useState('/(lab)');
  const [menu, setMenu] = useState(false);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    listLabs().then((l) => setLabs(l.map((x) => ({ id: x.id, name: x.name, slug: x.slug })))).catch(() => {});
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let name = user.email ?? '';
      try {
        const { data } = await supabase.from('profiles').select('full_name, user_type, role').eq('id', user.id).maybeSingle();
        const p = data as any;
        if (p?.full_name) name = p.full_name;
        const ut = p?.user_type, role = p?.role;
        setHomeBase(
          ut === 'admin' ? '/(admin)'
          : ut === 'clinic_admin' || ut === 'clinic_secretary' ? '/(clinic)'
          : ut === 'doctor' ? '/(doctor)'
          : (ut === 'lab' && role === 'courier') ? '/(courier)'
          : (ut === 'lab' && role === 'technician') ? '/(station)'
          : '/(lab)'
        );
      } catch {}
      setMe({ name, email: user.email ?? '' });
    })();
  }, []);

  const goHome = () => { try { if (typeof window !== 'undefined') window.localStorage?.removeItem('nx_panel'); } catch {} setMenu(false); router.replace(homeBase as any); };

  const s = q.trim().toLowerCase();
  const results = s ? labs.filter((l) => `${l.name} ${l.slug}`.toLowerCase().includes(s)).slice(0, 6) : [];
  const initials = (me.name || me.email || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const go = (id: string) => { setQ(''); setFocus(false); router.push(`/(platform)/${id}` as any); };
  const web = Platform.OS === 'web';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 4, position: 'relative', zIndex: 50 }}>
      {/* Arama */}
      <View style={{ position: 'relative', width: 300, maxWidth: '48%' as any }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: focus ? C.accent : C.line, paddingHorizontal: 14, height: 40, ...CARD_SHADOW }}>
          <Search size={16} color={C.ink3} strokeWidth={1.9} />
          <TextInput value={q} onChangeText={setQ} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 160)}
            placeholder="Lab ara…" placeholderTextColor={C.ink3}
            style={{ flex: 1, color: C.ink, fontSize: 14, ...(web ? { outlineStyle: 'none' } as any : {}) }} />
        </View>
        {focus && results.length > 0 && (
          <View style={{ position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden', ...CARD_SHADOW, zIndex: 60 }}>
            {results.map((r, i) => (
              <Pressable key={r.id} onPress={() => go(r.id)}
                style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, backgroundColor: hovered ? C.cardHover : 'transparent', ...(web ? { cursor: 'pointer' } : {}) }]}>
                <Building2 size={15} color={C.ink3} strokeWidth={1.8} />
                <Text numberOfLines={1} style={{ flex: 1, color: C.ink, fontSize: 13.5, fontWeight: '600' }}>{r.name}</Text>
                <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>{r.slug}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Profil kartı */}
      <View style={{ position: 'relative', zIndex: 55 }}>
        <Pressable onPress={() => setMenu((m) => !m)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingStart: 6, paddingEnd: 12, height: 40, ...CARD_SHADOW, ...(web ? { cursor: 'pointer' } as any : {}) }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{initials}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13.5, fontWeight: '600', maxWidth: 130 }}>{me.name || 'Hesap'}</Text>
          <ChevronDown size={15} color={C.ink3} strokeWidth={2} style={{ transform: [{ rotate: menu ? '180deg' : '0deg' }] }} />
        </Pressable>
        {menu && (
          <View style={{ position: 'absolute', top: 46, end: 0, minWidth: 210, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden', ...CARD_SHADOW, zIndex: 70 }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13, fontWeight: '700' }}>{me.name || '—'}</Text>
              <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{me.email}</Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}><Chip tone={C.accent}>PLATFORM ADMIN</Chip></View>
            </View>
            <Pressable onPress={goHome}
              style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: hovered ? C.cardHover : 'transparent', ...(web ? { cursor: 'pointer' } : {}) }]}>
              <LayoutGrid size={15} color={C.ink2} strokeWidth={1.9} />
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>Uygulama paneline dön</Text>
            </Pressable>
            <Pressable onPress={() => supabase.auth.signOut()}
              style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: hovered ? C.cardHover : 'transparent', ...(web ? { cursor: 'pointer' } : {}) }]}>
              <LogOut size={15} color={C.red} strokeWidth={1.9} />
              <Text style={{ color: C.red, fontSize: 13, fontWeight: '600' }}>Çıkış yap</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/** Dairesel accent-tintli ikon çipi (tasarım dili imzası) */
export function IconChip({ icon: Icon, tone = C.accent, size = 34 }: { icon: any; tone?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hexA(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={Math.round(size * 0.46)} color={tone} strokeWidth={1.9} />
    </View>
  );
}

/** Yumuşak accent tonlu chip (opsiyonel dot) */
export function Chip({ tone = C.ink2, dot, children }: { tone?: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: hexA(tone, 0.12), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} /> : null}
      <Text style={{ color: tone, fontSize: 11.5, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

/** Beyaz kart yüzeyi — radius + hairline + yumuşak gölge */
export function Panel({ children, style, padding = 20 }: { children: React.ReactNode; style?: any; padding?: number }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding, ...CARD_SHADOW }, style]}>{children}</View>;
}

/** Bölüm başlığı — 11px/700 UPPERCASE ink-400 + opsiyonel ikon/aksiyon */
export function SectionLabel({ icon: Icon, tone, children, action }: { icon?: any; tone?: string; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
      {Icon ? <Icon size={14} color={tone ?? C.ink3} strokeWidth={2} /> : null}
      <Text style={{ color: C.ink3, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>{children}</Text>
      <View style={{ flex: 1 }} />
      {action ? (
        <Pressable onPress={action.onPress} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: '700' }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Ghost dairesel ikon butonu (kart köşesi ok'u vb.) */
export function IconBtn({ icon: Icon, onPress, tone = C.ink3, size = 32 }: { icon: any; onPress?: () => void; tone?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.cardHover, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
      <Icon size={Math.round(size * 0.44)} color={tone} strokeWidth={1.9} />
    </Pressable>
  );
}

/** Küçük stat: etiket + pill değeri (hero altı — ÜRETİM 20% gibi) */
export function StatPill({ label, value, tone = C.ink }: { label: string; value: React.ReactNode; tone?: string }) {
  const dark = tone === C.ink;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: C.ink3 }}>{label}</Text>
      <View style={{ backgroundColor: dark ? C.ink : hexA(tone, 0.14), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, minWidth: 24, alignItems: 'center' }}>
        <Text style={{ ...NUM, fontSize: 11.5, fontWeight: '700', color: dark ? '#FFFFFF' : tone }}>{value}</Text>
      </View>
    </View>
  );
}

/** Büyük stat kümesi öğesi — ince display değer + uppercase etiket (hero sağı) */
export function BigStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <View>
      <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: C.ink3, marginBottom: 5 }}>{label}</Text>
      <Text style={{ ...SERIF, ...NUM, fontSize: 40, letterSpacing: -1.4, lineHeight: 42, color: tone ?? C.ink }}>{value}</Text>
    </View>
  );
}

/** Full-bleed accent uyarı banner'ı (yumuşak tonlu, ikon çipi + opsiyonel aksiyon) */
export function Banner({ tone = C.accent, icon: Icon, title, children, action }: { tone?: string; icon?: any; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: hexA(tone, 0.10), borderWidth: 1, borderColor: hexA(tone, 0.22), borderRadius: 18, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 24 }}>
      {Icon ? <IconChip icon={Icon} tone={tone} size={40} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={{ color: tone, fontSize: 14, fontWeight: '700' }}>{title}</Text> : null}
        {children ? <Text style={{ color: C.ink2, fontSize: 13, marginTop: title ? 2 : 0 }}>{children}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/** Sayfa başlığı (hero) — eyebrow + ince display başlık + açıklama + opsiyonel pill satırı + sağ stat kümesi/aksiyonlar */
export function PageHeader({ eyebrow, title, accent: accentWord, description, actions, stats, pills }: {
  eyebrow?: string; title: string; accent?: string; description?: string; actions?: React.ReactNode;
  stats?: { label: string; value: React.ReactNode; tone?: string }[];
  pills?: { label: string; value: React.ReactNode; tone?: string }[];
}) {
  return (
    <View style={{ paddingBottom: 24, marginBottom: 28, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 260 }}>
          {eyebrow ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <View style={{ width: 22, height: 2, borderRadius: 1, backgroundColor: C.accent }} />
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: C.accent }}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text style={{ ...SERIF, fontSize: 44, letterSpacing: -1.5, lineHeight: 48, color: C.ink }}>
            {title}
            {accentWord ? <Text style={{ ...SERIF, color: C.accent }}>{' ' + accentWord}</Text> : null}
          </Text>
          {description ? <Text style={{ color: C.ink3, fontSize: 14, marginTop: 14, maxWidth: 620, lineHeight: 20 }}>{description}</Text> : null}
          {pills && pills.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 18 }}>
              {pills.map((p, i) => <StatPill key={i} label={p.label} value={p.value} tone={p.tone} />)}
            </View>
          ) : null}
        </View>
        {stats && stats.length ? (
          <View style={{ flexDirection: 'row', gap: 30, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {stats.map((s, i) => <BigStat key={i} label={s.label} value={s.value} tone={s.tone} />)}
          </View>
        ) : null}
        {actions ? <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</View> : null}
      </View>
    </View>
  );
}

/** Pill buton — primary(Kobalt) / danger / outline / ghost */
export function Btn({ children, onPress, variant = 'primary', icon: Icon, disabled, size = 'md' }: {
  children: React.ReactNode; onPress?: () => void; variant?: 'primary' | 'danger' | 'outline' | 'ghost'; icon?: any; disabled?: boolean; size?: 'sm' | 'md';
}) {
  const ph = size === 'sm' ? 14 : 18, pv = size === 'sm' ? 8 : 10, fs = size === 'sm' ? 13 : 14;
  const s = variant === 'primary' ? { bg: C.accent, hov: C.accentDeep, fg: '#FFFFFF', bd: C.accent }
    : variant === 'danger' ? { bg: C.red, hov: '#C13B3B', fg: '#FFFFFF', bd: C.red }
    : variant === 'outline' ? { bg: 'transparent', hov: C.cardHover, fg: C.ink, bd: C.line }
    : { bg: C.cardHover, hov: hexA(C.ink3, 0.14), fg: C.ink2, bd: 'transparent' };
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ hovered, pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: ph, paddingVertical: pv, borderRadius: 999,
        backgroundColor: hovered && !disabled ? s.hov : s.bg, borderWidth: 1, borderColor: hovered && !disabled ? s.hov : s.bd,
        opacity: disabled ? 0.5 : 1, transform: [{ translateY: pressed && !disabled ? 1 : 0 }],
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer', transition: 'background-color 140ms ease, transform 140ms ease' } as any) : {}) })}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} color={s.fg} strokeWidth={2} /> : null}
      <Text style={{ color: s.fg, fontSize: fs, fontWeight: '700' }}>{children}</Text>
    </Pressable>
  );
}

/** KPI kartı — editorial hiyerarşi: micro etiket ÜSTTE, devasa ince display
 * metrik ALTINDA; opsiyonel alt satır hairline ayraçla ayrılır. */
export function Kpi({ label, value, tone, icon: Icon, sub }: { label: string; value: string | number; tone?: string; icon?: any; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 156, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 18, ...CARD_SHADOW }}>
      {/* Eyebrow etiket + opsiyonel ince ikon */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: C.ink3 }}>{label}</Text>
        {Icon ? <Icon size={15} color={tone ?? C.ink3} strokeWidth={1.9} /> : null}
      </View>
      {/* Devasa metrik */}
      <Text style={{ ...SERIF, ...NUM, fontSize: 42, letterSpacing: -1.7, lineHeight: 46, color: tone ?? C.ink, marginTop: 10 }}>{value}</Text>
      {/* Alt satır — hairline ayraçla */}
      {sub ? (
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontSize: 11.5, color: C.ink3 }}>{sub}</Text>
        </View>
      ) : null}
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
