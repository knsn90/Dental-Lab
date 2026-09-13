/**
 * LegalDocModal — hukuki dokümanı (Gizlilik / Kullanım Koşulları) uygulama
 * içinde popup olarak gösterir. Kullanıcı rıza ekranında linke tıkladığında
 * dış sekmeye gitmek yerine bu modal açılır.
 *
 * Web  → <iframe> (react-native-web DOM elemanı)
 * Native → react-native-webview
 * Her iki tarafta "Yeni sekmede aç" fallback'i ve kapatma (X) bulunur.
 */
import React from 'react';
import { View, Text, Pressable, Modal, Platform, Linking, ActivityIndicator } from 'react-native';
import { X, ExternalLink } from '../../../core/ui/icons';
import { AUTH, AUTH_FONT } from './AuthShell';

function WebFrame({ url }: { url: string }) {
  // react-native-web bir DOM <iframe> render edebilir; RN JSX bunu tanımadığı
  // için createElement ile veriyoruz.
  return React.createElement('iframe', {
    src: url,
    style: { width: '100%', height: '100%', border: 'none', borderRadius: 12, background: '#fff' },
    title: 'legal-document',
  });
}

function NativeFrame({ url }: { url: string }) {
  // Lazy require: web bundle'ına webview girmesin.
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      source={{ uri: url }}
      style={{ flex: 1, borderRadius: 12, backgroundColor: '#fff' }}
      startInLoadingState
      renderLoading={() => (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={AUTH.accentDeep} />
        </View>
      )}
    />
  );
}

export function LegalDocModal({
  visible, url, title, onClose,
}: {
  visible: boolean;
  url: string | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1, backgroundColor: 'rgba(10,10,10,0.55)',
          alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        {/* İç kart — arkaya tıklayınca kapanır, karta tıklayınca kapanmaz */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: '100%', maxWidth: 720, height: '86%', maxHeight: 900,
            backgroundColor: AUTH.cardBg, borderRadius: 16, overflow: 'hidden',
            borderWidth: 1, borderColor: AUTH.border,
          }}
        >
          {/* Başlık çubuğu */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: AUTH.border,
          }}>
            <Text style={{
              flex: 1, fontSize: 15, fontWeight: '700',
              color: AUTH.ink, fontFamily: AUTH_FONT.sans,
            }} numberOfLines={1}>
              {title}
            </Text>
            {url ? (
              <Pressable
                onPress={() => Linking.openURL(url)}
                hitSlop={8}
                style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                accessibilityLabel="Yeni sekmede aç"
              >
                <ExternalLink size={18} color={AUTH.inkMuted} strokeWidth={1.8} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              accessibilityLabel="Kapat"
            >
              <X size={20} color={AUTH.ink} strokeWidth={2} />
            </Pressable>
          </View>

          {/* İçerik */}
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {visible && url
              ? (Platform.OS === 'web' ? <WebFrame url={url} /> : <NativeFrame url={url} />)
              : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
