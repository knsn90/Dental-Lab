// ReviewRequestSettingsCard — Ayarlar → Entegrasyonlar → WhatsApp altındaki lab ayarı:
// teslimden N gün sonra hekime WhatsApp puan isteği. Spec:
// docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md §5.7
//
// Okuma/yazma yalnız lab yöneticisi (RPC 42501 döner) → diğer rollerde kart çizilmez.
// Aktif WhatsApp bağlantısı yoksa anahtar devre dışı ve açıklamalı durur.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Star, Minus, Plus } from '../../../core/ui/icons';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { getReviewWaSettings, setReviewWaSettings, type ReviewWaSettings } from '../api';
import { stepReviewDelayDays, REVIEW_DELAY_MIN, REVIEW_DELAY_MAX, REVIEW_DELAY_DEFAULT } from '../reviewRules';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

/** GG.AA.YYYY — takvim dile göre (fa'da şemsi). */
function fmtDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

export function ReviewRequestSettingsCard({ accentColor }: { accentColor?: string }) {
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const panel = usePanelTheme();
  const accent = accentColor ?? panel.primary;

  const [settings, setSettings] = useState<ReviewWaSettings | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState(REVIEW_DELAY_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apply = (s: ReviewWaSettings) => {
    setSettings(s);
    setEnabled(!!s.enabled);
    setDays(stepReviewDelayDays(Number(s.delay_days), 0));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: e } = await getReviewWaSettings();
      if (!alive) return;
      if (e) {
        if (e.code === '42501') setHidden(true);
        else setLoadError(e.message ?? 'Ayar okunamadı');
        return;
      }
      if (data) apply(data);
    })();
    return () => { alive = false; };
  }, []);

  if (hidden) return null;

  const hasWa = !!settings?.has_whatsapp;
  const dirty = !!settings && (enabled !== !!settings.enabled || days !== Number(settings.delay_days));

  const save = async () => {
    if (!dirty || saving) return;
    setError('');
    setSaving(true);
    const { data, error: e } = await setReviewWaSettings(enabled, days);
    setSaving(false);
    if (e) { setError(e.message ?? 'Kaydedilemedi'); return; }
    if (data) apply(data);
    toast.success(autoT('Kaydedildi'));
  };

  const stepBtn = (dir: -1 | 1) => {
    const atEdge = dir < 0 ? days <= REVIEW_DELAY_MIN : days >= REVIEW_DELAY_MAX;
    const Icon = dir < 0 ? Minus : Plus;
    return (
      <GlassTooltip
        title={dir < 0 ? autoT('Bir gün azalt') : autoT('Bir gün artır')}
        text={autoT('Teslimden kaç gün sonra mesaj gideceğini ayarlar')}
        enabled={!atEdge}
      >
        <Pressable
          onPress={() => setDays(d => stepReviewDelayDays(d, dir))}
          disabled={atEdge}
          accessibilityRole="button"
          accessibilityLabel={dir < 0 ? autoT('Bir gün azalt') : autoT('Bir gün artır')}
          style={({ hovered }: any) => ({
            width: 34, height: 34, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered && !atEdge ? U.plainBtn.hoverBg : U.plainBtn.bg,
            borderWidth: 1, borderColor: U.plainBtn.border,
            opacity: atEdge ? 0.4 : 1,
            ...(Platform.OS === 'web' ? ({ cursor: atEdge ? 'default' : 'pointer' } as any) : {}),
          })}
        >
          <Icon size={14} color={U.plainBtn.fg} strokeWidth={2} />
        </Pressable>
      </GlassTooltip>
    );
  };

  return (
    <View style={{
      backgroundColor: U.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1, borderColor: isDark ? U.hairline : 'rgba(0,0,0,0.05)',
      gap: 12,
      ...Platform.select({
        web:     { boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' } as any,
        default: { shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1 },
      }),
    }}>
      {/* Başlık + anahtar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 12,
          backgroundColor: accent + (isDark ? '33' : '14'),
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Star size={17} color={isDark ? U.ink[900] : accent} strokeWidth={1.8} />
        </View>
        <Text style={{ ...DISPLAY, fontSize: 18, color: U.ink[900], flex: 1, letterSpacing: -0.3 }}>
          WhatsApp'tan puan iste
        </Text>
        {settings ? (
          <AppSwitch value={enabled} onValueChange={setEnabled} accentColor={accent} disabled={!hasWa && !enabled} />
        ) : !loadError ? (
          <ActivityIndicator size="small" color={accent} />
        ) : null}
      </View>

      <Text style={{ fontSize: 12, color: U.ink[500], lineHeight: 17 }}>
        Teslimden birkaç gün sonra hekime tek dokunuşla cevaplanan bir mesaj gider. Cevap işin değerlendirmesi olur.
      </Text>

      {loadError ? (
        <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>{loadError}</Text>
      ) : null}

      {settings && !hasWa ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: U.chipTones.warning.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>
            Önce WhatsApp bağlantısını kurun.
          </Text>
        </View>
      ) : null}

      {settings ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: U.ink[700] }} numberOfLines={1}>
            Teslimden kaç gün sonra
          </Text>
          {stepBtn(-1)}
          <Text style={{ minWidth: 52, textAlign: 'center', fontSize: 14, fontWeight: '600', color: U.ink[900] }}>
            {`${days} ${autoT('gün')}`}
          </Text>
          {stepBtn(1)}
        </View>
      ) : null}

      {settings?.enabled && settings.enabled_at ? (
        <Text style={{ fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>
          {`${autoT('Açıldığı gün')}: ${fmtDay(settings.enabled_at)}. ${autoT('Bu tarihten önceki teslimlere istek gitmez.')}`}
        </Text>
      ) : null}

      {/* Kaydet — hata düğmenin yanında (tek satır) */}
      {settings ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {error ? (
              <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }} numberOfLines={2}>{error}</Text>
            ) : null}
          </View>
          <GlassTooltip title={autoT('Kaydet')} text={autoT('Puan isteği ayarını kaydeder')} enabled={dirty && !saving}>
            <Pressable
              onPress={save}
              disabled={!dirty || saving}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: accent, opacity: !dirty || saving ? 0.45 : 1,
                ...(Platform.OS === 'web' ? ({ cursor: !dirty || saving ? 'default' : 'pointer' } as any) : {}),
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </Text>
            </Pressable>
          </GlassTooltip>
        </View>
      ) : null}
    </View>
  );
}
