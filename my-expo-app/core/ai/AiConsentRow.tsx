/**
 * AiConsentRow — "Yapay zekâ ile işleme" izni anahtarı (Ayarlar/Profil satırı).
 *
 * App Store 5.1.2(i) izni yalnız almayı değil, GERİ ALINABİLİR olmasını da
 * istiyor. Anahtar kapatılınca deftere granted=false satırı yazılır ve
 * ensureAiConsent() bir sonraki kullanımda yeniden sorar.
 *
 * Profil ekranlarına düşer (izin kullanıcıya aittir, laba değil).
 */
import React from 'react';
import { View, Text, Platform, ActivityIndicator } from 'react-native';
import { Sparkles } from '../ui/icons';
import { AppSwitch } from '../ui/AppSwitch';
import { autoT } from '../i18n/autoTranslate';
import { useMobileTokens } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';
import { usePanelTheme } from '../theme/usePanelTheme';
import { fetchAiConsent, grantAiConsent, withdrawAiConsent, useAiConsentStore } from './aiConsent';

export function AiConsentRow({ accentColor }: { accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const theme = usePanelTheme();
  const accent = accentColor ?? theme.primary;
  // Diyalogdan izin verilirse bu satır da anında güncellensin.
  const storeStatus = useAiConsentStore((s) => s.status);

  const [on, setOn] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetchAiConsent()
      .then((v) => { if (alive) setOn(v); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeStatus]);

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    const prev = on;
    setOn(next);                                   // iyimser
    const ok = next ? await grantAiConsent() : await withdrawAiConsent();
    if (!ok) setOn(prev);                          // yazılamadıysa geri al
    setBusy(false);
  };

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 13,
      borderRadius: 16,
      backgroundColor: isDark ? T.card : '#FFFFFF',
      borderWidth: 1, borderColor: T.hairline,
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: accent + '14',
      }}>
        <Sparkles size={16} color={accent} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink }}>
          {autoT('Yapay zekâ ile işleme')}
        </Text>
        <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 16 }}>
          {autoT('Fatura ve iş emri okuma ile Simanty için Anthropic (Claude) kullanılır. Kapatırsan bu özellikler devre dışı kalır.')}
        </Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={accent} />
        : <AppSwitch value={on} onValueChange={toggle} accentColor={accent} disabled={busy} />}
    </View>
  );
}
