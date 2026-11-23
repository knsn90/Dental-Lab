/**
 * GeneralSection — Patterns Design Language (NativeWind)
 * ─────────────────────────────────────────────────────
 * Ayarlar > Genel sekmesi.
 * Genel ayarlar (para birimi, hafta başlangıcı, tema) +
 * Lab'a özel ayarlar (sipariş prefix, KDV, mesai, otomatik çıkış, sayfa kayıt).
 * Patterns cardSolid stili + NativeWind className.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SUPPORTED_CURRENCIES, CURRENCY_META } from '../../../core/money/currency';
import { autoT } from '../../../core/i18n/autoTranslate';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED, type Lang,
         getCalendarPref, setCalendarPref, usesPersianCalendar, type CalendarPref } from '../../../core/i18n';
import { View, Text, ScrollView, Pressable, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import {
  Globe, Clock, Calendar, Monitor, Sun, Moon, Laptop,
  ChevronDown, Check, Info, Hash, Percent, Timer, LogOut, List,
  CalendarDays, Watch, UserCheck, Building2, Image as ImageIcon, Upload, Trash2,
  MapPin, Phone, Download, Receipt,
  Bell, Mail, MessageCircle, Send, AlertTriangle,
} from '../../../core/ui/icons';
import { Image as RNImage } from 'react-native';
import { useAuthStore } from '../../../core/store/authStore';
import {
  useLabSettingsStore,
  defaultTaxRateFor,
  type LabRegion,
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
import { useInkUI } from '../../../core/theme/inkScale';
import { toast } from '../../../core/ui/Toast';
import {
  EMPTY_LAB_BILLING, LAB_BILLING_LABELS, REQUIRED_LAB_BILLING_FIELDS,
  validateLabBilling, splitLegacyAddress, composeLabAddress,
  type LabBilling, type LabBillingField,
} from '../labBilling';
import { fetchLabBilling, saveLabBilling } from '../labBillingApi';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import * as ImagePicker from 'expo-image-picker';
import { myLabMemberships } from '../../lab-connections/api';

// ── Types ───────────────────────────────────────────────────────────────
interface Props {
  panelType: string;
  accentColor: string;
  /** 'personal' = Genel sekmesi (tema, dil, takvim — yalnız bu kullanıcı).
   *  'lab' = Laboratuvar sekmesi (marka, bölge, kimlik, iş akışı, gizlilik — tüm ekip).
   *  Eskiden ikisi tek sayfadaydı; hangi ayarın kimi etkilediği belli değildi ve
   *  paylaşılan tabletten lab ayarı değiştirilebiliyordu. */
  view?: 'personal' | 'lab';
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
// TEK KAYNAK: core/money/currency. Buradaki liste elle yazılıydı ve IRT (Tümen)
// eklendiğinde güncellenmediği için İran labı kendi para birimini seçemiyordu.
const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] =
  SUPPORTED_CURRENCIES.map(code => ({
    code,
    symbol: CURRENCY_META[code].symbol,
    label:  CURRENCY_META[code].label,
  }));

// ── Week start options ──────────────────────────────────────────────────
const WEEK_STARTS: { key: WeekStart; label: string }[] = [
  { key: 'auto',     label: 'Otomatik' },
  { key: 'saturday', label: 'Cumartesi' },
  { key: 'monday', label: 'Pazartesi' },
  { key: 'sunday', label: 'Pazar' },
];

// ── Theme options ───────────────────────────────────────────────────────
const THEMES: { key: ThemeMode; label: string; icon: any }[] = [
  { key: 'light',  label: 'Açık',   icon: Sun },
  { key: 'dark',   label: 'Koyu',   icon: Moon },
  { key: 'system', label: 'Sistem', icon: Laptop },
];

// Teslim süresi seçenekleri (iş günü)
const LEAD_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30];
const URGENT_DAY_OPTIONS = [1, 2, 3, 4, 5];

// Otomatik Çıkış · Sayfa Başına Kayıt · Çalışma Saatleri ekrandan kaldırıldı
// (2026-11-22): üçünü de okuyan hiçbir kod yoktu, değiştirmek hiçbir şey
// yapmıyordu. lab_settings sütunları duruyor — işlevi bağlanınca geri gelir.

// ── Tema önizleme seçici (macOS "Appearance" tarzı) ────────────────────
//
// NEDEN: tema, adı okunarak değil GÖRÜLEREK seçilir. Üç mini pencere mockup'ı
// seçeneğin ne yapacağını kelimeden önce gösterir (Apple: tanıdıklık + kavrama).
// Karolar BİLEREK sabit renklidir — aktif temayı değil, TEMSİL ETTİKLERİ temayı
// gösterirler; yalnız çerçeve/etiket/rozet aktif temaya uyar.

const TILE_LIGHT = { shell: '#F1F1F1', card: '#FFFFFF', text: '#0A0A0A', edge: 'rgba(0,0,0,0.07)' };
const TILE_DARK  = { shell: '#4A4A4A', card: '#171717', text: '#FFFFFF', edge: 'rgba(255,255,255,0.10)' };

/** Tek mini pencere: dış kabuk + sağ-alta taşan iç kart + "Aa". */
function ThemeTileArt({ tone }: { tone: 'light' | 'dark' }) {
  const c = tone === 'light' ? TILE_LIGHT : TILE_DARK;
  return (
    <View style={{ flex: 1, backgroundColor: c.shell }}>
      <View
        style={{
          position: 'absolute', start: '27%', top: '30%', end: -3, bottom: -3,
          backgroundColor: c.card,
          borderTopStartRadius: 10,
          borderWidth: 1, borderColor: c.edge,
          paddingStart: 10, paddingTop: 5,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, letterSpacing: -0.3 }}>Aa</Text>
      </View>
    </View>
  );
}

/** "Sistem" karosu: aynı mockup ortadan ikiye bölünür — solu koyu, sağı açık. */
function ThemeTileSplit() {
  return (
    <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: '50%', overflow: 'hidden' }}>
        <View style={{ width: '200%', height: '100%' }}><ThemeTileArt tone="dark" /></View>
      </View>
      <View style={{ position: 'absolute', end: 0, top: 0, bottom: 0, width: '50%', overflow: 'hidden' }}>
        <View style={{ width: '200%', height: '100%', marginStart: '-100%' }}><ThemeTileArt tone="light" /></View>
      </View>
    </View>
  );
}

// Kaydedilen ama henüz hiçbir ekranın okumadığı kişisel tercihler (tarih/saat
// biçimi, hekim unvanı, varsayılan lab). Bağlanınca true yapılır.
const SHOW_UNWIRED_PREFS = false;

export function ThemePreviewPicker({ value, onChange }: {
  value: ThemeMode; onChange: (v: ThemeMode) => void;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Seçim halkası ve tik rozeti aktif temaya göre: açıkta siyah, koyuda krem.
  const ring   = T.ink as string;
  const onRing = isDark ? '#141312' : '#FFFFFF';
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {THEMES.map(opt => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={Platform.OS === 'web'
              ? ((({ pressed }: any) => ({
                  flex: 1, minWidth: 72, gap: 6,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  cursor: 'pointer', transitionProperty: 'transform', transitionDuration: '140ms',
                })) as any)
              : { flex: 1, minWidth: 72, gap: 6 }}
          >
            <View
              style={{
                height: 64, borderRadius: 12, overflow: 'hidden',
                borderWidth: active ? 3 : 1,
                borderColor: active ? ring : T.hairline,
                position: 'relative',
              }}
            >
              {opt.key === 'system' ? <ThemeTileSplit /> : <ThemeTileArt tone={opt.key === 'dark' ? 'dark' : 'light'} />}
              {active && (
                <View
                  style={{
                    position: 'absolute', end: 5, bottom: 5,
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: ring, alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Check size={11} color={onRing} strokeWidth={3} />
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: active ? '700' : '600', color: active ? (T.ink as string) : (T.ink3 as string) }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Vurgu rengi okunabilirliği ──────────────────────────────────────────
// Panel accent'leri (safran #F5C24B, zümrüt #32BB78…) ZEMİN için seçilmiş;
// beyaz kart üstünde METİN/ikon olarak kullanılınca okunmuyordu (safran ≈1.6:1).
// Metin/ikon için aynı rengin koyu tonu (açık tema) ya da açık tonu (koyu tema).
const ACCENT_INK: Record<string, { light: string; dark: string }> = {
  '#F5C24B': { light: '#8A6410', dark: '#F5C24B' },   // lab safran
  '#32BB78': { light: '#0A7247', dark: '#74E1A8' },   // klinik/hekim zümrüt
  '#004B87': { light: '#004B87', dark: '#93C5FD' },   // admin lacivert
  '#3B82F6': { light: '#1E5FBF', dark: '#93C5FD' },   // istasyon mavi
};
export function accentInk(accent: string, isDark: boolean): string {
  const m = ACCENT_INK[(accent ?? '').toUpperCase()];
  return m ? (isDark ? m.dark : m.light) : accent;
}
/** Accent ZEMİN üstündeki metin: açık accent'te (safran) koyu, diğerlerinde beyaz. */
export function onAccentFg(accent: string): string {
  return (accent ?? '').toUpperCase() === '#F5C24B' ? '#0A0A0A' : '#FFFFFF';
}

// ── Segment picker (3-option pill) ─────────────────────────────────────
export function SegmentPicker<T extends string>({
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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // iOS tarzı segmented: açık gri ray + YÜKSELEN pill + KOYU metin.
  //
  // NEDEN (iki ayrı hata birlikte yaşandı):
  //  1) Pressable'a `className` ile BİRLİKTE fonksiyon-`style` verilince NativeWind
  //     fonksiyon stilini uygulamıyordu → seçili pill'in zemini hiç çizilmiyordu.
  //     Bütün stil tek bir düz nesnede toplandı, className kaldırıldı.
  //  2) Metin accent zeminine göre beyaz seçiliyordu; zemin çizilmeyince beyaz
  //     yazı açık gri rayın üstünde kayboluyordu. Artık seçili metin `T.ink`
  //     (açık temada siyah, koyu temada krem) — zemine bağlı tahmin yok.
  const trackBg  = isDark ? 'rgba(255,255,255,0.07)' : T.hairline2;
  const pillBg   = isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF';
  const pillEdge = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)';
  return (
    <View style={{ flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: trackBg, padding: 3 }}>
      {options.map(opt => {
        const active = value === opt.key;
        const Icon = opt.icon;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            // 3. HATA (2026-09-10): fonksiyon-`style` native'de layout stilini
            // düşürüyor → `flex:1` + `flexDirection:'row'` uygulanmıyor, seçenekler
            // alt alta yığılıp ray taşıyordu. Web'de görünmez. Native'de düz nesne;
            // hover/scale zaten web kavramı, orada fonksiyon stille yaşıyor.
            style={Platform.OS === 'web'
              ? ((({ pressed, hovered }: any) => ({
                  flex: 1,
                  flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
                  gap: 6, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 9,
                  backgroundColor: active
                    ? pillBg
                    : hovered ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? pillEdge : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                  cursor: 'pointer',
                  transitionProperty: 'background-color, transform',
                  transitionDuration: '140ms',
                  ...(active && !isDark ? { boxShadow: '0 1px 3px rgba(0,0,0,0.10)' } : {}),
                })) as any)
              : {
                  flex: 1,
                  flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
                  gap: 6, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9,
                  backgroundColor: active ? pillBg : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? pillEdge : 'transparent',
                }}
            // Basma geri bildirimi native'de fonksiyon stille gelemediği için
            // Android'de ripple; iOS'ta seçili pill'in kendisi zaten net cevap.
            android_ripple={{ color: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)', borderless: false }}
          >
            {Icon && <Icon size={13} color={active ? (T.ink as string) : (T.ink3 as string)} strokeWidth={active ? 2 : 1.8} />}
            <Text style={{ fontSize: 12, fontWeight: active ? '700' : '600', color: active ? (T.ink as string) : (T.ink3 as string) }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Dropdown select ─────────────────────────────────────────────────────
export function DropdownSelect<T extends string | number>({
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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const selected = options.find(o => o.key === value);
  const displayLabel = selected ? (renderLabel ? renderLabel(selected) : selected.label) : '';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 border rounded-[10px] px-3"
        style={{ height: 36, borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card }}
      >
        <Text numberOfLines={1} className="flex-1 text-[13px]" style={{ color: T.ink }}>{displayLabel}</Text>
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
                        style={isSelected ? { fontWeight: '600', color: accentInk(accentColor, isDark) } : { color: T.ink }}
                      >
                        {renderLabel ? renderLabel(opt) : opt.label}
                      </Text>
                      {opt.sub && (
                        <Text className="text-[12px] mt-0.5" style={{ color: T.ink3 }}>{opt.sub}</Text>
                      )}
                    </View>
                    {isSelected && <Check size={16} color={accentInk(accentColor, isDark)} strokeWidth={2} />}
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
/**
 * Ayar grubu başlığı. Sayfa düz bir form listesiydi; 17 satır arka arkaya
 * gelince "hangi ayar nerede" aranarak bulunuyordu. Anlam birimleri:
 * Kimlik · Görünüm · Yerelleştirme · Operasyon.
 */
export function SettingGroup({ title, sub, children, first }: {
  title: string; sub?: string; children: React.ReactNode; first?: boolean;
}) {
  const T = useMobileTokens();
  return (
    <View style={{ marginTop: first ? 4 : 30 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: T.ink2 }}>
        {title}
      </Text>
      {!!sub && <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{sub}</Text>}
      <View className="h-px" style={{ backgroundColor: T.hairline, marginTop: 10, marginBottom: 2 }} />
      {children}
    </View>
  );
}

/**
 * Kaydet butonu yerine geçen sessiz gösterge.
 * Metin alanları zaten blur/enter'da kaydediyordu; buton yalnız "eski admin
 * paneli" hissi veriyordu. Yazan kullanıcı alandan çıkınca kaydedilir ve
 * ~2 sn "Kaydedildi" görünür.
 */
function SaveHint({ saving, dirty, accentColor }: {
  saving: boolean; dirty: boolean; accentColor: string;
}) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const T = useMobileTokens();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const wasSaving = useRef(false);

  useEffect(() => {
    if (wasSaving.current && !saving) setSavedAt(Date.now());
    wasSaving.current = saving;
  }, [saving]);

  // "Az önce" → "3 dk önce" diye yaşlansın; kullanıcı en son ne zaman
  // kaydedildiğini görsün. Dakikada bir yeniden çizmek yeterli.
  useEffect(() => {
    if (savedAt == null) return;
    const id = setInterval(() => tick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, [savedAt]);

  if (saving) {
    return <Text style={{ fontSize: 11.5, color: T.ink3 }}>Kaydediliyor…</Text>;
  }
  if (dirty) {
    return <Text style={{ fontSize: 11.5, fontWeight: '600', color: accentInk(accentColor, isDark) }}>Çıkınca kaydedilir</Text>;
  }
  if (savedAt != null) {
    const mins = Math.floor((Date.now() - savedAt) / 60_000);
    const when = mins < 1 ? autoT('Az önce') : mins < 60 ? `${mins} ${autoT('dk önce')}` : `${Math.floor(mins / 60)} ${autoT('sa önce')}`;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 96 }}>
        <Check size={12} color="#2D9A6B" strokeWidth={2.6} />
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#2D9A6B' }}>Kaydedildi</Text>
        <Text style={{ fontSize: 11, color: T.ink3 }}>· {when}</Text>
      </View>
    );
  }
  return null;
}

/**
 * Ayar metin kutusu — hover/focus geri bildirimi olan tek kaynak.
 * Eskiden düz TextInput'lardı: tıklanabilir mi, düzenlenebilir mi belli
 * olmuyordu. Focus'ta accent kenarlık + halka, hover'da kenarlık koyulaşır.
 */
function SettingInput({ accentColor, style, multiline, ...rest }: any) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <TextInput
      {...rest}
      multiline={multiline}
      onFocus={(e: any) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e: any) => { setFocused(false); rest.onBlur?.(e); }}
      {...(Platform.OS === 'web'
        ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
        : {})}
      placeholderTextColor={T.ink3}
      style={[
        {
          fontSize: 13, color: T.ink,
          // Zemin HER ZAMAN kart yüzeyi (açık temada beyaz). Koyu temada kartın
          // üstünde kaybolmasın diye bir kademe koyu yüzey kullanılır.
          backgroundColor: isDark ? T.cardSoft : T.card,
          borderRadius: 8, borderWidth: 1,
          borderColor: focused
            ? accentColor
            : hovered ? (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)')
                      : (isDark ? T.hairline : 'rgba(0,0,0,0.08)'),
          ...(Platform.OS === 'web'
            ? {
                outline: 'none',
                boxShadow: focused ? `0 0 0 3px ${accentColor}22` : 'none',
                transitionProperty: 'border-color, box-shadow, background-color',
                transitionDuration: '130ms',
              } as any
            : {}),
        },
        style,
      ]}
    />
  );
}

/**
 * Fatura Bilgileri — lab künyesi: ticari unvan, VKN/TCKN, vergi dairesi ve
 * yapılandırılmış adres. Zorunlu alanlar eksik/hatalıyken KAYDEDİLMEZ; e-fatura
 * gönderimi de bunlar dolmadan kilitli. Görünen adres (labs.address) bu
 * alanlardan oluşturulur — iki ayrı adres tutulmaz. Kurallar: ../labBilling.ts
 *
 * Diğer satırlar alan alan "çıkınca kaydet" çalışır; bu blok alanlar birbirine
 * bağlı (zorunluluk) olduğu için tek "Kaydet" ile kaydeder.
 */
/**
 * Fatura Bilgileri — Finans Ayarları'nda gösterilir (eskiden Genel'deydi).
 * Lab adresi henüz girilmemişse kurye entegrasyonundaki alış adresini önerir.
 */
export function LabBillingCard({ labId, accentColor }: { labId: string; accentColor: string }) {
  const [pickup, setPickup] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('labs').select('address').eq('id', labId).maybeSingle();
      if (String((data as any)?.address ?? '').trim()) return;
      const { data: pc } = await supabase
        .from('provider_credentials').select('credentials')
        .eq('lab_id', labId).eq('type', 'courier').eq('is_active', true).maybeSingle();
      const addr = (pc as any)?.credentials?.pickup_address;
      if (alive && addr) setPickup(String(addr));
    })();
    return () => { alive = false; };
  }, [labId]);
  return <LabBillingRow labId={labId} accentColor={accentColor} pickupAddress={pickup} />;
}

function LabBillingRow({ labId, accentColor, pickupAddress }: {
  labId: string; accentColor: string; pickupAddress?: string | null;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const bumpLabBrand = useLabBrandStore(s => s.bump);
  const [saved, setSaved] = useState<LabBilling>(EMPTY_LAB_BILLING);
  const [form, setForm] = useState<LabBilling>(EMPTY_LAB_BILLING);
  const [loading, setLoading] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLabBilling(labId).then(({ billing, prefilledFromAddress }) => {
      if (!alive) return;
      setForm(billing);
      // Eski adresten doldurulan alanlar henüz KAYDEDİLMEDİ → "değişti" sayılır.
      setSaved(prefilledFromAddress ? { ...billing, street: '', district: '', city: '' } : billing);
      setPrefilled(prefilledFromAddress);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [labId]);

  const errors = validateLabBilling(form);
  const savedComplete = Object.keys(validateLabBilling(saved)).length === 0;
  const missingSaved = REQUIRED_LAB_BILLING_FIELDS.filter(f => !saved[f].trim());
  const dirty = (Object.keys(form) as LabBillingField[]).some(k => form[k].trim() !== saved[k].trim());
  const setField = (k: LabBillingField) => (v: string) => { setForm(f => ({ ...f, [k]: v })); setJustSaved(false); };

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length || saving) return;
    setSaving(true);
    const r = await saveLabBilling(labId, form);
    setSaving(false);
    if (!r.ok) { toast.error(autoT(r.error)); return; }
    setSaved(r.billing); setForm(r.billing); setPrefilled(false); setShowErrors(false); setJustSaved(true);
    bumpLabBrand();
  };

  const field = (k: LabBillingField, opts: { placeholder?: string; multiline?: boolean; keyboardType?: any; flex?: boolean } = {}) => {
    const err = showErrors ? errors[k] : undefined;
    const errColor = isDark ? '#FCA5A5' : '#D94B4B';
    return (
      <View key={k} style={{ gap: 4, ...(opts.flex ? { flex: 1, minWidth: 0 } : {}) }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3 }}>
          {LAB_BILLING_LABELS[k]}{REQUIRED_LAB_BILLING_FIELDS.includes(k) ? ' *' : ''}
        </Text>
        <SettingInput
          accentColor={err ? errColor : accentColor}
          value={form[k]}
          onChangeText={setField(k)}
          onSubmitEditing={opts.multiline ? undefined : save}
          placeholder={opts.placeholder}
          multiline={opts.multiline}
          keyboardType={opts.keyboardType}
          style={{
            width: '100%', paddingHorizontal: 12,
            ...(opts.multiline ? { minHeight: 44, paddingVertical: 9, textAlignVertical: 'top' } : { height: 36 }),
            ...(err ? { borderColor: errColor } : {}),
          }}
        />
        {err ? <Text accessibilityRole="alert" style={{ fontSize: 11, color: errColor }}>{err}</Text> : null}
      </View>
    );
  };

  if (loading) {
    return (
      <SettingRow icon={Receipt} label="Fatura Bilgileri" sub="e-Fatura ve resmi belgeler için zorunlu" accentColor={accentColor}>
        <ActivityIndicator size="small" color={accentColor} />
      </SettingRow>
    );
  }

  return (
    <SettingRow icon={Receipt} label="Fatura Bilgileri" sub="e-Fatura ve resmi belgeler için zorunlu" accentColor={accentColor}>
      <View style={{ flex: 1, gap: 10 }}>
        {!savedComplete && !dirty ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: U.chipTones.warning.bg }}>
            <AlertTriangle size={12} color={U.chipTones.warning.fg} strokeWidth={2} />
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: U.chipTones.warning.fg }}>
              {`${autoT('Eksik')}: ${(missingSaved.length ? missingSaved : (Object.keys(validateLabBilling(saved)) as LabBillingField[])).map(f => autoT(LAB_BILLING_LABELS[f])).join(', ')}`}
            </Text>
          </View>
        ) : null}
        {prefilled ? (
          <Text style={{ fontSize: 11.5, color: T.ink3 }}>Adres alanları mevcut adresinizden dolduruldu — kontrol edip kaydedin.</Text>
        ) : null}

        {field('legal_name', { placeholder: 'ör. Örnek Diş Laboratuvarı San. Tic. Ltd. Şti.' })}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {field('tax_number', { placeholder: '10 ya da 11 hane', keyboardType: 'number-pad', flex: true })}
          {field('tax_office', { placeholder: 'ör. Kozyatağı', flex: true })}
        </View>
        {field('street', { placeholder: 'Mahalle, cadde/sokak, no', multiline: true })}
        {pickupAddress && !form.street.trim() ? (
          <Pressable
            onPress={() => { setForm(f => ({ ...f, ...splitLegacyAddress(pickupAddress) })); setJustSaved(false); }}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
              paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
              backgroundColor: `${accentColor}14`, opacity: pressed ? 0.6 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Download size={12} color={accentInk(accentColor, isDark)} strokeWidth={2} />
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: accentInk(accentColor, isDark) }}>Kurye ayarındaki alış adresini kullan</Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {field('district', { placeholder: 'İlçe', flex: true })}
          {field('city', { placeholder: 'İl', flex: true })}
          <View style={{ width: 96 }}>{field('postal_code', { placeholder: '34000', keyboardType: 'number-pad' })}</View>
        </View>

        {composeLabAddress(form) ? (
          <Text numberOfLines={2} style={{ fontSize: 11.5, color: T.ink3 }}>
            {`${autoT('Görünen adres')}: ${composeLabAddress(form)}`}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          {justSaved && !dirty ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={12} color="#2D9A6B" strokeWidth={2.6} />
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#2D9A6B' }}>Kaydedildi</Text>
            </View>
          ) : null}
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
              backgroundColor: accentColor,
              opacity: !dirty || saving ? 0.45 : pressed ? 0.85 : 1,
              ...(Platform.OS === 'web' && dirty && !saving ? { cursor: 'pointer' } as any : {}),
            })}
          >
            {saving ? <ActivityIndicator size="small" color={onAccentFg(accentColor)} /> : null}
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: onAccentFg(accentColor) }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
          </Pressable>
        </View>
      </View>
    </SettingRow>
  );
}

// Satır yüksekliği py-3.5 → py-3 (~72px → ~64px): sayfa kompaktlaştı.
// İkon zemini 0x14 → 0x20, stroke 1.8 → 1.9: eskiden fazla soluktu.
/**
 * Kontrol kolonu genişliği — TÜM satırlarda aynı. Satır başına farklı değer
 * verilince inputlar farklı yerde başlayıp bitiyordu (sayfa dağınık görünüyor).
 */
const CONTROL_W = 320;

export function SettingRow({
  icon: Icon,
  label,
  sub,
  accentColor,
  children,
  isLast,
  controlWidth = CONTROL_W,
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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const iconInk = accentInk(accentColor, isDark);
  return (
    <>
      {isNarrow ? (
        <View style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Icon size={16} color={iconInk} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-[14px] font-semibold mb-0.5" style={{ color: T.ink }} numberOfLines={1}>{label}</Text>
              {/* Satır sınırı YOK: uzun açıklamaların sonu önemli bilgi taşıyordu */}
              <Text className="text-[12px]" style={{ color: T.ink3 }}>{sub}</Text>
            </View>
          </View>
          <View style={{ width: '100%', paddingStart: 48 }}>
            {children}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3 py-3">
          <View
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <Icon size={16} color={iconInk} strokeWidth={1.9} />
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
      {!isLast && <View className="h-px" style={{ marginStart: 48, backgroundColor: T.hairline2 }} />}
    </>
  );
}

// ── Local defaults (when DB not available) ──────────────────────────────
const LOCAL_DEFAULTS = {
  default_currency: 'TRY' as CurrencyCode,
  week_start: 'monday' as WeekStart,
  theme_mode: 'light' as ThemeMode,
  order_prefix: 'LAB',
  technician_name_visibility: 'full',
  default_lead_days: 5,
  urgent_lead_days: 1,
};

// ── Component ───────────────────────────────────────────────────────────
export function GeneralSection({ panelType, accentColor, view = 'personal' }: Props) {
  const P = view === 'personal';
  const L = view === 'lab';
  const { settings, loading, saving, load, update } = useLabSettingsStore();
  const [local, setLocal] = useState(LOCAL_DEFAULTS);
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const themeMode = useThemeModeStore(s => s.mode);   // toggle bunu sürer; resolvedDark → .dark sınıfı
  const { width: _vw } = useWindowDimensions();
  const U = useInkUI();
  // Sayfa kenarı: platform-genel sözleşme — her genişlikte PAGE_PADDING (16)
  const sidePad = PAGE_PADDING;

  useEffect(() => { load(); }, []);

  // Sync local state when settings load from DB
  useEffect(() => {
    if (settings) {
      setLocal({
        default_currency: settings.default_currency,
        week_start: settings.week_start,
        theme_mode: settings.theme_mode,
        order_prefix: settings.order_prefix,
        technician_name_visibility: settings.technician_name_visibility ?? 'full',
        default_lead_days: settings.default_lead_days ?? 5,
        urgent_lead_days: settings.urgent_lead_days ?? 1,
      });
    }
  }, [settings]);

  const handleUpdate = useCallback(async (patch: Record<string, any>) => {
    // İyimser: ekran hemen değişir; kayıt tutmazsa eski değere döner ve
    // kullanıcı neden döndüğünü görür (eskiden sessizce kayboluyordu).
    let prevSnap: Record<string, any> = {};
    setLocal(prev => {
      prevSnap = Object.fromEntries(Object.keys(patch).map(k => [k, (prev as any)[k]]));
      return { ...prev, ...patch };
    });
    const ok = await update(patch);
    if (ok) toast.success(autoT('Kaydedildi'));
    else {
      setLocal(prev => ({ ...prev, ...prevSnap }));
      toast.error(autoT('Ayar kaydedilemedi — yetkini ve bağlantını kontrol et'));
    }
    return ok;
  }, [update]);

  const isLab    = panelType === 'lab' || panelType === 'admin';
  // Yetki: ayarları yönet — yoksa kullanıcı sadece tema/saat/tarih formatını görür
  const { can } = usePermissions();
  const canManageSettings = can('manage_settings');
  const isDoctor = panelType === 'doctor';

  // User prefs (date/time format + doctor-only fields)
  // Takvim tercihi i18n modülünde tutulur (localeTag onu okur, 80 dosya oradan geçer),
  // store'da değil — bu yüzden yerel durumla aynalanıyor.
  const labRegion = useLabSettingsStore(st => st.settings?.region ?? 'TR');
  const updateLabSettings = useLabSettingsStore(st => st.update);
  const [calPref, setCalPref] = React.useState<CalendarPref>(getCalendarPref());
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
      // Yalnız hekimin ÜYE olduğu (aktif) laboratuvarlar — tüm lab tablosu değil.
      try {
        const ms = await myLabMemberships();
        const list = ms
          .filter(m => m.status === 'active')
          .map(m => ({ id: m.lab_id, name: m.lab_name ?? '—' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        if (list.length) { setLabs(list); return; }
      } catch { /* RPC yoksa profildeki lab'a düş */ }
      const ownLab = (useAuthStore.getState().profile as any)?.lab_id;
      if (!ownLab) return;
      const { data } = await supabase.from('labs').select('id, name').eq('id', ownLab);
      if (Array.isArray(data)) setLabs(data as any);
    })();
  }, [isDoctor]);

  // ── Lab logo (genel ayarlar) ─────────────────────────────────────────
  const labId = useAuthStore(st => (st.profile as any)?.lab_id ?? null) as string | null;
  const [labLogoUrl, setLabLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [brandMode, setBrandMode] = useState<'logo' | 'logo_text'>('logo_text');
  const [logoScale, setLogoScale] = useState(1);
  const [labNameInput, setLabNameInput] = useState('');
  const [labNameSaved, setLabNameSaved] = useState('');
  const [labNameSaving, setLabNameSaving] = useState(false);
  // Laboratuvar adresi/telefonu — iş kâğıdı, fatura ve klinikten-alım kurye
  // bacaklarının VARIŞ noktası buradan okunur. Boşken create_delivery kurye
  // entegrasyonundaki alış adresine düşer; burası dolunca o öncelik kazanır.
  const [labPhoneInput, setLabPhoneInput] = useState('');
  const [labPhoneSaved, setLabPhoneSaved] = useState('');
  const [labSiteInput, setLabSiteInput]   = useState('');
  const [labSiteSaved, setLabSiteSaved]   = useState('');
  const [labContactSaving, setLabContactSaving] = useState(false);
  const bumpLabBrand = useLabBrandStore(s => s.bump);

  useEffect(() => {
    if (!labId || !isLab) return;
    (async () => {
      const { data } = await supabase.from('labs').select('name, address, phone, website, logo_url, sidebar_brand_mode, sidebar_logo_scale').eq('id', labId).maybeSingle();
      const tel  = (data as any)?.phone ?? '';
      const site = (data as any)?.website ?? '';
      setLabPhoneInput(tel);  setLabPhoneSaved(tel);
      setLabSiteInput(site);  setLabSiteSaved(site);
      if (data?.logo_url) setLabLogoUrl(data.logo_url);
      if ((data as any)?.sidebar_brand_mode) setBrandMode((data as any).sidebar_brand_mode === 'logo' ? 'logo' : 'logo_text');
      if ((data as any)?.sidebar_logo_scale != null) {
        const sc = Number((data as any).sidebar_logo_scale) || 1;
        setLogoScale(sc); logoScaleSaved.current = sc;
      }
      if ((data as any)?.name != null) { setLabNameInput((data as any).name); setLabNameSaved((data as any).name); }
    })();
  }, [labId, isLab]);

  /** labs satırını günceller; RLS 0 satır döndürürse de BAŞARISIZ sayar
   *  (hata vermeden etkisiz kalan güncelleme sessiz kayıp demekti). */
  // okMsg null → başarıda bildirim YOK (satırında "Kaydedildi" göstergesi olan alanlar)
  const updateLab = useCallback(async (patch: Record<string, any>, okMsg: string | null = 'Kaydedildi'): Promise<boolean> => {
    if (!labId) return false;
    const { data, error } = await supabase.from('labs').update(patch).eq('id', labId).select('id');
    const ok = !error && Array.isArray(data) && data.length > 0;
    if (ok && okMsg) toast.success(autoT(okMsg));
    else toast.error(autoT('Kaydedilemedi — yetkini ve bağlantını kontrol et'));
    return ok;
  }, [labId]);

  const saveLabName = useCallback(async () => {
    const v = labNameInput.trim();
    if (!labId || !v || v === labNameSaved || labNameSaving) return;
    setLabNameSaving(true);
    const ok = await updateLab({ name: v }, null);
    setLabNameSaving(false);
    if (ok) { setLabNameSaved(v); bumpLabBrand(); }
  }, [labId, labNameInput, labNameSaved, labNameSaving, bumpLabBrand, updateLab]);

  const saveLabContact = useCallback(async () => {
    if (!labId || labContactSaving) return;
    const t = labPhoneInput.trim();
    const w = labSiteInput.trim();
    if (t === labPhoneSaved.trim() && w === labSiteSaved.trim()) return;
    setLabContactSaving(true);
    // Adres burada YAZILMAZ: labs.address, Fatura Bilgileri'ndeki yapılandırılmış
    // alanlardan oluşturulur (iki ayrı adres tutulmasın).
    const ok = await updateLab({ phone: t || null, website: w || null }, null);
    setLabContactSaving(false);
    if (ok) {
      setLabPhoneSaved(t); setLabSiteSaved(w);
      // Kenar çubuğundaki logo bağlantısı anında güncellensin
      bumpLabBrand();
    }
  }, [labId, labPhoneInput, labSiteInput, labPhoneSaved, labSiteSaved, labContactSaving, bumpLabBrand, updateLab]);

  const saveBrandMode = useCallback(async (mode: 'logo' | 'logo_text') => {
    const prev = brandMode;
    setBrandMode(mode);
    if (!labId) return;
    if (await updateLab({ sidebar_brand_mode: mode })) bumpLabBrand();
    else setBrandMode(prev);
  }, [labId, brandMode, bumpLabBrand, updateLab]);
  // Kaydedilmiş ölçek — kayıt tutmazsa kaydırıcı buraya geri döner
  const logoScaleSaved = useRef(1);
  const saveLogoScale = useCallback(async (next: number) => {
    const v = Math.max(0.6, Math.min(1.8, Math.round(next * 20) / 20));
    setLogoScale(v);
    if (!labId || v === logoScaleSaved.current) return;
    if (await updateLab({ sidebar_logo_scale: v })) { logoScaleSaved.current = v; bumpLabBrand(); }
    else setLogoScale(logoScaleSaved.current);
  }, [labId, bumpLabBrand, updateLab]);

  /** Dosyayı depoya yükler, labs.logo_url'i yazar; her hata kullanıcıya görünür. */
  const uploadLogoBody = useCallback(async (body: Blob | Uint8Array, mime: string, ext: string) => {
    if (!labId) return;
    setLogoUploading(true);
    try {
      const path = `${labId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('lab-logos')
        .upload(path, body as any, { contentType: mime, upsert: true });
      if (upErr) { toast.error(`${autoT('Logo yüklenemedi')}: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('lab-logos').getPublicUrl(path);
      const url = pub.publicUrl;
      if (await updateLab({ logo_url: url }, 'Logo güncellendi')) {
        setLabLogoUrl(url);
        bumpLabBrand();
      }
    } catch (e: any) {
      toast.error(`${autoT('Logo yüklenemedi')}: ${e?.message ?? ''}`);
    } finally {
      setLogoUploading(false);
    }
  }, [labId, bumpLabBrand, updateLab]);

  const pickAndUploadLogo = useCallback(async () => {
    if (!labId || logoUploading) return;
    if (Platform.OS !== 'web') {
      // iOS/Android: galeriden seç (eskiden native'de düğme hiçbir şey yapmıyordu)
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.warning(autoT('Galeri erişimi için izin verin.')); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, base64: true,
      });
      if (result.canceled || !result.assets[0]?.base64) return;
      const asset = result.assets[0];
      const byteStr = atob(asset.base64!);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const mime = asset.mimeType ?? 'image/jpeg';
      await uploadLogoBody(bytes, mime, (mime.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg'));
      return;
    }
    // @ts-ignore — web
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      await uploadLogoBody(file, file.type, ext);
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  }, [labId, logoUploading, uploadLogoBody]);

  const removeLogo = useCallback(async () => {
    if (!labId) return;
    if (await updateLab({ logo_url: null }, 'Logo kaldırıldı')) {
      setLabLogoUrl(null);
      bumpLabBrand();
    }
  }, [labId, bumpLabBrand, updateLab]);

  // Sipariş ön eki: yazarken yerel taslak, alandan çıkınca/Enter'da tek kayıt.
  // (Eskiden her harf ayrı kayıttı; alan boşaltılınca '' yazılıp numaralar
  // sessizce 'LAB'a düşüyordu.)
  const [prefixDraft, setPrefixDraft] = useState<string | null>(null);
  const commitPrefix = useCallback(async () => {
    if (prefixDraft == null) return;
    const v = prefixDraft.trim();
    if (!v) { toast.warning(autoT('Ön ek boş bırakılamaz')); setPrefixDraft(null); return; }
    if (v === local.order_prefix) { setPrefixDraft(null); return; }
    await handleUpdate({ order_prefix: v });
    setPrefixDraft(null);
  }, [prefixDraft, local.order_prefix, handleUpdate]);

  if (loading) {
    return <CenteredLoader color={accentColor} label="Ayarlar yükleniyor…" />;
  }

  const s = local;

  return (
    <ScrollView
      className="flex-1"
      // Geniş ekranda satırlar 1400px'e yayılınca başlıkla kontrol arası boş kalıyordu
      contentContainerStyle={{ paddingHorizontal: sidePad, paddingTop: 0, paddingBottom: 120, width: '100%', maxWidth: 920 + 2 * sidePad, alignSelf: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Genel Ayarlar kartı ──────────────────────────────── */}
      <View className="rounded-[24px] p-[22px]" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
        {/* Başlık hub üst çubuğunda ("Genel") zaten var — kartta tekrarlanmaz */}
        <Text className="text-[13px] mb-4" style={{ color: T.ink3 }}>
          {L ? 'Bu ayarlar tüm ekip için geçerlidir.' : 'Bu ayarlar yalnız senin hesabın için geçerlidir.'}
        </Text>

        {/* Ayarlar ARTIK ANLAMA göre gruplu — "kim yönetiyor"a göre değil.
            Eskiden aynı konudaki ayarlar üç ayrı kartta dağılmıştı (Genel /
            Hekim Ayarları / Laboratuvar Ayarları): tema görünümde, sayfa
            başına kayıt lab kartında, otomatik çıkış ise hiçbir güvenlik
            başlığı altında değildi. Tek kart, altı anlam grubu. */}

        {P && (
        <SettingGroup title="Görünüm" sub="Açık, koyu veya sistem teması" first>
        {/* Tema — görsel önizlemeli seçici, diğer kontrollerle aynı sağ kolonda */}
        <SettingRow
          icon={Sun}
          label="Tema"
          sub="Arayüz görünüm tercihi · yalnız bu cihazda"
          accentColor={accentColor}
          isLast
        >
          <ThemePreviewPicker
            value={themeMode}
            onChange={(v) => useThemeModeStore.getState().setMode(v)}
          />
        </SettingRow>
        </SettingGroup>
        )}

        {L && isLab && canManageSettings && labLogoUrl && (
        <SettingGroup title="Marka" sub="Kenar çubuğunda logo görünümü" first>
        <>

          <SettingRow
            icon={ImageIcon}
            label="Sidebar Markası"
            sub="Kenar çubuğunda logo nasıl görünsün"
            accentColor={accentColor}
          >
            <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : T.hairline2, alignSelf: 'flex-end' }}>
              {([
                { k: 'logo_text', label: 'Logo + İsim' },
                { k: 'logo',      label: 'Sadece Logo' },
              ] as const).map(opt => {
                const active = brandMode === opt.k;
                return (
                  <Pressable
                    key={opt.k}
                    onPress={() => saveBrandMode(opt.k)}
                    style={Platform.OS === 'web'
                      ? ((({ pressed, hovered }: any) => ({
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                          backgroundColor: active
                            ? (isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF')
                            : hovered ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                          borderWidth: 1,
                          borderColor: active ? (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)') : 'transparent',
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                          cursor: 'pointer', transitionProperty: 'background-color, transform', transitionDuration: '140ms',
                          ...(active && !isDark ? { boxShadow: '0 1px 3px rgba(0,0,0,0.10)' } : {}),
                        })) as any)
                      : {
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                          backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF') : 'transparent',
                          borderWidth: 1,
                          borderColor: active ? (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)') : 'transparent',
                        }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? (T.ink as string) : (T.ink3 as string) }}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SettingRow>


        {/* Logo Boyutu — sidebar logo ölçeği */}

          <SettingRow
            icon={ImageIcon}
            label="Logo Boyutu"
            sub="Sidebar'daki logonun büyüklüğü"
            accentColor={accentColor}
            isLast
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: T.ink3 }}>Küçük</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input' as any, {
                  type: 'range', min: 0.6, max: 1.8, step: 0.05, value: logoScale,
                  onChange: (e: any) => setLogoScale(parseFloat(e.target.value)),
                  onMouseUp: (e: any) => saveLogoScale(parseFloat(e.target.value)),
                  onTouchEnd: (e: any) => saveLogoScale(parseFloat(e.target.value)),
                  style: { flex: 1, maxWidth: 150, accentColor, cursor: 'pointer' },
                })
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <GlassTooltip title={autoT('Küçült')} text={autoT('Kenar çubuğundaki logoyu bir kademe küçültür')} enabled={logoScale > 0.6}>
                    <Pressable onPress={() => saveLogoScale(logoScale - 0.1)} disabled={logoScale <= 0.6} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: logoScale <= 0.6 ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: U.plainBtn.fg, marginTop: -2 }}>−</Text>
                    </Pressable>
                  </GlassTooltip>
                  <GlassTooltip title={autoT('Büyüt')} text={autoT('Kenar çubuğundaki logoyu bir kademe büyütür')} enabled={logoScale < 1.8}>
                    <Pressable onPress={() => saveLogoScale(logoScale + 0.1)} disabled={logoScale >= 1.8} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: logoScale >= 1.8 ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: U.plainBtn.fg, marginTop: -2 }}>+</Text>
                    </Pressable>
                  </GlassTooltip>
                </View>
              )}
              <Text style={{ fontSize: 11, color: T.ink3 }}>Büyük</Text>
              {/* Çıplak "%60" neye göre olduğunu söylemiyordu; uçlara etiket. */}
              <Text style={{ fontSize: 11, color: T.ink3, minWidth: 40, textAlign: 'end' as any }}>
                %{Math.round(logoScale * 100)}
              </Text>
            </View>
          </SettingRow>
        </>

        </SettingGroup>
        )}

        {(P || (isLab && canManageSettings)) && (
        <SettingGroup title={P ? 'Dil ve Takvim' : 'Bölge'} sub={P ? 'Uygulama dili ve takvim gösterimi' : 'Mevzuat bölgesi ve hafta başlangıcı'} first={L && !(isLab && canManageSettings && labLogoUrl)}>

        {/* Uygulama Dili */}
        {P && (
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
        )}

        {/* Bölge — mevzuata bağlı özellikleri tek yerden açar/kapatır.
            TR: e-Fatura + iyzico POS + %20 KDV · IR: ikisi de kapalı, %10 KDV.
            Lab mevzuat ayarı → yalnız lab/admin panelinde; klinik/hekime gösterilmez. */}
        {L && isLab && canManageSettings && (
        <SettingRow
          icon={Globe}
          label="Bölge"
          sub="Mevzuat bölgesi — dil, takvim, e-Fatura, POS ve KDV varsayılanını belirler"
          accentColor={accentColor}
        >
          <DropdownSelect
            options={[
              { key: 'TR', label: 'Türkiye', sub: 'e-Fatura · POS · %20 KDV' },
              { key: 'IR', label: 'İran',    sub: 'e-Fatura/POS yok · %10 KDV' },
            ]}
            value={labRegion}
            onChange={(v) => {
              // Bölge değişimi KDV varsayılanını da taşır (TR %20 · IR %10).
              // Bilinçli bir kullanıcı eylemi olduğu için mevcut oranı günceller.
              const r = v as LabRegion;
              if (r === labRegion) return;
              const rate = defaultTaxRateFor(r);
              void updateLabSettings({ region: r, default_tax_rate: rate }).then(ok => {
                if (ok) toast.success(`${autoT('Bölge güncellendi · varsayılan KDV')} %${rate} — ${autoT('Finans ayarlarından değiştirebilirsin')}`);
                else toast.error(autoT('Ayar kaydedilemedi — yetkini ve bağlantını kontrol et'));
              });
            }}
            accentColor={accentColor}
          />
        </SettingRow>
        )}

        {/* Takvim — YALNIZ Farsça'da anlamlı, o yüzden yalnız orada gösterilir.
            Farsça konuşan herkes Şemsi kullanmaz: İran'da resmîdir ama Afgan/
            diaspora kullanıcı ya da Farsça arayüz kullanan Türk lab Miladi bekler.
            'Otomatik' cihaz saat dilimine bakar (Asia/Tehran → Şemsi).
            Saklanan veri ETKİLENMEZ — bu yalnız görüntüleme biçimidir. */}
        {P && i18n.language === 'fa' && (
          <SettingRow
            icon={CalendarDays}
            label="تقویم"
            sub={calPref === 'auto'
              ? `خودکار — اکنون ${usesPersianCalendar() ? 'شمسی' : 'میلادی'}`
              : 'تقویمی که تاریخ‌ها با آن نمایش داده می‌شوند'}
            accentColor={accentColor}
          >
            <DropdownSelect
              options={[
                { key: 'auto',      label: 'خودکار',  sub: 'بر اساس منطقهٔ دستگاه' },
                { key: 'persian',   label: 'شمسی',    sub: 'تقویم هجری شمسی' },
                { key: 'gregorian', label: 'میلادی',  sub: 'تقویم میلادی' },
              ]}
              value={calPref}
              onChange={(v) => { void setCalendarPref(v as CalendarPref); setCalPref(v as CalendarPref); }}
              accentColor={accentColor}
            />
          </SettingRow>
        )}

        {/* Hafta Başlangıcı — lab ayarı (lab_settings.week_start) → Laboratuvar sekmesi */}
        {L && isLab && canManageSettings && (
          <SettingRow
            icon={Calendar}
            label="Hafta Başlangıcı"
            sub="Takvim ve raporlarda haftanın ilk günü"
            accentColor={accentColor}
            isLast
          >
            <DropdownSelect
              options={WEEK_STARTS.map(w => ({ key: w.key, label: w.label }))}
              value={s.week_start}
              onChange={(v) => handleUpdate({ week_start: v })}
              accentColor={accentColor}
            />
          </SettingRow>
        )}

        {/* Tarih/Saat formatı: tercih kaydediliyor ama uygulamadaki hiçbir tarih
            gösterimi okumuyordu (değiştirmek hiçbir şeyi değiştirmiyordu). Ortak
            biçimleyiciye bağlanana kadar gizli — SHOW_UNWIRED_PREFS. */}
        {SHOW_UNWIRED_PREFS && (<>
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

        </>)}

        </SettingGroup>
        )}

        {L && isLab && (
        <SettingGroup title="Laboratuvar Kimliği" sub="Fatura, iş kâğıdı ve yazışmalarda görünen bilgiler">

        {isLab && canManageSettings && (
          <SettingRow
            icon={Building2}
            label="Laboratuvar İsmi"
            sub="Sidebar, fatura ve yazışmalarda görünür"
            accentColor={accentColor}
          >
            <View style={{ gap: 6 }}>
              <SettingInput
                accentColor={accentColor}
                value={labNameInput}
                onChangeText={setLabNameInput}
                onSubmitEditing={saveLabName}
                onBlur={saveLabName}
                placeholder="Laboratuvar adı"
                style={{ width: '100%', height: 36, paddingHorizontal: 12 }}
              />
              <View style={{ alignItems: 'flex-end' }}>
                <SaveHint
                  saving={labNameSaving}
                  dirty={!!labNameInput.trim() && labNameInput.trim() !== labNameSaved}
                  accentColor={accentColor}
                />
              </View>
            </View>
          </SettingRow>
        )}

        {/* Fatura Bilgileri → Finans Ayarları'na taşındı (LabBillingCard). */}

        {/* ── Laboratuvar adresi + telefon ──────────────────────────
            Kurye entegrasyonundaki "alış adresi" BanaBiKurye'ye özeldi;
            laboratuvarın kendi adresi hiçbir yerde tutulmuyordu. Klinikten
            alım bacaklarında VARIŞ noktası, iş kâğıdı ve faturada da künye
            bilgisi olarak buradan okunur. */}
        {isLab && canManageSettings && (
          <SettingRow
            icon={Phone}
            label="İletişim"
            sub="Telefon ve web sitesi · iş kâğıdı ve fatura künyesinde görünür"
            accentColor={accentColor}
          >
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', start: 10, zIndex: 1 }} pointerEvents="none">
                  <Phone size={13} color={T.ink3} strokeWidth={1.8} />
                </View>
                <SettingInput
                  accentColor={accentColor}
                  value={labPhoneInput}
                  onChangeText={setLabPhoneInput}
                  onBlur={saveLabContact}
                  onSubmitEditing={saveLabContact}
                  placeholder="Telefon"
                  keyboardType="phone-pad"
                  style={{ width: '100%', height: 36, paddingStart: 30, paddingEnd: 10 }}
                />
              </View>

              {/* Web sitesi — dolu olduğunda kenar çubuğundaki lab logosu bu adrese
                  bağlanır. Protokol yazmak gerekmez, açılırken https:// eklenir. */}
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', start: 10, zIndex: 1 }} pointerEvents="none">
                  <Globe size={13} color={T.ink3} strokeWidth={1.8} />
                </View>
                <SettingInput
                  accentColor={accentColor}
                  value={labSiteInput}
                  onChangeText={setLabSiteInput}
                  onBlur={saveLabContact}
                  onSubmitEditing={saveLabContact}
                  placeholder="Web sitesi (örn. nexadentlab.com)"
                  autoCapitalize="none"
                  keyboardType="url"
                  style={{ width: '100%', height: 36, paddingStart: 30, paddingEnd: 10 }}
                />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <SaveHint
                  saving={labContactSaving}
                  dirty={labPhoneInput.trim() !== labPhoneSaved.trim() || labSiteInput.trim() !== labSiteSaved.trim()}
                  accentColor={accentColor}
                />
              </View>
            </View>
          </SettingRow>
        )}

        {isLab && canManageSettings && (
          <SettingRow
            icon={ImageIcon}
            label="Laboratuvar Logosu"
            sub="İş emri çıktısı ve yazışmalarda kullanılır"
            accentColor={accentColor}
            isLast
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* 44 → 72px: küçük thumbnail'de logonun okunup okunmadığı
                  anlaşılmıyordu. Şeffaflığı göstermek için damalı zemin. */}
              {/* Ayrı "Değiştir" butonu yerine karonun KENDİSİ hedef: eylem
                  değiştirdiği nesnenin üzerinde durur (Apple: doğrudan manipülasyon). */}
              <GlassTooltip title={autoT(labLogoUrl ? 'Logoyu değiştir' : 'Logo yükle')} text={autoT('Laboratuvar logosunu yükler veya mevcut logoyu değiştirir')} enabled={!logoUploading}>
                <Pressable
                  onPress={pickAndUploadLogo}
                  disabled={logoUploading}
                  accessibilityLabel={labLogoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
                  style={{
                    width: 84, height: 84, borderRadius: 14,
                    borderWidth: 1, borderColor: T.hairline,
                    // Logo önizlemesi koyu temada da AÇIK zemin: logolar kağıt/beyaz
                    // için çizilir, koyu karoda lacivert logo kayboluyordu.
                    backgroundColor: labLogoUrl ? '#F7F7F5' : T.cardSoft,
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', flexShrink: 0,
                    ...(Platform.OS === 'web'
                      ? { cursor: logoUploading ? 'wait' : 'pointer' } as any
                      : {}),
                    ...(Platform.OS === 'web' && labLogoUrl
                      ? {
                          backgroundImage:
                            'linear-gradient(45deg,rgba(0,0,0,0.05) 25%,transparent 25%),' +
                            'linear-gradient(-45deg,rgba(0,0,0,0.05) 25%,transparent 25%),' +
                            'linear-gradient(45deg,transparent 75%,rgba(0,0,0,0.05) 75%),' +
                            'linear-gradient(-45deg,transparent 75%,rgba(0,0,0,0.05) 75%)',
                          backgroundSize: '10px 10px',
                          backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                        } as any
                      : {}),
                  }}
                >
                  {({ hovered }: any) => {
                    const show = hovered || logoUploading;
                    return (
                      <>
                        {labLogoUrl ? (
                          <RNImage source={{ uri: labLogoUrl }} style={{ width: 74, height: 74 }} resizeMode="contain" />
                        ) : (
                          <ImageIcon size={24} color={T.ink3} strokeWidth={1.5} />
                        )}
                        {/* Kaplama — hover'da (ve yüklerken) tam karoyu örter */}
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute', top: 0, bottom: 0, start: 0, end: 0,
                            alignItems: 'center', justifyContent: 'center', gap: 3,
                            backgroundColor: 'rgba(10,10,10,0.58)',
                            opacity: show ? 1 : 0,
                            ...(Platform.OS === 'web'
                              ? { transitionProperty: 'opacity', transitionDuration: '140ms' } as any
                              : {}),
                          }}
                        >
                          <Upload size={16} color="#FFFFFF" strokeWidth={2} />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>
                            {logoUploading ? 'Yükleniyor' : labLogoUrl ? 'Değiştir' : 'Yükle'}
                          </Text>
                        </View>
                        {/* Dokunmatikte hover yok — küçük rozet tıklanabilirliği söyler */}
                        {!show && Platform.OS !== 'web' && (
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute', end: 4, bottom: 4,
                              width: 22, height: 22, borderRadius: 11,
                              alignItems: 'center', justifyContent: 'center',
                              backgroundColor: 'rgba(10,10,10,0.62)',
                            }}
                          >
                            <Upload size={11} color="#FFFFFF" strokeWidth={2.2} />
                          </View>
                        )}
                      </>
                    );
                  }}
                </Pressable>
              </GlassTooltip>
              {/* Teknik gereksinimler alt metinde uzun bir cümleydi; okunmuyordu.
                  Rozet olarak durur — logoyu değiştirirken de gerekiyor. */}
              <View style={{ gap: 5, flexShrink: 0 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {['PNG', 'JPG', 'SVG'].map(tag => (
                    <View key={tag} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.ink3 }}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 10, color: T.ink3 }}>400×400 · şeffaf zemin</Text>
              </View>
              {labLogoUrl && (
                <GlassTooltip title={autoT('Logoyu kaldır')} text={autoT('Yüklü laboratuvar logosunu siler')}>
                  <Pressable
                    onPress={removeLogo}
                    accessibilityLabel="Logoyu kaldır"
                    style={Platform.OS === 'web'
                      ? ((({ hovered }: any) => ({
                          width: 32, height: 32, borderRadius: 8,
                          alignItems: 'center' as const, justifyContent: 'center' as const,
                          backgroundColor: hovered ? (isDark ? 'rgba(217,75,75,0.20)' : '#FEE2E2') : 'transparent',
                          borderWidth: 1, borderColor: hovered ? (isDark ? 'rgba(217,75,75,0.45)' : '#FCA5A5') : T.hairline,
                          cursor: 'pointer',
                        })) as any)
                      : {
                          width: 32, height: 32, borderRadius: 8,
                          alignItems: 'center' as const, justifyContent: 'center' as const,
                          backgroundColor: 'transparent',
                          borderWidth: 1, borderColor: T.hairline,
                        }}
                  >
                    <Trash2 size={13} color={isDark ? '#F3A0A0' : '#DC2626'} strokeWidth={1.8} />
                  </Pressable>
                </GlassTooltip>
              )}
            </View>
          </SettingRow>
        )}

        </SettingGroup>
        )}

        {L && isLab && canManageSettings && (
        <SettingGroup title="İş Akışı" sub="Sipariş numaralandırma ve teslim süreleri">

        {/* Sipariş Prefix */}
        <SettingRow
          icon={Hash}
          label="Sipariş Ön Eki"
          sub="Yeni siparişlerin numarası bu ön ekle başlar · eski siparişler değişmez"
          accentColor={accentColor}
        >
          <View style={{ gap: 4 }}>
          <TextInput
            className="text-[14px] border rounded-[14px] px-3.5"
            style={{ height: 36, width: '100%', borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card, color: T.ink, outlineWidth: 0 } as any}
            value={prefixDraft ?? s.order_prefix}
            onChangeText={(v) => setPrefixDraft(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            onBlur={commitPrefix}
            onSubmitEditing={commitPrefix}
            placeholder="LAB"
            placeholderTextColor={T.ink3}
            maxLength={6}
            autoCapitalize="characters"
          />
          <Text style={{ fontSize: 11, color: T.ink3, textAlign: 'right' }}>
            {autoT('Örnek')}: {((prefixDraft ?? s.order_prefix) || 'LAB')}-{new Date().getFullYear()}-0001
          </Text>
          </View>
        </SettingRow>

        {/* Varsayılan teslim süresi — sihirbaz bu kadar iş günü sonrasını en erken
            tarih yapar ve tarihi kendiliğinden doldurur. Hizmette (Fiyat Listesi)
            üretim süresi girilmişse o hizmet için o süre geçerlidir. */}
        <SettingRow
          icon={Timer}
          label="Varsayılan Teslim Süresi"
          sub="Yeni siparişte en erken teslim · iş günü, hafta sonu sayılmaz · hizmette süre girilmişse o kullanılır"
          accentColor={accentColor}
        >
          <DropdownSelect
            options={LEAD_DAY_OPTIONS.map(n => ({ key: n, label: `${n} ${autoT('iş günü')}` }))}
            value={(s as any).default_lead_days ?? 5}
            onChange={(v) => handleUpdate({ default_lead_days: Number(v) })}
            accentColor={accentColor}
            renderLabel={(opt) => opt.label}
          />
        </SettingRow>

        <SettingRow
          icon={Clock}
          label="Acil Teslim Süresi"
          sub="Acil işaretlenen siparişte en erken teslim · iş günü"
          accentColor={accentColor}
          isLast
        >
          <DropdownSelect
            options={URGENT_DAY_OPTIONS.map(n => ({ key: n, label: `${n} ${autoT('iş günü')}` }))}
            value={(s as any).urgent_lead_days ?? 1}
            onChange={(v) => handleUpdate({ urgent_lead_days: Number(v) })}
            accentColor={accentColor}
            renderLabel={(opt) => opt.label}
          />
        </SettingRow>

        </SettingGroup>
        )}

        {L && isLab && canManageSettings && (
        <SettingGroup title="Gizlilik" sub="Teknisyen adı görünürlüğü">

        {/* Teknisyen adı görünürlüğü — hekim/kliniklere nasıl görünsün */}
        <SettingRow
          icon={UserCheck}
          label="Teknisyen Adı (hekim/klinik)"
          sub="Sipariş aşamalarında teknisyen adı hekim ve kliniklere nasıl görünsün"
          accentColor={accentColor}
          isLast
        >
          <SegmentPicker
            options={[
              { key: 'full',   label: 'Ad Soyad' },
              { key: 'first',  label: 'Sadece Ad' },
              { key: 'hidden', label: 'Gizli' },
            ]}
            value={(s.technician_name_visibility ?? 'full') as any}
            onChange={(v) => handleUpdate({ technician_name_visibility: v })}
            accentColor={accentColor}
          />
        </SettingRow>

        </SettingGroup>
        )}

        {/* Unvan + varsayılan lab da yeni sipariş/isim gösteriminde okunmuyordu → gizli. */}
        {P && isDoctor && SHOW_UNWIRED_PREFS && (
        <SettingGroup title="Hekim Tercihleri" sub="Unvan ve varsayılan laboratuvar">

        {/* Hekim Unvanı */}
        <SettingRow
          icon={UserCheck}
          label="Hekim Unvanı"
          sub="İsminizin önünde gösterilir (Dt., Diş Hekimi, Prof. Dr., …)"
          accentColor={accentColor}
        >
          <TextInput
            className="text-[14px] border rounded-[14px] px-3.5"
            style={{ height: 36, width: '100%', borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card, color: T.ink, outlineWidth: 0 } as any}
            value={doctorTitle}
            onChangeText={(v) => setUserPref('doctor_title', v.slice(0, 30))}
            placeholder="Örn: Dt."
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

        </SettingGroup>
        )}
      </View>

      {/* Bilgi notu */}
      <View
        className="flex-row gap-3 rounded-2xl p-4 mt-4"
        style={{ backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline }}
      >
        <Info size={15} color={T.ink3} strokeWidth={1.8} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[13px] leading-5" style={{ color: T.ink2 }}>
          {L
            ? 'Ayarlar değiştirildiğinde otomatik kaydedilir ve tüm ekip için geçerlidir. Dil ve tema her kişinin kendi Genel sekmesindedir.'
            : 'Ayarlar değiştirildiğinde otomatik kaydedilir ve yalnız senin hesabın için geçerlidir.'}
        </Text>
      </View>
    </ScrollView>
  );
}
