/**
 * MobileViewer3D — Native (iOS/Android) için react-native-webview wrapper.
 *
 * three.js mobile native'de doğrudan zor (expo-gl + expo-three RN bridge'i
 * şişiriyor). Onun yerine: web build'i tek HTML asset olarak WebView'a yükle,
 * GPU native render etsin. RN UI overlay (toolbar + layer panel) postMessage
 * ile WebView'daki state'i değiştirir.
 *
 * Faz 5: viewer + overlay close button. Toolbar / layer panel UI Faz 5.1.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Viewer3DProps, LayerStyle } from '../types';
import { buildViewerHtml } from './htmlTemplate';
import { classifyFile } from '../lib/layerMap';

function MobileViewer3D({ visible, files, title, onClose }: Viewer3DProps) {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView | null>(null);
  const [_ready, setReady] = useState(false);
  const [_loadErr, setLoadErr] = useState<string | null>(null);

  // Default layer styles (RN tarafında compute, HTML'e gömeriz)
  const initialStyles = useMemo<Record<string, LayerStyle>>(() => {
    const init: Record<string, LayerStyle> = {};
    for (const f of files) {
      const layer = classifyFile(f.name);
      init[f.id] = {
        visible: true,
        opacity: layer.opacity ?? 1,
        color: f.color ?? layer.color,
        wireframe: false,
      };
    }
    return init;
  }, [files]);

  const html = useMemo(
    () => buildViewerHtml({ files, layerStyles: initialStyles, bg: '#0e0e0e' }),
    [files, initialStyles],
  );

  // RN → WebView mesaj gönderici (Faz 5.1'de toolbar/panel UI bağlanır)
  // const send = (msg: object) => webviewRef.current?.postMessage(JSON.stringify(msg));

  // WebView → RN mesaj alıcı
  useEffect(() => { setLoadErr(null); setReady(false); }, [files]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={{ flex: 1, backgroundColor: '#0e0e0e', paddingTop: insets.top }}>
        {/* Top bar (kapatma + başlık) */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#1A1A1A',
          borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#E8D5C4', fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>
              3D Viewer
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {title ?? (files.length === 1 ? files[0].name : `${files.length} dosya`)}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} color="#E8D5C4" strokeWidth={2} />
          </Pressable>
        </View>

        {/* WebView canvas */}
        <View style={{ flex: 1, backgroundColor: '#0e0e0e' }}>
          <WebView
            ref={webviewRef}
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            bounces={false}
            mixedContentMode="always"
            style={{ flex: 1, backgroundColor: '#0e0e0e' }}
            onMessage={(ev) => {
              try {
                const msg = JSON.parse(ev.nativeEvent.data);
                if (msg.type === 'READY') setReady(true);
                if (msg.type === 'ERROR') setLoadErr(msg.message ?? 'Yüklenemedi');
              } catch { /* noop */ }
            }}
            onError={(e) => setLoadErr(e.nativeEvent.description)}
          />
        </View>

        {/* Footer hint */}
        <View style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          paddingBottom: Math.max(insets.bottom, 10) + 4,
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', letterSpacing: 0.5 }}>
            Tek parmakla döndür · Pinch ile yakınlaştır · İki parmakla kaydır
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export { MobileViewer3D };
export default MobileViewer3D;
