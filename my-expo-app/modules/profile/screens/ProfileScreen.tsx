import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  useWindowDimensions,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin:      'Sistem Yöneticisi',
  manager:    'Mesul Müdür',
  technician: 'Teknisyen',
  doctor:     'Hekim',
  lab:        'Lab Personeli',
};

function getRoleLabel(profile: any): string {
  if (profile?.user_type === 'admin') return ROLE_LABEL.admin;
  if (profile?.role === 'manager')    return ROLE_LABEL.manager;
  if (profile?.role === 'technician') return ROLE_LABEL.technician;
  if (profile?.user_type === 'doctor')return ROLE_LABEL.doctor;
  return ROLE_LABEL.lab;
}

function getAccent(profile: any): string {
  // Admin panel = black, everyone else (lab manager/technician, doctor) = blue
  if (profile?.user_type === 'admin') return '#0F172A';
  return '#2563EB';
}

function joinedDate(profile: any): string {
  if (!profile?.created_at) return '';
  return new Date(profile.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrimaryBadge({ color }: { color: string }) {
  return (
    <View style={[c.primaryBadge, { backgroundColor: color + '18' }]}>
      <Text style={[c.primaryBadgeText, { color }]}>Birincil</Text>
    </View>
  );
}

function CardTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={c.cardTitleRow}>
      <Text style={c.cardTitle}>{title}</Text>
      {right}
    </View>
  );
}

function InfoItem({
  icon, label, value, accent,
}: { icon: string; label: string; value: string; accent: string }) {
  return (
    <View style={c.infoItem}>
      <Feather name={icon as any} size={14} color="#94A3B8" />
      <Text style={c.infoLabel}>{label}</Text>
      <Text style={c.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { profile, signOut, setProfile } = useAuthStore() as any;
  const accent    = getAccent(profile);
  const roleLabel = getRoleLabel(profile);
  const initial   = (profile?.full_name ?? '?').charAt(0).toUpperCase();

  const { width: _viewportW } = useWindowDimensions();
  const isMobile = _viewportW < 769;

  // ── Avatar state
  const [avatarUri,    setAvatarUri]    = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Edit mode state
  const [editing,   setEditing]   = useState(false);
  const [fullName,  setFullName]  = useState(profile?.full_name ?? '');
  const [phone,     setPhone]     = useState(profile?.phone    ?? '');
  const [savingInfo,setSavingInfo]= useState(false);

  // ── Email state
  const [email,      setEmail]      = useState(profile?.email ?? '');
  const [editEmail,  setEditEmail]  = useState(false);
  const [savingEmail,setSavingEmail]= useState(false);

  // ── Password state
  const [showPassSection, setShowPassSection] = useState(false);
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPass,  setSavingPass]  = useState(false);

  // ── Prefs
  const [notifEnabled, setNotifEnabled] = useState(true);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone    ?? '');
    setEmail(profile?.email    ?? '');
    setAvatarUri(profile?.avatar_url ?? null);
  }, [profile]);

  // ── Pick & upload avatar
  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning('Galeri erişimi için izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) { toast.error('Görsel okunamadı.'); return; }

    setUploadingAvatar(true);
    try {
      // base64 → Uint8Array (web & native uyumlu)
      const byteStr = atob(asset.base64);
      const bytes   = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);

      const mime = asset.mimeType ?? 'image/jpeg';
      const ext  = mime.split('/')[1] ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      // Upload
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { upsert: true, contentType: mime });
      if (uploadErr) throw new Error(uploadErr.message);

      // Public URL (cache bust)
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Save to profiles
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id);
      if (dbErr) throw new Error(dbErr.message);

      setAvatarUri(publicUrl);
      if (setProfile) setProfile({ ...profile, avatar_url: urlData.publicUrl });
    } catch (e: any) {
      toast.error(e.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploadingAvatar(false);
    }
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
    } catch (e: any) {
      toast.error(e.message ?? 'Bir hata oluştu.');
    } finally {
      setSavingInfo(false);
    }
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
    } catch (e: any) {
      toast.error(e.message ?? 'E-posta güncellenemedi.');
    } finally {
      setSavingEmail(false);
    }
  };

  // ── Change password
  const handleChangePassword = async () => {
    if (newPass.length < 6)      { toast.error('Şifre en az 6 karakter olmalıdır.'); return; }
    if (newPass !== confirmPass)  { toast.error('Şifreler eşleşmiyor.'); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw new Error(error.message);
      setNewPass(''); setConfirmPass(''); setShowPassSection(false);
      toast.success('Şifreniz değiştirildi.');
    } catch (e: any) {
      toast.error(e.message ?? 'Şifre değiştirilemedi.');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  const passNoMatch = newPass.length > 0 && confirmPass.length > 0 && newPass !== confirmPass;

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.container, isMobile && { padding: 14, paddingTop: 16, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Profil Kartı ── */}
          <View style={[s.card, isMobile && { padding: 14, borderRadius: 14 }]}>
            <CardTitle
              title="Profiliniz"
              right={<Text style={s.joinedText}>Katılım {joinedDate(profile)}</Text>}
            />

            {editing ? (
              /* Edit mode */
              <View style={s.editBlock}>
                <View style={s.editAvatarRow}>
                  <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={s.avatarWrap}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                    ) : (
                      <View style={[s.avatar, { backgroundColor: accent }]}>
                        <Text style={s.avatarLetter}>{initial}</Text>
                      </View>
                    )}
                    <View style={[s.avatarEditBadge, { backgroundColor: accent }]}>
                      {uploadingAvatar
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Feather name="camera" size={11} color="#FFF" />}
                    </View>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={s.editHelp}>Ad, soyad ve telefon bilgilerinizi güncelleyin.</Text>
                    <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.75}>
                      <Text style={[s.changePhotoText, { color: accent }]}>Fotoğrafı değiştir</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>AD SOYAD</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Ad Soyad"
                    placeholderTextColor="#C0C0C8"
                    returnKeyType="next"
                  />
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>TELEFON</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="0555 000 00 00"
                    placeholderTextColor="#C0C0C8"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                  />
                </View>

                <View style={s.editActions}>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={() => { setEditing(false); setFullName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); }}
                    activeOpacity={0.75}
                  >
                    <Text style={s.cancelBtnText}>Vazgeç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, { backgroundColor: accent }, savingInfo && s.saveBtnDim]}
                    onPress={handleSaveInfo}
                    disabled={savingInfo}
                    activeOpacity={0.82}
                  >
                    {savingInfo
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={s.saveBtnText}>Kaydet</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* View mode */
              <View style={s.profileRow}>
                <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85} style={s.avatarWrap}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                  ) : (
                    <View style={[s.avatar, { backgroundColor: accent }]}>
                      <Text style={s.avatarLetter}>{initial}</Text>
                    </View>
                  )}
                  <View style={[s.avatarEditBadge, { backgroundColor: accent }]}>
                    {uploadingAvatar
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Feather name="camera" size={11} color="#FFF" />}
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={s.profileName}>{profile?.full_name ?? '—'}</Text>
                  <View style={[s.rolePill, { backgroundColor: accent + '14' }]}>
                    <Text style={[s.rolePillText, { color: accent }]}>{roleLabel}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.editBtn, { borderColor: accent + '40' }]}
                  onPress={() => setEditing(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="edit-2" size={13} color={accent} />
                  <Text style={[s.editBtnText, { color: accent }]}>Düzenle</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── 2 Sütun ── */}
          <View style={[s.grid, { marginTop: isMobile ? 12 : 16 }, isMobile && { flexDirection: 'column', gap: 12 }]}>

            {/* Sol sütun */}
            <View style={[s.col, isMobile && { gap: 12 }]}>

              {/* İletişim Kartı — E-posta + Telefon */}
              <View style={[s.card, isMobile && { padding: 14, borderRadius: 14 }]}>
                <CardTitle title="İletişim" />

                {/* E-posta satırı */}
                <View style={s.itemRow}>
                  <Feather name="mail" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemLabel}>E-posta</Text>
                    <Text style={s.itemText} numberOfLines={1}>{profile?.email ?? '—'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditEmail(v => !v)} style={s.dotBtn}>
                    <Feather name={editEmail ? 'x' : 'edit-2'} size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {editEmail && (
                  <View style={s.emailEditBlock}>
                    <View style={s.fieldGroup}>
                      <Text style={s.fieldLabel}>YENİ E-POSTA</Text>
                      <TextInput
                        style={s.fieldInput}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="yeni@email.com"
                        placeholderTextColor="#C0C0C8"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        returnKeyType="done"
                        autoFocus
                      />
                      <Text style={s.fieldHint}>Değişiklik sonrası doğrulama e-postası gönderilir.</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.saveBtn, { backgroundColor: accent }, savingEmail && s.saveBtnDim]}
                      onPress={handleSaveEmail}
                      disabled={savingEmail}
                      activeOpacity={0.82}
                    >
                      {savingEmail
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Text style={s.saveBtnText}>E-postayı Güncelle</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                <View style={s.itemDivider} />

                {/* Telefon satırı */}
                <View style={s.itemRow}>
                  <Feather name="phone" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemLabel}>Telefon</Text>
                    <Text style={[s.itemText, !profile?.phone && { color: '#C0C0C8' }]}>
                      {profile?.phone ?? 'Eklenmedi'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditing(true)} style={s.dotBtn}>
                    <Feather name="edit-2" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Güvenlik Kartı */}
              <View style={[s.card, isMobile && { padding: 14, borderRadius: 14 }]}>
                <CardTitle title="Güvenlik" />
                <TouchableOpacity
                  style={s.navRow}
                  onPress={() => setShowPassSection(v => !v)}
                  activeOpacity={0.75}
                >
                  <Feather name="lock" size={15} color="#64748B" />
                  <Text style={s.navRowText}>Şifre Değiştir</Text>
                  <Feather
                    name={showPassSection ? 'chevron-up' : 'chevron-right'}
                    size={16} color="#CBD5E1"
                    style={{ marginLeft: 'auto' as any }}
                  />
                </TouchableOpacity>
                {showPassSection && (
                  <View style={s.passBlock}>
                    <View style={s.fieldGroup}>
                      <Text style={s.fieldLabel}>YENİ ŞİFRE</Text>
                      <View style={s.passInputRow}>
                        <TextInput
                          style={[s.fieldInput, { flex: 1 }]}
                          value={newPass} onChangeText={setNewPass}
                          placeholder="En az 6 karakter" placeholderTextColor="#C0C0C8"
                          secureTextEntry={!showNew} returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setShowNew(v => !v)} style={s.eyeBtn}>
                          <Feather name={showNew ? 'eye-off' : 'eye'} size={15} color="#C0C0C8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={s.fieldGroup}>
                      <Text style={[s.fieldLabel, passNoMatch && { color: '#EF4444' }]}>ŞİFRE TEKRAR</Text>
                      <View style={[s.passInputRow, passNoMatch && { borderColor: '#EF4444' }]}>
                        <TextInput
                          style={[s.fieldInput, { flex: 1 }, passNoMatch && { color: '#EF4444' }]}
                          value={confirmPass} onChangeText={setConfirmPass}
                          placeholder="Şifreyi tekrar girin" placeholderTextColor="#C0C0C8"
                          secureTextEntry={!showConfirm} returnKeyType="done"
                        />
                        <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn}>
                          <Feather name={showConfirm ? 'eye-off' : 'eye'} size={15} color="#C0C0C8" />
                        </TouchableOpacity>
                      </View>
                      {passNoMatch && <Text style={s.errorHint}>Şifreler eşleşmiyor</Text>}
                    </View>
                    <TouchableOpacity
                      style={[s.saveBtn, { backgroundColor: accent }, savingPass && s.saveBtnDim]}
                      onPress={handleChangePassword} disabled={savingPass} activeOpacity={0.82}
                    >
                      {savingPass
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Text style={s.saveBtnText}>Şifreyi Güncelle</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

            </View>{/* /sol sütun */}

            {/* Sağ sütun */}
            <View style={[s.col, isMobile && { gap: 12 }]}>

              {/* Tercihler Kartı */}
              <View style={[s.card, isMobile && { padding: 14, borderRadius: 14 }]}>
                <CardTitle title="Tercihler" />
                <View style={s.toggleRow}>
                  <Feather name="bell" size={15} color="#64748B" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>Bildirimler</Text>
                    <Text style={s.toggleSub}>Sipariş ve durum güncellemeleri</Text>
                  </View>
                  <AppSwitch value={notifEnabled} onValueChange={setNotifEnabled} accentColor={accent} />
                </View>
              </View>

              {/* Hesap Seçenekleri Kartı */}
              <View style={[s.card, isMobile && { padding: 14, borderRadius: 14 }]}>
                <CardTitle title="Hesap Seçenekleri" />
                <InfoItem icon="user" label="Hesap Türü" value={roleLabel} accent={accent} />
                <View style={s.itemDivider} />
                <InfoItem icon="calendar" label="Katılım Tarihi" value={joinedDate(profile) || '—'} accent={accent} />
                <View style={s.itemDivider} />
                <TouchableOpacity style={s.dangerRow} onPress={handleSignOut} activeOpacity={0.75}>
                  <Feather name="log-out" size={15} color="#EF4444" />
                  <Text style={s.dangerText}>Hesaptan Çıkış Yap</Text>
                  <Feather name="chevron-right" size={16} color="#FCA5A5" style={{ marginLeft: 'auto' as any }} />
                </TouchableOpacity>
              </View>

            </View>{/* /sağ sütun */}

          </View>{/* /grid */}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Card sub-styles (shared) ─────────────────────────────────────────────────

const c = StyleSheet.create({
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardTitle:    { fontSize: 15, fontWeight: '600', color: '#0F172A', flex: 1 },
  primaryBadge: { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3, marginRight: 10 },
  primaryBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingTop: 24, paddingBottom: 32, maxWidth: 1000, width: '100%', alignSelf: 'center' as any },

  // 2-col grid
  grid: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  col:  { flex: 1, gap: 16 },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  } as any,

  joinedText: { fontSize: 12, color: '#94A3B8', fontWeight: '400' },

  // Profile row (view mode)
  profileRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarWrap:   { position: 'relative', flexShrink: 0 },
  avatar:       { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarImg:    { width: 52, height: 52, borderRadius: 16 },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  avatarEditBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  profileName:  { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3, marginBottom: 5 },
  rolePill:     { alignSelf: 'flex-start' as any, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 5 },
  rolePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  profilePhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  profilePhone: { fontSize: 12, color: '#94A3B8', fontWeight: '400' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  editBtnText: { fontSize: 13, fontWeight: '600' },

  // Edit mode block
  editBlock: { gap: 14 },
  editAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editHelp:        { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 4 },
  changePhotoText: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },

  // Field
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.9, textTransform: 'uppercase' as any },
  fieldInput: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: '#0F172A',
    outlineStyle: 'none',
  } as any,
  fieldHint: { fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Save / dim
  saveBtn:     { alignItems: 'center', justifyContent: 'center', flex: 1, borderRadius: 12, paddingVertical: 13 },
  saveBtnDim:  { opacity: 0.6 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Item row
  itemRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemLabel: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginBottom: 2 },
  itemText:  { fontSize: 14, color: '#334155', fontWeight: '400' },
  dotBtn:    { padding: 6 },

  // Email edit block
  emailEditBlock: { marginTop: 14, gap: 12, borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 14 },

  // Item divider
  itemDivider: { height: 1, backgroundColor: '#F8FAFC', marginVertical: 2 },

  // Nav row (security)
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  navRowText: { fontSize: 14, color: '#334155', fontWeight: '500', flex: 1 },

  // Password block
  passBlock: { marginTop: 14, gap: 14, borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 14 },
  passInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 11 },
  errorHint: { fontSize: 11, color: '#EF4444', marginTop: 4 },

  // Toggle row
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '500', color: '#0F172A' },
  toggleSub:   { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Danger row (sign out)
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dangerText: { fontSize: 14, fontWeight: '500', color: '#EF4444', flex: 1 },
});
