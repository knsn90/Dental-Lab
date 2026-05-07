/**
 * ProfileB7Mobile — Variant B B7 profile screen.
 * Hero (avatar + name + role) · Role swap chooser · Quick actions 2×2 grid · Sign out.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Bell, MapPin, FileText, BarChart3, LogOut, Moon, Sun } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import {
  MFONT, useMobileTheme, useRoleOverrideStore, ROLE_LABEL,
  type MobileRole,
} from '../../../core/theme/mobileTheme';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Profile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
  clinic_name?: string | null;
}

interface QuickAction {
  key: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  onPress: () => void;
}

interface Props {
  profile: Profile | null;
  onSignOut: () => void;
}

export function ProfileB7Mobile({ profile, onSignOut }: Props) {
  const theme = useMobileTheme();
  const override = useRoleOverrideStore(s => s.override);
  const setOverride = useRoleOverrideStore(s => s.setOverride);
  const clearOverride = useRoleOverrideStore(s => s.clear);
  const themeMode = useThemeModeStore(s => s.mode);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const setThemeMode = useThemeModeStore(s => s.setMode);

  const initial = (profile?.full_name ?? '?').charAt(0).toUpperCase();
  const cityOrClinic = profile?.clinic_name ?? '—';
  const userTypeLabel = profile?.user_type
    ? (profile.user_type === 'admin' ? 'Yönetim'
       : profile.user_type === 'lab' ? 'Lab'
       : profile.user_type === 'doctor' ? 'Hekim'
       : profile.user_type === 'clinic_admin' ? 'Klinik' : profile.user_type)
    : '—';

  const ROLES: { key: MobileRole; title: string; sub: string }[] = [
    { key: 'lab',    title: 'Lab',     sub: 'Üretim' },
    { key: 'clinic', title: 'Klinik',  sub: 'Hekim akışı' },
    { key: 'exec',   title: 'Yönetim', sub: 'Mali + analitik' },
  ];

  const handleRolePick = (role: MobileRole) => {
    if (theme.role === role && override === null) return;
    setOverride(role);
  };

  const handleClearRole = () => {
    Alert.alert(
      'Görünümü sıfırla',
      'Hesap rolünüze göre otomatik teması kullansın mı?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sıfırla', onPress: clearOverride },
      ],
    );
  };

  const QUICK_ACTIONS: QuickAction[] = [
    {
      key: 'notif',
      label: 'Bildirimler',
      sub: 'Mesaj, sipariş & uyarı',
      icon: <Bell size={18} color={theme.accent} strokeWidth={1.8} />,
      onPress: () => Alert.alert('Bildirimler', 'Yakında.'),
    },
    {
      key: 'clinics',
      label: 'Klinik adresleri',
      sub: 'Adres ve iletişim',
      icon: <MapPin size={18} color={theme.accent} strokeWidth={1.8} />,
      onPress: () => Alert.alert('Klinik adresleri', 'Yakında.'),
    },
    {
      key: 'billing',
      label: 'Faturalama',
      sub: 'Aboneliğiniz ve fatura',
      icon: <FileText size={18} color={theme.accent} strokeWidth={1.8} />,
      onPress: () => Alert.alert('Faturalama', 'Yakında.'),
    },
    {
      key: 'perf',
      label: 'Performans',
      sub: 'KPI ve analitik',
      icon: <BarChart3 size={18} color={theme.accent} strokeWidth={1.8} />,
      onPress: () => Alert.alert('Performans', 'Yakında.'),
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: theme.bgDeep }]}>
          <View style={[styles.heroOrb, { backgroundColor: theme.primary }]} />
          <View style={styles.heroContent}>
            <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {profile?.full_name ?? 'Kullanıcı'}
            </Text>
            <Text style={styles.subline} numberOfLines={1}>
              {userTypeLabel} · {cityOrClinic}
            </Text>
          </View>
        </View>

        {/* ── Görünüm rolü chooser ─────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionEyebrow}>GÖRÜNÜM ROLÜ</Text>
            {override !== null && (
              <Pressable onPress={handleClearRole} hitSlop={8}>
                <Text style={[styles.resetLink, { color: theme.accent }]}>Sıfırla</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.roleRow}>
            {ROLES.map(r => {
              const active = theme.role === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => handleRolePick(r.key)}
                  style={[
                    styles.roleCard,
                    active
                      ? { backgroundColor: DS[r.key].accent }
                      : { backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
                  ]}
                >
                  <Text style={[
                    styles.roleTitle,
                    { color: active ? '#FFF' : DS.ink[900] },
                  ]}>
                    {r.title}
                  </Text>
                  <Text style={[
                    styles.roleSub,
                    { color: active ? 'rgba(255,255,255,0.7)' : DS.ink[500] },
                  ]}>
                    {r.sub}
                  </Text>
                  <View style={[
                    styles.roleSwatch,
                    { backgroundColor: DS[r.key].primary },
                  ]} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Hızlı eylemler 2×2 ───────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>HIZLI EYLEMLER</Text>
          <View style={styles.actionGrid}>
            {QUICK_ACTIONS.map(a => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                style={({ pressed }) => [styles.actionTile, { opacity: pressed ? 0.92 : 1 }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.bgSoft }]}>
                  {a.icon}
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
                <Text style={styles.actionSub}>{a.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Tema (light/dark/system) ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>GÖRÜNÜM TEMASI</Text>
          <View style={styles.themeRow}>
            {([
              { key: 'light',  label: 'Açık',  icon: <Sun size={16} color={isDark ? '#FAFAFA' : DS.ink[900]} strokeWidth={1.8} /> },
              { key: 'dark',   label: 'Koyu',  icon: <Moon size={16} color={isDark ? '#FAFAFA' : DS.ink[900]} strokeWidth={1.8} /> },
              { key: 'system', label: 'Sistem', icon: null },
            ] as const).map((opt) => {
              const active = themeMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setThemeMode(opt.key)}
                  style={[
                    styles.themeBtn,
                    active
                      ? { backgroundColor: theme.accent }
                      : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
                  ]}
                >
                  {opt.icon && (
                    <View style={{ marginRight: 6 }}>
                      {React.cloneElement(opt.icon as React.ReactElement<any>, {
                        color: active ? (isDark ? '#0A0A0A' : '#FFF') : (isDark ? '#FAFAFA' : DS.ink[900]),
                      })}
                    </View>
                  )}
                  <Text style={[
                    styles.themeBtnText,
                    { color: active ? (isDark ? '#0A0A0A' : '#FFF') : theme.text },
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Sign out ─────────────────────────────────────────── */}
        <View style={[styles.section, { paddingTop: 4 }]}>
          <Pressable
            onPress={() => {
              Alert.alert('Çıkış yap', 'Oturumunuzu kapatmak istediğinize emin misiniz?', [
                { text: 'İptal', style: 'cancel' },
                { text: 'Çıkış', style: 'destructive', onPress: onSignOut },
              ]);
            }}
            style={styles.signOutBtn}
          >
            <LogOut size={16} color={DS.ink[700]} strokeWidth={1.8} />
            <Text style={styles.signOutText}>Çıkış yap</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Hero
  hero: {
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.40,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    marginTop: 18,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 36,
  },
  name: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 32,
    color: DS.ink[900],
    letterSpacing: -1.28,
    lineHeight: 34,
    marginTop: 14,
  },
  subline: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: DS.ink[700],
    marginTop: 4,
  },

  // Sections
  section: {
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.66,
  },
  resetLink: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
  },

  // Role cards
  roleRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  roleCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    minHeight: 86,
    overflow: 'hidden',
    position: 'relative',
  },
  roleTitle: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 22,
    letterSpacing: -0.66,
  },
  roleSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    marginTop: 4,
  },
  roleSwatch: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  // Quick actions
  actionGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[900],
    letterSpacing: -0.14,
  },
  actionSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: DS.ink[500],
    marginTop: 2,
  },

  // Theme mode toggle
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  themeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  themeBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
    letterSpacing: -0.1,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  signOutText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[700],
  },
});
