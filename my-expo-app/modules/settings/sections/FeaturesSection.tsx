// Ayarlar › Özellikler — lab yöneticisi KENDİ lab'ı için yeni modülleri açıp kapatır
// (kullanıcı, 2026-11-09: "bunlar için ayarlarda ayar ekleyelim yeni özellikler için").
// Kaynak: lab_feature_settings() — platformun "Özellik bayrakları" kataloğu (platform_feature_flags),
// yalnız lab_toggleable işaretli modüller. Yazma: lab_set_feature() (hesap sahibi / lab müdürü, kendi lab'ı).
// Değişiklikten sonra featureFlagsStore yenilenir → kenar çubuğu, özet ve ayar sekmeleri hemen güncellenir.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useInkUI } from '../../../core/theme/inkScale';
import { hexA } from '../../../core/theme/stationPalette';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Phone, CalendarDays, Puzzle } from '../../../core/ui/icons';
import { useFeatureFlagsStore } from '../../../core/store/featureFlagsStore';
import { labFeatureSettings, setLabFeature, type LabFeatureSetting } from '../../platform/api';

const ICONS: Record<string, any> = { phone_assistant: Phone, scan_appointments: CalendarDays };

function errText(e: any, t: (k: string) => string): string {
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? '');
  if (code === '42501' || /forbidden|not_toggleable/i.test(msg)) return t('settings.modules.errForbidden');
  if (code === 'PGRST202' || /could not find the function/i.test(msg)) return t('settings.modules.errNotReady');
  return t('settings.modules.errGeneric');
}

/** Modül adı / açıklaması: bilinen modüller anahtarlı çeviriden, yeni katalog satırları DB metninden (autoT) */
function useFeatureText() {
  const { t } = useTranslation();
  return {
    labelOf: (r: LabFeatureSetting) => t(`settings.modules.items.${r.key}.label`, { defaultValue: autoT(r.label ?? r.key) }),
    descOf: (r: LabFeatureSetting) => t(`settings.modules.items.${r.key}.desc`, { defaultValue: r.description ? autoT(r.description) : '' }),
    offNoteOf: (r: LabFeatureSetting) => t(`settings.modules.items.${r.key}.offNote`, { defaultValue: t('settings.modules.offNoteDefault') }),
  };
}

export function FeaturesSection({ accentColor = '#F5C24B' }: { accentColor?: string }) {
  const { t } = useTranslation();
  const refreshFlags = useFeatureFlagsStore((s) => s.refresh);
  const [rows, setRows] = useState<LabFeatureSetting[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try { setRows(await labFeatureSettings()); }
    catch (e) { setRows([]); setLoadErr(errText(e, t)); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const { labelOf, offNoteOf } = useFeatureText();

  const apply = async (r: LabFeatureSetting, next: boolean) => {
    setBusyKey(r.key);
    setRowErr((m) => { const { [r.key]: _drop, ...rest } = m; return rest; });
    try {
      await setLabFeature(r.key, next);
      setRows((list) => (list ?? []).map((x) => (x.key === r.key ? { ...x, override: next, effective: next } : x)));
      await refreshFlags();
    } catch (e) {
      setRowErr((m) => ({ ...m, [r.key]: errText(e, t) }));
    } finally {
      setBusyKey(null);
    }
  };

  const onToggle = (r: LabFeatureSetting, next: boolean) => {
    if (busyKey) return;
    if (next) { void apply(r, true); return; }
    // Kapatmanın sonucu var (ör. telefon asistanının aldığı aramalar kaydedilmez) → önce sor
    setConfirm({
      title: t('settings.modules.confirmTitle', { name: labelOf(r) }),
      message: offNoteOf(r),
      label: t('settings.modules.confirmOff'),
      cancelLabel: t('settings.modules.cancel'),
      variant: 'warning',
      onConfirm: async () => { setConfirm(null); await apply(r, false); },
    });
  };

  if (rows === null) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <>
      <FeaturesView rows={rows} loadErr={loadErr} busyKey={busyKey} rowErr={rowErr} accentColor={accentColor} onToggle={onToggle} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

export interface FeaturesViewProps {
  rows: LabFeatureSetting[]; loadErr: string | null; busyKey: string | null; rowErr: Record<string, string>;
  accentColor: string; onToggle: (r: LabFeatureSetting, next: boolean) => void;
}

/** Saf görünüm (veri dışarıdan) — /dev/scan-widget?view=features demo sayfası sahte satırlarla çizer */
export function FeaturesView({ rows, loadErr, busyKey, rowErr, accentColor, onToggle }: FeaturesViewProps) {
  const U = useInkUI();
  const { t } = useTranslation();
  const { labelOf, descOf, offNoteOf } = useFeatureText();
  return (
    <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: CARD_GAP, paddingBottom: 60 }}>
      <View style={{ ...U.cardSolid, gap: 4 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: U.ink[400], textTransform: 'uppercase' }}>
          {t('settings.modules.eyebrow')}
        </Text>
        <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19 }}>{t('settings.modules.intro')}</Text>

        {loadErr ? (
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.chipTones.danger.fg, marginTop: 12 }} accessibilityLiveRegion="polite">
            {loadErr}
          </Text>
        ) : rows.length === 0 ? (
          <Text style={{ fontSize: 13, color: U.ink[400], marginTop: 12 }}>{t('settings.modules.empty')}</Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            {rows.map((r, i) => {
              const Icon = ICONS[r.key] ?? Puzzle;
              const on = r.effective === true;
              const busy = busyKey === r.key;
              const chip = on ? U.chipTones.success : U.chipTones.neutral;
              const desc = descOf(r);
              return (
                <View key={r.key} style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft,
                }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hexA(accentColor, U.isDark ? 0.22 : 0.16) }}>
                    <Icon size={18} color={U.ink[700]} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '600', color: U.ink[900] }}>{labelOf(r)}</Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: chip.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: chip.fg }}>
                          {on ? t('settings.modules.on') : t('settings.modules.off')}
                        </Text>
                      </View>
                    </View>
                    {desc ? <Text style={{ fontSize: 12.5, color: U.ink[500], marginTop: 3, lineHeight: 18 }}>{desc}</Text> : null}
                    <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 4, lineHeight: 16 }}>{offNoteOf(r)}</Text>
                    {rowErr[r.key] ? (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg, marginTop: 6 }} accessibilityLiveRegion="polite">
                        {rowErr[r.key]}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                    {busy ? <ActivityIndicator size="small" /> : null}
                    <GlassTooltip
                      title={on ? t('settings.modules.turnOff') : t('settings.modules.turnOn')}
                      text={on ? t('settings.modules.turnOffTip') : t('settings.modules.turnOnTip')}>
                      <AppSwitch value={on} onValueChange={(v) => onToggle(r, v)} accentColor={accentColor} disabled={!!busyKey} />
                    </GlassTooltip>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
