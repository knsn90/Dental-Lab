/**
 * ProfileScreen — Patterns Design Language
 * ─────────────────────────────────────────
 * Kullanıcı profil sayfası. Avatar, kişisel bilgiler, e-posta, şifre,
 * tercihler ve hesap seçenekleri.
 *
 * Patterns dili: Inter Tight Light display, Lucide ikonlar, panel accent,
 * krem zemin, yumuşak köşeler, inline style (no StyleSheet).
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSegments } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera, Edit2, Mail, Phone, Lock, Bell, User,
  Calendar, LogOut, ChevronRight, ChevronUp, Eye, EyeOff, X,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { supabase } from '../../../core/api/supabase';

// ── Display font ─────────────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Panel accent ─────────────────────────────────────────────────────────
type PanelKind = 'lab' | 'admin' | 'doctor' | 'clinic';
const PANEL_ACCENTS: Record<PanelKind, string> = {
  lab: '#F5C24B', admin: '#E97757', doctor: '#6BA888', clinic: '#6BA888',
};
function detectPanel(segments: string[]): PanelKind {
  const seg = segments?.[0] ?? '';
  if (seg === '(clinic)') return 'clinic';
  if (seg === '(doctor)') return 'doctor';
  if (seg === '(admin)')  return 'admin';
  return 'lab';
}

// ── Helpers ──────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  admin: 'Sistem Yöneticisi', manager: 'Mesul Müdür',
  technician: 'Teknisyen', doctor: 'Hekim', lab: 'Lab Personeli',
  clinic_admin: 'Klinik Yöneticisi',
};
function getRoleLabel(profile: any): string {
  if (profile?.user_type === 'admin')  return ROLE_LABEL.admin;
  if (profile?.user_type === 'clinic_admin') return ROLE_LABEL.clinic_admin;
  if (profile?.role === 'manager')     return ROLE_LABEL.manager;
  if (profile?.role === 'technician')  return ROLE_LABEL.technician;
  if (profile?.user_type === 'doctor') return ROLE_LABEL.doctor;
  return ROLE_LABEL.lab;
}
function joinedDate(profile: any): string {
  if (!profile?.created_at) return '';
  return new Date(profile.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Shared sub-components ────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase',
      color: '#9A9A9A', marginBottom: 14,
    }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22,
      // @ts-ignore web
      boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 6 }} />;
}

function FieldLabel({ children, error }: { children: string; error?: boolean }) {
  return (
    <Text style={{
      fontSize: 10, fontWeight: '600', letterSpacing: 0.9,
      textTransform: 'uppercase', color: error ? '#EF4444' : '#9A9A9A', marginBottom: 6,
    }}>
      {children}
    </Text>
  );
}

function FieldInput(props: React.ComponentProps<typeof TextInput> & { error?: boolean }) {
  const { error, style: extraStyle, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor="#C0C0C8"
      style={{
        borderWidth: 1, borderColor: error ? '#EF4444' : 'rgba(0,0,0,0.06)',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: error ? '#EF4444' : '#0A0A0A',
        backgroundColor: '#FAFAFA',
        // @ts-ignore web
        outlineWidth: 0,
        ...(extraStyle as any),
      }}
      {...rest}
    />
  );
}

function PillBtn({ label, accent, onPress, loading, variant = 'primary' }: {
  label: string; accent: string; onPress: () => void; loading?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  const bg = variant === 'primary' ? accent : variant === 'danger' ? '#FEE2E2' : 'transparent';
  const textColor = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? '#EF4444' : '#6B6B6B';
  const border = variant === 'outline' ? 'rgba(0,0,0,0.08)' : 'transparent';
  return (
    <Pressable
      onPress={onPress} disabled={loading}
      style={{
        flex: 1, alignItems: 'center', justifyContent: 'center',
        borderRadius: 12, paddingVertical: 12,
        backgroundColor: bg, borderWidth: 1, borderColor: border,
        opacity: loading ? 0.6 : 1,
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor} />
        : <Text style={{ fontSize: 13, fontWeight: '600', color: textColor }}>{label}</Text>}
    </Pressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────
export function ProfileScreen() {
  const segments = useSegments();
  const panel = detectPanel(segments);
  const accent = PANEL_ACCENTS[panel];

  const { profile, signOut, setProfile } = useAuthStore() as any;
  const roleLabel = getRoleLabel(profile);
  const initial = (profile?.full_name ?? '?').charAt(0).toUpperCase();

  // Page title
  const setPageTitle = usePageTitleStore(s => s.setTitle);
  useEffect(() => {
    setPageTitle('Profil', undefined);
    return () => setPageTitle('', undefined);
  }, []);

  // ── Avatar state
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Edit mode state
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [savingInfo, setSavingInfo] = useState(false);

  // ── Email state
  const [email, setEmail] = useState(profile?.email ?? '');
  const [editEmail, setEditEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Password state
  const [showPassSection, setShowPassSection] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // ── Prefs
  const [notifEnabled, setNotifEnabled] = useState(true);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setEmail(profile?.email ?? '');
    setAvatarUri(profile?.avatar_url ?? null);
  }, [profile]);

  // ── Pick & upload avatar
  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.warning('Galeri erişimi için izin verin.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { toast.error('Görsel okunamadı.'); return; }

    setUploadingAvatar(true);
    try {
      const byteStr = atob(asset.base64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.split('/')[1] ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars').upload(path, bytes, { upsert: true, contentType: mime });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id);
      if (dbErr) throw new Error(dbErr.message);
      setAvatarUri(publicUrl);
      if (setProfile) setProfile({ ...profile, avatar_url: urlData.publicUrl });
    } catch (e: any) {
      toast.error(e.message ?? 'Fotoğraf yüklenemedi.');
    } finally { setUploadingAvatar(false); }
  };

  // ── Save personal info
  const handleSaveInfo = async () => {
    if (!fullName.trim()) { toast.error('Ad Soyad boş bırakılamaz.'); return; }
    setSavingInfo(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', profile.id);
      if (error) throw new Error(error.message);
      if (setProfile) setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() || null });
      setEditing(false);
      toast.success('Bilgileriniz güncellendi.');
    } catch (e: any) { toast.error(e.message ?? 'Bir hata oluştu.'); }
    finally { setSavingInfo(false); }
  };

  // ── Save email
  const handleSaveEmail = async () => {
    if (!email.trim()) { toast.error('E-posta boş bırakılamaz.'); return; }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      if (setProfile) setProfile({ ...profile, email: email.trim() });
      setEditEmail(false);
      toast.success('Doğrulama e-postası gönderildi.');
    } catch (e: any) { toast.error(e.message ?? 'E-posta güncellenemedi.'); }
    finally { setSavingEmail(false); }
  };

  // ── Change password
  const handleChangePassword = async () => {
    if (newPass.length < 6)     { toast.error('Şifre en az 6 karakter olmalıdır.'); return; }
    if (newPass !== confirmPass) { toast.error('Şifreler eşleşmiyor.'); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw new Error(error.message);
      setNewPass(''); setConfirmPass(''); setShowPassSection(false);
      toast.success('Şifreniz değiştirildi.');
    } catch (e: any) { toast.error(e.message ?? 'Şifre değiştirilemedi.'); }
    finally { setSavingPass(false); }
  };

  const handleSignOut = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  const passNoMatch = newPass.length > 0 && confirmPass.length > 0 && newPass !== confirmPass;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ padding: 28, paddingBottom: 80, maxWidth: 960, width: '100%', alignSelf: 'center' as any }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ═══════ PROFIL KARTI ═══════ */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <SectionTitle>Profiliniz</SectionTitle>
            <Text style={{ fontSize: 12, color: '#9A9A9A' }}>Katılım {joinedDate(profile)}</Text>
          </View>

          {editing ? (
            /* ── Edit mode ── */
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable onPress={handlePickAvatar} style={{ position: 'relative' }}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: 56, height: 56, borderRadius: 16 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
                    </View>
                  )}
                  <View style={{
                    position: 'absolute', bottom: -4, right: -4,
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: '#FFFFFF',
                  }}>
                    {uploadingAvatar
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Camera size={10} color="#FFFFFF" strokeWidth={2} />}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 18 }}>
                    Ad, soyad ve telefon bilgilerinizi güncelleyin.
                  </Text>
                  <Pressable onPress={handlePickAvatar}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: accent, marginTop: 4 }}>Fotoğrafı değiştir</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <FieldLabel>Ad Soyad</FieldLabel>
                <FieldInput value={fullName} onChangeText={setFullName} placeholder="Ad Soyad" returnKeyType="next" />
              </View>
              <View style={{ gap: 6 }}>
                <FieldLabel>Telefon</FieldLabel>
                <FieldInput value={phone} onChangeText={setPhone} placeholder="0555 000 00 00" keyboardType="phone-pad" returnKeyType="done" />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <PillBtn
                  label="Vazgeç" variant="outline" accent={accent}
                  onPress={() => { setEditing(false); setFullName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); }}
                />
                <PillBtn label="Kaydet" accent={accent} onPress={handleSaveInfo} loading={savingInfo} />
              </View>
            </View>
          ) : (
            /* ── View mode ── */
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable onPress={handlePickAvatar} style={{ position: 'relative' }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 56, height: 56, borderRadius: 16 }} />
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
                  </View>
                )}
                <View style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#FFFFFF',
                }}>
                  {uploadingAvatar
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Camera size={10} color="#FFFFFF" strokeWidth={2} />}
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.4, color: '#0A0A0A', marginBottom: 4 }}>
                  {profile?.full_name ?? '—'}
                </Text>
                <View style={{
                  alignSelf: 'flex-start', borderRadius: 999,
                  paddingHorizontal: 10, paddingVertical: 3,
                  backgroundColor: `${accent}18`,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>{roleLabel}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setEditing(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 8,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <Edit2 size={13} color={accent} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: accent }}>Düzenle</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* ═══════ 2 SÜTUN ═══════ */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>

          {/* ── Sol sütun ── */}
          <View style={{ flex: 1, gap: 16 }}>

            {/* İletişim */}
            <Card>
              <SectionTitle>İletişim</SectionTitle>

              {/* E-posta */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <Mail size={14} color="#9A9A9A" strokeWidth={1.8} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#9A9A9A', marginBottom: 2 }}>E-posta</Text>
                  <Text style={{ fontSize: 14, color: '#3C3C3C' }} numberOfLines={1}>{profile?.email ?? '—'}</Text>
                </View>
                <Pressable onPress={() => setEditEmail(v => !v)} style={{ padding: 6, cursor: 'pointer' as any }}>
                  {editEmail
                    ? <X size={14} color="#9A9A9A" strokeWidth={1.8} />
                    : <Edit2 size={14} color="#9A9A9A" strokeWidth={1.8} />}
                </Pressable>
              </View>

              {editEmail && (
                <View style={{ marginTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingTop: 12 }}>
                  <View style={{ gap: 6 }}>
                    <FieldLabel>Yeni E-posta</FieldLabel>
                    <FieldInput
                      value={email} onChangeText={setEmail}
                      placeholder="yeni@email.com" keyboardType="email-address"
                      autoCapitalize="none" returnKeyType="done" autoFocus
                    />
                    <Text style={{ fontSize: 11, color: '#9A9A9A', lineHeight: 16 }}>
                      Değişiklik sonrası doğrulama e-postası gönderilir.
                    </Text>
                  </View>
                  <PillBtn label="E-postayı Güncelle" accent={accent} onPress={handleSaveEmail} loading={savingEmail} />
                </View>
              )}

              <Divider />

              {/* Telefon */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <Phone size={14} color="#9A9A9A" strokeWidth={1.8} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#9A9A9A', marginBottom: 2 }}>Telefon</Text>
                  <Text style={{ fontSize: 14, color: profile?.phone ? '#3C3C3C' : '#C0C0C8' }}>
                    {profile?.phone ?? 'Eklenmedi'}
                  </Text>
                </View>
                <Pressable onPress={() => setEditing(true)} style={{ padding: 6, cursor: 'pointer' as any }}>
                  <Edit2 size={14} color="#9A9A9A" strokeWidth={1.8} />
                </Pressable>
              </View>
            </Card>

            {/* Güvenlik */}
            <Card>
              <SectionTitle>Güvenlik</SectionTitle>
              <Pressable
                onPress={() => setShowPassSection(v => !v)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <Lock size={15} color="#6B6B6B" strokeWidth={1.8} />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#3C3C3C', flex: 1 }}>Şifre Değiştir</Text>
                {showPassSection
                  ? <ChevronUp size={16} color="#9A9A9A" strokeWidth={1.8} />
                  : <ChevronRight size={16} color="#9A9A9A" strokeWidth={1.8} />}
              </Pressable>

              {showPassSection && (
                <View style={{ marginTop: 12, gap: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingTop: 14 }}>
                  <View style={{ gap: 6 }}>
                    <FieldLabel>Yeni Şifre</FieldLabel>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 12,
                      backgroundColor: '#FAFAFA',
                    }}>
                      <TextInput
                        style={{
                          flex: 1, paddingHorizontal: 14, paddingVertical: 12,
                          fontSize: 14, color: '#0A0A0A',
                          // @ts-ignore web
                          outlineWidth: 0,
                        }}
                        value={newPass} onChangeText={setNewPass}
                        placeholder="En az 6 karakter" placeholderTextColor="#C0C0C8"
                        secureTextEntry={!showNew} returnKeyType="next"
                      />
                      <Pressable onPress={() => setShowNew(v => !v)} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                        {showNew
                          ? <EyeOff size={15} color="#C0C0C8" strokeWidth={1.8} />
                          : <Eye size={15} color="#C0C0C8" strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <FieldLabel error={passNoMatch}>Şifre Tekrar</FieldLabel>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      borderWidth: 1, borderColor: passNoMatch ? '#EF4444' : 'rgba(0,0,0,0.06)',
                      borderRadius: 12, backgroundColor: '#FAFAFA',
                    }}>
                      <TextInput
                        style={{
                          flex: 1, paddingHorizontal: 14, paddingVertical: 12,
                          fontSize: 14, color: passNoMatch ? '#EF4444' : '#0A0A0A',
                          // @ts-ignore web
                          outlineWidth: 0,
                        }}
                        value={confirmPass} onChangeText={setConfirmPass}
                        placeholder="Şifreyi tekrar girin" placeholderTextColor="#C0C0C8"
                        secureTextEntry={!showConfirm} returnKeyType="done"
                      />
                      <Pressable onPress={() => setShowConfirm(v => !v)} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                        {showConfirm
                          ? <EyeOff size={15} color="#C0C0C8" strokeWidth={1.8} />
                          : <Eye size={15} color="#C0C0C8" strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                    {passNoMatch && (
                      <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>Şifreler eşleşmiyor</Text>
                    )}
                  </View>

                  <PillBtn label="Şifreyi Güncelle" accent={accent} onPress={handleChangePassword} loading={savingPass} />
                </View>
              )}
            </Card>
          </View>

          {/* ── Sağ sütun ── */}
          <View style={{ flex: 1, gap: 16 }}>

            {/* Tercihler */}
            <Card>
              <SectionTitle>Tercihler</SectionTitle>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Bell size={15} color="#6B6B6B" strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#0A0A0A' }}>Bildirimler</Text>
                  <Text style={{ fontSize: 12, color: '#9A9A9A', marginTop: 2 }}>Sipariş ve durum güncellemeleri</Text>
                </View>
                <AppSwitch value={notifEnabled} onValueChange={setNotifEnabled} accentColor={accent} />
              </View>
            </Card>

            {/* Hesap Seçenekleri */}
            <Card>
              <SectionTitle>Hesap Seçenekleri</SectionTitle>

              {/* Hesap Türü */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <User size={14} color="#9A9A9A" strokeWidth={1.8} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#9A9A9A', width: 90 }}>Hesap Türü</Text>
                <Text style={{ fontSize: 14, color: '#3C3C3C', flex: 1 }}>{roleLabel}</Text>
              </View>

              <Divider />

              {/* Katılım Tarihi */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <Calendar size={14} color="#9A9A9A" strokeWidth={1.8} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#9A9A9A', width: 90 }}>Katılım Tarihi</Text>
                <Text style={{ fontSize: 14, color: '#3C3C3C', flex: 1 }}>{joinedDate(profile) || '—'}</Text>
              </View>

              <Divider />

              {/* Çıkış */}
              <Pressable
                onPress={handleSignOut}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} color="#EF4444" strokeWidth={1.8} />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#EF4444', flex: 1 }}>Hesaptan Çıkış Yap</Text>
                <ChevronRight size={16} color="#FCA5A5" strokeWidth={1.8} />
              </Pressable>
            </Card>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
