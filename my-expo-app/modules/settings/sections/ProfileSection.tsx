/**
 * ProfileSection — Patterns Design Language (NativeWind)
 * ──────────────────────────────────────────────────────
 * Ayarlar > Profil sekmesi. Avatar, kişisel bilgiler, e-posta,
 * şifre değiştirme, hesap bilgileri.
 * Patterns cardSolid: bg-white rounded-[24px] p-[22px] + soft shadow.
 * Lucide ikonlar, Inter Tight Light display.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Image, Platform, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera, Edit2, Mail, Phone, Lock, Shield,
  Calendar, LogOut, ChevronRight, ChevronUp, Eye, EyeOff, X,
  MapPin, User as UserIcon, Hash, MessageCircle, GraduationCap, Briefcase, Building2,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';

// ── Helpers ──────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  admin: 'Sistem Yöneticisi', manager: 'Mesul Müdür',
  technician: 'Teknisyen', doctor: 'Hekim',
  clinic_admin: 'Klinik Müdürü', lab: 'Lab Personeli',
};
function getRoleLabel(p: any): string {
  if (p?.user_type === 'admin')        return ROLE_LABEL.admin;
  if (p?.user_type === 'doctor')       return ROLE_LABEL.doctor;
  if (p?.user_type === 'clinic_admin') return ROLE_LABEL.clinic_admin;
  if (p?.role === 'manager')           return ROLE_LABEL.manager;
  if (p?.role === 'technician')        return ROLE_LABEL.technician;
  return ROLE_LABEL.lab;
}
function joinedDate(p: any): string {
  if (!p?.created_at) return '';
  return new Date(p.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// cardSolid shadow (patterns)
const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

// ── InfoRow (hero card bilgi satırı) ─────────────────────────────────────
function InfoRow({ icon: Icon, value }: { icon: any; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={13} color="#9A9A9A" strokeWidth={1.6} />
      <Text className="text-[13px] text-ink-500 flex-1" numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── CardRow (sağ taraf kart satırı — view / edit modları) ────────────────
function CardRow({ icon: Icon, iconColor, iconBg, label, value, placeholder, editing, editValue, onChangeEdit, inputProps }: {
  icon: any; iconColor: string; iconBg: string;
  label: string; value?: string | null; placeholder?: string;
  editing?: boolean; editValue?: string; onChangeEdit?: (v: string) => void;
  inputProps?: Record<string, any>;
}) {
  return (
    <View className="flex-row items-center gap-3 py-1">
      <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: iconBg }}>
        <Icon size={14} color={iconColor} strokeWidth={1.8} />
      </View>
      <View className="flex-1">
        <Text className="text-[11px] text-ink-400 mb-0.5">{label}</Text>
        {editing && onChangeEdit ? (
          <TextInput
            className="border border-black/[0.06] rounded-lg px-2.5 py-1.5 text-[13px] text-ink-900 bg-ink-50 mt-0.5"
            value={editValue ?? ''} onChangeText={onChangeEdit}
            placeholder={placeholder || label} placeholderTextColor="#C0C0C8"
            // @ts-ignore web
            style={{ outlineWidth: 0 }}
            {...inputProps}
          />
        ) : (
          <Text className={`text-[14px] font-medium ${value ? 'text-ink-900' : 'text-ink-300'}`} numberOfLines={1}>
            {value || placeholder || '—'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Gender picker options ────────────────────────────────────────────────
const GENDER_OPTIONS = [
  { value: 'erkek', label: 'Erkek' },
  { value: 'kadın', label: 'Kadın' },
  { value: 'belirtilmedi', label: 'Belirtilmedi' },
] as const;

// ── Props ────────────────────────────────────────────────────────────────
interface Props { accentColor: string; }

// ── Component ────────────────────────────────────────────────────────────
export function ProfileSection({ accentColor }: Props) {
  const { profile, signOut, setProfile } = useAuthStore() as any;
  const roleLabel = getRoleLabel(profile);
  const initial = (profile?.full_name ?? '?').charAt(0).toUpperCase();

  // Avatar
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit — kişisel
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [tcKimlik, setTcKimlik] = useState(profile?.tc_kimlik_no ?? '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_phone ?? '');
  // Edit — mesleki
  const [diplomaNo, setDiplomaNo] = useState(profile?.diploma_no ?? '');
  const [specialty, setSpecialty] = useState(profile?.specialty ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [savingInfo, setSavingInfo] = useState(false);

  // Email
  const [email, setEmail] = useState(profile?.email ?? '');
  const [editEmail, setEditEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setEmail(profile?.email ?? '');
    setAvatarUri(profile?.avatar_url ?? null);
    setBirthDate(profile?.birth_date ?? '');
    setGender(profile?.gender ?? '');
    setCity(profile?.city ?? '');
    setAddress(profile?.address ?? '');
    setTcKimlik(profile?.tc_kimlik_no ?? '');
    setWhatsapp(profile?.whatsapp_phone ?? '');
    setDiplomaNo(profile?.diploma_no ?? '');
    setSpecialty(profile?.specialty ?? '');
    setDepartment(profile?.department ?? '');
  }, [profile]);

  /* ── Handlers ─────────────────────────────────────────────────────── */
  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.warning('Galeri erişimi için izin verin.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true,
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
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: mime });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id);
      if (dbErr) throw new Error(dbErr.message);
      setAvatarUri(publicUrl);
      if (setProfile) setProfile({ ...profile, avatar_url: urlData.publicUrl });
    } catch (e: any) { toast.error(e.message ?? 'Fotoğraf yüklenemedi.'); }
    finally { setUploadingAvatar(false); }
  };

  const handleSaveInfo = async () => {
    if (!fullName.trim()) { toast.error('Ad Soyad boş bırakılamaz.'); return; }
    setSavingInfo(true);
    try {
      const updates: Record<string, any> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        birth_date: birthDate.trim() || null,
        gender: gender || null,
        city: city.trim() || null,
        address: address.trim() || null,
        tc_kimlik_no: tcKimlik.trim() || null,
        whatsapp_phone: whatsapp.trim() || null,
        diploma_no: diplomaNo.trim() || null,
        specialty: specialty.trim() || null,
        department: department.trim() || null,
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
      if (error) throw new Error(error.message);
      if (setProfile) setProfile({ ...profile, ...updates });
      setEditing(false); toast.success('Bilgileriniz güncellendi.');
    } catch (e: any) { toast.error(e.message ?? 'Bir hata oluştu.'); }
    finally { setSavingInfo(false); }
  };

  const handleSaveEmail = async () => {
    if (!email.trim()) { toast.error('E-posta boş bırakılamaz.'); return; }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      if (setProfile) setProfile({ ...profile, email: email.trim() });
      setEditEmail(false); toast.success('Doğrulama e-postası gönderildi.');
    } catch (e: any) { toast.error(e.message ?? 'E-posta güncellenemedi.'); }
    finally { setSavingEmail(false); }
  };

  const handleChangePassword = async () => {
    if (newPass.length < 6) { toast.error('Şifre en az 6 karakter olmalıdır.'); return; }
    if (newPass !== confirmPass) { toast.error('Şifreler eşleşmiyor.'); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw new Error(error.message);
      setNewPass(''); setConfirmPass(''); setShowPass(false);
      toast.success('Şifreniz değiştirildi.');
    } catch (e: any) { toast.error(e.message ?? 'Şifre değiştirilemedi.'); }
    finally { setSavingPass(false); }
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

  const handleCancelEdit = () => {
    setEditing(false);
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setBirthDate(profile?.birth_date ?? '');
    setGender(profile?.gender ?? '');
    setCity(profile?.city ?? '');
    setAddress(profile?.address ?? '');
    setTcKimlik(profile?.tc_kimlik_no ?? '');
    setWhatsapp(profile?.whatsapp_phone ?? '');
    setDiplomaNo(profile?.diploma_no ?? '');
    setSpecialty(profile?.specialty ?? '');
    setDepartment(profile?.department ?? '');
  };

  const passNoMatch = newPass.length > 0 && confirmPass.length > 0 && newPass !== confirmPass;

  /* ── Avatar sub-component ─────────────────────────────────────────── */
  const AvatarBlock = () => (
    <Pressable onPress={handlePickAvatar} className="relative flex-shrink-0">
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} className="w-14 h-14 rounded-2xl" />
      ) : (
        <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: accentColor }}>
          <Text className="text-[22px] font-extrabold text-white">{initial}</Text>
        </View>
      )}
      <View
        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center border-2 border-white"
        style={{ backgroundColor: accentColor }}
      >
        {uploadingAvatar
          ? <ActivityIndicator size={8} color="#fff" />
          : <Camera size={9} color="#FFFFFF" strokeWidth={2.5} />}
      </View>
    </Pressable>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 0, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ═══════ ANA LAYOUT: Sol (Profil hero) — Sağ (Bilgi kartları) ═══════ */}
      <View className="flex-row gap-5" style={{ alignItems: 'flex-start' }}>

        {/* ══ SOL — Profil hero kartı ══ */}
        <View style={{ width: 280 }}>
          <View
            className="bg-white rounded-[24px]"
            style={CARD_SHADOW}
          >
            {/* Avatar — kart içinde padding + rounded */}
            <Pressable onPress={handlePickAvatar} className="relative p-3 pb-0">
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  className="w-full rounded-[18px]"
                  style={{ aspectRatio: 4 / 5 }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  className="w-full items-center justify-center rounded-[18px]"
                  style={{ aspectRatio: 4 / 5, backgroundColor: accentColor }}
                >
                  <Text className="text-[72px] font-bold text-white">{initial}</Text>
                </View>
              )}
              {/* Camera badge */}
              <View
                className="absolute bottom-2 right-5 w-8 h-8 rounded-full items-center justify-center border-2 border-white"
                style={{ backgroundColor: accentColor }}
              >
                {uploadingAvatar
                  ? <ActivityIndicator size={12} color="#fff" />
                  : <Camera size={14} color="#FFFFFF" strokeWidth={2} />}
              </View>
            </Pressable>

            {/* Name + role + info */}
            <View className="px-5 pt-4 pb-5">
              <Text
                className="text-ink-900 mb-1.5"
                style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 20, letterSpacing: -0.4 }}
                numberOfLines={1}
              >
                {profile?.full_name ?? '—'}
              </Text>
              <View className="self-start rounded-full px-3 py-1 mb-4" style={{ backgroundColor: `${accentColor}18` }}>
                <Text className="text-[11px] font-semibold" style={{ color: accentColor }}>{roleLabel}</Text>
              </View>

              {/* Info rows */}
              <View className="gap-2">
                <InfoRow icon={Mail} value={profile?.email} />
                <InfoRow icon={Phone} value={profile?.phone} />
                {profile?.whatsapp_phone ? <InfoRow icon={MessageCircle} value={profile.whatsapp_phone} /> : null}
                {profile?.city ? <InfoRow icon={MapPin} value={profile.city} /> : null}
                {profile?.specialty ? <InfoRow icon={GraduationCap} value={profile.specialty} /> : null}
                {profile?.department ? <InfoRow icon={Briefcase} value={profile.department} /> : null}
                <InfoRow icon={Calendar} value={joinedDate(profile)} />
              </View>

              {/* Edit button */}
              <Pressable
                onPress={() => setEditing(true)}
                className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl mt-4"
                style={{ backgroundColor: accentColor }}
              >
                <Edit2 size={13} color="#FFFFFF" strokeWidth={1.8} />
                <Text className="text-[13px] font-semibold text-white">Profili Düzenle</Text>
              </Pressable>

              {/* Hesap bilgileri */}
              <View className="mt-4 pt-4 border-t border-black/[0.04] gap-2">
                <View className="flex-row items-center gap-2.5">
                  <Shield size={13} color="#9A9A9A" strokeWidth={1.6} />
                  <Text className="text-[13px] text-ink-500">{roleLabel}</Text>
                </View>
                <View className="flex-row items-center gap-2.5">
                  <Calendar size={13} color="#9A9A9A" strokeWidth={1.6} />
                  <Text className="text-[13px] text-ink-500">{joinedDate(profile) || '—'}</Text>
                </View>
              </View>

              {/* Çıkış */}
              <Pressable onPress={handleSignOut} className="flex-row items-center justify-center gap-2 py-2 rounded-xl mt-3 border border-red-200">
                <LogOut size={13} color="#EF4444" strokeWidth={1.8} />
                <Text className="text-[13px] font-semibold text-red-500">Çıkış Yap</Text>
              </Pressable>
            </View>
          </View>

        </View>

        {/* ══ SAĞ — Bilgi kartları (her zaman view mode) ══ */}
        <View className="flex-1 gap-4">

          {/* ROW 1 — Kişisel + İletişim */}
          <View className="flex-row gap-4" style={{ alignItems: 'flex-start' }}>
            {/* Kişisel Bilgiler */}
            <View className="flex-1 bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase text-ink-400 mb-3">Kişisel Bilgiler</Text>
              <CardRow icon={UserIcon} iconColor={accentColor} iconBg={`${accentColor}14`} label="Doğum Tarihi" value={profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : null} />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={UserIcon} iconColor={accentColor} iconBg={`${accentColor}14`} label="Cinsiyet" value={profile?.gender === 'erkek' ? 'Erkek' : profile?.gender === 'kadın' ? 'Kadın' : profile?.gender === 'belirtilmedi' ? 'Belirtilmedi' : null} />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={MapPin} iconColor={accentColor} iconBg={`${accentColor}14`} label="Şehir" value={profile?.city} />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={Hash} iconColor={accentColor} iconBg={`${accentColor}14`} label="TC Kimlik" value={profile?.tc_kimlik_no ? `***${profile.tc_kimlik_no.slice(-4)}` : null} />
            </View>

            {/* İletişim */}
            <View className="flex-1 bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase text-ink-400 mb-3">İletişim</Text>
              <View className="flex-row items-center gap-3 py-1">
                <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${accentColor}14` }}>
                  <Mail size={14} color={accentColor} strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] text-ink-400 mb-0.5">E-posta</Text>
                  <Text className="text-[14px] font-medium text-ink-900" numberOfLines={1}>{profile?.email ?? '—'}</Text>
                </View>
                <Pressable onPress={() => setEditEmail(v => !v)} className="p-1.5">
                  {editEmail ? <X size={14} color="#9A9A9A" strokeWidth={1.8} /> : <Edit2 size={14} color="#9A9A9A" strokeWidth={1.8} />}
                </Pressable>
              </View>
              {editEmail && (
                <View className="mt-3 pt-3.5 border-t border-black/[0.04] gap-3">
                  <TextInput className="border border-black/[0.06] rounded-xl px-3.5 py-3 text-[14px] text-ink-900 bg-ink-50" value={email} onChangeText={setEmail} placeholder="yeni@email.com" placeholderTextColor="#C0C0C8" keyboardType="email-address" autoCapitalize="none" autoFocus style={{ outlineWidth: 0 } as any} />
                  <Pressable onPress={handleSaveEmail} disabled={savingEmail} className="items-center py-3 rounded-xl" style={{ backgroundColor: accentColor, opacity: savingEmail ? 0.6 : 1 }}>
                    {savingEmail ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-[13px] font-semibold text-white">Güncelle</Text>}
                  </Pressable>
                </View>
              )}
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={Phone} iconColor={accentColor} iconBg={`${accentColor}14`} label="Telefon" value={profile?.phone} placeholder="Eklenmedi" />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={MessageCircle} iconColor={accentColor} iconBg={`${accentColor}14`} label="WhatsApp" value={profile?.whatsapp_phone} placeholder="Eklenmedi" />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={MapPin} iconColor={accentColor} iconBg={`${accentColor}14`} label="Adres" value={profile?.address} placeholder="Eklenmedi" />
            </View>
          </View>

          {/* ROW 2 — Mesleki + Güvenlik */}
          <View className="flex-row gap-4" style={{ alignItems: 'flex-start' }}>
            {/* Mesleki Bilgiler */}
            <View className="flex-1 bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase text-ink-400 mb-3">Mesleki Bilgiler</Text>
              <CardRow icon={GraduationCap} iconColor={accentColor} iconBg={`${accentColor}14`} label="Uzmanlık" value={profile?.specialty} placeholder="Belirtilmedi" />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={Briefcase} iconColor={accentColor} iconBg={`${accentColor}14`} label="Departman" value={profile?.department} placeholder="Belirtilmedi" />
              <View className="h-px bg-black/[0.04] my-2" />
              <CardRow icon={Hash} iconColor={accentColor} iconBg={`${accentColor}14`} label="Diploma No" value={profile?.diploma_no} placeholder="Belirtilmedi" />
            </View>

            {/* Güvenlik */}
            <View className="flex-1 bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase text-ink-400 mb-3">Güvenlik</Text>
              <Pressable onPress={() => setShowPass(v => !v)} className="flex-row items-center gap-3 py-1">
                <View className="w-8 h-8 rounded-lg items-center justify-center bg-amber-50">
                  <Lock size={14} color="#D97706" strokeWidth={1.8} />
                </View>
                <Text className="flex-1 text-[14px] font-medium text-ink-700">Şifre Değiştir</Text>
                {showPass ? <ChevronUp size={16} color="#9A9A9A" strokeWidth={1.8} /> : <ChevronRight size={16} color="#9A9A9A" strokeWidth={1.8} />}
              </Pressable>
              {showPass && (
                <View className="mt-3 pt-3.5 border-t border-black/[0.04] gap-3.5">
                  <View className="gap-1.5">
                    <Text className="text-[10px] font-semibold tracking-wider uppercase text-ink-400">Yeni Şifre</Text>
                    <View className="flex-row items-center border border-black/[0.06] rounded-xl bg-ink-50">
                      <TextInput className="flex-1 px-3.5 py-3 text-[14px] text-ink-900" value={newPass} onChangeText={setNewPass} placeholder="En az 6 karakter" placeholderTextColor="#C0C0C8" secureTextEntry={!showNew} style={{ outlineWidth: 0 } as any} />
                      <Pressable onPress={() => setShowNew(v => !v)} className="px-3 py-3">
                        {showNew ? <EyeOff size={15} color="#C0C0C8" strokeWidth={1.8} /> : <Eye size={15} color="#C0C0C8" strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                  </View>
                  <View className="gap-1.5">
                    <Text className={`text-[10px] font-semibold tracking-wider uppercase ${passNoMatch ? 'text-red-500' : 'text-ink-400'}`}>Şifre Tekrar</Text>
                    <View className="flex-row items-center rounded-xl bg-ink-50" style={{ borderWidth: 1, borderColor: passNoMatch ? '#EF4444' : 'rgba(0,0,0,0.06)' }}>
                      <TextInput className={`flex-1 px-3.5 py-3 text-[14px] ${passNoMatch ? 'text-red-500' : 'text-ink-900'}`} value={confirmPass} onChangeText={setConfirmPass} placeholder="Tekrar girin" placeholderTextColor="#C0C0C8" secureTextEntry={!showConfirm} style={{ outlineWidth: 0 } as any} />
                      <Pressable onPress={() => setShowConfirm(v => !v)} className="px-3 py-3">
                        {showConfirm ? <EyeOff size={15} color="#C0C0C8" strokeWidth={1.8} /> : <Eye size={15} color="#C0C0C8" strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                    {passNoMatch && <Text className="text-[11px] text-red-500 mt-0.5">Şifreler eşleşmiyor</Text>}
                  </View>
                  <Pressable onPress={handleChangePassword} disabled={savingPass} className="items-center py-3 rounded-xl" style={{ backgroundColor: accentColor, opacity: savingPass ? 0.6 : 1 }}>
                    {savingPass ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-[13px] font-semibold text-white">Güncelle</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          </View>


        </View>
      </View>

      {/* ═══════ PROFIL DÜZENLE — MODAL / POPUP ═══════ */}
      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onRequestClose={handleCancelEdit}
      >
        <Pressable
          onPress={handleCancelEdit}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <Pressable
            onPress={() => {}}
            className="bg-white rounded-[24px] w-full"
            style={[{ maxWidth: 620, maxHeight: '85%' }, CARD_SHADOW]}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 pt-5 pb-3">
              <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 20, letterSpacing: -0.4, color: '#0A0A0A' }}>
                Profili Düzenle
              </Text>
              <Pressable onPress={handleCancelEdit} className="w-8 h-8 rounded-full items-center justify-center bg-black/[0.04]">
                <X size={16} color="#6B6B6B" strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Kişisel */}
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: '#6B6B6B', marginTop: 12, marginBottom: 8 }}>Kişisel Bilgiler</Text>
              {/* 2-kolon form grid */}
              <View className="flex-row gap-4">
                <View className="flex-1 gap-4">
                  <FormField label="Ad Soyad" value={fullName} onChange={setFullName} placeholder="Ad Soyad" />
                  <FormField label="Doğum Tarihi" value={birthDate} onChange={setBirthDate} placeholder="1990-01-15" />
                  <FormField label="Şehir" value={city} onChange={setCity} placeholder="İstanbul" />
                </View>
                <View className="flex-1 gap-4">
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#2A2A2A' }}>Cinsiyet</Text>
                    <View className="flex-row gap-2" style={{ height: 44 }}>
                      {GENDER_OPTIONS.map(opt => (
                        <Pressable key={opt.value} onPress={() => setGender(opt.value)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: gender === opt.value ? accentColor : 'rgba(0,0,0,0.08)', backgroundColor: gender === opt.value ? `${accentColor}14` : '#FFFFFF' }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: gender === opt.value ? accentColor : '#6B6B6B' }}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <FormField label="TC Kimlik No" value={tcKimlik} onChange={setTcKimlik} placeholder="11 haneli TC kimlik" keyboardType="number-pad" maxLength={11} />
                  <FormField label="Adres" value={address} onChange={setAddress} placeholder="Açık adres" multiline />
                </View>
              </View>

              {/* İletişim */}
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: '#6B6B6B', marginTop: 20, marginBottom: 8 }}>İletişim</Text>
              <View className="flex-row gap-4">
                <View className="flex-1 gap-4">
                  <FormField label="Telefon" value={phone} onChange={setPhone} placeholder="+90 555 123 45 67" hint="WhatsApp'tan ulaşılabilir" keyboardType="phone-pad" />
                </View>
                <View className="flex-1 gap-4">
                  <FormField label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+90 555 123 45 67" keyboardType="phone-pad" />
                </View>
              </View>

              {/* Mesleki */}
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: '#6B6B6B', marginTop: 20, marginBottom: 8 }}>Mesleki Bilgiler</Text>
              <View className="flex-row gap-4">
                <View className="flex-1 gap-4">
                  <FormField label="Uzmanlık" value={specialty} onChange={setSpecialty} placeholder="Protetik Diş Tedavisi" />
                  <FormField label="Diploma No" value={diplomaNo} onChange={setDiplomaNo} placeholder="Diploma numarası" />
                </View>
                <View className="flex-1 gap-4">
                  <FormField label="Departman" value={department} onChange={setDepartment} placeholder="Sabit Protez" />
                </View>
              </View>

              {/* Form footer — patterns style */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                <Pressable onPress={handleCancelEdit} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFFFFF' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B6B6B' }}>Vazgeç</Text>
                </Pressable>
                <Pressable onPress={handleSaveInfo} disabled={savingInfo} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: accentColor, opacity: savingInfo ? 0.6 : 1 }}>
                  {savingInfo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Kaydet</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

/* ── FormField — patterns "05 · Form Elemanları" stiline uygun ──────── */
function FormField({ label, value, onChange, placeholder, hint, multiline, keyboardType, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; multiline?: boolean; keyboardType?: any; maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: '#2A2A2A' }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor="#9A9A9A"
        multiline={multiline} numberOfLines={multiline ? 3 : 1}
        keyboardType={keyboardType} maxLength={maxLength}
        style={{
          height: multiline ? 80 : 44,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          fontSize: 14,
          color: '#0A0A0A',
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.08)',
          // @ts-ignore web
          outlineWidth: 0,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint && <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{hint}</Text>}
    </View>
  );
}
