/**
 * FinanceSection — Finans Ayarları (lab geneli).
 *
 * Ayarların genelinde dağınık duran finans ayarları burada toplanır:
 *   • Ana Para Birimi (default_currency) + Varsayılan KDV (default_tax_rate)
 *   • Ödeme Hatırlatmaları politikası (otomatik + kanallar + ton + sıklık)
 *   • Döviz Kurları (CurrencyRatesScreen — gömülü)
 *
 * Uzun bloklar collapse edilebilir; Döviz Kurları varsayılan kapalı gelir.
 * Paylaşılan form bileşenleri GeneralSection'dan gelir (tek kaynak).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import {
  Globe, Percent, Clock, Bell, Mail, MessageCircle, Send, AlertTriangle, CalendarDays, Check,
  ChevronDown, Coins,
} from '../../../core/ui/icons';

import { SUPPORTED_CURRENCIES, CURRENCY_META } from '../../../core/money/currency';
import { useLabSettingsStore, type CurrencyCode } from '../../../core/store/labSettingsStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { SegmentPicker, DropdownSelect, SettingRow } from './GeneralSection';
import { CurrencyRatesScreen } from '../screens/CurrencyRatesScreen';

type Props = { panelType: string; accentColor: string };

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)' } as any,
  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
});
const DISPLAY_FONT = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };

const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] =
  SUPPORTED_CURRENCIES.map(code => ({ code, symbol: CURRENCY_META[code].symbol, label: CURRENCY_META[code].label }));

const LOCAL_DEFAULTS = {
  default_currency: 'TRY' as CurrencyCode,
  default_tax_rate: 20 as number,
  payment_reminder_auto: false,
  payment_reminder_frequency_days: 7,
  payment_reminder_channels: ['in_app', 'email', 'whatsapp'] as string[],
  payment_reminder_tone: 'standard',
  payment_reminder_min_days_overdue: 1,
};

// ── Collapse edilebilir kart ──────────────────────────────────────────────
function CollapseCard({ title, sub, icon: Icon, accentColor, defaultOpen, children }: {
  title: string; sub?: string; icon: any; accentColor: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const T = useMobileTokens();
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <View className="rounded-[24px] mt-4" style={[CARD_SHADOW, { backgroundColor: T.card, overflow: 'hidden' }]}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        className="flex-row items-center gap-2.5 p-[22px]"
        style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
      >
        <Icon size={18} color={accentColor} strokeWidth={1.9} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...DISPLAY_FONT, fontSize: 18, letterSpacing: -0.3, color: T.ink }}>{title}</Text>
          {!!sub && <Text className="text-[13px] mt-0.5" style={{ color: T.ink3 }}>{sub}</Text>}
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={20} color={T.ink3} strokeWidth={2} />
        </View>
      </Pressable>
      {open && (
        <View className="px-[22px] pb-[22px]">
          <View className="h-px mb-1" style={{ backgroundColor: T.hairline2 }} />
          {children}
        </View>
      )}
    </View>
  );
}

export function FinanceSection({ accentColor }: Props) {
  const { settings, loading, load, update } = useLabSettingsStore();
  const [local, setLocal] = useState(LOCAL_DEFAULTS);
  const T = useMobileTokens();
  const { width: _vw } = useWindowDimensions();
  const sidePad = _vw < 768 ? 16 : 28;
  const { can } = usePermissions();
  const canManageSettings = can('manage_settings');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (settings) {
      setLocal({
        default_currency: settings.default_currency,
        default_tax_rate: settings.default_tax_rate,
        payment_reminder_auto: settings.payment_reminder_auto ?? false,
        payment_reminder_frequency_days: settings.payment_reminder_frequency_days ?? 7,
        payment_reminder_channels: settings.payment_reminder_channels ?? ['in_app', 'email', 'whatsapp'],
        payment_reminder_tone: settings.payment_reminder_tone ?? 'standard',
        payment_reminder_min_days_overdue: settings.payment_reminder_min_days_overdue ?? 1,
      });
    }
  }, [settings]);

  const handleUpdate = useCallback((patch: Record<string, any>) => {
    setLocal(prev => ({ ...prev, ...patch }));
    update(patch);
  }, [update]);

  if (loading) {
    return <CenteredLoader color={accentColor} label="Ayarlar yükleniyor…" />;
  }

  if (!canManageSettings) {
    return <CenteredLoader color={accentColor} label="Bu ayarlar için yetkiniz yok." />;
  }

  const s = local;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: sidePad, paddingTop: 0, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Genel finans (para birimi + KDV) ─────────────────── */}
      <CollapseCard title="Finans" sub="Para birimi ve vergi" icon={Percent} accentColor={accentColor} defaultOpen>
        <SettingRow
          icon={Globe}
          label="Ana Para Birimi"
          sub="Varsayılan para birimi (çoklu desteklenir)"
          accentColor={accentColor}
        >
          <DropdownSelect
            options={CURRENCIES.map(c => ({ key: c.code, label: `${c.symbol}  ${c.code}`, sub: c.label }))}
            value={s.default_currency}
            onChange={(v) => handleUpdate({ default_currency: v })}
            accentColor={accentColor}
            renderLabel={(opt) => opt.label}
          />
        </SettingRow>
        <SettingRow
          icon={Percent}
          label="Varsayılan KDV Oranı"
          sub="Faturalarda kullanılacak oran"
          accentColor={accentColor}
          isLast
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
      </CollapseCard>

      {/* ── Ödeme Hatırlatmaları ─────────────────────────────── */}
      <CollapseCard
        title="Ödeme Hatırlatmaları"
        sub="Vadesi geçen bakiyeler için otomatik/elle hatırlatma"
        icon={Bell}
        accentColor={accentColor}
        defaultOpen
      >
        <SettingRow
          icon={Send}
          label="Otomatik Gönderim"
          sub="Vadesi geçen kliniklere ayarlanan sıklıkta otomatik hatırlatma gönderilir."
          accentColor={accentColor}
        >
          <SegmentPicker
            options={[{ key: 'off', label: 'Kapalı' }, { key: 'on', label: 'Açık' }]}
            value={s.payment_reminder_auto ? 'on' : 'off'}
            onChange={(v) => handleUpdate({ payment_reminder_auto: v === 'on' })}
            accentColor={accentColor}
          />
        </SettingRow>

        {s.payment_reminder_auto && (
          <SettingRow
            icon={Clock}
            label="Gönderim Sıklığı"
            sub="Otomatik hatırlatmalar hangi aralıkla gönderilsin."
            accentColor={accentColor}
            controlWidth={220}
          >
            <SegmentPicker
              options={[
                { key: '1', label: 'Günlük' },
                { key: '7', label: 'Haftalık' },
                { key: '14', label: '2 Hafta' },
                { key: '30', label: 'Aylık' },
              ]}
              value={String(s.payment_reminder_frequency_days ?? 7) as any}
              onChange={(v) => handleUpdate({ payment_reminder_frequency_days: Number(v) })}
              accentColor={accentColor}
            />
          </SettingRow>
        )}

        <SettingRow
          icon={Bell}
          label="Kanallar"
          sub="Hatırlatma hangi kanallardan iletilsin (uygulama içi her zaman açık)."
          accentColor={accentColor}
          controlWidth={260}
        >
          <View className="flex-row flex-wrap gap-1.5 justify-end">
            {([
              { key: 'in_app',   label: 'Uygulama içi', icon: Bell,          locked: true  },
              { key: 'email',    label: 'E-posta',      icon: Mail,          locked: false },
              { key: 'whatsapp', label: 'WhatsApp',     icon: MessageCircle, locked: false },
            ] as const).map((ch) => {
              const channels = s.payment_reminder_channels ?? ['in_app', 'email', 'whatsapp'];
              const on = ch.locked || channels.includes(ch.key);
              const ChIcon = ch.icon;
              return (
                <Pressable
                  key={ch.key}
                  disabled={ch.locked}
                  onPress={() => {
                    const cur = s.payment_reminder_channels ?? ['in_app', 'email', 'whatsapp'];
                    const has = cur.includes(ch.key);
                    const next = has ? cur.filter((c) => c !== ch.key) : [...cur, ch.key];
                    const withInApp = Array.from(new Set(['in_app', ...next]));
                    handleUpdate({ payment_reminder_channels: withInApp });
                  }}
                  className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: on ? `${accentColor}18` : T.cardSoft,
                    borderWidth: 1,
                    borderColor: on ? `${accentColor}55` : 'rgba(0,0,0,0.08)',
                    opacity: ch.locked ? 0.85 : 1,
                    ...(Platform.OS === 'web' && !ch.locked ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <ChIcon size={13} color={on ? accentColor : T.ink3} strokeWidth={2} />
                  <Text className="text-[12.5px] font-semibold" style={{ color: on ? accentColor : T.ink3 }}>
                    {ch.label}
                  </Text>
                  {on && <Check size={12} color={accentColor} strokeWidth={2.6} />}
                </Pressable>
              );
            })}
          </View>
        </SettingRow>

        <SettingRow
          icon={AlertTriangle}
          label="Varsayılan Ton"
          sub="Otomatik hatırlatmaların üslubu."
          accentColor={accentColor}
          controlWidth={220}
        >
          <SegmentPicker
            options={[
              { key: 'gentle', label: 'Nazik' },
              { key: 'standard', label: 'Standart' },
              { key: 'firm', label: 'Sert' },
            ]}
            value={(s.payment_reminder_tone ?? 'standard') as any}
            onChange={(v) => handleUpdate({ payment_reminder_tone: v })}
            accentColor={accentColor}
          />
        </SettingRow>

        <SettingRow
          icon={CalendarDays}
          label="Minimum Gecikme"
          sub="Vade gününden kaç gün sonra hatırlatılsın."
          accentColor={accentColor}
          controlWidth={220}
          isLast
        >
          <SegmentPicker
            options={[
              { key: '0', label: 'Hemen' },
              { key: '1', label: '1 gün' },
              { key: '3', label: '3 gün' },
              { key: '7', label: '7 gün' },
            ]}
            value={String(s.payment_reminder_min_days_overdue ?? 1) as any}
            onChange={(v) => handleUpdate({ payment_reminder_min_days_overdue: Number(v) })}
            accentColor={accentColor}
          />
        </SettingRow>
      </CollapseCard>

      {/* ── Döviz Kurları (uzun liste → varsayılan kapalı) ───── */}
      <CollapseCard
        title="Döviz Kurları"
        sub="EUR/USD/GBP kur yönetimi ve geçmiş"
        icon={Coins}
        accentColor={accentColor}
        defaultOpen={false}
      >
        <CurrencyRatesScreen accentColor={accentColor} embedded />
      </CollapseCard>

      {/* Bilgi notu */}
      <View
        className="flex-row gap-3 rounded-2xl p-4 mt-4"
        style={{ backgroundColor: `${accentColor}08`, borderWidth: 1, borderColor: `${accentColor}30` }}
      >
        <AlertTriangle size={15} color={accentColor} strokeWidth={1.8} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[13px] leading-5" style={{ color: accentColor }}>
          Ayarlar değiştirildiğinde otomatik olarak kaydedilir. Tüm laboratuvar için geçerli olur.
        </Text>
      </View>
    </ScrollView>
  );
}
