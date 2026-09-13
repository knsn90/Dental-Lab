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
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED, type Lang,
         getCalendarPref, setCalendarPref, usesPersianCalendar, type CalendarPref } from '../../../core/i18n';
import { View, Text, ScrollView, Pressable, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import {
  Globe, Clock, Calendar, Monitor, Sun, Moon, Laptop,
  ChevronDown, Check, Info, Hash, Percent, Timer, LogOut, List,
  CalendarDays, Watch, UserCheck, Building2, Image as ImageIcon, Upload, Trash2,
  MapPin, Phone, Download,
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
                  gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9,
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
                  gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9,
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
    <View style={{ marginTop: first ? 4 : 22 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: T.ink3 }}>
        {title}
      </Text>
      {!!sub && <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{sub}</Text>}
      <View className="h-px" style={{ backgroundColor: T.hairline2, marginTop: 8, marginBottom: 2 }} />
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
    return <Text style={{ fontSize: 11.5, color: accentColor }}>Çıkınca kaydedilir</Text>;
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
  return (
    <>
      {isNarrow ? (
        <View style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Icon size={16} color={accentColor} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-[14px] font-semibold mb-0.5" style={{ color: T.ink }} numberOfLines={1}>{label}</Text>
              <Text className="text-[12px]" style={{ color: T.ink3 }} numberOfLines={2}>{sub}</Text>
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
            <Icon size={16} color={accentColor} strokeWidth={1.9} />
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
  default_tax_rate: 20,
  working_hours_start: '08:00',
  working_hours_end: '18:00',
  auto_logout_minutes: 0,
  items_per_page: 50,
  technician_name_visibility: 'full',
  payment_reminder_auto: false,
  payment_reminder_frequency_days: 7,
  payment_reminder_channels: ['in_app', 'email', 'whatsapp'] as string[],
  payment_reminder_tone: 'standard',
  payment_reminder_min_days_overdue: 1,
};

// ── Component ───────────────────────────────────────────────────────────
export function GeneralSection({ panelType, accentColor }: Props) {
  const { settings, loading, saving, load, update } = useLabSettingsStore();
  const [local, setLocal] = useState(LOCAL_DEFAULTS);
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const themeMode = useThemeModeStore(s => s.mode);   // toggle bunu sürer; resolvedDark → .dark sınıfı
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
        technician_name_visibility: settings.technician_name_visibility ?? 'full',
        payment_reminder_auto: settings.payment_reminder_auto ?? false,
        payment_reminder_frequency_days: settings.payment_reminder_frequency_days ?? 7,
        payment_reminder_channels: settings.payment_reminder_channels ?? ['in_app', 'email'],
        payment_reminder_tone: settings.payment_reminder_tone ?? 'standard',
        payment_reminder_min_days_overdue: settings.payment_reminder_min_days_overdue ?? 1,
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
  // Laboratuvar adresi/telefonu — iş kâğıdı, fatura ve klinikten-alım kurye
  // bacaklarının VARIŞ noktası buradan okunur. Boşken create_delivery kurye
  // entegrasyonundaki alış adresine düşer; burası dolunca o öncelik kazanır.
  const [labAddrInput, setLabAddrInput]   = useState('');
  const [labAddrSaved, setLabAddrSaved]   = useState('');
  const [labPhoneInput, setLabPhoneInput] = useState('');
  const [labPhoneSaved, setLabPhoneSaved] = useState('');
  const [labSiteInput, setLabSiteInput]   = useState('');
  const [labSiteSaved, setLabSiteSaved]   = useState('');
  const [labContactSaving, setLabContactSaving] = useState(false);
  /** Kurye entegrasyonuna girilmiş alış adresi — adres boşsa tek tıkla kopyalanır. */
  const [pickupAddr, setPickupAddr] = useState<{ address: string; phone: string } | null>(null);
  const bumpLabBrand = useLabBrandStore(s => s.bump);

  useEffect(() => {
    if (!labId || !isLab) return;
    (async () => {
      const { data } = await supabase.from('labs').select('name, address, phone, website, logo_url, sidebar_brand_mode, sidebar_logo_scale').eq('id', labId).maybeSingle();
      const addr = (data as any)?.address ?? '';
      const tel  = (data as any)?.phone ?? '';
      const site = (data as any)?.website ?? '';
      setLabAddrInput(addr);  setLabAddrSaved(addr);
      setLabPhoneInput(tel);  setLabPhoneSaved(tel);
      setLabSiteInput(site);  setLabSiteSaved(site);
      // Adres henüz girilmemişse kurye ayarındaki alış adresini öner
      if (!String(addr).trim()) {
        const { data: pc } = await supabase
          .from('provider_credentials').select('credentials')
          .eq('lab_id', labId).eq('type', 'courier').eq('is_active', true).maybeSingle();
        const cred = (pc as any)?.credentials ?? {};
        if (cred.pickup_address) {
          setPickupAddr({ address: String(cred.pickup_address), phone: String(cred.pickup_phone ?? '') });
        }
      }
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

  const saveLabContact = useCallback(async () => {
    if (!labId || labContactSaving) return;
    const a = labAddrInput.trim();
    const t = labPhoneInput.trim();
    const w = labSiteInput.trim();
    if (a === labAddrSaved.trim() && t === labPhoneSaved.trim() && w === labSiteSaved.trim()) return;
    setLabContactSaving(true);
    const { error } = await supabase.from('labs')
      .update({ address: a || null, phone: t || null, website: w || null }).eq('id', labId);
    setLabContactSaving(false);
    if (!error) {
      setLabAddrSaved(a); setLabPhoneSaved(t); setLabSiteSaved(w); setPickupAddr(null);
      // Kenar çubuğundaki logo bağlantısı anında güncellensin
      bumpLabBrand();
    }
  }, [labId, labAddrInput, labPhoneInput, labSiteInput, labAddrSaved, labPhoneSaved, labSiteSaved, labContactSaving, bumpLabBrand]);

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
            Genel
          </Text>
        </View>
        <Text className="text-[13px] mb-4" style={{ color: T.ink3 }}>
          {isLab ? 'Kimlik, görünüm, bölge, iş akışı ve güvenlik ayarları.' : 'Görünüm ve bölge ayarları.'}
        </Text>

        {/* Ayarlar ARTIK ANLAMA göre gruplu — "kim yönetiyor"a göre değil.
            Eskiden aynı konudaki ayarlar üç ayrı kartta dağılmıştı (Genel /
            Hekim Ayarları / Laboratuvar Ayarları): tema görünümde, sayfa
            başına kayıt lab kartında, otomatik çıkış ise hiçbir güvenlik
            başlığı altında değildi. Tek kart, altı anlam grubu. */}

        {isLab && (
        <SettingGroup title="Laboratuvar Kimliği" sub="Fatura, iş kâğıdı ve yazışmalarda görünen bilgiler" first>

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

        {/* ── Laboratuvar adresi + telefon ──────────────────────────
            Kurye entegrasyonundaki "alış adresi" BanaBiKurye'ye özeldi;
            laboratuvarın kendi adresi hiçbir yerde tutulmuyordu. Klinikten
            alım bacaklarında VARIŞ noktası, iş kâğıdı ve faturada da künye
            bilgisi olarak buradan okunur. */}
        {isLab && canManageSettings && (
          <SettingRow
            icon={MapPin}
            label="Laboratuvar Adresi"
            sub="Kurye teslim noktası, iş kâğıdı ve fatura künyesi"
            accentColor={accentColor}
          >
            <View style={{ flex: 1, gap: 8 }}>
              <SettingInput
                accentColor={accentColor}
                value={labAddrInput}
                onChangeText={setLabAddrInput}
                onBlur={saveLabContact}
                placeholder="Mah., Cad., No, İlçe / İl"
                multiline
                style={{ width: '100%', minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, textAlignVertical: 'top' }}
              />

              {/* Adres zaten kurye ayarında varsa tek tıkla al — iki yere ayrı ayrı
                  yazdırmak hataya davetiye. */}
              {pickupAddr && !labAddrInput.trim() ? (
                <Pressable
                  onPress={() => {
                    setLabAddrInput(pickupAddr.address);
                    if (!labPhoneInput.trim() && pickupAddr.phone) setLabPhoneInput(pickupAddr.phone);
                  }}
                  style={Platform.OS === 'web'
                    ? ((({ pressed }: any) => ({
                        flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
                        paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                        backgroundColor: `${accentColor}14`,
                        opacity: pressed ? 0.6 : 1, cursor: 'pointer',
                      })) as any)
                    : {
                        flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
                        paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                        backgroundColor: `${accentColor}14`,
                      }}
                >
                  <Download size={12} color={accentColor} strokeWidth={2} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: accentColor }}>
                    Kurye ayarındaki alış adresini kullan
                  </Text>
                </Pressable>
              ) : null}

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
                  dirty={labAddrInput.trim() !== labAddrSaved.trim() || labPhoneInput.trim() !== labPhoneSaved.trim() || labSiteInput.trim() !== labSiteSaved.trim()}
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
              <Pressable
                onPress={pickAndUploadLogo}
                disabled={logoUploading}
                accessibilityLabel={labLogoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
                style={{
                  width: 84, height: 84, borderRadius: 14,
                  borderWidth: 1, borderColor: T.hairline,
                  backgroundColor: T.cardSoft,
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
              {/* Teknik gereksinimler alt metinde uzun bir cümleydi; okunmuyordu.
                  Rozet olarak durur — logoyu değiştirirken de gerekiyor. */}
              <View style={{ gap: 5, flexShrink: 0 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {['PNG', 'JPG', 'SVG'].map(tag => (
                    <View key={tag} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3 }}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 10, color: T.ink3 }}>400×400 · şeffaf zemin</Text>
              </View>
              {labLogoUrl && (
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
              )}
            </View>
          </SettingRow>
        )}

        </SettingGroup>
        )}

        <SettingGroup title="Görünüm" sub="Tema, kenar çubuğu markası ve liste yoğunluğu" first={!isLab}>

        {/* Tema — görsel önizlemeli seçici, diğer kontrollerle aynı sağ kolonda */}
        <SettingRow
          icon={Sun}
          label="Tema"
          sub="Arayüz görünüm tercihi"
          accentColor={accentColor}
        >
          <ThemePreviewPicker
            value={themeMode}
            onChange={(v) => { useThemeModeStore.getState().setMode(v); handleUpdate({ theme_mode: v }); }}
          />
        </SettingRow>

        {isLab && canManageSettings && labLogoUrl && (
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
        )}

        {/* Logo Boyutu — sidebar logo ölçeği */}
        {isLab && canManageSettings && labLogoUrl && (
          <SettingRow
            icon={ImageIcon}
            label="Logo Boyutu"
            sub="Sidebar'daki logonun büyüklüğü"
            accentColor={accentColor}
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
                  <Pressable onPress={() => saveLogoScale(logoScale - 0.1)} disabled={logoScale <= 0.6} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', opacity: logoScale <= 0.6 ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink, marginTop: -2 }}>−</Text>
                  </Pressable>
                  <Pressable onPress={() => saveLogoScale(logoScale + 0.1)} disabled={logoScale >= 1.8} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', opacity: logoScale >= 1.8 ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink, marginTop: -2 }}>+</Text>
                  </Pressable>
                </View>
              )}
              <Text style={{ fontSize: 11, color: T.ink3 }}>Büyük</Text>
              {/* Çıplak "%60" neye göre olduğunu söylemiyordu; uçlara etiket. */}
              <Text style={{ fontSize: 11, color: T.ink3, minWidth: 40, textAlign: 'end' as any }}>
                %{Math.round(logoScale * 100)}
              </Text>
            </View>
          </SettingRow>
        )}

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

        </SettingGroup>

        <SettingGroup title="Bölge ve Biçim" sub="Dil, mevzuat bölgesi, takvim ve tarih/saat gösterimi">

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

        {/* Bölge — mevzuata bağlı özellikleri tek yerden açar/kapatır.
            TR: e-Fatura + iyzico POS + %20 KDV · IR: ikisi de kapalı, %10 KDV.
            Lab mevzuat ayarı → yalnız lab/admin panelinde; klinik/hekime gösterilmez. */}
        {isLab && canManageSettings && (
        <SettingRow
          icon={Globe}
          label="Bölge"
          sub="Mevzuat bölgesi — dil, takvim, e-Fatura, POS ve KDV varsayılanını belirler"
          accentColor={accentColor}
        >
          <DropdownSelect
            options={[
              { key: 'TR', label: '🇹🇷 Türkiye', sub: 'e-Fatura · POS · %20 KDV' },
              { key: 'IR', label: '🇮🇷 İran',    sub: 'e-Fatura/POS yok · %10 KDV' },
            ]}
            value={labRegion}
            onChange={(v) => {
              // Bölge değişimi KDV varsayılanını da taşır (TR %20 · IR %10).
              // Bilinçli bir kullanıcı eylemi olduğu için mevcut oranı günceller.
              const r = v as LabRegion;
              void updateLabSettings({ region: r, default_tax_rate: defaultTaxRateFor(r) });
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
        {i18n.language === 'fa' && (
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

        {/* Hafta Başlangıcı — manage_settings yetkisi gerekir */}
        {canManageSettings && (
          <SettingRow
            icon={Calendar}
            label="Hafta Başlangıcı"
            sub="Takvim ve raporlarda haftanın ilk günü"
            accentColor={accentColor}
          >
            <DropdownSelect
              options={WEEK_STARTS.map(w => ({ key: w.key, label: w.label }))}
              value={s.week_start}
              onChange={(v) => handleUpdate({ week_start: v })}
              accentColor={accentColor}
            />
          </SettingRow>
        )}

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

        </SettingGroup>

        {isLab && canManageSettings && (
        <SettingGroup title="İş Akışı" sub="Sipariş numaralandırma ve mesai saatleri">

        {/* Sipariş Prefix */}
        <SettingRow
          icon={Hash}
          label="Sipariş Ön Eki"
          sub="Sipariş numarası formatı (ör: LAB-2026-0001)"
          accentColor={accentColor}
        >
          <TextInput
            className="text-[14px] border rounded-[14px] px-3.5"
            style={{ height: 36, width: '100%', borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card, color: T.ink, outlineWidth: 0 } as any}
            value={s.order_prefix}
            onChangeText={(v) => handleUpdate({ order_prefix: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })}
            placeholder="LAB"
            placeholderTextColor={T.ink3}
            maxLength={6}
            autoCapitalize="characters"
          />
        </SettingRow>

        {/* Çalışma Saatleri */}
        <SettingRow
          icon={Clock}
          label="Çalışma Saatleri"
          sub="Mesai başlangıç ve bitiş saatleri"
          accentColor={accentColor}
          isLast
        >
          <View className="flex-row items-center gap-1.5">
            <TextInput
              className="text-[14px] text-center border rounded-[14px]"
              style={{ height: 36, width: 84, borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card, color: T.ink, outlineWidth: 0 } as any}
              value={s.working_hours_start}
              onChangeText={(v) => handleUpdate({ working_hours_start: v })}
              placeholder="08:00"
              placeholderTextColor={T.ink3}
              maxLength={5}
            />
            <Text className="text-[14px] px-1" style={{ color: T.ink3 }}>–</Text>
            <TextInput
              className="text-[14px] text-center border rounded-[14px]"
              style={{ height: 36, width: 84, borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : T.card, color: T.ink, outlineWidth: 0 } as any}
              value={s.working_hours_end}
              onChangeText={(v) => handleUpdate({ working_hours_end: v })}
              placeholder="18:00"
              placeholderTextColor={T.ink3}
              maxLength={5}
            />
          </View>
        </SettingRow>

        </SettingGroup>
        )}

        {isLab && canManageSettings && (
        <SettingGroup title="Gizlilik ve Güvenlik" sub="Teknisyen adı görünürlüğü ve oturum güvenliği">

        {/* Teknisyen adı görünürlüğü — hekim/kliniklere nasıl görünsün */}
        <SettingRow
          icon={UserCheck}
          label="Teknisyen Adı (hekim/klinik)"
          sub="Sipariş aşamalarında teknisyen adı hekim ve kliniklere nasıl görünsün"
          accentColor={accentColor}
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

        {/* Otomatik Çıkış */}
        <SettingRow
          icon={LogOut}
          label="Otomatik Çıkış"
          sub="İşlem yapılmadığında otomatik oturum kapatma"
          accentColor={accentColor}
          isLast
        >
          <DropdownSelect
            options={AUTO_LOGOUT.map(a => ({ key: a.value, label: a.label }))}
            value={s.auto_logout_minutes}
            onChange={(v) => handleUpdate({ auto_logout_minutes: v })}
            accentColor={accentColor}
          />
        </SettingRow>

        </SettingGroup>
        )}

        {isDoctor && (
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
