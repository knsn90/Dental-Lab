import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../core/ui/Toast';

import { AppIcon } from '../../../core/ui/AppIcon';

// ── Helpers ────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  admin:      'Sistem Yöneticisi',
  manager:    'Mesul Müdür',
  technician: 'Teknisyen',
  doctor:     'Hekim',
  clinic_admin: 'Klinik Müdürü',
  lab:        'Lab Personeli',
};

function getRoleLabel(profile: any): string {
  if (profile?.user_type === 'admin')        return ROLE_LABEL.admin;
  if (profile?.user_type === 'doctor')       return ROLE_LABEL.doctor;
  if (profile?.user_type === 'clinic_admin') return ROLE_LABEL.clinic_admin;
  if (profile?.role === 'manager')           return ROLE_LABEL.manager;
  if (profile?.role === 'technician')        return ROLE_LABEL.technician;
  return ROLE_LABEL.lab;
}

function joinedDate(profile: any): string {
  if (!profile?.created_at) return '';
  return new Date(profile.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  accentColor: string;
}

// ── Component ──────────────────────────────────────────────────────────────
export function ProfileSection({ accentColor }: Props) {
  const { profile, signOut, setProfile } = useAuthStore() as any;
  const roleLabel = getRoleLabel(profile);
  const initial   = (profile?.full_name ?? '?').charAt(0).toUpperCase();

  // Avatar
  const [avatarUri,       setAvatarUri]       = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Personal info edit
  const [editing,    setEditing]    = useState(false);
  const [fullName,   setFullName]   = useState(profile?.full_name ?? '');
  const [phone,      setPhone]      = useState(profile?.phone ?? '');
  const [savingInfo, setSavingInfo] = useState(false);

  // Email
  const [email,       setEmail]       = useState(profile?.email ?? '');
  const [editEmail,   setEditEmail]   = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [showPass,    setShowPass]    = useState(false);
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPass,  setSavingPass]  = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setEmail(profile?.email ?? '');
    setAvatarUri(profile?.avatar_url ?? null);
  }, [profile]);

  // ── Handlers ──────────────────────────────────────────────────────────────
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
      const bytes   = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);

      const mime = asset.mimeType ?? 'image/jpeg';
      const ext  = mime.split('/')[1] ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars').upload(path, bytes, { upsert: true, contentType: mime });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbErr } = await supabase.from('profiles')
        .update({ avatar_url: urlData.publicUrl }).eq('id', profile.id);
      if (dbErr) throw new Error(dbErr.message);

      setAvatarUri(publicUrl);
      if (setProfile) setProfile({ ...profile, avatar_url: urlData.publicUrl });
    } catch (e: any) {
      toast.error(e.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploadingAvatar(false);
    }
  };

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
    } catch (e: any) {
      toast.error(e.message ?? 'Bir hata oluştu.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!email.trim()) { toast.error('E-posta boş bırakılamaz.'); return; }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      if (setProfile) setProfile({ ...profile, email: email.trim() });
      setEditEmail(false);
      toast.success('Doğrulama e-postası gönderildi.');
    } catch (e: any) {
      toast.error(e.message ?? 'E-posta güncellenemedi.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPass.length < 6)     { toast.error('Şifre en az 6 karakter olmalıdır.'); return; }
    if (newPass !== confirmPass) { toast.error('Şifreler eşleşmiyor.'); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw new Error(error.message);
      setNewPass(''); setConfirmPass(''); setShowPass(false);
      toast.success('Şifreniz değiştirildi.');
    } catch (e: any) {
      toast.error(e.message ?? 'Şifre değiştirilemedi.');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Hesabınızdan çıkmak istediğinizden emin misiniz?')) signOut();
    } else {
      Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinizden emin misiniz?', [
        { text: 'İptal', style: 'cancel' },
        { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
      ]);
    }
  };

  const passNoMatch = newPass.length > 0 && confirmPass.length > 0 && newPass !== confirmPass;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >

      {/* ── Profile identity card ───────────────────────────────────── */}
      <View style={s.card}>
        {editing ? (
          /* Edit mode */
          <View style={s.editBlock}>
            <View style={s.editAvatarRow}>
              <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={s.avatarWrap}>
                {avatarUri
                  ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                  : <View style={[s.avatar, { backgroundColor: accentColor }]}>
                      <Text style={s.avatarLetter}>{initial}</Text>
                    </View>}
                <View style={[s.avatarBadge, { backgroundColor: accentColor }]}>
                  {uploadingAvatar
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <AppIcon name="camera" size={11} color="#fff" />}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={s.editHelp}>Ad, soyad ve telefon bilgilerinizi güncelleyin.</Text>
                <TouchableOpacity onPress={handlePickAvatar}>
                  <Text style={[s.editPhotoLink, { color: accentColor }]}>Fotoğrafı değiştir</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>AD SOYAD</Text>
              <TextInput
                style={s.fieldInput as any}
                value={fullName} onChangeText={setFullName}
                placeholder="Ad Soyad" placeholderTextColor="#C0C0C8"
                returnKeyType="next"
              />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>TELEFON</Text>
              <TextInput
                style={s.fieldInput as any}
                value={phone} onChangeText={setPhone}
                placeholder="0555 000 00 00" placeholderTextColor="#C0C0C8"
                keyboardType="phone-pad" returnKeyType="done"
              />
            </View>
            <View style={s.editActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setEditing(false); setFullName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); }}
              >
                <Text style={s.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: accentColor }, savingInfo && { opacity: 0.6 }]}
                onPress={handleSaveInfo} disabled={savingInfo}
              >
                {savingInfo
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.saveBtnText}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* View mode */
          <View style={s.profileRow}>
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85} style={s.avatarWrap}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                : <View style={[s.avatar, { backgroundColor: accentColor }]}>
                    <Text style={s.avatarLetter}>{initial}</Text>
                  </View>}
              <View style={[s.avatarBadge, { backgroundColor: accentColor }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <AppIcon name="camera" size={11} color="#fff" />}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{profile?.full_name ?? '—'}</Text>
              <View style={[s.rolePill, { backgroundColor: accentColor + '14' }]}>
                <Text style={[s.rolePillText, { color: accentColor }]}>{roleLabel}</Text>
              </View>
              {profile?.email ? (
                <Text style={s.profileEmail}>{profile.email}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[s.editBtn, { borderColor: accentColor + '40' }]}
              onPress={() => setEditing(true)}
            >
              <AppIcon name="edit-2" size={13} color={accentColor} />
              <Text style={[s.editBtnText, { color: accentColor }]}>Düzenle</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── İletişim ───────────────────────────────────────────────── */}
      <Text style={[s.sectionLabel, { marginTop: 24 }]}>İletişim Bilgileri</Text>
      <View style={s.card}>
        {/* E-posta */}
        <View style={s.itemRow}>
          <View style={[s.itemIcon, { backgroundColor: accentColor + '14' }]}>
            <AppIcon name="mail" size={14} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.itemLabel}>E-posta</Text>
            <Text style={s.itemValue}>{profile?.email ?? '—'}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditEmail(v => !v)} style={s.dotBtn}>
            <AppIcon name={editEmail ? 'x' : 'edit-2'} size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {editEmail && (
          <View style={s.subBlock}>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>YENİ E-POSTA</Text>
              <TextInput
                style={s.fieldInput as any}
                value={email} onChangeText={setEmail}
                placeholder="yeni@email.com" placeholderTextColor="#C0C0C8"
                keyboardType="email-address" autoCapitalize="none"
                returnKeyType="done" autoFocus
              />
              <Text style={s.fieldHint}>Değişiklik sonrası doğrulama e-postası gönderilir.</Text>
            </View>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: accentColor }, savingEmail && { opacity: 0.6 }]}
              onPress={handleSaveEmail} disabled={savingEmail}
            >
              {savingEmail
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>E-postayı Güncelle</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={s.divider} />

        {/* Telefon */}
        <View style={s.itemRow}>
          <View style={[s.itemIcon, { backgroundColor: accentColor + '14' }]}>
            <AppIcon name="phone" size={14} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.itemLabel}>Telefon</Text>
            <Text style={[s.itemValue, !profile?.phone && { color: '#CBD5E1' }]}>
              {profile?.phone ?? 'Eklenmedi'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditing(true)} style={s.dotBtn}>
            <AppIcon name="edit-2" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Güvenlik ───────────────────────────────────────────────── */}
      <Text style={[s.sectionLabel, { marginTop: 20 }]}>Güvenlik</Text>
      <View style={s.card}>
        <TouchableOpacity
          style={s.navRow}
          onPress={() => setShowPass(v => !v)}
        >
          <View style={[s.itemIcon, { backgroundColor: '#FEF3C720' }]}>
            <AppIcon name="lock" size={14} color="#D97706" />
          </View>
          <Text style={s.navRowText}>Şifre Değiştir</Text>
          <AppIcon name={showPass ? 'chevron-up' : 'chevron-right'} size={16} color="#CBD5E1" />
        </TouchableOpacity>

        {showPass && (
          <View style={s.subBlock}>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>YENİ ŞİFRE</Text>
              <View style={s.passRow}>
                <TextInput
                  style={[s.fieldInput, { flex: 1, borderWidth: 0 }] as any}
                  value={newPass} onChangeText={setNewPass}
                  placeholder="En az 6 karakter" placeholderTextColor="#C0C0C8"
                  secureTextEntry={!showNew} returnKeyType="next"
                />
                <TouchableOpacity onPress={() => setShowNew(v => !v)} style={s.eyeBtn}>
                  <AppIcon name={showNew ? 'eye-off' : 'eye'} size={15} color="#C0C0C8" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.fieldGroup}>
              <Text style={[s.fieldLabel, passNoMatch && { color: '#EF4444' }]}>ŞİFRE TEKRAR</Text>
              <View style={[s.passRow, passNoMatch && { borderColor: '#EF4444' }]}>
                <TextInput
                  style={[s.fieldInput, { flex: 1, borderWidth: 0 }, passNoMatch && { color: '#EF4444' }] as any}
                  value={confirmPass} onChangeText={setConfirmPass}
                  placeholder="Şifreyi tekrar girin" placeholderTextColor="#C0C0C8"
                  secureTextEntry={!showConfirm} returnKeyType="done"
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn}>
                  <AppIcon name={showConfirm ? 'eye-off' : 'eye'} size={15} color="#C0C0C8" />
                </TouchableOpacity>
              </View>
              {passNoMatch && <Text style={s.errorHint}>Şifreler eşleşmiyor</Text>}
            </View>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: accentColor }, savingPass && { opacity: 0.6 }]}
              onPress={handleChangePassword} disabled={savingPass}
            >
              {savingPass
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>Şifreyi Güncelle</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Hesap Bilgileri ─────────────────────────────────────────── */}
      <Text style={[s.sectionLabel, { marginTop: 20 }]}>Hesap Bilgileri</Text>
      <View style={s.card}>
        <View style={s.itemRow}>
          <View style={[s.itemIcon, { backgroundColor: accentColor + '14' }]}>
            <AppIcon name="shield" size={14} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.itemLabel}>Hesap Türü</Text>
            <Text style={s.itemValue}>{roleLabel}</Text>
          </View>
        </View>
        <View style={s.divider} />
        <View style={s.itemRow}>
          <View style={[s.itemIcon, { backgroundColor: accentColor + '14' }]}>
            <AppIcon name="calendar" size={14} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.itemLabel}>Katılım Tarihi</Text>
            <Text style={s.itemValue}>{joinedDate(profile) || '—'}</Text>
          </View>
        </View>
        <View style={s.divider} />
        <TouchableOpacity style={s.dangerRow} onPress={handleSignOut}>
          <View style={[s.itemIcon, { backgroundColor: '#FEF2F2' }]}>
            <AppIcon name="log-out" size={14} color="#EF4444" />
          </View>
          <Text style={s.dangerText}>Hesaptan Çıkış Yap</Text>
          <AppIcon name="chevron-right" size={16} color="#FCA5A5" />
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    padding: 28,
    paddingBottom: 48,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.6,
    textTransform: 'uppercase' as any,
    marginBottom: 8,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  // Profile identity
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 16 },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: '#fff' },
  avatarBadge: {
    position: 'absolute',
    bottom: -4, right: -4,
    width: 20, height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },
  profileName:  { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  rolePill: {
    alignSelf: 'flex-start' as any,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  rolePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  profileEmail: { fontSize: 12, color: '#94A3B8' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  editBtnText: { fontSize: 13, fontWeight: '600' },

  // Edit mode
  editBlock: { gap: 14 },
  editAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editHelp: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 4 },
  editPhotoLink: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },

  // Fields
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.9,
    textTransform: 'uppercase' as any,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E8EDF4',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  fieldHint: { fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Sub-block (email edit, password)
  subBlock: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 2 },
  itemValue: { fontSize: 14, fontWeight: '500', color: '#0F172A' },
  dotBtn: { padding: 6 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 8 },

  // Nav row (password)
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  navRowText: { fontSize: 14, fontWeight: '500', color: '#334155', flex: 1 },

  // Password
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDF4',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 11 },
  errorHint: { fontSize: 11, color: '#EF4444', marginTop: 4 },

  // Danger
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  dangerText: { fontSize: 14, fontWeight: '500', color: '#EF4444', flex: 1 },
});
