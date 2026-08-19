import { localeTag } from '../../../core/i18n';
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
  Alert, Image, Platform, Modal, useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera, Edit2, Mail, Phone, Lock, LogOut, ChevronLeft, ChevronRight, Eye, EyeOff, X,
  MapPin, User as UserIcon, Hash, MessageCircle, GraduationCap, Briefcase, Building2,
  Receipt, CreditCard, Search, Plus, Calendar,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { ColorOrb } from '../../denty/components/ColorOrb';
import { toast } from '../../../core/ui/Toast';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { searchPlaces, getPlaceDetails, startPlaceSession, endPlaceSession, type PlaceSuggestion } from '../../auth/api/places';

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
  return new Date(p.created_at).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' });
}

// cardSolid shadow (patterns)
const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

// ── Profil tamamlanma ────────────────────────────────────────────────────
// Hangi alanların "profil" sayıldığı tek yerde dursun: yüzde, eksik sayısı ve
// ilerleme çubuğu aynı listeden türer, birbirinden kaymaz.
const COMPLETION_FIELDS: { key: string; label: string }[] = [
  { key: 'avatar_url',      label: 'Profil fotoğrafı' },
  { key: 'email',           label: 'E-posta' },
  { key: 'phone',           label: 'Telefon' },
  { key: 'whatsapp_phone',  label: 'WhatsApp' },
  { key: 'birth_date',      label: 'Doğum tarihi' },
  { key: 'gender',          label: 'Cinsiyet' },
  { key: 'city',            label: 'Şehir' },
  { key: 'address',         label: 'Adres' },
  { key: 'tc_kimlik_no',    label: 'TC Kimlik' },
  { key: 'specialty',       label: 'Uzmanlık' },
  { key: 'department',      label: 'Departman' },
  { key: 'diploma_no',      label: 'Diploma No' },
];

function profileCompletion(p: any): { pct: number; missing: number; total: number } {
  const total = COMPLETION_FIELDS.length;
  const filled = COMPLETION_FIELDS.reduce((n, f) => {
    const v = p?.[f.key];
    return n + (v != null && String(v).trim() !== '' ? 1 : 0);
  }, 0);
  return { pct: Math.round((filled / total) * 100), missing: total - filled, total };
}

// ── InfoRow (hero card bilgi satırı) ─────────────────────────────────────
function InfoRow({ icon: Icon, value }: { icon: any; value?: string | null }) {
  const T = useMobileTokens();
  if (!value) return null;
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={13} color={T.ink3} strokeWidth={1.6} />
      <Text className="text-[13px] flex-1" style={{ color: T.ink2 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── CardRow (sağ taraf kart satırı — view / edit modları) ────────────────
function CardRow({ icon: Icon, iconColor, iconBg, label, value, placeholder, editing, editValue, onChangeEdit, inputProps, onPress }: {
  icon: any; iconColor: string; iconBg: string;
  label: string; value?: string | null; placeholder?: string;
  editing?: boolean; editValue?: string; onChangeEdit?: (v: string) => void;
  inputProps?: Record<string, any>;
  /** Boş alanı doldurmak için düzenleme moduna götürür. */
  onPress?: () => void;
}) {
  const T = useMobileTokens();
  const empty = !value;
  const Row: any = onPress && !editing ? Pressable : View;
  return (
    <Row
      {...(onPress && !editing ? {
        onPress,
        accessibilityRole: 'button',
        accessibilityLabel: empty ? `${label} ${autoT('ekle')}` : `${label} ${autoT('düzenle')}`,
        style: ({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: 8, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 12,
          opacity: pressed ? 0.6 : 1,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
        }),
      } : { className: 'flex-row items-center gap-3 py-2' })}
    >
      <View className="w-7 h-7 rounded-[9px] items-center justify-center" style={{ backgroundColor: iconBg }}>
        <Icon size={13} color={iconColor} strokeWidth={1.8} />
      </View>
      <View className="flex-1">
        <Text className="text-[11px] mb-0.5" style={{ color: T.ink3 }}>{label}</Text>
        {editing && onChangeEdit ? (
          <TextInput
            className="rounded-lg px-2.5 py-1.5 text-[13px] mt-0.5"
            value={editValue ?? ''} onChangeText={onChangeEdit}
            placeholder={placeholder || label} placeholderTextColor={T.ink3}
            // @ts-ignore web
            style={{ outlineWidth: 0, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.cardSoft, color: T.ink }}
            {...inputProps}
          />
        ) : empty ? (
          /* "Eklenmedi" pasif bir cümledir ve dolu değerle aynı ağırlıkta
             görünüyordu. Yerine aksiyon: kullanıcı satıra basıp doldurur. */
          <View className="flex-row items-center gap-1">
            <Text className="text-[13.5px] font-medium" style={{ color: iconColor }} numberOfLines={1}>
              {placeholder ?? `${label} ekle`}
            </Text>
            <Plus size={12} color={iconColor} strokeWidth={2.2} />
          </View>
        ) : (
          <Text className="text-[14px] font-semibold" style={{ color: T.ink }} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {onPress && !editing && !empty ? (
        <Edit2 size={13} color={T.ink3} strokeWidth={1.8} />
      ) : null}
    </Row>
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
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 900;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const roleLabel = getRoleLabel(profile);
  const completion = profileCompletion(profile);
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

  // Clinic admin tab state — kurum bilgileri ve yetkili (kişisel) bilgileri
  const isClinicAdmin = profile?.user_type === 'clinic_admin';
  const [profileTab, setProfileTab] = useState<'kurum' | 'yetkili'>(isClinicAdmin ? 'kurum' : 'yetkili');
  const [clinicData, setClinicData] = useState<any>(null);
  useEffect(() => {
    if (!isClinicAdmin || !profile?.clinic_id) { setClinicData(null); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('clinics')
        .select('id, name, category, phone, email, address, contact_person, vkn, tax_office, billing_mode, default_payment_terms_days, is_active, logo_url')
        .eq('id', profile.clinic_id)
        .maybeSingle();
      if (alive) setClinicData(data ?? null);
    })();
    return () => { alive = false; };
  }, [isClinicAdmin, profile?.clinic_id]);

  // Adres JSON formatını tek satıra çevir
  const fmtClinicAddress = (raw: any): string | null => {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return fmtClinicAddress(JSON.parse(raw)); } catch { return raw; }
    }
    if (typeof raw === 'object') {
      const parts = [raw.sokak, raw.bina_no ? `No: ${raw.bina_no}` : null, raw.mahalle ? `${raw.mahalle} Mah.` : null, raw.ilce, raw.il, raw.posta_kodu].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    return null;
  };

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
        className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full items-center justify-center border-2 border-white"
        style={{ backgroundColor: accentColor }}
      >
        <Camera size={9} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    </Pressable>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: isNarrow ? 12 : 28, paddingTop: 0, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {/* ═══════ CLINIC ADMIN TAB STRIP ═══════ */}
      {isClinicAdmin && (
        <View style={{
          flexDirection: 'row', gap: 6,
          backgroundColor: T.cardSoft, borderRadius: 14, padding: 4,
          alignSelf: 'flex-start',
          marginBottom: 16,
        }}>
          {[
            { key: 'kurum',   label: 'Kurum Bilgileri',   icon: Building2 },
            { key: 'yetkili', label: 'Yetkili Bilgileri', icon: UserIcon },
          ].map(t => {
            const active = profileTab === t.key;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setProfileTab(t.key as any)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: active ? T.card : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : {}),
                }}
              >
                <Icon size={14} color={active ? accentColor : T.ink3} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? accentColor : T.ink2 }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ═══════ TAB 1 — KURUM BİLGİLERİ (sadece clinic_admin) ═══════ */}
      {isClinicAdmin && profileTab === 'kurum' && (
        <ClinicKurumTab
          T={T}
          accentColor={accentColor}
          isNarrow={isNarrow}
          clinic={clinicData}
          onSaved={(updated) => setClinicData(updated)}
        />
      )}

      {/* ═══════ TAB 2 — YETKİLİ BİLGİLERİ (default — eski içerik) ═══════ */}
      {(!isClinicAdmin || profileTab === 'yetkili') && <>
      {/* ═══════ ANA LAYOUT: Sol (Profil hero) — Sağ (Bilgi kartları) ═══════ */}
      <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 14 : 20, alignItems: 'flex-start' }}>

        {/* ══ SOL — Kimlik kartı ══
            Eskiden avatar 4/5 en-boy oranında tam genişlikte bir bloktu ve
            ekranın ~%30'unu kaplıyordu; ayrıca rol + kayıt tarihi kartın hem
            üstünde hem altında iki kez yazılıydı. Avatar 88px daireye indi,
            tekrar eden blok kaldırıldı, yerine profil tamamlanma göstergesi
            geldi — sayfa "görüntüleme"den "yönetme"ye döndü. */}
        <View style={{ width: isNarrow ? '100%' : 300 }}>
          <View
            className="rounded-[24px] p-5"
            style={[CARD_SHADOW, { backgroundColor: T.card }]}
          >
            {/* Avatar + kimlik */}
            <View className="items-center">
              <Pressable onPress={handlePickAvatar} className="relative" style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88, borderRadius: 44 }} resizeMode="cover" />
                ) : (
                  <View className="items-center justify-center" style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accentColor }}>
                    <Text style={{ fontSize: 34, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.5 }}>{initial}</Text>
                  </View>
                )}
                <View
                  className="absolute bottom-0 end-0 w-7 h-7 rounded-full items-center justify-center border-2"
                  style={{ backgroundColor: accentColor, borderColor: T.card }}
                >
                  <Camera size={12} color="#FFFFFF" strokeWidth={2} />
                </View>
              </Pressable>

              {/* Büyük punto → negatif tracking, sıkı satır yüksekliği */}
              <Text
                className="mt-3.5"
                style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '400', fontSize: 19, lineHeight: 24, letterSpacing: -0.4, color: T.ink, textAlign: 'center' }}
                numberOfLines={2}
              >
                {profile?.full_name ?? '—'}
              </Text>
              <View className="rounded-full px-2.5 py-1 mt-2" style={{ backgroundColor: `${accentColor}18` }}>
                <Text className="text-[11px] font-semibold" style={{ color: accentColor }}>{roleLabel}</Text>
              </View>
            </View>

            {/* Birincil iletişim — geri kalanı sağdaki İletişim kartında */}
            <View className="gap-2.5 mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: T.hairline2 }}>
              <InfoRow icon={Mail} value={profile?.email} />
              <InfoRow icon={Phone} value={profile?.phone} />
            </View>

            {/* ── Profil tamamlanma ── */}
            <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: T.hairline2 }}>
              <View className="flex-row items-baseline justify-between mb-2">
                <Text className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: T.ink3 }}>
                  Profil Tamamlanma
                </Text>
                <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '500', fontSize: 17, letterSpacing: -0.3, color: T.ink }}>
                  %{completion.pct}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: T.hairline2, overflow: 'hidden' }}>
                <View style={{ width: `${completion.pct}%`, height: '100%', borderRadius: 3, backgroundColor: accentColor }} />
              </View>
              <Text className="text-[11.5px] mt-2" style={{ color: T.ink3 }}>
                {completion.missing > 0
                  ? `${completion.missing} bilgi eksik — tamamlamak için satırlara dokun`
                  : 'Profilin eksiksiz.'}
              </Text>
            </View>

            {/* Birincil aksiyon */}
            <Pressable
              onPress={() => setEditing(true)}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 11, borderRadius: 14, marginTop: 16,
                backgroundColor: accentColor,
                opacity: pressed ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
              })}
            >
              <Edit2 size={13} color="#FFFFFF" strokeWidth={1.8} />
              <Text className="text-[13px] font-semibold text-white">Profili Düzenle</Text>
            </Pressable>

            {/* Çıkış */}
            <Pressable
              onPress={handleSignOut}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 9, borderRadius: 14, marginTop: 8,
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)',
                opacity: pressed ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
              })}
            >
              <LogOut size={13} color="#EF4444" strokeWidth={1.8} />
              <Text className="text-[13px] font-semibold" style={{ color: '#EF4444' }}>Çıkış Yap</Text>
            </Pressable>
          </View>
        </View>

        {/* ══ SAĞ — Bilgi kartları (her zaman view mode) ══ */}
        <View className="gap-[18px]" style={{ flex: isNarrow ? undefined : 1, width: isNarrow ? '100%' : undefined }}>

          {/* ROW 1 — Kişisel + İletişim.
              alignItems 'stretch': iki kart aynı yükseklikte bitsin (eskiden
              kısa olan kartın altında ragged boşluk kalıyordu). */}
          <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 14 : 18, alignItems: 'stretch' }}>
            {/* Kişisel Bilgiler */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card, flex: isNarrow ? undefined : 1, width: isNarrow ? "100%" : undefined } as any]}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: T.ink3 }}>Kişisel Bilgiler</Text>
              <CardRow icon={UserIcon} iconColor={accentColor} iconBg={`${accentColor}14`} label="Doğum Tarihi" value={profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString(localeTag(), { day: 'numeric', month: 'long', year: 'numeric' }) : null} placeholder="Doğum tarihi ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={UserIcon} iconColor={accentColor} iconBg={`${accentColor}14`} label="Cinsiyet" value={profile?.gender === 'erkek' ? 'Erkek' : profile?.gender === 'kadın' ? 'Kadın' : null} placeholder="Cinsiyet seç" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={MapPin} iconColor={accentColor} iconBg={`${accentColor}14`} label="Şehir" value={profile?.city} placeholder="Şehir ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={Hash} iconColor={accentColor} iconBg={`${accentColor}14`} label="TC Kimlik" value={profile?.tc_kimlik_no ? `***${profile.tc_kimlik_no.slice(-4)}` : null} placeholder="TC Kimlik ekle" onPress={() => setEditing(true)} />
            </View>

            {/* İletişim */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card, flex: isNarrow ? undefined : 1, width: isNarrow ? "100%" : undefined } as any]}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: T.ink3 }}>İletişim</Text>
              <View className="flex-row items-center gap-3 py-1">
                <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${accentColor}14` }}>
                  <Mail size={14} color={accentColor} strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] mb-0.5" style={{ color: T.ink3 }}>E-posta</Text>
                  <Text className="text-[14px] font-medium" style={{ color: T.ink }} numberOfLines={1}>{profile?.email ?? '—'}</Text>
                </View>
                <Pressable onPress={() => setEditEmail(v => !v)} className="p-1.5">
                  {editEmail ? <X size={14} color={T.ink3} strokeWidth={1.8} /> : <Edit2 size={14} color={T.ink3} strokeWidth={1.8} />}
                </Pressable>
              </View>
              {editEmail && (
                <View className="mt-3 pt-3.5 gap-3" style={{ borderTopWidth: 1, borderTopColor: T.hairline2 }}>
                  <TextInput className="rounded-xl px-3.5 py-3 text-[14px]" value={email} onChangeText={setEmail} placeholder="yeni@email.com" placeholderTextColor={T.ink3} keyboardType="email-address" autoCapitalize="none" autoFocus style={{ outlineWidth: 0, borderWidth: 1, borderColor: T.hairline, color: T.ink, backgroundColor: T.cardSoft } as any} />
                  <Pressable onPress={handleSaveEmail} disabled={savingEmail} className="items-center py-3 rounded-xl" style={{ backgroundColor: accentColor, opacity: savingEmail ? 0.6 : 1 }}>
                    <Text className="text-[13px] font-semibold text-white">Güncelle</Text>
                  </Pressable>
                </View>
              )}
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={Phone} iconColor={accentColor} iconBg={`${accentColor}14`} label="Telefon" value={profile?.phone} placeholder="Telefon ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={MessageCircle} iconColor={accentColor} iconBg={`${accentColor}14`} label="WhatsApp" value={profile?.whatsapp_phone} placeholder="WhatsApp ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={MapPin} iconColor={accentColor} iconBg={`${accentColor}14`} label="Adres" value={profile?.address} placeholder="Adres ekle" onPress={() => setEditing(true)} />
            </View>
          </View>

          {/* ROW 2 — Mesleki + Güvenlik */}
          <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 14 : 18, alignItems: 'stretch' }}>
            {/* Mesleki Bilgiler */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card, flex: isNarrow ? undefined : 1, width: isNarrow ? "100%" : undefined } as any]}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: T.ink3 }}>Mesleki Bilgiler</Text>
              <CardRow icon={GraduationCap} iconColor={accentColor} iconBg={`${accentColor}14`} label="Uzmanlık" value={profile?.specialty} placeholder="Uzmanlık ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={Briefcase} iconColor={accentColor} iconBg={`${accentColor}14`} label="Departman" value={profile?.department} placeholder="Departman ekle" onPress={() => setEditing(true)} />
              <View className="h-px my-2" style={{ backgroundColor: T.hairline2 }} />
              <CardRow icon={Hash} iconColor={accentColor} iconBg={`${accentColor}14`} label="Diploma No" value={profile?.diploma_no} placeholder="Diploma No ekle" onPress={() => setEditing(true)} />
            </View>

            {/* Güvenlik */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card, flex: isNarrow ? undefined : 1, width: isNarrow ? "100%" : undefined } as any]}>
              <Text className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: T.ink3 }}>Güvenlik</Text>
              {/* Tek satırlık kart yarım kalıyordu: satıra açıklama eklendi.
                  İki adımlı doğrulama / aktif oturumlar HENÜZ backend'de yok —
                  çalışmayan satır göstermek yerine yer verilmedi. */}
              <Pressable
                onPress={() => setShowPass(v => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showPass }}
                style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 8, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 12,
                  opacity: pressed ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
                })}
              >
                <View className="w-7 h-7 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'rgba(217,119,6,0.10)' }}>
                  <Lock size={13} color="#D97706" strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] mb-0.5" style={{ color: T.ink3 }}>Şifre</Text>
                  <Text className="text-[14px] font-semibold" style={{ color: T.ink }}>Şifre Değiştir</Text>
                </View>
                <View style={{ transform: [{ rotate: showPass ? (isRTL() ? '-90deg' : '90deg') : '0deg' }] }}>
                  {isRTL() ? <ChevronLeft size={15} color={T.ink3} strokeWidth={1.8} /> : <ChevronRight size={15} color={T.ink3} strokeWidth={1.8} />}
                </View>
              </Pressable>
              {showPass && (
                <View className="mt-3 pt-3.5 gap-3.5" style={{ borderTopWidth: 1, borderTopColor: T.hairline2 }}>
                  <View className="gap-1.5">
                    <Text className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: T.ink3 }}>Yeni Şifre</Text>
                    <View className="flex-row items-center rounded-xl" style={{ borderWidth: 1, borderColor: T.hairline, backgroundColor: T.cardSoft }}>
                      <TextInput className="flex-1 px-3.5 py-3 text-[14px]" value={newPass} onChangeText={setNewPass} placeholder="En az 6 karakter" placeholderTextColor={T.ink3} secureTextEntry={!showNew} style={{ outlineWidth: 0, color: T.ink } as any} />
                      <Pressable onPress={() => setShowNew(v => !v)} className="px-3 py-3">
                        {showNew ? <EyeOff size={15} color={T.ink3} strokeWidth={1.8} /> : <Eye size={15} color={T.ink3} strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: passNoMatch ? '#EF4444' : T.ink3 }}>Şifre Tekrar</Text>
                    <View className="flex-row items-center rounded-xl" style={{ borderWidth: 1, borderColor: passNoMatch ? '#EF4444' : T.hairline, backgroundColor: T.cardSoft }}>
                      <TextInput className="flex-1 px-3.5 py-3 text-[14px]" value={confirmPass} onChangeText={setConfirmPass} placeholder="Tekrar girin" placeholderTextColor={T.ink3} secureTextEntry={!showConfirm} style={{ outlineWidth: 0, color: passNoMatch ? '#EF4444' : T.ink } as any} />
                      <Pressable onPress={() => setShowConfirm(v => !v)} className="px-3 py-3">
                        {showConfirm ? <EyeOff size={15} color={T.ink3} strokeWidth={1.8} /> : <Eye size={15} color={T.ink3} strokeWidth={1.8} />}
                      </Pressable>
                    </View>
                    {passNoMatch && <Text className="text-[11px] text-red-500 mt-0.5">Şifreler eşleşmiyor</Text>}
                  </View>
                  <Pressable onPress={handleChangePassword} disabled={savingPass} className="items-center py-3 rounded-xl" style={{ backgroundColor: accentColor, opacity: savingPass ? 0.6 : 1 }}>
                    <Text className="text-[13px] font-semibold text-white">Güncelle</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>


        </View>
      </View>
      </>}

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
          style={{ backgroundColor: 'rgba(10,14,26,0.42)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any : {}) }}
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
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Kaydet</Text>
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

// ─── ClinicKurumTab — clinic_admin Kurum Bilgileri tab (view + edit) ─────
function ClinicKurumTab({
  T, accentColor, isNarrow, clinic, onSaved,
}: {
  T: any; accentColor: string; isNarrow: boolean; clinic: any; onSaved: (c: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Logo upload state
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // AI logo bul (internetten aday + onay) state
  const [logoFinderOpen, setLogoFinderOpen] = useState(false);
  const [logoQuery, setLogoQuery] = useState('');
  const [logoWebsite, setLogoWebsite] = useState('');
  const [logoResults, setLogoResults] = useState<{ name: string; domain: string; url: string }[]>([]);
  const [logoSearching, setLogoSearching] = useState(false);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [logoSearched, setLogoSearched] = useState(false);
  const [showManual, setShowManual] = useState(false);  // "hiçbiri doğru değil" → manuel alanları aç

  // Form state — clinic verisinden hidrat
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [il, setIl] = useState('');
  const [ilce, setIlce] = useState('');
  const [mahalle, setMahalle] = useState('');
  const [sokak, setSokak] = useState('');
  const [binaNo, setBinaNo] = useState('');
  const [postaKodu, setPostaKodu] = useState('');
  const [vkn, setVkn] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [billingMode, setBillingMode] = useState<'monthly_bulk' | 'per_order'>('monthly_bulk');
  const [paymentDays, setPaymentDays] = useState('30');

  // Google Places autocomplete
  const [nameFocused, setNameFocused] = useState(false);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);

  // Clinic verisi gelince formu doldur
  useEffect(() => {
    if (!clinic) return;
    setLogoUri(clinic.logo_url ?? null);
    setName(clinic.name ?? '');
    setPhone(clinic.phone ?? '');
    setEmail(clinic.email ?? '');
    setContactPerson(clinic.contact_person ?? '');
    const addr = parseAddressRaw(clinic.address);
    setIl(addr.il); setIlce(addr.ilce); setMahalle(addr.mahalle);
    setSokak(addr.sokak); setBinaNo(addr.bina_no); setPostaKodu(addr.posta_kodu);
    setVkn(clinic.vkn ?? '');
    setTaxOffice(clinic.tax_office ?? '');
    setBillingMode(clinic.billing_mode ?? 'monthly_bulk');
    setPaymentDays(String(clinic.default_payment_terms_days ?? 30));
  }, [clinic]);

  // Kurum adı yazıldıkça Google Places ara (debounce 350ms)
  useEffect(() => {
    if (!editing) { setPlaces([]); return; }
    const q = name.trim();
    if (q.length < 3) { setPlaces([]); return; }
    let cancelled = false;
    setPlacesLoading(true);
    startPlaceSession();
    const t = setTimeout(async () => {
      try {
        const res = await searchPlaces(q);
        if (!cancelled) setPlaces(res);
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [editing, name]);

  const applyPlace = async (sug: PlaceSuggestion) => {
    setPlacesLoading(true);
    try {
      const d = await getPlaceDetails(sug.placeId);
      if (!d) return;
      // Sadece boş alanları doldur — kullanıcının değiştirdiklerini ezme
      setName(d.name || name);
      if (!phone.trim()) setPhone(d.phone || '');
      setIl(d.il || il); setIlce(d.ilce || ilce); setMahalle(d.mahalle || mahalle);
      setSokak(d.sokak || sokak); setPostaKodu(d.postaKodu || postaKodu);
      setPlaces([]);
    } finally {
      setPlacesLoading(false);
      endPlaceSession();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Kurum adı zorunludur'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        contact_person: contactPerson.trim() || null,
        vkn: vkn.trim() || null,
        tax_office: taxOffice.trim() || null,
        billing_mode: billingMode,
        default_payment_terms_days: parseInt(paymentDays, 10) || 30,
        address: JSON.stringify({
          il: il.trim(), ilce: ilce.trim(), mahalle: mahalle.trim(),
          sokak: sokak.trim(), bina_no: binaNo.trim(), posta_kodu: postaKodu.trim(),
        }),
      };
      const { data, error } = await supabase
        .from('clinics')
        .update(payload)
        .eq('id', clinic.id)
        .select()
        .single();
      if (error) { toast.error(error.message); return; }
      toast.success('Kurum bilgileri güncellendi');
      setEditing(false);
      onSaved(data);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setPlaces([]);
  };

  // AI ile logo bul — edge function'dan aday logolar; kullanıcı seçer
  const runSearch = async (qArg?: string, wArg?: string) => {
    const q = (qArg ?? logoQuery).trim();
    const website = (wArg ?? logoWebsite).trim();
    if ((!q && !website) || logoSearching) return;
    setLogoSearching(true); setLogoSearched(false); setLogoResults([]);
    try {
      const { data } = await supabase.functions.invoke('clinic-logo-search', { body: { q, website } });
      setLogoResults((data?.candidates ?? []) as any);
    } catch { setLogoResults([]); }
    finally { setLogoSearching(false); setLogoSearched(true); }
  };
  const openLogoFinder = () => {
    const q = clinic?.name ?? '';
    setLogoQuery(q);
    setLogoWebsite('');
    setLogoResults([]);
    setLogoSearched(false);
    setShowManual(false);
    setLogoFinderOpen(true);
    if (q) runSearch(q, '');   // Simanty otomatik arasın
  };
  // Seçilen aday logoyu SERVER-SIDE indir+yükle (CORS yok) → clinics.logo_url
  const applyCandidate = async (url: string) => {
    if (!clinic?.id || applyingUrl) return;
    setApplyingUrl(url);
    try {
      const { data, error } = await supabase.functions.invoke('clinic-logo-search', {
        body: { apply: true, url, clinicId: clinic.id },
      });
      if (error || !data?.logo_url) { toast.error(data?.error ?? error?.message ?? 'Logo uygulanamadı'); return; }
      // Edge function artık sürümlü URL döndürüyor — olduğu gibi kullan
      setLogoUri(data.logo_url);
      onSaved({ ...clinic, logo_url: data.logo_url });
      toast.success('Logo güncellendi');
      setLogoFinderOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Logo uygulanamadı');
    } finally {
      setApplyingUrl(null);
    }
  };

  // Klinik logosu yükle (avatars bucket'ını kullanır — clinic_id altında)
  const handlePickLogo = async () => {
    if (!clinic?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.warning('Galeri erişimi için izin verin.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { toast.error('Görsel okunamadı.'); return; }

    setUploadingLogo(true);
    try {
      const byteStr = atob(asset.base64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.split('/')[1] ?? 'jpg';
      const path = `clinics/${clinic.id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: mime });
      if (uploadErr) { toast.error(uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Sürüm damgası DB'ye de yazılır: yol sabit olduğu için CDN eski görseli
      // servis ediyor; yalnız ekranda ?t= eklemek yetmiyordu (yeniden yüklemede
      // damgasız URL geri geliyordu).
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id);
      if (dbErr) { toast.error(dbErr.message); return; }
      setLogoUri(publicUrl);
      toast.success('Logo güncellendi');
      onSaved({ ...clinic, logo_url: publicUrl });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 14 : 20, alignItems: 'flex-start' }}>
      {/* Sol: Hero + edit toggle */}
      <View style={{ width: isNarrow ? '100%' : 280 }}>
        <View className="rounded-[24px] p-6" style={[CARD_SHADOW, { backgroundColor: T.card, gap: 14 }]}>
          {/* Logo / placeholder — Pressable upload */}
          <Pressable
            onPress={handlePickLogo}
            disabled={uploadingLogo}
            style={({ hovered }: any) => ({
              width: 80, height: 80, borderRadius: 20, overflow: 'hidden',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: logoUri ? T.card : `${accentColor}18`,
              borderWidth: 1, borderColor: logoUri ? T.hairline : `${accentColor}30`,
              opacity: uploadingLogo ? 0.6 : 1,
              ...(Platform.OS === 'web' ? {
                cursor: uploadingLogo ? 'wait' : 'pointer',
                ...(hovered ? { boxShadow: '0 4px 12px rgba(0,0,0,0.10)' } : {}),
              } as any : {}),
            })}
          >
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Building2 size={32} color={accentColor} strokeWidth={1.6} />
            )}
            {/* Upload overlay badge */}
            <View style={{
              position: 'absolute', bottom: -4, end: -4,
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: T.card,
            }}>
              <Camera size={11} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          </Pressable>
          <Text style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>
            Logo eklemek için tıkla
          </Text>
          {/* AI ile logo bul (internetten aday + onay) */}
          <Pressable
            onPress={openLogoFinder}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
              backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : {}),
            }}
          >
            <ColorOrb size={20} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0A' }}>Simanty ile logonu ekle</Text>
          </Pressable>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: T.ink, letterSpacing: -0.4 }}>
              {clinic?.name ?? '—'}
            </Text>
            <Text style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>
              {clinic?.category
                ? clinic.category.charAt(0).toUpperCase() + clinic.category.slice(1)
                : 'Sağlık Kurumu'}
              {clinic?.is_active === false ? ' · Pasif' : ''}
            </Text>
          </View>

          {!editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl mt-2"
              style={{ backgroundColor: accentColor }}
            >
              <Edit2 size={13} color="#FFFFFF" strokeWidth={1.8} />
              <Text className="text-[13px] font-semibold text-white">Bilgileri Düzenle</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <Pressable
                onPress={handleCancel}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: T.hairline }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink2 }}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: accentColor, opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Sağ: Bilgi kartları (view) veya Form (edit) */}
      <View style={{ flex: 1, gap: 14, width: '100%' }}>
        {editing ? (
          <>
            {/* İletişim — edit mode */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 14 }}>
                İLETIŞIM
              </Text>
              <View style={{ gap: 12 }}>
                {/* Kurum Adı — Google Places */}
                <View style={{ position: 'relative' }}>
                  <KurumLabel T={T}>Kurum Adı *</KurumLabel>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setTimeout(() => setNameFocused(false), 250)}
                    placeholder="Örn: Dent Hekim Kliniği"
                    placeholderTextColor={T.ink3}
                    style={kurumInputStyle(T)}
                  />
                  {nameFocused && (places.length > 0 || placesLoading) && (
                    <View style={{
                      position: 'absolute', top: 70, left: 0, right: 0, zIndex: 10,
                      backgroundColor: T.card, borderRadius: 10,
                      borderWidth: 1, borderColor: T.hairline,
                      ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.10)' } as any : {}),
                      overflow: 'hidden',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: T.cardSoft }}>
                        <MapPin size={11} color="#1A73E8" strokeWidth={1.8} />
                        <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: '#1A73E8', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                          Google Sonuçları
                        </Text>
                        {placesLoading && <Text style={{ fontSize: 9, color: T.ink3, fontStyle: 'italic' }}>aranıyor…</Text>}
                      </View>
                      {places.slice(0, 6).map((p) => (
                        <Pressable
                          key={p.placeId}
                          onPress={() => { applyPlace(p); setNameFocused(false); }}
                          style={({ hovered }: any) => ({
                            paddingHorizontal: 12, paddingVertical: 9,
                            borderBottomWidth: 1, borderBottomColor: T.hairline2,
                            backgroundColor: hovered ? T.cardSoft : 'transparent',
                          })}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>
                            {p.mainText}
                          </Text>
                          {p.secondaryText ? (
                            <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
                              {p.secondaryText}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>Telefon</KurumLabel>
                    <TextInput value={phone} onChangeText={setPhone} placeholder="0555 000 00 00" placeholderTextColor={T.ink3} keyboardType="phone-pad" style={kurumInputStyle(T)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>E-posta</KurumLabel>
                    <TextInput value={email} onChangeText={setEmail} placeholder="info@klinik.com" placeholderTextColor={T.ink3} keyboardType="email-address" autoCapitalize="none" style={kurumInputStyle(T)} />
                  </View>
                </View>
                <View>
                  <KurumLabel T={T}>İrtibat Kişisi</KurumLabel>
                  <TextInput value={contactPerson} onChangeText={setContactPerson} placeholder="Örn: Mehmet Bey" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                </View>
              </View>
            </View>

            {/* Adres — edit mode */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 4 }}>
                ADRES
              </Text>
              <Text style={{ fontSize: 11, color: T.ink3, marginBottom: 14, fontStyle: 'italic' }}>
                Kurum adı seçildiğinde adres + telefon Google'dan otomatik dolar.
              </Text>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>İl</KurumLabel>
                    <TextInput value={il} onChangeText={setIl} placeholder="İstanbul" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>İlçe</KurumLabel>
                    <TextInput value={ilce} onChangeText={setIlce} placeholder="Kadıköy" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>Mahalle</KurumLabel>
                    <TextInput value={mahalle} onChangeText={setMahalle} placeholder="Caferağa" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                  </View>
                </View>
                <View>
                  <KurumLabel T={T}>Cadde / Sokak</KurumLabel>
                  <TextInput value={sokak} onChangeText={setSokak} placeholder="Vatan Caddesi" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                </View>
                <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>Bina No</KurumLabel>
                    <TextInput value={binaNo} onChangeText={setBinaNo} placeholder="21" placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>Posta Kodu</KurumLabel>
                    <TextInput value={postaKodu} onChangeText={(v) => setPostaKodu(v.replace(/[^0-9]/g, ''))} placeholder="34000" placeholderTextColor={T.ink3} keyboardType="number-pad" maxLength={5} style={kurumInputStyle(T)} />
                  </View>
                </View>
              </View>
            </View>

            {/* Fatura — edit mode */}
            <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 14 }}>
                FATURA BILGILERI
              </Text>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>VKN / TCKN</KurumLabel>
                    <TextInput value={vkn} onChangeText={(v) => setVkn(v.replace(/[^0-9]/g, ''))} placeholder="10/11 hane" placeholderTextColor={T.ink3} keyboardType="number-pad" maxLength={11} style={{ ...kurumInputStyle(T), fontFamily: 'ui-monospace, monospace' }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KurumLabel T={T}>Vergi Dairesi</KurumLabel>
                    <TextInput value={taxOffice} onChangeText={setTaxOffice} placeholder="Kadıköy V.D." placeholderTextColor={T.ink3} style={kurumInputStyle(T)} />
                  </View>
                </View>
                <View>
                  <KurumLabel T={T}>Fatura Modu</KurumLabel>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { v: 'monthly_bulk', l: 'Aylık Toplu' },
                      { v: 'per_order',    l: 'Her Teslimat' },
                    ].map(opt => {
                      const active = billingMode === opt.v;
                      return (
                        <Pressable
                          key={opt.v}
                          onPress={() => setBillingMode(opt.v as any)}
                          style={{
                            flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
                            borderRadius: 12, borderWidth: 1.5,
                            borderColor: active ? accentColor : T.hairline,
                            backgroundColor: active ? `${accentColor}10` : T.card,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: active ? accentColor : T.ink2 }}>
                            {opt.l}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View>
                  <KurumLabel T={T}>Vade (gün)</KurumLabel>
                  <TextInput value={paymentDays} onChangeText={(v) => setPaymentDays(v.replace(/[^0-9]/g, ''))} placeholder="30" placeholderTextColor={T.ink3} keyboardType="number-pad" style={kurumInputStyle(T)} />
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <KurumInfoCard
              title="İLETIŞIM"
              T={T}
              rows={[
                { icon: Phone,    label: 'Telefon',  value: clinic?.phone },
                { icon: Mail,     label: 'E-posta',  value: clinic?.email },
                { icon: UserIcon, label: 'İrtibat',  value: clinic?.contact_person },
                { icon: MapPin,   label: 'Adres',    value: fmtAddressRaw(clinic?.address), multiline: true },
              ]}
            />
            <KurumInfoCard
              title="FATURA BILGILERI"
              T={T}
              rows={[
                { icon: Receipt,    label: 'VKN / TCKN',    value: clinic?.vkn, mono: true },
                { icon: Receipt,    label: 'Vergi Dairesi', value: clinic?.tax_office },
                { icon: CreditCard, label: 'Fatura Modu',   value: clinic?.billing_mode === 'per_order' ? 'Her Teslimat' : 'Aylık Toplu' },
                { icon: Calendar,   label: 'Vade',          value: clinic?.default_payment_terms_days != null ? `${clinic.default_payment_terms_days} gün` : null },
              ]}
            />
          </>
        )}
      </View>

      {/* ── AI Logo Bul modalı ── */}
      <Modal visible={logoFinderOpen} transparent animationType="fade" onRequestClose={() => setLogoFinderOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <View style={{ width: '100%', maxWidth: 460, maxHeight: '86%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
              <ColorOrb size={24} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Simanty ile Logo</Text>
                <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>İnternetten aday logolar — seçtiğin uygulanır</Text>
              </View>
              <Pressable onPress={() => setLogoFinderOpen(false)} hitSlop={8} style={{ cursor: 'pointer' as any }}>
                <X size={20} color={T.ink3} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Manuel arama — Simanty bulamazsa veya kullanıcı "hiçbiri doğru değil" derse */}
            {(showManual || (logoSearched && !logoSearching && logoResults.length === 0)) && (
            <View style={{ gap: 8, padding: 16, paddingBottom: 8 }}>
              {/* Web sitesi — küçük klinikler için en güvenilir yol */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline }}>
                <Building2 size={15} color={accentColor} strokeWidth={1.8} />
                <TextInput
                  value={logoWebsite}
                  onChangeText={setLogoWebsite}
                  onSubmitEditing={() => runSearch()}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="Web sitesi (örn. lunadente.com)"
                  placeholderTextColor={T.ink3}
                  style={{ flex: 1, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline }}>
                  <Search size={15} color={T.ink3} strokeWidth={1.8} />
                  <TextInput
                    value={logoQuery}
                    onChangeText={setLogoQuery}
                    onSubmitEditing={() => runSearch()}
                    placeholder="veya marka adı (büyük markalar)"
                    placeholderTextColor={T.ink3}
                    style={{ flex: 1, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
                  />
                </View>
                <Pressable onPress={() => runSearch()} disabled={logoSearching || (!logoQuery.trim() && !logoWebsite.trim())} style={{ paddingHorizontal: 18, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: (logoQuery.trim() || logoWebsite.trim()) ? accentColor : T.hairline, cursor: 'pointer' as any }}>
                  {logoSearching ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Ara</Text>}
                </Pressable>
              </View>
            </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
              {logoSearching ? (
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
                  <ColorOrb size={44} state="thinking" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>Simanty kliniğinin logosunu arıyor…</Text>
                  <Text style={{ fontSize: 11, color: T.ink3 }}>web sitesi bulunuyor, logolar çekiliyor</Text>
                </View>
              ) : logoResults.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {logoResults.map((c, i) => (
                    <Pressable key={c.url + i} onPress={() => applyCandidate(c.url)} disabled={!!applyingUrl}
                      style={{ width: 96, alignItems: 'center', gap: 6, cursor: 'pointer' as any }}>
                      <View style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <Image source={{ uri: c.url }} style={{ width: 76, height: 76 }} resizeMode="contain" />
                        {applyingUrl === c.url && (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color={accentColor} />
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 10, color: T.ink3, textAlign: 'center' }} numberOfLines={1}>{c.domain || c.name}</Text>
                    </Pressable>
                  ))}
                  {/* Hiçbiri doğru değilse: manuel ara veya cihazdan yükle */}
                  {!showManual && (
                    <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.hairline }}>
                      <Text style={{ fontSize: 12, color: T.ink3 }}>Hiçbiri doğru değil mi?</Text>
                      <Pressable onPress={() => setShowManual(true)} style={{ cursor: 'pointer' as any }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Manuel ara</Text>
                      </Pressable>
                      <Text style={{ fontSize: 12, color: T.ink3 }}>·</Text>
                      <Pressable onPress={() => { setLogoFinderOpen(false); handlePickLogo(); }} style={{ cursor: 'pointer' as any }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Cihazdan yükle</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : logoSearched ? (
                <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', paddingVertical: 24 }}>
                  Otomatik bulunamadı. Yukarıya kliniğin web sitesini yazıp tekrar deneyin ya da kamera ile yükleyin.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: T.ink3, textAlign: 'center', paddingVertical: 24 }}>
                  Simanty kliniğin logosunu otomatik arıyor…
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function KurumLabel({ T, children }: { T: any; children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function kurumInputStyle(T: any) {
  return {
    borderWidth: 1,
    borderColor: T.hairline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: T.ink,
    backgroundColor: T.card,
    // @ts-ignore web
    outlineWidth: 0,
  } as any;
}

// Adres JSON parse (form için: tüm 6 alan)
function parseAddressRaw(raw: any): { il: string; ilce: string; mahalle: string; sokak: string; bina_no: string; posta_kodu: string } {
  const empty = { il: '', ilce: '', mahalle: '', sokak: '', bina_no: '', posta_kodu: '' };
  if (!raw) return empty;
  if (typeof raw === 'string') {
    try { return parseAddressRaw(JSON.parse(raw)); } catch { return empty; }
  }
  if (typeof raw === 'object') {
    return {
      il: raw.il ?? '', ilce: raw.ilce ?? '', mahalle: raw.mahalle ?? '',
      sokak: raw.sokak ?? '', bina_no: raw.bina_no ?? '', posta_kodu: raw.posta_kodu ?? '',
    };
  }
  return empty;
}

// Adres JSON → tek satır insan-okunur
function fmtAddressRaw(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return fmtAddressRaw(JSON.parse(raw)); } catch { return raw; }
  }
  if (typeof raw === 'object') {
    const parts = [raw.sokak, raw.bina_no ? `No: ${raw.bina_no}` : null, raw.mahalle ? `${raw.mahalle} Mah.` : null, raw.ilce, raw.il, raw.posta_kodu].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return null;
}

// ── KurumInfoCard — clinic_admin Kurum Bilgileri tab'ında kullanılır ────
function KurumInfoCard({ title, rows, T }: {
  title: string;
  T: any;
  rows: Array<{ icon: any; label: string; value?: string | null; multiline?: boolean; mono?: boolean }>;
}) {
  return (
    <View
      className="rounded-[24px] p-[22px]"
      style={[CARD_SHADOW, { backgroundColor: T.card }]}
    >
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 14 }}>
        {title}
      </Text>
      <View style={{ gap: 14 }}>
        {rows.map((r, i) => {
          const Icon = r.icon;
          const empty = !r.value || !String(r.value).trim();
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: r.multiline ? 'flex-start' : 'center' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 9,
                backgroundColor: T.cardSoft,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                marginTop: r.multiline ? 2 : 0,
              }}>
                <Icon size={14} color={T.ink3} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                  {r.label}
                </Text>
                <Text
                  style={{
                    fontSize: 14, fontWeight: '500',
                    color: empty ? T.ink3 : T.ink,
                    fontStyle: empty ? 'italic' : 'normal',
                    ...(r.mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } : {}),
                  }}
                  numberOfLines={r.multiline ? 3 : 1}
                >
                  {empty ? '—' : r.value}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
