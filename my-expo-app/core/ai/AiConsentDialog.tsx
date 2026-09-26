/**
 * AiConsentDialog — Yapay zekâ izni diyaloğu (global host).
 *
 * App Store 5.1.2(i): izin İSTEĞİ, veri gönderilmeden önce, uygulama İÇİNDE
 * ve görünür bir etkileşimle alınmalı; sağlayıcı ve paylaşılan veri açıkça
 * yazmalı. Bu yüzden metinde "Anthropic (Claude)" ve gönderilen alanlar
 * isim isim geçiyor — genel "AI kullanıyoruz" ifadesi reddedilme sebebi.
 *
 * Kök layout'ta BİR KEZ mount edilir; ensureAiConsent() açar.
 */
import React from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Sparkles, Check, X } from '../ui/icons';
import { autoT } from '../i18n/autoTranslate';
import { useMobileTokens } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';
import { usePanelTheme } from '../theme/usePanelTheme';
import { LEGAL_PRIVACY_URL } from '../legal';
import { openFileUrl } from '../util/openFile';
import { useAiConsentStore, grantAiConsent, dismissAiConsent } from './aiConsent';

/** Claude'a giden veri — diyalogda gösterilen liste. */
const SHARED_ITEMS = [
  'İş emri / fatura görselinde yazan metin',
  'Hasta adı, doğum tarihi ve cinsiyeti (iş emri okuma)',
  'Sipariş ve hekim bilgileri',
];

export function AiConsentDialog() {
  const open = useAiConsentStore((s) => s.open);
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const theme = usePanelTheme();
  const [busy, setBusy] = React.useState(false);

  const accent = theme.primary;
  const surface = isDark ? T.card : '#FFFFFF';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismissAiConsent}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(10,14,26,0.52)',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <View style={{
          width: '100%', maxWidth: 460, maxHeight: '86%',
          backgroundColor: surface, borderRadius: 22,
          borderWidth: 1, borderColor: hairline, overflow: 'hidden',
        }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accent + '18',
              }}>
                <Sparkles size={18} color={accent} strokeWidth={1.8} />
              </View>
              <Text style={{ flex: 1, fontSize: 16.5, fontWeight: '700', color: T.ink }}>
                {autoT('Yapay zekâ ile işleme izni')}
              </Text>
            </View>

            <Text style={{ fontSize: 13, lineHeight: 19, color: T.ink2 }}>
              {autoT('Bu özellik, gönderdiğin içeriği okuyup formu doldurmak için Anthropic (Claude) yapay zekâ servisini kullanır. Veri bu servise şifreli olarak gönderilir ve model eğitimi için kullanılmaz.')}
            </Text>

            <View style={{
              borderRadius: 14, borderWidth: 1, borderColor: hairline,
              padding: 12, gap: 7,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: T.ink3, textTransform: 'uppercase' }}>
                {autoT('Paylaşılan veriler')}
              </Text>
              {SHARED_ITEMS.map((it) => (
                <View key={it} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Text style={{ color: accent, fontSize: 13, lineHeight: 18 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: T.ink2 }}>{autoT(it)}</Text>
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 12, lineHeight: 18, color: T.ink3 }}>
              {autoT('İzni istediğin zaman Ayarlar → Gizlilik bölümünden geri alabilirsin. İzin vermezsen yapay zekâ özellikleri kapalı kalır, uygulamanın kalanını kullanmaya devam edebilirsin.')}
            </Text>

            <Pressable onPress={() => openFileUrl(LEGAL_PRIVACY_URL)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: accent, textDecorationLine: 'underline' }}>
                {autoT('Gizlilik Politikası')}
              </Text>
            </Pressable>
          </ScrollView>

          <View style={{
            flexDirection: 'row', gap: 10, padding: 16,
            borderTopWidth: 1, borderTopColor: hairline,
          }}>
            <Pressable
              onPress={dismissAiConsent}
              disabled={busy}
              style={{
                flex: 1, height: 44, borderRadius: 22,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderColor: hairline,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={T.ink2} strokeWidth={2} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink2 }}>{autoT('Şimdi değil')}</Text>
            </Pressable>
            <Pressable
              onPress={async () => { setBusy(true); try { await grantAiConsent(); } finally { setBusy(false); } }}
              disabled={busy}
              style={{
                flex: 1.4, height: 44, borderRadius: 22,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                backgroundColor: accent, opacity: busy ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              {busy
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Check size={15} color="#FFFFFF" strokeWidth={2.4} />}
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' }}>{autoT('İzin ver')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
