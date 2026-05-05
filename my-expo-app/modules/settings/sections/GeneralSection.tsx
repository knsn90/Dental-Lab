/**
 * GeneralSection — Patterns Design Language (NativeWind)
 * ─────────────────────────────────────────────────────
 * Ayarlar > Genel sekmesi.
 * Genel ayarlar (para birimi, hafta başlangıcı, tema) +
 * Lab'a özel ayarlar (sipariş prefix, KDV, mesai, otomatik çıkış, sayfa kayıt).
 * Patterns cardSolid stili + NativeWind className.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, ActivityIndicator, Modal, TextInput } from 'react-native';
import {
  Globe, Clock, Calendar, Monitor, Sun, Moon, Laptop,
  ChevronDown, Check, Info, Hash, Percent, Timer, LogOut, List,
} from 'lucide-react-native';
import {
  useLabSettingsStore,
  type CurrencyCode, type WeekStart, type ThemeMode,
} from '../../../core/store/labSettingsStore';

// ── Types ───────────────────────────────────────────────────────────────
interface Props {
  panelType: string;
  accentColor: string;
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
  return (
    <View className="flex-row rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
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
            {Icon && <Icon size={13} color={active ? '#FFF' : '#9A9A9A'} strokeWidth={1.8} />}
            <Text
              className="text-[12px] font-semibold"
              style={{ color: active ? '#FFF' : '#9A9A9A' }}
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
  const selected = options.find(o => o.key === value);
  const displayLabel = selected ? (renderLabel ? renderLabel(selected) : selected.label) : '';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 bg-white border rounded-[14px] px-3.5"
        style={{ height: 44, borderColor: 'rgba(0,0,0,0.08)' }}
      >
        <Text className="flex-1 text-[14px] text-ink-900">{displayLabel}</Text>
        <ChevronDown size={14} color="#9A9A9A" strokeWidth={1.8} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onPress={() => setOpen(false)}
        >
          <View
            className="bg-white rounded-[20px] w-[320px] overflow-hidden"
            style={{ ...CARD_SHADOW, maxHeight: 400 }}
          >
            <View className="px-5 pt-4 pb-2">
              <Text className="text-[15px] font-semibold text-ink-900">Seçim yapın</Text>
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
                        className="text-[14px] text-ink-900"
                        style={isSelected ? { fontWeight: '600', color: accentColor } : undefined}
                      >
                        {renderLabel ? renderLabel(opt) : opt.label}
                      </Text>
                      {opt.sub && (
                        <Text className="text-[12px] text-ink-400 mt-0.5">{opt.sub}</Text>
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
  return (
    <>
      <View className="flex-row items-center gap-3 py-3.5">
        <View
          className="w-9 h-9 rounded-xl items-center justify-center"
          style={{ backgroundColor: `${accentColor}14` }}
        >
          <Icon size={16} color={accentColor} strokeWidth={1.8} />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-ink-900 mb-0.5">{label}</Text>
          <Text className="text-[12px] text-ink-400">{sub}</Text>
        </View>
        <View style={{ width: controlWidth }}>
          {children}
        </View>
      </View>
      {!isLast && <View className="h-px bg-black/[0.04]" style={{ marginLeft: 48 }} />}
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

  const isLab = panelType === 'lab' || panelType === 'admin';

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 pt-20">
        <ActivityIndicator size="large" color={accentColor} />
        <Text className="text-[13px] text-ink-300">Ayarlar yükleniyor…</Text>
      </View>
    );
  }

  const s = local;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 0, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Genel Ayarlar kartı ──────────────────────────────── */}
      <View className="bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
        <View className="flex-row items-center gap-2 mb-1">
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: '#0A0A0A' }}>
            Genel Ayarlar
          </Text>
          {saving && <ActivityIndicator size={14} color={accentColor} />}
        </View>
        <Text className="text-[13px] text-ink-400 mb-4">
          Uygulama genelindeki temel yapılandırma ayarları.
        </Text>

        <View className="h-px bg-black/[0.04] mb-1" />

        {/* Para Birimi */}
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

        {/* Hafta Başlangıcı */}
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

        {/* Tema */}
        <SettingRow
          icon={Sun}
          label="Tema"
          sub="Arayüz görünüm tercihi"
          accentColor={accentColor}
          isLast
        >
          <SegmentPicker
            options={THEMES}
            value={s.theme_mode}
            onChange={(v) => handleUpdate({ theme_mode: v })}
            accentColor={accentColor}
          />
        </SettingRow>
      </View>

      {/* ── Lab'a Özel Ayarlar kartı ─────────────────────────── */}
      {isLab && (
        <View className="bg-white rounded-[24px] p-[22px] mt-4" style={CARD_SHADOW}>
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: '#0A0A0A', marginBottom: 4 }}>
            Laboratuvar Ayarları
          </Text>
          <Text className="text-[13px] text-ink-400 mb-4">
            Laboratuvara özel iş akışı ve yapılandırma ayarları.
          </Text>

          <View className="h-px bg-black/[0.04] mb-1" />

          {/* Sipariş Prefix */}
          <SettingRow
            icon={Hash}
            label="Sipariş Ön Eki"
            sub="Sipariş numarası formatı (ör: LAB-2026-0001)"
            accentColor={accentColor}
          >
            <TextInput
              className="text-[14px] text-ink-900 bg-white border rounded-[14px] px-3.5"
              style={{ height: 44, borderColor: 'rgba(0,0,0,0.08)', outlineWidth: 0 } as any}
              value={s.order_prefix}
              onChangeText={(v) => handleUpdate({ order_prefix: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })}
              placeholder="LAB"
              placeholderTextColor="#C0C0C8"
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
                className="text-[14px] text-ink-900 text-center bg-white border rounded-[14px]"
                style={{ height: 40, width: 80, borderColor: 'rgba(0,0,0,0.08)', outlineWidth: 0 } as any}
                value={s.working_hours_start}
                onChangeText={(v) => handleUpdate({ working_hours_start: v })}
                placeholder="08:00"
                placeholderTextColor="#C0C0C8"
                maxLength={5}
              />
              <Text className="text-[14px] text-ink-300 px-1">–</Text>
              <TextInput
                className="text-[14px] text-ink-900 text-center bg-white border rounded-[14px]"
                style={{ height: 40, width: 80, borderColor: 'rgba(0,0,0,0.08)', outlineWidth: 0 } as any}
                value={s.working_hours_end}
                onChangeText={(v) => handleUpdate({ working_hours_end: v })}
                placeholder="18:00"
                placeholderTextColor="#C0C0C8"
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
