/**
 * GeneralSection — Patterns Design Language (NativeWind)
 * ─────────────────────────────────────────────────────
 * Ayarlar > Genel sekmesi.
 * Genel ayarlar (para birimi, hafta başlangıcı, tema) +
 * Lab'a özel ayarlar (sipariş prefix, KDV, mesai, otomatik çıkış, sayfa kayıt).
 * Patterns cardSolid stili + NativeWind className.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED, type Lang } from '../../../core/i18n';
import { View, Text, ScrollView, Pressable, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import {
  Globe, Clock, Calendar, Monitor, Sun, Moon, Laptop,
  ChevronDown, Check, Info, Hash, Percent, Timer, LogOut, List,
  CalendarDays, Watch, UserCheck, Building2, Image as ImageIcon, Upload, Trash2,
} from 'lucide-react-native';
import { Image as RNImage } from 'react-native';
import { useAuthStore } from '../../../core/store/authStore';
import {
  useLabSettingsStore,
  type CurrencyCode, type WeekStart, type ThemeMode,
} from '../../../core/store/labSettingsStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useUserPrefsStore } from '../../../core/store/userPrefsStore';
import { supabase } from '../../../core/api/supabase';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { useLabBrandStore } from '../../../core/store/labBrandStore';

// ── Types ───────────────────────────────────────────────────────────────
interface Props {
  panelType: string;
  accentColor: string;
}

// Bugünün tarihini seçilen formatta gösterir
function formatDatePreview(fmt: 'dd.MM.yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (fmt === 'MM/dd/yyyy') return `${mm}/${dd}/${yyyy}`;
  if (fmt === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
  return `${dd}.${mm}.${yyyy}`;
}

// ── Shadow (patterns cardSolid) ─────────────────────────────────────────
const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const THUMB_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});

// ── Display font token ──────────────────────────────────────────────────
const DISPLAY_FONT = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Currency options ────────────────────────────────────────────────────
const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
  { code: 'USD', symbol: '$', label: 'ABD Doları' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'İngiliz Sterlini' },
];

// ── Week start options ──────────────────────────────────────────────────
const WEEK_STARTS: { key: WeekStart; label: string }[] = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'sunday', label: 'Pazar' },
];

// ── Theme options ───────────────────────────────────────────────────────
const THEMES: { key: ThemeMode; label: string; icon: any }[] = [
  { key: 'light',  label: 'Açık',   icon: Sun },
  { key: 'dark',   label: 'Koyu',   icon: Moon },
  { key: 'system', label: 'Sistem', icon: Laptop },
];

// ── Auto logout options ─────────────────────────────────────────────────
const AUTO_LOGOUT: { value: number; label: string }[] = [
  { value: 0,  label: 'Kapalı' },
  { value: 15, label: '15 dakika' },
  { value: 30, label: '30 dakika' },
  { value: 60, label: '1 saat' },
];

// ── Items per page options ──────────────────────────────────────────────
const ITEMS_PER_PAGE: { value: number; label: string }[] = [
  { value: 25,  label: '25' },
  { value: 50,  label: '50' },
  { value: 100, label: '100' },
];

// ── Segment picker (3-option pill) ─────────────────────────────────────
function SegmentPicker<T extends string>({
  options,
  value,
  onChange,
  accentColor,
}: {
  options: { key: T; label: string; icon?: any }[];
  value: T;
  onChange: (v: T) => void;
  accentColor: string;
}) {
  const T = useMobileTokens();
  return (
    <View className="flex-row rounded-xl overflow-hidden" style={{ backgroundColor: T.hairline2 }}>
      {options.map(opt => {
        const active = value === opt.key;
        const Icon = opt.icon;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2 px-3 rounded-xl"
            style={active ? { backgroundColor: accentColor } : undefined}
          >
            {Icon && <Icon size={13} color={active ? '#FFF' : T.ink3} strokeWidth={1.8} />}
            <Text
              className="text-[12px] font-semibold"
              style={{ color: active ? '#FFF' : T.ink3 }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Dropdown select ─────────────────────────────────────────────────────
function DropdownSelect<T extends string | number>({
  options,
  value,
  onChange,
  accentColor,
  renderLabel,
}: {
  options: { key: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  accentColor: string;
  renderLabel?: (opt: { key: T; label: string; sub?: string }) => string;
}) {
  const [open, setOpen] = useState(false);
  const T = useMobileTokens();
  const selected = options.find(o => o.key === value);
  const displayLabel = selected ? (renderLabel ? renderLabel(selected) : selected.label) : '';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 border rounded-[14px] px-3.5"
        style={{ height: 44, borderColor: T.hairline, backgroundColor: T.card }}
      >
        <Text className="flex-1 text-[14px]" style={{ color: T.ink }}>{displayLabel}</Text>
        <ChevronDown size={14} color={T.ink3} strokeWidth={1.8} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(10,14,26,0.42)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any : {}) }}
          onPress={() => setOpen(false)}
        >
          <View
            className="rounded-[20px] w-[320px] overflow-hidden"
            style={{ ...CARD_SHADOW, maxHeight: 400, backgroundColor: T.card }}
          >
            <View className="px-5 pt-4 pb-2">
              <Text className="text-[15px] font-semibold" style={{ color: T.ink }}>Seçim yapın</Text>
            </View>
            <ScrollView className="px-2 pb-2" showsVerticalScrollIndicator={false}>
              {options.map(opt => {
                const isSelected = opt.key === value;
                return (
                  <Pressable
                    key={String(opt.key)}
                    onPress={() => { onChange(opt.key); setOpen(false); }}
                    className="flex-row items-center gap-3 px-3 py-3 mx-1 rounded-xl"
                    style={isSelected ? { backgroundColor: `${accentColor}14` } : undefined}
                  >
                    <View className="flex-1">
                      <Text
                        className="text-[14px]"
                        style={isSelected ? { fontWeight: '600', color: accentColor } : { color: T.ink }}
                      >
                        {renderLabel ? renderLabel(opt) : opt.label}
                      </Text>
                      {opt.sub && (
                        <Text className="text-[12px] mt-0.5" style={{ color: T.ink3 }}>{opt.sub}</Text>
                      )}
                    </View>
                    {isSelected && <Check size={16} color={accentColor} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Setting row ─────────────────────────────────────────────────────────
function SettingRow({
  icon: Icon,
  label,
  sub,
  accentColor,
  children,
  isLast,
  controlWidth = 180,
}: {
  icon: any;
  label: string;
  sub: string;
  accentColor: string;
  children: React.ReactNode;
  isLast?: boolean;
  controlWidth?: number;
}) {
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 560;
  const T = useMobileTokens();
  return (
    <>
      {isNarrow ? (
        <View style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${accentColor}14` }}
            >
              <Icon size={16} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-[14px] font-semibold mb-0.5" style={{ color: T.ink }} numberOfLines={1}>{label}</Text>
              <Text className="text-[12px]" style={{ color: T.ink3 }} numberOfLines={2}>{sub}</Text>
            </View>
          </View>
          <View style={{ width: '100%', paddingLeft: 48 }}>
            {children}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3 py-3.5">
          <View
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${accentColor}14` }}
          >
            <Icon size={16} color={accentColor} strokeWidth={1.8} />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-semibold mb-0.5" style={{ color: T.ink }}>{label}</Text>
            <Text className="text-[12px]" style={{ color: T.ink3 }}>{sub}</Text>
          </View>
          <View style={{ width: controlWidth }}>
            {children}
          </View>
        </View>
      )}
      {!isLast && <View className="h-px" style={{ marginLeft: 48, backgroundColor: T.hairline2 }} />}
    </>
  );
}

// ── Local defaults (when DB not available) ──────────────────────────────
const LOCAL_DEFAULTS = {
  default_currency: 'TRY' as CurrencyCode,
  week_start: 'monday' as WeekStart,
  theme_mode: 'light' as ThemeMode,
  order_prefix: 'LAB',
  default_tax_rate: 20,
  working_hours_start: '08:00',
  working_hours_end: '18:00',
  auto_logout_minutes: 0,
  items_per_page: 50,
};

// ── Component ───────────────────────────────────────────────────────────
export function GeneralSection({ panelType, accentColor }: Props) {
  const { settings, loading, saving, load, update } = useLabSettingsStore();
  const [local, setLocal] = useState(LOCAL_DEFAULTS);
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width: _vw } = useWindowDimensions();
  // Sayfa kenarı: mobilde standart 16, desktop'ta 28
  const sidePad = _vw < 768 ? 16 : 28;

  useEffect(() => { load(); }, []);

  // Sync local state when settings load from DB
  useEffect(() => {
    if (settings) {
      setLocal({
        default_currency: settings.default_currency,
        week_start: settings.week_start,
        theme_mode: settings.theme_mode,
        order_prefix: settings.order_prefix,
        default_tax_rate: settings.default_tax_rate,
        working_hours_start: settings.working_hours_start,
        working_hours_end: settings.working_hours_end,
        auto_logout_minutes: settings.auto_logout_minutes,
        items_per_page: settings.items_per_page,
      });
    }
  }, [settings]);

  const handleUpdate = useCallback((patch: Record<string, any>) => {
    // Always update local state immediately
    setLocal(prev => ({ ...prev, ...patch }));
    // Try to persist to DB
    update(patch);
  }, [update]);

  const isLab    = panelType === 'lab' || panelType === 'admin';
  // Yetki: ayarları yönet — yoksa kullanıcı sadece tema/saat/tarih formatını görür
  const { can } = usePermissions();
  const canManageSettings = can('manage_settings');
  const isDoctor = panelType === 'doctor';

  // User prefs (date/time format + doctor-only fields)
  const dateFormat    = useUserPrefsStore(s => s.date_format);
  const timeFormat    = useUserPrefsStore(s => s.time_format);
  const doctorTitle   = useUserPrefsStore(s => s.doctor_title);
  const defaultLabId  = useUserPrefsStore(s => s.default_lab_id);
  const setUserPref   = useUserPrefsStore(s => s.setPref);

  // Lab listesi — doctor için default lab dropdown'da kullanılır
  const [labs, setLabs] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!isDoctor) return;
    (async () => {
      const { data } = await supabase.from('labs').select('id, name').order('name');
      if (Array.isArray(data)) setLabs(data as any);
    })();
  }, [isDoctor]);

  // ── Lab logo (genel ayarlar) ─────────────────────────────────────────
  const labId = (useAuthStore.getState().profile as any)?.lab_id ?? null;
  const [labLogoUrl, setLabLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [brandMode, setBrandMode] = useState<'logo' | 'logo_text'>('logo_text');
  const [logoScale, setLogoScale] = useState(1);
  const [labNameInput, setLabNameInput] = useState('');
  const [labNameSaved, setLabNameSaved] = useState('');
  const [labNameSaving, setLabNameSaving] = useState(false);
  const bumpLabBrand = useLabBrandStore(s => s.bump);

  useEffect(() => {
    if (!labId || !isLab) return;
    (async () => {
      const { data } = await supabase.from('labs').select('name, logo_url, sidebar_brand_mode, sidebar_logo_scale').eq('id', labId).maybeSingle();
      if (data?.logo_url) setLabLogoUrl(data.logo_url);
      if ((data as any)?.sidebar_brand_mode) setBrandMode((data as any).sidebar_brand_mode === 'logo' ? 'logo' : 'logo_text');
      if ((data as any)?.sidebar_logo_scale != null) setLogoScale(Number((data as any).sidebar_logo_scale) || 1);
      if ((data as any)?.name != null) { setLabNameInput((data as any).name); setLabNameSaved((data as any).name); }
    })();
  }, [labId, isLab]);

  const saveLabName = useCallback(async () => {
    const v = labNameInput.trim();
    if (!labId || !v || v === labNameSaved || labNameSaving) return;
    setLabNameSaving(true);
    const { error } = await supabase.from('labs').update({ name: v }).eq('id', labId);
    setLabNameSaving(false);
    if (!error) { setLabNameSaved(v); bumpLabBrand(); }
  }, [labId, labNameInput, labNameSaved, labNameSaving, bumpLabBrand]);

  const saveBrandMode = useCallback(async (mode: 'logo' | 'logo_text') => {
    setBrandMode(mode);
    if (labId) { await supabase.from('labs').update({ sidebar_brand_mode: mode }).eq('id', labId); bumpLabBrand(); }
  }, [labId, bumpLabBrand]);
  const saveLogoScale = useCallback(async (next: number) => {
    const v = Math.max(0.6, Math.min(1.8, Math.round(next * 20) / 20));
    setLogoScale(v);
    if (labId) { await supabase.from('labs').update({ sidebar_logo_scale: v }).eq('id', labId); bumpLabBrand(); }
  }, [labId, bumpLabBrand]);

  const pickAndUploadLogo = useCallback(() => {
    if (Platform.OS !== 'web' || !labId) return;
    // @ts-ignore — web
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLogoUploading(true);
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
        const path = `${labId}/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('lab-logos')
          .upload(path, file, { contentType: file.type, upsert: true });
        if (upErr) { console.error('[lab-logo] upload', upErr); setLogoUploading(false); return; }
        const { data: pub } = supabase.storage.from('lab-logos').getPublicUrl(path);
        const url = pub.publicUrl;
        await supabase.from('labs').update({ logo_url: url }).eq('id', labId);
        setLabLogoUrl(url);
        bumpLabBrand();
      } finally {
        setLogoUploading(false);
      }
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  }, [labId, bumpLabBrand]);

  const removeLogo = useCallback(async () => {
    if (!labId) return;
    await supabase.from('labs').update({ logo_url: null }).eq('id', labId);
    setLabLogoUrl(null);
    bumpLabBrand();
  }, [labId, bumpLabBrand]);

  if (loading) {
    return <CenteredLoader color={accentColor} label="Ayarlar yükleniyor…" />;
  }

  const s = local;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: sidePad, paddingTop: 0, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Genel Ayarlar kartı ──────────────────────────────── */}
      <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
        <View className="flex-row items-center gap-2 mb-1">
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: T.ink }}>
            Genel Ayarlar
          </Text>
        </View>
        <Text className="text-[13px] mb-4" style={{ color: T.ink3 }}>
          Uygulama genelindeki temel yapılandırma ayarları.
        </Text>

        <View className="h-px mb-1" style={{ backgroundColor: T.hairline2 }} />

        {/* ── Laboratuvar Logosu (sadece lab/admin + manage_settings yetkisi) ── */}
        {isLab && canManageSettings && (
          <SettingRow
            icon={Building2}
            label="Laboratuvar İsmi"
            sub="Sidebar, fatura ve yazışmalarda görünür"
            accentColor={accentColor}
            controlWidth={300}
          >
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <TextInput
                value={labNameInput}
                onChangeText={setLabNameInput}
                onSubmitEditing={saveLabName}
                onBlur={saveLabName}
                placeholder="Laboratuvar adı"
                placeholderTextColor={T.ink3}
                style={{
                  flex: 1, maxWidth: 240, height: 36, paddingHorizontal: 12, fontSize: 13, color: T.ink,
                  backgroundColor: T.cardSoft, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}),
                }}
              />
              <Pressable
                onPress={saveLabName}
                disabled={labNameSaving || !labNameInput.trim() || labNameInput.trim() === labNameSaved}
                style={{
                  height: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: (labNameInput.trim() && labNameInput.trim() !== labNameSaved) ? accentColor : 'rgba(0,0,0,0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: (labNameInput.trim() && labNameInput.trim() !== labNameSaved) ? '#FFFFFF' : T.ink3 }}>
                  {labNameSaving ? '…' : 'Kaydet'}
                </Text>
              </Pressable>
            </View>
          </SettingRow>
        )}

        {isLab && canManageSettings && (
          <SettingRow
            icon={ImageIcon}
            label="Laboratuvar Logosu"
            sub="İş emri çıktısı ve yazışmalarda kullanılır · PNG, JPG, SVG (önerilen: 400×400, transparent)"
            accentColor={accentColor}
            controlWidth={240}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <View style={{
                width: 44, height: 44, borderRadius: 10,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                backgroundColor: labLogoUrl ? T.card : T.cardSoft,
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {labLogoUrl ? (
                  <RNImage source={{ uri: labLogoUrl }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                ) : (
                  <ImageIcon size={18} color={T.ink3} strokeWidth={1.6} />
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {/* Değiştir — compact icon button, sadece icon */}
                <Pressable
                  onPress={pickAndUploadLogo}
                  disabled={logoUploading}
                  accessibilityLabel={labLogoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    height: 32, paddingHorizontal: 12, borderRadius: 8,
                    backgroundColor: hovered ? `${accentColor}E6` : accentColor,
                    opacity: logoUploading ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: logoUploading ? 'wait' : 'pointer' as any } as any : {}),
                  })}
                >
                  <Upload size={12} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 }}>
                    {logoUploading ? 'Yükleniyor' : labLogoUrl ? 'Değiştir' : 'Yükle'}
                  </Text>
                </Pressable>
                {labLogoUrl && (
                  <Pressable
                    onPress={removeLogo}
                    accessibilityLabel="Logoyu kaldır"
                    style={({ hovered }: any) => ({
                      width: 32, height: 32, borderRadius: 8,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: hovered ? '#FEE2E2' : 'transparent',
                      borderWidth: 1, borderColor: hovered ? '#FCA5A5' : 'rgba(0,0,0,0.08)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                    })}
                  >
                    <Trash2 size={13} color="#DC2626" strokeWidth={1.8} />
                  </Pressable>
                )}
              </View>
            </View>
          </SettingRow>
        )}

        {/* Sidebar marka gösterimi — logo varsa */}
        {isLab && canManageSettings && labLogoUrl && (
          <SettingRow
            icon={ImageIcon}
            label="Sidebar Markası"
            sub="Kenar çubuğunda logo nasıl görünsün"
            accentColor={accentColor}
            controlWidth={240}
          >
            <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', alignSelf: 'flex-end' }}>
              {([
                { k: 'logo_text', label: 'Logo + İsim' },
                { k: 'logo',      label: 'Sadece Logo' },
              ] as const).map(opt => {
                const active = brandMode === opt.k;
                return (
                  <Pressable
                    key={opt.k}
                    onPress={() => saveBrandMode(opt.k)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: active ? accentColor : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : T.ink2 }}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SettingRow>
        )}

        {/* Logo Boyutu — sidebar logo ölçeği */}
        {isLab && canManageSettings && labLogoUrl && (
          <SettingRow
            icon={ImageIcon}
            label="Logo Boyutu"
            sub="Sidebar'daki logonun büyüklüğü"
            accentColor={accentColor}
            controlWidth={240}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-end', flex: 1, justifyContent: 'flex-end' }}>
              {Platform.OS === 'web' ? (
                React.createElement('input' as any, {
                  type: 'range', min: 0.6, max: 1.8, step: 0.05, value: logoScale,
                  onChange: (e: any) => setLogoScale(parseFloat(e.target.value)),
                  onMouseUp: (e: any) => saveLogoScale(parseFloat(e.target.value)),
                  onTouchEnd: (e: any) => saveLogoScale(parseFloat(e.target.value)),
                  style: { flex: 1, maxWidth: 180, accentColor, cursor: 'pointer' },
                })
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => saveLogoScale(logoScale - 0.1)} disabled={logoScale <= 0.6} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', opacity: logoScale <= 0.6 ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink, marginTop: -2 }}>−</Text>
                  </Pressable>
                  <Pressable onPress={() => saveLogoScale(logoScale + 0.1)} disabled={logoScale >= 1.8} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', opacity: logoScale >= 1.8 ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink, marginTop: -2 }}>+</Text>
                  </Pressable>
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, minWidth: 44, textAlign: 'right' }}>%{Math.round(logoScale * 100)}</Text>
            </View>
          </SettingRow>
        )}

        {/* Para Birimi — manage_settings yetkisi gerekir */}
        {canManageSettings && (
          <SettingRow
            icon={Globe}
            label="Ana Para Birimi"
            sub="Varsayılan para birimi (çoklu desteklenir)"
            accentColor={accentColor}
          >
            <DropdownSelect
              options={CURRENCIES.map(c => ({
                key: c.code,
                label: `${c.symbol}  ${c.code}`,
                sub: c.label,
              }))}
              value={s.default_currency}
              onChange={(v) => handleUpdate({ default_currency: v })}
              accentColor={accentColor}
              renderLabel={(opt) => opt.label}
            />
          </SettingRow>
        )}

        {/* Hafta Başlangıcı — manage_settings yetkisi gerekir */}
        {canManageSettings && (
          <SettingRow
            icon={Calendar}
            label="Hafta Başlangıcı"
            sub="Takvim ve raporlarda haftanın ilk günü"
            accentColor={accentColor}
          >
            <SegmentPicker
              options={WEEK_STARTS.map(w => ({ key: w.key, label: w.label }))}
              value={s.week_start}
              onChange={(v) => handleUpdate({ week_start: v })}
              accentColor={accentColor}
            />
          </SettingRow>
        )}

        {/* Uygulama Dili */}
        <SettingRow
          icon={Globe}
          label={t('common.language')}
          sub={t('settings.languageSub')}
          accentColor={accentColor}
        >
          <DropdownSelect
            options={(SUPPORTED as readonly Lang[]).map(l => ({ key: l, label: ({ tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی' } as Record<string, string>)[l] ?? l }))}
            value={i18n.language as Lang}
            onChange={(v) => setLanguage(v as Lang)}
            accentColor={accentColor}
          />
        </SettingRow>

        {/* Tema */}
        <SettingRow
          icon={Sun}
          label="Tema"
          sub="Arayüz görünüm tercihi"
          accentColor={accentColor}
        >
          <SegmentPicker
            options={THEMES}
            value={s.theme_mode}
            onChange={(v) => handleUpdate({ theme_mode: v })}
            accentColor={accentColor}
          />
        </SettingRow>

        {/* Tarih Formatı */}
        <SettingRow
          icon={CalendarDays}
          label="Tarih Formatı"
          sub="Tarihlerin gösterim biçimi"
          accentColor={accentColor}
        >
          <DropdownSelect
            options={[
              { key: 'dd.MM.yyyy', label: formatDatePreview('dd.MM.yyyy'), sub: 'Gün.Ay.Yıl (TR)' },
              { key: 'MM/dd/yyyy', label: formatDatePreview('MM/dd/yyyy'), sub: 'Ay/Gün/Yıl (US)' },
              { key: 'yyyy-MM-dd', label: formatDatePreview('yyyy-MM-dd'), sub: 'Yıl-Ay-Gün (ISO)' },
            ]}
            value={dateFormat}
            onChange={(v) => setUserPref('date_format', v as any)}
            accentColor={accentColor}
            renderLabel={(opt) => opt.label}
          />
        </SettingRow>

        {/* Saat Formatı */}
        <SettingRow
          icon={Watch}
          label="Saat Formatı"
          sub="24 saat veya 12 saat AM/PM"
          accentColor={accentColor}
          isLast
        >
          <SegmentPicker
            options={[
              { key: '24h', label: '24 saat' },
              { key: '12h', label: '12 saat' },
            ]}
            value={timeFormat}
            onChange={(v) => setUserPref('time_format', v as any)}
            accentColor={accentColor}
          />
        </SettingRow>
      </View>

      {/* ── Hekim'e Özel Ayarlar kartı ───────────────────────── */}
      {isDoctor && (
        <View className="rounded-[24px] p-[22px] mt-4" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: T.ink, marginBottom: 4 }}>
            Hekim Ayarları
          </Text>
          <Text className="text-[13px] mb-4" style={{ color: T.ink3 }}>
            Profil ve varsayılan tercihler.
          </Text>

          <View className="h-px mb-1" style={{ backgroundColor: T.hairline2 }} />

          {/* Hekim Unvanı */}
          <SettingRow
            icon={UserCheck}
            label="Hekim Unvanı"
            sub="İsminizin önünde gösterilir (Dr., Diş Hekimi, Prof. Dr., …)"
            accentColor={accentColor}
          >
            <TextInput
              className="text-[14px] border rounded-[14px] px-3.5"
              style={{ height: 44, minWidth: 180, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, outlineWidth: 0 } as any}
              value={doctorTitle}
              onChangeText={(v) => setUserPref('doctor_title', v.slice(0, 30))}
              placeholder="Örn: Dr."
              placeholderTextColor={T.ink3}
              maxLength={30}
            />
          </SettingRow>

          {/* Varsayılan Laboratuvar */}
          <SettingRow
            icon={Building2}
            label="Varsayılan Laboratuvar"
            sub="Yeni siparişlerde otomatik seçili gelir"
            accentColor={accentColor}
            isLast
          >
            <DropdownSelect
              options={[
                { key: '__none__', label: 'Yok', sub: 'Her seferinde seç' },
                ...labs.map(l => ({ key: l.id, label: l.name, sub: '' })),
              ]}
              value={defaultLabId ?? '__none__'}
              onChange={(v) => setUserPref('default_lab_id', v === '__none__' ? null : v as string)}
              accentColor={accentColor}
              renderLabel={(opt) => opt.label}
            />
          </SettingRow>
        </View>
      )}

      {/* ── Lab'a Özel Ayarlar kartı — manage_settings yetkisi gerekir ── */}
      {isLab && canManageSettings && (
        <View className="rounded-[24px] p-[22px] mt-4" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: T.ink, marginBottom: 4 }}>
            Laboratuvar Ayarları
          </Text>
          <Text className="text-[13px] mb-4" style={{ color: T.ink3 }}>
            Laboratuvara özel iş akışı ve yapılandırma ayarları.
          </Text>

          <View className="h-px mb-1" style={{ backgroundColor: T.hairline2 }} />

          {/* Sipariş Prefix */}
          <SettingRow
            icon={Hash}
            label="Sipariş Ön Eki"
            sub="Sipariş numarası formatı (ör: LAB-2026-0001)"
            accentColor={accentColor}
          >
            <TextInput
              className="text-[14px] border rounded-[14px] px-3.5"
              style={{ height: 44, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, outlineWidth: 0 } as any}
              value={s.order_prefix}
              onChangeText={(v) => handleUpdate({ order_prefix: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })}
              placeholder="LAB"
              placeholderTextColor={T.ink3}
              maxLength={6}
              autoCapitalize="characters"
            />
          </SettingRow>

          {/* KDV Oranı */}
          <SettingRow
            icon={Percent}
            label="Varsayılan KDV Oranı"
            sub="Faturalarda kullanılacak oran"
            accentColor={accentColor}
          >
            <DropdownSelect
              options={[
                { key: 0,  label: '%0',  sub: 'KDV yok' },
                { key: 1,  label: '%1',  sub: 'Düşük oran' },
                { key: 10, label: '%10', sub: 'İndirimli oran' },
                { key: 20, label: '%20', sub: 'Genel oran' },
              ]}
              value={s.default_tax_rate}
              onChange={(v) => handleUpdate({ default_tax_rate: v })}
              accentColor={accentColor}
            />
          </SettingRow>

          {/* Çalışma Saatleri */}
          <SettingRow
            icon={Clock}
            label="Çalışma Saatleri"
            sub="Mesai başlangıç ve bitiş saatleri"
            accentColor={accentColor}
            controlWidth={200}
          >
            <View className="flex-row items-center gap-1.5">
              <TextInput
                className="text-[14px] text-center border rounded-[14px]"
                style={{ height: 40, width: 80, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, outlineWidth: 0 } as any}
                value={s.working_hours_start}
                onChangeText={(v) => handleUpdate({ working_hours_start: v })}
                placeholder="08:00"
                placeholderTextColor={T.ink3}
                maxLength={5}
              />
              <Text className="text-[14px] px-1" style={{ color: T.ink3 }}>–</Text>
              <TextInput
                className="text-[14px] text-center border rounded-[14px]"
                style={{ height: 40, width: 80, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, outlineWidth: 0 } as any}
                value={s.working_hours_end}
                onChangeText={(v) => handleUpdate({ working_hours_end: v })}
                placeholder="18:00"
                placeholderTextColor={T.ink3}
                maxLength={5}
              />
            </View>
          </SettingRow>

          {/* Otomatik Çıkış */}
          <SettingRow
            icon={LogOut}
            label="Otomatik Çıkış"
            sub="İşlem yapılmadığında otomatik oturum kapatma"
            accentColor={accentColor}
          >
            <DropdownSelect
              options={AUTO_LOGOUT.map(a => ({ key: a.value, label: a.label }))}
              value={s.auto_logout_minutes}
              onChange={(v) => handleUpdate({ auto_logout_minutes: v })}
              accentColor={accentColor}
            />
          </SettingRow>

          {/* Sayfa Başına Kayıt */}
          <SettingRow
            icon={List}
            label="Sayfa Başına Kayıt"
            sub="Tablo ve listelerde gösterilecek kayıt sayısı"
            accentColor={accentColor}
            isLast
          >
            <SegmentPicker
              options={ITEMS_PER_PAGE.map(p => ({ key: p.value as any, label: p.label }))}
              value={s.items_per_page as any}
              onChange={(v) => handleUpdate({ items_per_page: v })}
              accentColor={accentColor}
            />
          </SettingRow>
        </View>
      )}

      {/* Bilgi notu */}
      <View
        className="flex-row gap-3 rounded-2xl p-4 mt-4"
        style={{ backgroundColor: `${accentColor}08`, borderWidth: 1, borderColor: `${accentColor}30` }}
      >
        <Info size={15} color={accentColor} strokeWidth={1.8} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[13px] leading-5" style={{ color: accentColor }}>
          Ayarlar değiştirildiğinde otomatik olarak kaydedilir. Tüm kullanıcılar için geçerli olur.
        </Text>
      </View>
    </ScrollView>
  );
}
