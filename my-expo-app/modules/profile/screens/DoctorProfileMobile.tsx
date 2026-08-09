// modules/profile/screens/DoctorProfileMobile.tsx
// Aydın Lab Mobile handoff — hekim profil sayfası.
// Sections: header → bilgi kartı → ayar grupları (Hesap · Görünüm · Bildirim · Güvenlik · Hakkında) → çıkış

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED, localeTag, type Lang } from '../../../core/i18n';
import {
  View, Text, Pressable, ScrollView, Switch, Platform, Alert, Modal, TextInput, Linking, } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  User as UserIcon, Mail, Phone, MapPin, Building2, Lock, Bell, Moon, Sun,
  Smartphone, ChevronRight, LogOut, ShieldCheck, FileText, HelpCircle, ScrollText,
  X, Eye, EyeOff, Check as CheckIcon, Users, FileSpreadsheet, Banknote, Settings,
  Landmark, Package, Wallet, CalendarDays, Trash2, AlertTriangle,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import { MOBILE_PANEL_THEMES, useMobileTokens, type MobilePanel } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { deleteMyAccount } from '../../../lib/auth';
import { DataRightsRequest } from '../../auth/components/DataRightsRequest';
// Yasal sayfalar — tek kaynak (core/legal.ts). App Store zorunlu.
import { LEGAL_PRIVACY_URL, LEGAL_TERMS_URL } from '../../../core/legal';

const APP_VERSION = (Constants?.expoConfig?.version ?? '1.0.0') as string;

// Panel accent'i Row ikon kutucuklarına aktarır (her panel kendi rengiyle)
const AccentCtx = React.createContext<string>('');

interface Profile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
  clinic_name?: string | null;
  approval_status?: string | null;
  created_at?: string | null;
}

interface Props {
  profile: Profile | null;
  onSignOut: () => void;
  /** Panel teması — accent, bgHero ve title prefix'i belirler */
  panel?: MobilePanel;
}

// Panel'e göre ünvan/başlık öneki ve fallback default ismi
function panelMeta(panel: MobilePanel): { prefix: string; fallback: string; titleLabel: string } {
  switch (panel) {
    case 'doctor':    return { prefix: 'Dr.',  fallback: 'Hekim',     titleLabel: 'Hekim' };
    case 'klinik':    return { prefix: '',     fallback: 'Klinik',    titleLabel: 'Klinik Yöneticisi' };
    case 'exec':      return { prefix: '',     fallback: 'Yönetici',  titleLabel: 'Yönetim' };
    case 'teknisyen': return { prefix: '',     fallback: 'Teknisyen', titleLabel: 'Teknisyen' };
    case 'lab':
    default:          return { prefix: '',     fallback: 'Kullanıcı', titleLabel: 'Lab Kullanıcısı' };
  }
}

export function DoctorProfileMobile({ profile, onSignOut, panel = 'doctor' }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const roleKey = panel === 'doctor' ? 'roles.doctor'
    : panel === 'klinik' ? 'roles.clinicManager'
    : panel === 'exec' ? 'roles.exec'
    : panel === 'teknisyen' ? 'roles.technician'
    : 'roles.labUser';
  const T = useMobileTokens();
  const insets = useSafeAreaInsets();
  const themeMode = useThemeModeStore(s => s.mode);
  const setThemeMode = useThemeModeStore(s => s.setMode);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [notifPush,  setNotifPush]  = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);

  // Modal states
  const [pwOpen,      setPwOpen]      = useState(false);
  const [kvkkOpen,    setKvkkOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editField,   setEditField]   = useState<'full_name' | 'phone' | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Hesap silme (App Store 5.1.1(v)) — yaz-onayla ("SİL") + geri alınamaz uyarı
  const [delOpen,  setDelOpen]  = useState(false);
  const [delText,  setDelText]  = useState('');
  const [delBusy,  setDelBusy]  = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  // Hermes toLocaleUpperCase locale'i yok sayabilir → hem "SİL" hem "SIL" kabul
  const _delNorm = delText.trim().toLocaleUpperCase('tr-TR');
  const delConfirmed = _delNorm === 'SİL' || _delNorm === 'SIL';
  const runDeleteAccount = async () => {
    if (delBusy || !delConfirmed) return;
    setDelBusy(true); setDelError(null);
    const res = await deleteMyAccount();
    setDelBusy(false);
    if (!res.ok) { setDelError(res.error); return; }
    setDelOpen(false);
    toast.success('Hesabınız silindi.');
    onSignOut();
  };

  const PANEL = MOBILE_PANEL_THEMES[panel];
  const meta = panelMeta(panel);

  // Hekim için "Dr." önekini soyup yeniden ekliyoruz; diğer paneller adı olduğu gibi gösterir
  const rawName = (profile?.full_name ?? '').trim();
  // Çift "Dr. Dr." gelmesin diye baştan tüm Dr. öneklerini agresif şekilde temizle
  const stripDrRe = /^\s*(dr\.?|doktor|prof\.?\s*dr\.?|doç\.?\s*dr\.?)\s*\.?\s*/i;
  let cleanName = rawName;
  if (panel === 'doctor') {
    // birden fazla "Dr." varsa loop ile hepsini sök (örn: "Dr. Dr. Ahmet")
    while (stripDrRe.test(cleanName)) cleanName = cleanName.replace(stripDrRe, '').trim();
  }
  const fullName = cleanName || meta.fallback;
  const initial = (fullName ?? '?').charAt(0).toUpperCase();

  // Ada göre otomatik font size — uzun isimler 22 → 18 → 16 düşer
  const displayName = meta.prefix ? `${meta.prefix} ${fullName}` : fullName;
  const dynamicFontSize = displayName.length > 26 ? 16
    : displayName.length > 18 ? 19
    : 22;
  const approved = profile?.approval_status === 'approved';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(localeTag(i18n.language), { month: 'short', year: 'numeric' })
    : null;

  const handleSignOut = () => {
    // Web/PWA: window.confirm standalone modda engellenir/no-op → uygulama-içi onay modalı
    if (Platform.OS === 'web') {
      setSignOutOpen(true);
      return;
    }
    Alert.alert(t('common.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.signOut'), style: 'destructive', onPress: onSignOut },
    ]);
  };

  return (
    <AccentCtx.Provider value={PANEL.primary}>
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        {/* ═══ Hero — MobileHeader hidden on profile route, so safe area only ═══ */}
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 72, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 20,
              backgroundColor: PANEL.bgHero,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{
                fontSize: 28, fontWeight: '500', color: PANEL.primary,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>
                {initial}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: dynamicFontSize,
                  fontWeight: '400', color: T.ink, letterSpacing: -0.4,
                  lineHeight: dynamicFontSize + 4,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {displayName}
              </Text>
              {!!profile?.email && (
                <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 4 }} numberOfLines={1}>
                  {profile.email}
                </Text>
              )}
            </View>
          </View>

          {/* Status row */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 10, paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: approved ? T.jadeSoft : T.rubySoft,
            }}>
              <ShieldCheck size={11} color={approved ? T.jade : T.ruby} strokeWidth={2} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: approved ? T.jade : T.ruby }}>
                {approved ? t('profile.approved', { role: t(roleKey).toLocaleLowerCase(localeTag(i18n.language)) }) : t('profile.pendingApproval')}
              </Text>
            </View>
            {memberSince && (
              <View style={{
                paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
              }}>
                <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '500' }}>
                  {t('profile.member', { date: memberSince })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ═══ HESAP ═══ */}
        <SectionLabel>{t('profile.sections.account')}</SectionLabel>
        <CardGroup>
          <Row
            icon={UserIcon}
            label={t('profile.rows.fullName')}
            value={fullName}
            onPress={() => { setEditField('full_name'); setProfileOpen(true); }}
          />
          <Divider />
          <Row
            icon={Mail}
            label={t('profile.rows.email')}
            value={profile?.email ?? '—'}
            readonly
          />
          <Divider />
          <Row
            icon={Phone}
            label={t('profile.rows.phone')}
            value={profile?.phone ?? t('common.notSet')}
            onPress={() => { setEditField('phone'); setProfileOpen(true); }}
            placeholder={!profile?.phone}
          />
        </CardGroup>

        {/* ═══ KURUM ═══ (hekim → klinik, diğer → lab/kurum) */}
        <SectionLabel>{panel === 'doctor' ? t('profile.sections.workplaceClinic') : t('profile.sections.workplaceOrg')}</SectionLabel>
        <CardGroup>
          <Row
            icon={Building2}
            label={panel === 'doctor' ? t('profile.rows.clinic') : t('profile.rows.org')}
            value={profile?.clinic_name ?? t('common.notDefined')}
            placeholder={!profile?.clinic_name}
            readonly
          />
          <Divider />
          <Row
            icon={MapPin}
            label={t('profile.rows.address')}
            value={t('common.notSet')}
            placeholder
            readonly
          />
        </CardGroup>

        {/* ═══ ÖZLÜK (yalnız teknisyen) — Avans & İzin talepleri ═══ */}
        {panel === 'teknisyen' && (
          <>
            <SectionLabel>{t('profile.sections.hr')}</SectionLabel>
            <CardGroup>
              <Row
                icon={Wallet}
                label={t('profile.rows.advanceRequest')}
                value={t('profile.values.advance')}
                onPress={() => router.push('/(station)/avans-talebi' as any)}
              />
              <Divider />
              <Row
                icon={CalendarDays}
                label={t('profile.rows.leaveRequest')}
                value={t('profile.values.leave')}
                onPress={() => router.push('/(station)/izin-talebi' as any)}
              />
            </CardGroup>
          </>
        )}

        {/* ═══ GÖRÜNÜM ═══ */}
        <SectionLabel>{t('profile.sections.appearance')}</SectionLabel>
        <CardGroup>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '500', marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {t('profile.theme.title')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([
                { key: 'light',  icon: Sun,        label: t('profile.theme.light') },
                { key: 'dark',   icon: Moon,       label: t('profile.theme.dark') },
                { key: 'system', icon: Smartphone, label: t('profile.theme.system') },
              ] as const).map(opt => {
                const active = themeMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setThemeMode(opt.key)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: active ? PANEL.primary : T.cardSoft,
                      borderWidth: 1, borderColor: active ? PANEL.primary : T.hairline2,
                    }}
                  >
                    <opt.icon size={14} color={active ? '#FFFFFF' : T.ink} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#FFFFFF' : T.ink }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </CardGroup>

        {/* ═══ DİL / LANGUAGE ═══ */}
        <SectionLabel>{t('profile.sections.language')}</SectionLabel>
        <CardGroup>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '500', marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {t('profile.rows.appLanguage')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(SUPPORTED as readonly Lang[]).map(lng => {
                const active = i18n.language === lng;
                const LABELS: Partial<Record<Lang, string>> = { tr: 'Türkçe', en: 'English' };
                return (
                  <Pressable
                    key={lng}
                    onPress={() => setLanguage(lng)}
                    style={{
                      flex: 1, alignItems: 'center', justifyContent: 'center',
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: active ? PANEL.primary : T.cardSoft,
                      borderWidth: 1, borderColor: active ? PANEL.primary : T.hairline2,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : T.ink }}>
                      {LABELS[lng]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </CardGroup>

        {/* ═══ BİLDİRİM ═══ */}
        <SectionLabel>{t('profile.sections.notifications')}</SectionLabel>
        <CardGroup>
          <ToggleRow
            icon={Bell}
            label={t('profile.rows.pushNotif')}
            sub={t('profile.subs.push')}
            value={notifPush}
            onChange={setNotifPush}
            accent={PANEL.primary}
          />
          <Divider />
          <ToggleRow
            icon={Mail}
            label={t('profile.rows.emailNotif')}
            sub={t('profile.subs.email')}
            value={notifEmail}
            onChange={setNotifEmail}
            accent={PANEL.primary}
          />
        </CardGroup>

        {/* ═══ YÖNETİM — Lab + Admin (Exec) paneli ═══ */}
        {(panel === 'lab' || panel === 'exec') && (profile?.user_type === 'lab' || profile?.user_type === 'admin') && (
          <>
            <SectionLabel>{t('profile.sections.management')}</SectionLabel>
            <CardGroup>
              <Row
                icon={Landmark}
                label={t('profile.rows.finance')}
                value={t('profile.values.finance')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/finance' : '/(lab)/finance') as any)}
              />
              <Divider />
              <Row
                icon={Package}
                label={t('profile.rows.stock')}
                value={t('profile.values.stock')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/stock' : '/(lab)/stock') as any)}
              />
              <Divider />
              <Row
                icon={FileSpreadsheet}
                label={t('profile.rows.invoices')}
                value={t('profile.values.invoices')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/finance?tab=invoices' : '/(lab)/invoices') as any)}
              />
              <Divider />
              <Row
                icon={Banknote}
                label={t('profile.rows.expenses')}
                value={t('profile.values.expenses')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/expenses' : '/(lab)/expenses') as any)}
              />
              <Divider />
              <Row
                icon={Users}
                label={panel === 'exec' ? t('profile.rows.staff') : t('profile.rows.users')}
                value={panel === 'exec' ? t('profile.values.staff') : t('profile.values.users')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/employees' : '/(lab)/settings?tab=users') as any)}
              />
              <Divider />
              <Row
                icon={Settings}
                label={t('profile.rows.allSettings')}
                value={t('profile.values.allSettings')}
                onPress={() => router.push((panel === 'exec' ? '/(admin)/settings' : '/(lab)/settings') as any)}
              />
            </CardGroup>
          </>
        )}

        {/* ═══ GÜVENLİK ═══ */}
        <SectionLabel>{t('profile.sections.security')}</SectionLabel>
        <CardGroup>
          <Row
            icon={Lock}
            label={t('profile.rows.changePassword')}
            value="•••••••"
            onPress={() => setPwOpen(true)}
            valueMono
          />
        </CardGroup>

        {/* ═══ HAKKINDA ═══ */}
        <SectionLabel>{t('profile.sections.about')}</SectionLabel>
        <CardGroup>
          <Row icon={HelpCircle} label={t('profile.rows.helpCenter')}  onPress={() => Alert.alert(t('profile.rows.helpCenter'), t('common.soon'))} />
          <Divider />
          <Row icon={FileText}    label={t('profile.rows.terms')}      onPress={() => Linking.openURL(LEGAL_TERMS_URL)} />
          <Divider />
          <Row icon={ScrollText}  label={t('profile.rows.privacy')}    onPress={() => Linking.openURL(LEGAL_PRIVACY_URL)} />
          <Divider />
          <Row icon={ShieldCheck} label="KVKK / Verilerim"             onPress={() => setKvkkOpen(true)} />
        </CardGroup>

        {/* (modal'lar ScrollView dışına render edilecek — aşağıda) */}

        {/* ═══ APP VERSION ═══ */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text style={{ fontSize: 10, color: T.ink3, textAlign: 'center', letterSpacing: 0.4 }}>
            v{APP_VERSION}{profile?.clinic_name ? `  ·  ${profile.clinic_name}` : ''}
          </Text>
        </View>

        {/* ═══ SIGN OUT BUTTON — bottom, destructive red ═══ */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }: any) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingVertical: 16,
                paddingHorizontal: 20,
                borderRadius: 16,
                backgroundColor: '#DC2626',
                opacity: pressed ? 0.85 : 1,
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 4,
              },
            ]}
          >
            <LogOut size={19} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
              Çıkış Yap
            </Text>
          </Pressable>
        </View>

        {/* ═══ HESABIMI SİL — sade tehlikeli bağlantı (çıkışla yarışmasın) ═══ */}
        <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 4 }}>
          <Pressable
            onPress={() => { setDelText(''); setDelError(null); setDelOpen(true); }}
            hitSlop={8}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 16,
              opacity: pressed ? 0.6 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Trash2 size={15} color="#B42318" strokeWidth={2} />
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#B42318' }}>Hesabımı Sil</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ═══ Password change modal ═══ */}
      <PasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} accent={PANEL.primary} />
      <DataRightsRequest visible={kvkkOpen} onClose={() => setKvkkOpen(false)} />

      {/* ═══ Profile field edit modal ═══ */}
      <ProfileFieldModal
        visible={profileOpen}
        field={editField}
        currentValue={editField === 'full_name' ? (profile?.full_name ?? '') : (profile?.phone ?? '')}
        onClose={() => setProfileOpen(false)}
        accent={PANEL.primary}
      />

      {/* ═══ Çıkış onay modalı (PWA'da window.confirm yerine) ═══ */}
      <Modal visible={signOutOpen} transparent animationType="fade" onRequestClose={() => setSignOutOpen(false)}>
        <Pressable
          onPress={() => setSignOutOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={{
              width: '100%', maxWidth: 360, backgroundColor: T.card, borderRadius: 20, padding: 20, gap: 14,
              ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any : {}),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,75,75,0.12)' }}>
                <LogOut size={18} color="#D94B4B" strokeWidth={2} />
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: T.ink, letterSpacing: -0.2 }}>
                {t('common.signOut')}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 19 }}>
              {t('profile.signOutConfirm')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Pressable
                onPress={() => setSignOutOpen(false)}
                style={({ pressed }: any) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                  opacity: pressed ? 0.7 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setSignOutOpen(false); onSignOut(); }}
                style={({ pressed }: any) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: '#D94B4B',
                  opacity: pressed ? 0.85 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{t('common.signOut')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ HESAP SİLME onay modalı — yaz-onayla + geri alınamaz uyarı ═══ */}
      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => { if (!delBusy) setDelOpen(false); }}>
        <Pressable
          onPress={() => { if (!delBusy) setDelOpen(false); }}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={{
              width: '100%', maxWidth: 380, backgroundColor: T.card, borderRadius: 20, padding: 20, gap: 12,
              ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.28)' } as any : {}),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,75,75,0.12)' }}>
                <AlertTriangle size={18} color="#D94B4B" strokeWidth={2} />
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: T.ink, letterSpacing: -0.2 }}>
                Hesabımı Sil
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 19 }}>
              Bu işlem <Text style={{ fontWeight: '700', color: T.ink }}>geri alınamaz</Text>. Kişisel bilgilerin ve giriş bilgin kalıcı olarak silinir.
              Oluşturduğun sipariş, fatura ve finans kayıtları yasal saklama gereği kimliksiz olarak korunur.
            </Text>

            <Text style={{ fontSize: 12.5, color: T.ink3 }}>
              Onaylamak için aşağıya <Text style={{ fontWeight: '800', color: T.ink }}>SİL</Text> yaz.
            </Text>
            <TextInput
              value={delText}
              onChangeText={(v) => { setDelText(v); if (delError) setDelError(null); }}
              editable={!delBusy}
              placeholder="SİL"
              placeholderTextColor={T.ink3}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                { height: 46, borderRadius: 12, borderWidth: 1, borderColor: delConfirmed ? '#D94B4B' : T.hairline, backgroundColor: T.cardSoft, paddingHorizontal: 14, fontSize: 15, color: T.ink },
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
              ]}
            />

            {delError && (
              <Text style={{ fontSize: 12.5, color: '#D94B4B', lineHeight: 17 }}>{delError}</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Pressable
                onPress={() => { if (!delBusy) setDelOpen(false); }}
                style={({ pressed }: any) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                  opacity: pressed ? 0.7 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>İptal</Text>
              </Pressable>
              <Pressable
                onPress={runDeleteAccount}
                disabled={!delConfirmed || delBusy}
                style={({ pressed }: any) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: !delConfirmed || delBusy ? 'rgba(217,75,75,0.4)' : '#D94B4B',
                  opacity: pressed ? 0.85 : 1,
                  ...(Platform.OS === 'web' && delConfirmed && !delBusy ? { cursor: 'pointer' } as any : {}),
                })}
              >
                {delBusy
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Kalıcı Sil</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </AccentCtx.Provider>
  );
}

// ─── Password change modal ──────────────────────────────────────────────────
function PasswordModal({ visible, onClose, accent }: { visible: boolean; onClose: () => void; accent: string }) {
  const T = useMobileTokens();
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [busy, setBusy]           = useState(false);

  const reset = () => { setNewPw(''); setConfirmPw(''); setShowPw(false); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const tooShort   = newPw.length > 0 && newPw.length < 8;
  const mismatch   = confirmPw.length > 0 && newPw !== confirmPw;
  const canSubmit  = newPw.length >= 8 && newPw === confirmPw && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) {
      toast.error('Şifre güncellenemedi: ' + error.message);
      return;
    }
    toast.success('Şifre güncellendi');
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: T.bg }}>
        <View style={{
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.mono }}>
            Güvenlik
          </Text>
          <Pressable onPress={close} hitSlop={8} style={{ padding: 4 }}>
            <X size={20} color={T.ink} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Text style={{
            fontSize: 26, fontWeight: '300', color: T.ink, letterSpacing: -0.4, lineHeight: 30,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            Şifre değiştir
          </Text>
          <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 6, lineHeight: 18 }}>
            En az 8 karakter olmalı. Eski şifre Supabase oturumunuzdan alınır.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
          <PasswordInput
            label="Yeni şifre"
            value={newPw}
            onChange={setNewPw}
            secure={!showPw}
            onToggleSecure={() => setShowPw(v => !v)}
            error={tooShort ? 'En az 8 karakter' : undefined}
          />
          <PasswordInput
            label="Yeni şifre tekrar"
            value={confirmPw}
            onChange={setConfirmPw}
            secure={!showPw}
            error={mismatch ? 'Şifreler eşleşmiyor' : undefined}
          />

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={{
              marginTop: 18,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 14, borderRadius: 16,
              backgroundColor: canSubmit ? accent : T.hairline,
              opacity: canSubmit ? 1 : 0.55,
            }}
          >
            <>
                <CheckIcon size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Şifreyi güncelle</Text>
              </>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PasswordInput({ label, value, onChange, secure, onToggleSecure, error }:
  { label: string; value: string; onChange: (v: string) => void; secure: boolean; onToggleSecure?: () => void; error?: string }) {
  const T = useMobileTokens();
  return (
    <View style={{
      backgroundColor: T.card, borderRadius: T.r2,
      borderWidth: 1, borderColor: error ? `${T.ruby}50` : T.hairline,
      paddingHorizontal: 14, paddingVertical: 12,
    }}>
      <Text style={{ fontSize: 10, color: T.ink3, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure}
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor={T.ink3}
          style={{
            flex: 1, fontSize: 15, color: T.ink, padding: 0,
            // @ts-ignore web outline reset
            outlineWidth: 0,
          }}
        />
        {!!onToggleSecure && (
          <Pressable onPress={onToggleSecure} hitSlop={8}>
            {secure
              ? <Eye  size={16} color={T.ink3} strokeWidth={1.8} />
              : <EyeOff size={16} color={T.ink3} strokeWidth={1.8} />
            }
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text style={{ fontSize: 11, color: T.ruby, marginTop: 4 }}>{error}</Text>
      )}
    </View>
  );
}

// ─── Profile field (name / phone) edit modal ────────────────────────────────
function ProfileFieldModal({ visible, field, currentValue, onClose, accent }:
  { visible: boolean; field: 'full_name' | 'phone' | null; currentValue: string; onClose: () => void; accent: string }) {
  const T = useMobileTokens();
  const [val, setVal] = useState(currentValue);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { setVal(currentValue); }, [currentValue, visible]);

  const fieldLabel = field === 'full_name' ? 'İsim soyisim' : 'Telefon';
  const placeholder = field === 'full_name' ? 'Ad Soyad' : '+90 555 123 45 67';
  const keyboard = field === 'phone' ? 'phone-pad' : 'default';

  const close = () => { setBusy(false); onClose(); };

  const submit = async () => {
    if (!field || !val.trim() || busy) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); toast.error('Oturum bulunamadı'); return; }
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: val.trim() })
      .eq('id', user.id);
    setBusy(false);
    if (error) {
      toast.error('Güncellenemedi: ' + error.message);
      return;
    }
    toast.success('Güncellendi');
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: T.bg }}>
        <View style={{
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.mono }}>
            Düzenle
          </Text>
          <Pressable onPress={close} hitSlop={8} style={{ padding: 4 }}>
            <X size={20} color={T.ink} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Text style={{
            fontSize: 26, fontWeight: '300', color: T.ink, letterSpacing: -0.4, lineHeight: 30,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {fieldLabel}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
          <View style={{
            backgroundColor: T.card, borderRadius: T.r2,
            borderWidth: 1, borderColor: T.hairline,
            paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <Text style={{ fontSize: 10, color: T.ink3, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {fieldLabel}
            </Text>
            <TextInput
              value={val}
              onChangeText={setVal}
              placeholder={placeholder}
              placeholderTextColor={T.ink3}
              keyboardType={keyboard as any}
              autoCapitalize={field === 'full_name' ? 'words' : 'none'}
              style={{
                fontSize: 15, color: T.ink, padding: 0, marginTop: 4,
                // @ts-ignore web outline reset
                outlineWidth: 0,
              }}
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={!val.trim() || busy}
            style={{
              marginTop: 18,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 14, borderRadius: 16,
              backgroundColor: val.trim() && !busy ? accent : T.hairline,
              opacity: val.trim() && !busy ? 1 : 0.55,
            }}
          >
            <>
                <CheckIcon size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Kaydet</Text>
              </>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  const T = useMobileTokens();
  return (
    <Text style={{
      fontSize: 11, fontWeight: '600', color: T.ink3,
      letterSpacing: 1.2, textTransform: 'uppercase',
      paddingHorizontal: 20, paddingTop: 26, paddingBottom: 10,
      fontFamily: T.mono,
    }}>
      {children}
    </Text>
  );
}

function CardGroup({ children }: { children: React.ReactNode }) {
  const T = useMobileTokens();
  return (
    <View style={{
      marginHorizontal: 16,
      backgroundColor: T.card,
      borderRadius: T.r3,
      borderWidth: 1, borderColor: T.hairline,
      overflow: 'hidden',
    }}>
      {children}
    </View>
  );
}

function Divider() {
  const T = useMobileTokens();
  return <View style={{ height: 1, backgroundColor: T.hairline, marginHorizontal: 16 }} />;
}

function Row({ icon: Icon, label, value, onPress, placeholder, valueMono, readonly }:
  { icon: any; label: string; value?: string; onPress?: () => void; placeholder?: boolean; valueMono?: boolean; readonly?: boolean }) {
  const T = useMobileTokens();
  const accent = React.useContext(AccentCtx);
  const content = (
    <>
      <View style={{
        width: 34, height: 34, borderRadius: 11,
        backgroundColor: accent ? `${accent}1A` : T.cardSoft,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={accent || T.ink2} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink }} numberOfLines={1}>
          {label}
        </Text>
        {!!value && (
          <Text
            style={{
              fontSize: 11.5,
              color: placeholder ? T.ink3 : T.ink2,
              marginTop: 2,
              fontStyle: placeholder ? 'italic' : 'normal',
              fontFamily: valueMono ? T.mono : undefined,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
      </View>
      {!readonly && <ChevronRight size={15} color={T.ink3} strokeWidth={1.8} />}
    </>
  );
  if (readonly || !onPress) {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 13,
      }}>{content}</View>
    );
  }
  // Wrap Pressable around an explicit row View — Pressable's style function
  // doesn't reliably propagate flexDirection in iOS New Arch / Fabric.
  return (
    <Pressable onPress={onPress} android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
      {({ pressed }: any) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 13,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

function ToggleRow({ icon: Icon, label, sub, value, onChange, accent }:
  { icon: any; label: string; sub: string; value: boolean; onChange: (v: boolean) => void; accent?: string }) {
  const T = useMobileTokens();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 13,
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 11,
        backgroundColor: accent ? `${accent}1A` : T.cardSoft,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={accent || T.ink2} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <CustomToggle on={value} onPress={() => onChange(!value)} accentColor={accent ?? T.ink} />
    </View>
  );
}

// ─── Custom Toggle — react-native Switch yerine pill thumb ─────────────────
function CustomToggle({ on, onPress, accentColor }: { on: boolean; onPress: () => void; accentColor: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: on ? accentColor : 'rgba(0,0,0,0.12)',
        padding: 2, justifyContent: 'center',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <View
        style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
          alignSelf: on ? 'flex-end' : 'flex-start',
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any
            : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }),
        }}
      />
    </Pressable>
  );
}
