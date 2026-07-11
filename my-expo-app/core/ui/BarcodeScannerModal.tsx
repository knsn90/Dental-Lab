/**
 * BarcodeScannerModal — kamera ile barkod/QR okutma.
 *
 * Cross-platform:
 *   • Native (iOS/Android): expo-camera CameraView + onBarcodeScanned
 *   • Web: getUserMedia + ZXing (BarcodeDetector API fallback ile)
 *
 * Kullanım:
 *   <BarcodeScannerModal
 *     visible={scanOpen}
 *     onClose={() => setScanOpen(false)}
 *     onScan={(code) => { setBarcode(code); setScanOpen(false); }}
 *     accentColor={accentColor}
 *   />
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Modal} from 'react-native';
import { X, Camera as CameraIcon, ScanLine, RotateCcw, AlertCircle, Check } from 'lucide-react-native';
import { ActivityIndicator } from './teethCompat';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  accentColor?: string;
  /** Format: 'all' (default) — qr + ean + code128 vb.; 'qr' — sadece QR */
  formats?: 'all' | 'qr';
  title?: string;
}

export function BarcodeScannerModal({ visible, onClose, onScan, accentColor = '#0A0A0A', formats = 'all', title = 'Barkod / QR okut' }: Props) {
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#0A0A0A', borderRadius: 24, width: 480, maxWidth: '100%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '33' }}>
                <ScanLine size={16} color={accentColor} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>Kamera</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 20, letterSpacing: -0.4, color: '#FAFAFA' }}>{title}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <X size={15} color="#FAFAFA" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Camera viewport */}
          <View style={{ aspectRatio: 4 / 3, backgroundColor: '#000', position: 'relative' }}>
            {visible && (Platform.OS === 'web'
              ? <WebScanner onScan={onScan} accentColor={accentColor} formats={formats} />
              : <NativeScanner onScan={onScan} accentColor={accentColor} formats={formats} />
            )}

            {/* Overlay frame */}
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0 as any, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 240, height: 240, borderRadius: 16, borderWidth: 2, borderColor: accentColor }}>
                {/* Corner accents */}
                {[
                  { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
                  { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
                  { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
                  { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
                ].map((s, i) => (
                  <View key={i} style={{ position: 'absolute', width: 28, height: 28, borderColor: accentColor, ...s } as any} />
                ))}
              </View>
            </View>
          </View>

          {/* Footer hint */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ScanLine size={13} color="#9A9A9A" strokeWidth={1.6} />
            <Text style={{ fontSize: 12, color: '#9A9A9A', flex: 1 }}>
              Kodu çerçevenin içine hizalayın — otomatik okunur.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Native scanner (Expo Camera) ────────────────────────────────────────────

function NativeScanner({ onScan, accentColor, formats }: { onScan: (code: string) => void; accentColor: string; formats: 'all' | 'qr' }) {
  // expo-camera API'sini lazy import (web bundle'a girmesin)
  // @ts-ignore
  const { CameraView, useCameraPermissions } = require('expo-camera');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '22' }}>
          <CameraIcon size={24} color={accentColor} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 14, color: '#FAFAFA', fontWeight: '600', textAlign: 'center' }}>Kamera izni gerekli</Text>
        <Text style={{ fontSize: 12, color: '#9A9A9A', textAlign: 'center' }}>
          Barkod okutmak için kameraya erişim izni verin.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={{
            marginTop: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999,
            backgroundColor: accentColor,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>İzin ver</Text>
        </Pressable>
      </View>
    );
  }

  const barcodeTypes = formats === 'qr'
    ? ['qr']
    : ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'pdf417', 'aztec', 'datamatrix', 'itf14', 'codabar'];

  return (
    <CameraView
      style={{ flex: 1 }}
      facing="back"
      onBarcodeScanned={scanned ? undefined : ({ data }: { data: string }) => {
        if (!data) return;
        setScanned(true);
        onScan(data);
      }}
      barcodeScannerSettings={{ barcodeTypes }}
    />
  );
}

// ─── Web scanner (BarcodeDetector API + getUserMedia) ────────────────────────

function WebScanner({ onScan, accentColor, formats }: { onScan: (code: string) => void; accentColor: string; formats: 'all' | 'qr' }) {
  const videoRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        // @ts-ignore — web only
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setError('Tarayıcı kamera desteği yok');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }

        // Native BarcodeDetector destekleniyorsa kullan
        // @ts-ignore — Web API
        if ('BarcodeDetector' in window) {
          // @ts-ignore
          const supportedFormats: string[] = await (window as any).BarcodeDetector.getSupportedFormats?.() ?? ['qr_code'];
          const wantedFormats = formats === 'qr'
            ? supportedFormats.filter(f => f === 'qr_code')
            : supportedFormats.filter(f => ['qr_code','ean_13','ean_8','code_128','code_39','upc_a','upc_e','pdf417','aztec','data_matrix','itf','codabar'].includes(f));
          // @ts-ignore
          const detector = new (window as any).BarcodeDetector({ formats: wantedFormats.length ? wantedFormats : ['qr_code'] });

          const tick = async () => {
            if (cancelled || scannedRef.current) return;
            if (videoRef.current && videoRef.current.readyState === 4) {
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes && codes[0]?.rawValue) {
                  scannedRef.current = true;
                  onScan(String(codes[0].rawValue));
                  return;
                }
              } catch {}
            }
            requestAnimationFrame(tick);
          };
          tick();
        } else {
          setError('Tarayıcınız barkod tanıma API\'sini desteklemiyor (BarcodeDetector). Chrome / Edge öneriyoruz.');
        }
      } catch (e: any) {
        setError(e?.message ?? 'Kamera açılamadı');
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onScan, formats]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,119,6,0.22)' }}>
          <AlertCircle size={24} color="#D97706" strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 14, color: '#FAFAFA', fontWeight: '600', textAlign: 'center' }}>Kamera hatası</Text>
        <Text style={{ fontSize: 12, color: '#9A9A9A', textAlign: 'center', maxWidth: 320, lineHeight: 17 }}>{error}</Text>
      </View>
    );
  }

  // @ts-ignore — RN-Web video
  return React.createElement('video', {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    muted: true,
    style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
  });
}
